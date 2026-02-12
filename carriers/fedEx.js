const async = require('async');
const cache = require('memory-cache');
const createError = require('http-errors');
const request = require('request');

const checkDigit = require('../util/checkDigit');

// Remove these words from cities to turn cities like `FEDEX SMARTPOST INDIANAPOLIS` into `INDIANAPOLIS`
const CITY_BLACKLIST = /fedex|smartpost/ig;

// These tracking status codes indicate the shipment was delivered: https://www.fedex.com/us/developer/webhelp/ws/2018/US/index.htm#t=wsdvg%2FTracking_Shipments.htm%23Tracking_Statusbc-5&rhtocid=_26_0_4
const DELIVERED_TRACKING_STATUS_CODES = ['DL'];

// These tracking status codes indicate the shipment was shipped (shows movement beyond a shipping label being created): https://www.fedex.com/us/developer/webhelp/ws/2018/US/index.htm#t=wsdvg%2FTracking_Shipments.htm%23Tracking_Statusbc-5&rhtocid=_26_0_4
const SHIPPED_TRACKING_STATUS_CODES = ['AR', 'DP', 'IT', 'OD'];

// The events from these tracking status codes are filtered because their timestamps are nonsensical: https://www.fedex.com/us/developer/webhelp/ws/2018/US/index.htm#t=wsdvg%2FTracking_Shipments.htm%23Tracking_Statusbc-5&rhtocid=_26_0_4
const TRACKING_STATUS_CODES_BLACKLIST = ['PU', 'PX'];

function FedEx(args) {
    const options = Object.assign({
        url: 'https://apis.fedex.com'
    }, args);

    this.getAccessToken = (callback) => {
        const key = args.api_key;
        const accessToken = cache.get(key);

        if (accessToken) {
            return callback(null, accessToken);
        }

        const req = {
            form: {
                grant_type: 'client_credentials',
                client_id: args.api_key,
                client_secret: args.secret_key
            },
            method: 'POST',
            url: `${options.url}/oauth/token`
        };

        request(req, (err, response, body) => {
            if (err) {
                return callback(err);
            }

            if (response.statusCode !== 200) {
                const err = createError(response.statusCode);
                err.response = response;

                return callback(err);
            }

            const accessToken = JSON.parse(body);

            cache.put(key, accessToken, (accessToken.expires_in - 100) * 1000);

            return callback(null, accessToken);
        });
    };

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

    this.track = (trackingNumber, _options, callback) => {
        // Options are optional
        if (typeof _options === 'function') {
            callback = _options;
            _options = {};
        }

        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        this.getAccessToken((err, accessToken) => {
            if (err) {
                return callback(err);
            }

            const trackRequestOptions = {
                gzip: true,
                headers: {
                    Authorization: `Bearer ${accessToken.access_token}`
                },
                json: {
                    includeDetailedScans: true,
                    trackingInfo: [
                        {
                            trackingNumberInfo: {
                                trackingNumber: trackingNumber
                            }
                        }
                    ]
                },
                method: 'POST',
                url: `${options.url}/track/v1/trackingnumbers`
            };

            async.retry((callback) => {
                request(trackRequestOptions, (err, response, trackResponse) => {
                    if (err) {
                        return callback(err);
                    }

                    if (trackResponse?.output?.alerts?.length) {
                        let alerts = trackResponse.output.alerts;
                        let warnings = alerts.filter(alert => alert.alertType === 'WARNING');

                        if (warnings.length) {
                            return callback(new Error(warnings.map(warning => `${warning.code}: ${warning.message}`).join(', ')));
                        }
                    }

                    // Return if only one track detail is returned
                    if (trackResponse?.output?.completeTrackResults?.trackResults?.scanEvents?.length === 1) {
                        return callback(null, trackResponse);
                    }

                    callback(null, trackResponse);
                });
            }, (err, trackReply) => {
                if (err) {
                    return callback(err);
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
                    return callback(null, results);
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

                callback(null, results);
            });
        });
    };
}

module.exports = FedEx;