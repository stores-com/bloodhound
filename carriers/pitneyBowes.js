const async = require('async');
const moment = require('moment-timezone');
const PitneyBowesClient = require('pitney-bowes');

// Remove these words from cities to turn cities like `DISTRIBUTION CENTER INDIANAPOLIS` into `INDIANAPOLIS`
const CITY_BLACKLIST = /DISTRIBUTION CENTER|INTERNATIONAL DISTRIBUTION CENTER|NETWORK DISTRIBUTION CENTER/ig;

// These tracking status codes indicate the shipment was delivered
const DELIVERED_TRACKING_STATUS_CODES = ['01', '517', 'DEL', 'PTS01'];

// These tracking status codes indicate the shipment was shipped (shows movement beyond a shipping label being created)
const SHIPPED_TRACKING_STATUS_CODES = ['000', '02', '07', '10', '131', '138', '139', '14', '141', '143', '144', '145', '146', '159', '248', '249', '30', '333', '334', '335', '336', '371', '375', '376', '377', '378', '396', '401', '403', '404', '406', '436', '437', '438', '439', '463', '464', '466', '516', '538', '81', '82', '865', '869', '870', '872', '873', '874', '876', '878', 'AD', 'ADU', 'DELU', 'IPS', 'OF', 'OFD', 'PC', 'PTS07', 'PTSAD', 'PTSMA', 'PTSOF', 'SS', 'UPROC'];

const geography = require('../util/geography');

function PitneyBowes(options) {
    const pitneyBowesClient = new PitneyBowesClient(options);

    this.track = (trackingNumber, _options, callback) => {
        // Options are optional
        if (typeof _options === 'function') {
            callback = _options;
            _options = {};
        }

        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        // Pitney Bowes Marketing Mail Flats (length 31): 0004290252994200071698133931119
        const isImb = trackingNumber.length === 31;

        async.retry((callback) => {
            if (isImb) {
                return pitneyBowesClient.tracking({ carrier: 'IMB', trackingNumber: trackingNumber.substring(0, 20) }, callback);
            }

            // Pitney Bowes Standard (length 34): 4201913892748927005269000023298282
            pitneyBowesClient.tracking({ carrier: 'FDR', trackingNumber }, callback);
        }, (err, data) => {
            const results = {
                carrier: 'Pitney Bowes',
                events: [],
                raw: data
            };

            if (_options && _options.carrier && _options.carrier.toLowerCase() === 'newgistics') {
                results.carrier = 'Newgistics';
            }

            if (err) {
                if (err.message === 'Not Found') {
                    return callback(null, results);
                }

                return callback(err);
            }

            if (!data | !data.scanDetailsList) {
                return callback(null, results);
            }

            // Set address and location of each scan detail
            data.scanDetailsList.forEach(scanDetail => {
                scanDetail.address = {
                    city: scanDetail.eventCity,
                    country: scanDetail.country,
                    state: scanDetail.eventStateOrProvince,
                    zip: scanDetail.postalCode
                };

                if (scanDetail.address.city) {
                    scanDetail.address.city = scanDetail.address.city.toString().replace(CITY_BLACKLIST, '').trim();
                }

                scanDetail.location = geography.addressToString(scanDetail.address);
            });

            // Get unique array of locations (remove falsy values)
            const locations = Array.from(new Set(data.scanDetailsList.map(scanDetail => scanDetail.location))).filter(l => l);

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

                // Sort list by date/time
                data.scanDetailsList.sort((a, b) => `${a.eventDate} ${a.eventTime}` - `${b.eventDate} ${b.eventTime}`);

                data.scanDetailsList.forEach(scanDetail => {
                    const address = addresses.find(a => a && a.location === scanDetail.location);
                    let timezone = options.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

                    if (address && address.timezone) {
                        timezone = address.timezone;
                    }

                    const event = {
                        address: scanDetail.address,
                        date: moment.tz(`${scanDetail.eventDate} ${scanDetail.eventTime}`, 'YYYY-MM-DD HH:mm:ss', timezone).toDate(),
                        description: scanDetail.scanDescription
                    };

                    // Ensure event is after minDate (used to prevent data from reused tracking numbers)
                    if (event.date < _options.minDate) {
                        return;
                    }

                    if (DELIVERED_TRACKING_STATUS_CODES.includes(scanDetail?.scanType?.toString())) {
                        results.deliveredAt = new Date(event.date);
                    }

                    if (SHIPPED_TRACKING_STATUS_CODES.includes(scanDetail?.scanType?.toString())) {
                        results.shippedAt = new Date(event.date);
                    }

                    // Use the city and state from the parsed address (for scenarios where the city includes the state like "New York, NY")
                    if (address) {
                        if (address.city) {
                            event.address.city = address.city;
                        }

                        if (address.state) {
                            event.address.state = address.state;
                        }
                    }

                    results.events.push(event);
                });

                // Add URL to carrier tracking page
                results.url = `https://pitneybowes.shipment.co/track/${trackingNumber}`;

                if (isImb) {
                    results.url = `https://tracking.pb.com/${trackingNumber.substring(0, 20)}`;
                }

                if (!results.shippedAt && results.deliveredAt) {
                    results.shippedAt = results.deliveredAt;
                }

                results.events = results.events.reverse();
                callback(null, results);
            });
        });
    };
}

module.exports = PitneyBowes;