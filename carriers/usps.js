const async = require('async');
const moment = require('moment-timezone');

const USPS = require('@stores.com/usps');

const checkDigit = require('../util/checkDigit');
const geography = require('../util/geography');

const CITY_BLACKLIST = /DISTRIBUTION CENTER|INTERNATIONAL DISTRIBUTION CENTER|NETWORK DISTRIBUTION CENTER/ig;
const DELIVERED_STATUS_CATEGORIES = ['Delivered'];
const SHIPPED_STATUS_CATEGORIES = ['Accepted', 'Alert', 'Delivered', 'In Transit', 'On the Way', 'Out for Delivery'];

function USPSCarrier(options) {
    const usps = new USPS(options);

    this.isTrackingNumberValid = (trackingNumber) => {
        // remove whitespace
        trackingNumber = trackingNumber.replace(/\s/g, '');
        trackingNumber = trackingNumber.toUpperCase();

        if ([/^[A-Z]{2}\d{9}[A-Z]{2}$/, /^926129\d{16}$/, /^927489\d{16}$/].some(regex => regex.test(trackingNumber))) {
            return true;
        }

        if (/^\d{20}$/.test(trackingNumber)) {
            return checkDigit(trackingNumber, [3, 1], 10);
        }

        if (/^(91|92|93|94|95|96)\d{20}$/.test(trackingNumber)) {
            return checkDigit(trackingNumber, [3, 1], 10);
        }

        if (/^\d{26}$/.test(trackingNumber)) {
            return checkDigit(trackingNumber, [3, 1], 10);
        }

        if (/^420\d{27}$/.test(trackingNumber)) {
            return checkDigit(trackingNumber.match(/^420\d{5}(\d{22})$/)[1], [3, 1], 10);
        }

        if (/^420\d{31}$/.test(trackingNumber)) {
            if (checkDigit(trackingNumber.match(/^420\d{9}(\d{22})$/)[1], [3, 1], 10)) {
                return true;
            } else if (checkDigit(trackingNumber.match(/^420\d{5}(\d{26})$/)[1], [3, 1], 10)) {
                return true;
            }
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

        async.retry((callback) => {
            usps.getTracking(trackingNumber).then((data) => {
                callback(null, data);
            }).catch(callback);
        }, (err, data) => {
            if (err) {
                // USPS returns 404 when package not found or not yet scanned.
                // Treat as empty results to match old XML API behavior (silent, not an error).
                if (err.cause?.status === 404) {
                    return callback(null, { carrier: 'USPS', events: [], raw: err.json });
                }

                return callback(err);
            }

            const results = {
                carrier: 'USPS',
                events: [],
                raw: data
            };

            // Handle response - it's an array with one item
            const trackingData = Array.isArray(data) ? data[0] : data;

            if (!trackingData || trackingData.error) {
                // No tracking information or error
                return callback(trackingData?.error ? new Error(JSON.stringify(trackingData.error)) : null, results);
            }

            // Handle expected delivery date
            if (trackingData.expectedDeliveryDate) {
                const parsedDate = moment.utc(trackingData.expectedDeliveryDate, 'YYYY-MM-DD').toDate();
                results.estimatedDeliveryDate = {
                    earliest: parsedDate,
                    latest: parsedDate
                };
            }

            // Process tracking events
            const trackingEvents = trackingData.trackingEvents || [];

            if (trackingEvents.length === 0 && trackingData.statusSummary) {
                // If no events but we have status summary, create a single event
                trackingEvents.push({
                    eventType: trackingData.statusSummary,
                    eventTimestamp: trackingData.eventTimestamp || new Date().toISOString(),
                    eventCity: trackingData.destinationCity || '',
                    eventState: trackingData.destinationState || '',
                    eventZIPCode: trackingData.destinationZIP || '',
                    eventCountry: 'US',
                    statusCategory: trackingData.statusCategory
                });
            }

            // Set address and location for each event
            trackingEvents.forEach(event => {
                event.address = {
                    city: (event.eventCity || '').replace(CITY_BLACKLIST, '').trim(),
                    country: event.eventCountry || 'US',
                    state: event.eventState || '',
                    zip: event.eventZIPCode || ''
                };

                event.location = geography.addressToString(event.address);
            });

            // Get unique array of locations
            const locations = Array.from(new Set(trackingEvents.map(event => event.location)));

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

                trackingEvents.forEach(event => {
                    const address = addresses.find(a => a && a.location === event.location);
                    let timezone = options.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

                    if (address && address.timezone) {
                        timezone = address.timezone;
                    }

                    // Parse the timestamp - USPS API returns ISO format like "2025-07-28T12:00:00Z"
                    const eventDate = moment.tz(event.eventTimestamp, timezone).toDate();

                    const bloodhoundEvent = {
                        address: event.address,
                        date: eventDate,
                        description: event.eventType || event.statusCategory || 'Unknown'
                    };

                    // Ensure event is after minDate (used to prevent data from reused tracking numbers)
                    if (bloodhoundEvent.date < _options.minDate) {
                        return;
                    }

                    if (DELIVERED_STATUS_CATEGORIES.includes(event.statusCategory)) {
                        results.deliveredAt = bloodhoundEvent.date;
                    }

                    if (SHIPPED_STATUS_CATEGORIES.includes(event.statusCategory)) {
                        results.shippedAt = bloodhoundEvent.date;
                    }

                    // Use the city and state from the parsed address (for scenarios where the city includes the state like "New York, NY")
                    if (address) {
                        if (address.city) {
                            bloodhoundEvent.address.city = address.city;
                        }

                        if (address.state) {
                            bloodhoundEvent.address.state = address.state;
                        }
                    }

                    results.events.push(bloodhoundEvent);
                });

                // Add details to the most recent event
                if (results.events[0] && trackingData.statusSummary) {
                    results.events[0].details = trackingData.statusSummary;
                }

                // Fallback: use top-level statusCategory if per-event statusCategory was missing
                if (!results.deliveredAt && DELIVERED_STATUS_CATEGORIES.includes(trackingData.statusCategory) && results.events.length) {
                    results.deliveredAt = results.events[0].date;
                }

                if (!results.shippedAt && SHIPPED_STATUS_CATEGORIES.includes(trackingData.statusCategory) && results.events.length) {
                    results.shippedAt = results.events[0].date;
                }

                // Add url to carrier tracking page
                results.url = `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(trackingNumber)}`;

                if (!results.shippedAt && results.deliveredAt) {
                    results.shippedAt = results.deliveredAt;
                }

                callback(null, results);
            });
        });
    };
}

module.exports = USPSCarrier;
