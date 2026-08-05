const async = require('async');
const FedEx = require('@stores.com/fedex');

const checkDigit = require('../util/checkDigit');

// Remove these words from cities to turn cities like `FEDEX SMARTPOST INDIANAPOLIS` into `INDIANAPOLIS`
const CITY_BLACKLIST = /fedex|smartpost/ig;

// These tracking status codes indicate the shipment was delivered: https://www.fedex.com/us/developer/webhelp/ws/2018/US/index.htm#t=wsdvg%2FTracking_Shipments.htm%23Tracking_Statusbc-5&rhtocid=_26_0_4
const DELIVERED_TRACKING_STATUS_CODES = ['DL'];

// These tracking status codes indicate the shipment was shipped (shows movement beyond a shipping label being created): https://www.fedex.com/us/developer/webhelp/ws/2018/US/index.htm#t=wsdvg%2FTracking_Shipments.htm%23Tracking_Statusbc-5&rhtocid=_26_0_4
const SHIPPED_TRACKING_STATUS_CODES = ['AR', 'DP', 'IT', 'OD'];

// The events from these tracking status codes are filtered because their timestamps are nonsensical: https://www.fedex.com/us/developer/webhelp/ws/2018/US/index.htm#t=wsdvg%2FTracking_Shipments.htm%23Tracking_Statusbc-5&rhtocid=_26_0_4
const TRACKING_STATUS_CODES_BLACKLIST = ['PU', 'PX'];

function FedExCarrier(args) {
    const fedEx = new FedEx(args);

    // @stores.com/fedex handles the OAuth token, including caching it per API key. This stays
    // exposed because carriers/fedEx.js is deep-requirable and this was part of that surface;
    // nothing inside Bloodhound calls it. Called through rather than assigned across, so it
    // does not depend on the package's method being safe to detach from its instance.
    this.getAccessToken = (options) => fedEx.getAccessToken(options);

    this.isTrackingNumberValid = (trackingNumber) => {
        // Remove whitespace
        trackingNumber = trackingNumber.replace(/\s/g, '');

        if ([/^6129\d{16}$/, /^7489\d{16}$/, /^926129\d{16}$/, /^927489\d{16}$/].some(regex => regex.test(trackingNumber))) {
            return true;
        }

        if (/^02\d{18}$/.test(trackingNumber)) {
            return checkDigit(`91${trackingNumber}`, [3, 1], 10);
        }

        if (/^96\d{20}$/.test(trackingNumber)) {
            if (checkDigit(trackingNumber, [3, 1, 7], 11)) {
                return true;
            }

            if (checkDigit(trackingNumber.slice(7), [1, 3], 10)) {
                return true;
            }

            return false;
        }

        if (/^DT\d{12}$/.test(trackingNumber)) {
            return checkDigit(trackingNumber.match(/^DT(\d{12})$/)[1], [3, 1, 7], 11);
        }

        if (/^\d{12}$/.test(trackingNumber)) {
            return checkDigit(trackingNumber, [3, 1, 7], 11);
        }

        if (/^\d{15}$/.test(trackingNumber)) {
            return checkDigit(trackingNumber, [1, 3], 10);
        }

        if (/^\d{20}$/.test(trackingNumber)) {
            if (checkDigit(trackingNumber, [3, 1, 7], 11)) {
                return true;
            }

            if (checkDigit(`92${trackingNumber}`, [3, 1], 10)) {
                return true;
            }

            return false;
        }

        return false;
    };

    this.track = async (trackingNumber, _options = {}) => {
        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        // @stores.com/fedex has no retry of its own, and a tracking lookup is a read, so retrying
        // it is safe. Only a 5xx or an error with no status at all — a transport failure, or a
        // body that would not parse — is worth a second call. This is deliberately not the
        // `!(status >= 400 && status < 500)` filter carriers/dhl.js uses: that one asks whether
        // the failure is a 4xx, and @stores.com/fedex also rejects a 200 carrying a top-level
        // errors[] envelope, whose status is 200 and which is as deterministic as a 4xx. Asking
        // for a 5xx instead covers both. It matters more than it looks: trackByTrackingNumber()
        // fetches the token itself and the package caches it only on success, so unfiltered, a
        // rejected credential cost five immediate hits to /oauth/token where it used to cost one.
        const trackReply = await async.retry({ errorFilter: err => err?.cause?.status === undefined || err.cause.status >= 500 }, async () => await fedEx.trackByTrackingNumber({
            includeDetailedScans: true,
            trackingInfo: [
                {
                    trackingNumberInfo: {
                        trackingNumber: trackingNumber
                    }
                }
            ]
        }));

        // FedEx reports per-shipment problems in output.alerts on an otherwise successful
        // response. @stores.com/fedex only rejects on the top-level errors[] envelope, so
        // interpreting the alerts is left to us. Checked outside the retry: a tracking number
        // FedEx cannot find is a settled answer, and it used to cost five identical lookups.
        if (trackReply?.output?.alerts?.length) {
            const warnings = trackReply.output.alerts.filter(alert => alert.alertType === 'WARNING');

            if (warnings.length) {
                throw new Error(warnings.map(warning => `${warning.code}: ${warning.message}`).join(', '));
            }
        }

        const results = {
            carrier: 'FedEx',
            events: [],
            raw: trackReply
        };
        // Extract the first tracking result from a nested FedEx tracking respons
        const trackResult = trackReply?.output?.completeTrackResults?.[0]?.trackResults?.[0];
        // Extract estimated delivery window if available
        const timeWindow = trackResult?.estimatedDeliveryTimeWindow;

        // Check if a time window is available
        if (timeWindow?.window?.begins && timeWindow?.window?.ends) {
            results.estimatedDeliveryDate = {
                earliest: new Date(timeWindow.window.begins),
                latest: new Date(timeWindow.window.ends)
            };
        }

        // Ensure track reply has events
        if (!trackReply?.output?.completeTrackResults[0]?.trackResults[0]?.scanEvents?.length) {
            return results;
        }
        trackReply?.output?.completeTrackResults?.[0]?.trackResults?.[0]?.scanEvents.forEach(e => {
            if (TRACKING_STATUS_CODES_BLACKLIST.includes(e.eventType)) {
                return;
            }

            const event = {
                address: {
                    city: e?.scanLocation?.city,
                    country: e?.scanLocation?.countryCode,
                    state: e?.scanLocation?.stateOrProvinceCode,
                    zip: e?.scanLocation?.postalCode
                },
                date: new Date(e.date),
                description: e.eventDescription
            };

            // Ensure event is after minDate (used to prevent data from reused tracking numbers)
            if (event.date < _options.minDate) {
                return;
            }

            if (e.exceptionDescription) {
                event.details = e.exceptionDescription;
            }

            // Remove blacklisted words
            if (event.address.city) {
                event.address.city = event.address.city.replace(CITY_BLACKLIST, '').trim();
            }

            if (DELIVERED_TRACKING_STATUS_CODES.includes(e.eventType)) {
                results.deliveredAt = new Date(e.date);
            }

            if (SHIPPED_TRACKING_STATUS_CODES.includes(e.eventType)) {
                results.shippedAt = new Date(e.date);
            }

            results.events.push(event);
        });
        // Add url to carrier tracking page
        results.url = `https://www.fedex.com/apps/fedextrack/?tracknumbers=${encodeURIComponent(trackingNumber)}`;

        if (!results.shippedAt && results.deliveredAt) {
            results.shippedAt = results.deliveredAt;
        }

        return results;
    };
}

module.exports = FedExCarrier;