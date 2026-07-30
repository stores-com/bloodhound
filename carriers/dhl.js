const async = require('async');
const HttpError = require('@stores.com/http-error');
const moment = require('moment-timezone');

const DhlEcommerceSolutions = require('./dhlEcommerceSolutions');

// These tracking descriptions indicate the shipment was delivered
const DELIVERED_TRACKING_DESCRIPTIONS = ['DELIVERED'];

// These tracking descriptions should indicate the shipment was shipped (shows movement beyond a shipping label being created)
const SHIPPED_TRACKING_DESCRIPTIONS = ['ARRIVAL DESTINATION DHL ECOMMERCE FACILITY', 'DEPARTURE ORIGIN DHL ECOMMERCE FACILITY', 'ARRIVED USPS SORT FACILITY', 'ARRIVAL AT POST OFFICE', 'OUT FOR DELIVERY', 'PACKAGE RECEIVED AT DHL ECOMMERCE DISTRIBUTION CENTER', 'PROCESSED THROUGH SORT FACILITY', 'PROCESSED THROUGH USPS SORT FACILITY', 'TENDERED TO DELIVERY SERVICE PROVIDER'];


function DHL(options) {
    const dhlEcommerceSolutions = new DhlEcommerceSolutions(options && options.dhlEcommerceSolutions);

    this.isTrackingNumberValid = (trackingNumber) => {
        // Remove spaces and uppercase
        trackingNumber = trackingNumber.replace(/\s/g, '').toUpperCase();

        // Check for standard DHL formats
        if ([/94748\d{17}$/, /93612\d{17}$/].some(regex => regex.test(trackingNumber))) {
            return true;
        }

        // Check for 30-digit DHL tracking numbers starting with 420
        if (/^420\d{27}$/.test(trackingNumber)) {
            return true;
        }

        return dhlEcommerceSolutions.isTrackingNumberValid(trackingNumber);
    };

    this.track = (trackingNumber, _options, callback) => {
        // Options are optional
        if (typeof _options === 'function') {
            callback = _options;
            _options = {};
        }

        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        const trackWithUTAPI = (_options) => {
            // This is the API being used from: https://developer.dhl.com/api-reference/shipment-tracking
            //
            // A 4xx is a permanent answer for this tracking number, so it is surfaced on the
            // first attempt. Retrying only spends carrier calls, and those wasted calls earn
            // the 429 that produces the next failure. A transport failure has no status to
            // judge and stays retryable.
            async.retry({ errorFilter: err => !(err?.cause?.status >= 400 && err?.cause?.status < 500) }, async () => {
                const response = await fetch(`https://api-eu.dhl.com/track/shipments?trackingNumber=${trackingNumber}`, {
                    headers: {
                        'Accept-Encoding': 'gzip, deflate',
                        'DHL-API-Key': options.apiKey
                    },
                    signal: AbortSignal.timeout(5000)
                });

                // Anything other than a 200 is a failure — deliberately narrower than
                // response.ok, which is what the previous `request` implementation did.
                if (response.status !== 200) {
                    throw await HttpError.from(response);
                }

                return await response.json();
            }, (err, body) => {
                if (err) {
                    return callback(err);
                }

                const results = {
                    carrier: 'DHL',
                    events: [],
                    raw: body
                };

                if (!body || !body.shipments || !body.shipments.length) {
                    return callback(null, results);
                }

                // We only support the first shipment
                const shipment = body.shipments[0];

                const estimatedDeliveryDate = shipment.estimatedTimeOfDelivery;

                // Add estimated delivery date to results if available
                if (estimatedDeliveryDate) {
                    // DHL typically provides a single estimated delivery date, so we use it for both earliest and latest
                    const deliveryDate = moment.utc(estimatedDeliveryDate).toDate();
                    results.estimatedDeliveryDate = {
                        earliest: deliveryDate,
                        latest: deliveryDate
                    };
                }

                // Reverse the array to get events in order Least Recent - Most Recent
                const events = shipment.events.reverse();

                // Used when there is no address data present
                const previousAddress = shipment.origin?.address;

                // Fall back to the shipment's origin when an event carries no address
                events.forEach(event => {
                    if (!event.location?.address) {
                        event.location = event.location || {};
                        event.location.address = previousAddress;
                    }
                });

                events.forEach(event => {
                    // DHL's UTAPI timestamps carry no offset, so they're interpreted in the
                    // caller's configured timezone. Without geocoding we can't know the scan's
                    // own zone, so a scan elsewhere is off by the difference between them.
                    const timezone = options.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

                    const _event = {
                        address: {
                            city: event.location.address?.addressLocality,
                            country: event.location.address?.countryCode,
                            // DHL's UTAPI has no state field, and it used to come from the
                            // geocoder. It is undefined now rather than guessed.
                            state: undefined,
                            zip: event.location.address?.postalCode
                        },
                        date: moment.tz(event.timestamp, 'YYYY-MM-DDTHH:mm:ss', timezone).toDate(),
                        description: event.description
                    };

                    // Ensure event is after minDate (used to prevent data from reused tracking numbers)
                    if (_event.date < _options.minDate) {
                        return;
                    }

                    if (event.remark) {
                        _event.details = event.remark;
                    }

                    if (!results.deliveredAt && _event.description && DELIVERED_TRACKING_DESCRIPTIONS.find(desc => _event.description.toUpperCase().startsWith(desc))) {
                        results.deliveredAt = _event.date;
                    }

                    if (!results.shippedAt && _event.description && SHIPPED_TRACKING_DESCRIPTIONS.find(desc => _event.description.toUpperCase().startsWith(desc))) {
                        results.shippedAt = _event.date;
                    }

                    results.events.push(_event);
                });

                // Add URL to carrier tracking page
                results.url = `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(trackingNumber)}&submit=1`;

                // Reverse results again to get events in order Most Recent - Least Recent
                results.events.reverse();

                if (!results.shippedAt && results.deliveredAt) {
                    results.shippedAt = results.deliveredAt;
                }

                callback(null, results);
            });
        };

        if (options.dhlEcommerceSolutions && dhlEcommerceSolutions.isTrackingNumberValid(trackingNumber)) {
            async.retry((callback) => {
                dhlEcommerceSolutions.track(trackingNumber, _options, callback);
            }, (err, results) => {
                // If DHL eCommerce Solutions fails, try UTAPI
                if (err || !results.raw?.packages?.length) {
                    return trackWithUTAPI(_options);
                }

                return callback(err, results);
            });
        } else {
            return trackWithUTAPI(_options);
        }
    };
}

module.exports = DHL;
