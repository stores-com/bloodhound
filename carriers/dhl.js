const async = require('async');
const moment = require('moment-timezone');
const request = require('request');

const DhlEcommerceSolutions = require('./dhlEcommerceSolutions');
const USPS = require('./usps');

// These tracking descriptions indicate the shipment was delivered
const DELIVERED_TRACKING_DESCRIPTIONS = ['DELIVERED'];

// These tracking descriptions should indicate the shipment was shipped (shows movement beyond a shipping label being created)
const SHIPPED_TRACKING_DESCRIPTIONS = ['ARRIVAL DESTINATION DHL ECOMMERCE FACILITY', 'DEPARTURE ORIGIN DHL ECOMMERCE FACILITY', 'ARRIVED USPS SORT FACILITY', 'ARRIVAL AT POST OFFICE', 'OUT FOR DELIVERY', 'PACKAGE RECEIVED AT DHL ECOMMERCE DISTRIBUTION CENTER', 'PROCESSED THROUGH SORT FACILITY', 'TENDERED TO DELIVERY SERVICE PROVIDER'];

const geography = require('../util/geography');

function DHL(options) {
    const dhlEcommerceSolutions = new DhlEcommerceSolutions(options && options.dhlEcommerceSolutions);
    const usps = new USPS(options && options.usps);

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
            const req = {
                forever: true,
                gzip: true,
                headers: {
                    'DHL-API-Key': options.apiKey
                },
                json: true,
                method: 'GET',
                timeout: 5000,
                url: `https://api-eu.dhl.com/track/shipments?trackingNumber=${trackingNumber}`
            };

            async.retry((callback) => {
                request(req, (err, res, body) => {
                    if (err) {
                        return callback(err);
                    }

                    if (res.statusCode !== 200) {
                        return callback(new Error(`${res.statusCode} ${res.request.method} ${res.request.href} ${body || ''}`.trim()));
                    }

                    callback(null, body);
                });
            }, (err, body) => {
                if (err) {
                    // If UTAPI fails, try USPS
                    if (options.usps && usps.isTrackingNumberValid(trackingNumber)) {
                        return usps.track(trackingNumber, _options, callback);
                    }

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
                    const deliveryDate = moment(estimatedDeliveryDate).toDate();
                    results.estimatedDeliveryDate = {
                        earliest: deliveryDate,
                        latest: deliveryDate
                    };
                }

                // Reverse the array to get events in order Least Recent - Most Recent
                const events = shipment.events.reverse();

                // Used when there is no address data present
                const previousAddress = shipment.origin?.address;

                // Set address and locationString of each event
                events.forEach(event => {
                    if (!event.location?.address) {
                        event.location = event.location || {};
                        event.location.address = previousAddress;
                    }
                    event.locationString = `${event.location.address?.addressLocality} ${event.location.address?.postalCode} ${event.location.address?.countryCode}`.trim();
                });

                // Get unique array of locations (remove falsy values)
                const locations = Array.from(new Set(events.map(event => event.locationString))).filter(l => l);

                // Lookup each location
                async.mapLimit(locations, 10, (location, callback) => {
                    geography.parseLocation(location, options, (err, address) => {
                        if (err || !address) {
                            return callback(err, address);
                        }

                        address.location = location;

                        callback(null, address);
                    });
                }, (err, addresses) => {
                    if (err) {
                        return callback(err);
                    }

                    events.forEach(event => {
                        const address = addresses.find(a => a && a.location === event.locationString);

                        // Use the geolocated timezone, or ET as a default
                        let timezone = 'America/New_York';

                        if (address?.timezone) {
                            timezone = address.timezone;
                        }

                        const _event = {
                            address: {
                                city: address?.city,
                                country: event.location.address?.countryCode,
                                state: address?.state,
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
