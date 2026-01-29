const async = require('async');
const moment = require('moment-timezone');
const parser = require('xml2js');
const request = require('request');
const checkDigit = require('../util/checkDigit');
const geography = require('../util/geography');

// Remove these words from cities to turn cities like `DISTRIBUTION CENTER INDIANAPOLIS` into `INDIANAPOLIS`
const CITY_BLACKLIST = /DISTRIBUTION CENTER|INTERNATIONAL DISTRIBUTION CENTER|NETWORK DISTRIBUTION CENTER/ig;

// These tracking status codes indicate the shipment was delivered: https://about.usps.com/publications/pub97/pub97_appi.htm
const DELIVERED_TRACKING_STATUS_CODES = ['01'];

// These tracking status codes indicate the shipment was shipped (shows movement beyond a shipping label being created): https://about.usps.com/publications/pub97/pub97_appi.htm
const SHIPPED_TRACKING_STATUS_CODES = ['02', '03', '07', '10', '14', '30', '81', '82', 'AD', 'OF', 'PC', 'SF'];

// The events from these tracking status codes are filtered because they do not provide any useful information: https://about.usps.com/publications/pub97/pub97_appi.htm
const TRACKING_STATUS_CODES_BLACKLIST = ['NT'];

function USPS(options) {
    this.isTrackingNumberValid = function(trackingNumber) {
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

    this.track = function(trackingNumber, _options, callback) {
        // Options are optional
        if (typeof _options === 'function') {
            callback = _options;
            _options = {};
        }

        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        const xml = `<TrackFieldRequest USERID="${options.userId}"><Revision>1</Revision><ClientIp>${options.clientIp || '127.0.0.1'}</ClientIp><SourceId>${options.sourceId || '@mediocre/bloodhound (+https://github.com/stores-com/bloodhound)'}</SourceId><TrackID ID="${trackingNumber}"/></TrackFieldRequest>`;

        const req = {
            baseUrl: options.baseUrl || 'https://production.shippingapis.com',
            method: 'GET',
            timeout: 5000,
            url: `/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`
        };

        async.retry(function(callback) {
            request(req, callback);
        }, function(err, res) {
            if (err) {
                return callback(err);
            }

            parser.parseString(res.body, function(err, data) {
                const results = {
                    carrier: 'USPS',
                    events: [],
                    raw: data
                };

                if (err) {
                    return callback(err);
                } else if (!data) {
                    return callback(new Error('Invalid or missing TrackResponse'));
                } else if (data.Error) {
                    // Invalid credentials or Invalid Tracking Number
                    return callback(new Error(data.Error.Description[0]));
                } else if (!data?.TrackResponse?.TrackInfo?.[0] || data.TrackResponse.TrackInfo[0].Error) {
                    // No Tracking Information
                    return callback(null, results);
                }

                const scanDetailsList = [];

                // TrackSummary[0] exists for every item (with valid tracking number)
                const summary = data.TrackResponse.TrackInfo[0].TrackSummary[0];
                scanDetailsList.push(summary);

                const trackDetailList = data.TrackResponse.TrackInfo[0].TrackDetail;

                // If we have tracking details, push them into statuses
                // Tracking details only exist if the item has more than one status update
                if (trackDetailList) {
                    trackDetailList.forEach(trackDetail => {
                        if (TRACKING_STATUS_CODES_BLACKLIST.includes(trackDetail.EventCode[0])) {
                            return;
                        }

                        scanDetailsList.push(trackDetail);
                    });
                }

                const trackInfo = data.TrackResponse.TrackInfo[0];

                if (trackInfo?.ExpectedDeliveryDate) {
                    const parsedDate = moment(trackInfo.ExpectedDeliveryDate[0], 'MMMM D, YYYY').toDate();

                    results.estimatedDeliveryDate = {
                        earliest: parsedDate,
                        latest: parsedDate
                    };
                }

                // Set address and location of each scan detail
                scanDetailsList.forEach(scanDetail => {
                    scanDetail.address = {
                        city: scanDetail.EventCity[0].replace(CITY_BLACKLIST, '').trim(),
                        country: scanDetail.EventCountry[0],
                        state: scanDetail.EventState[0],
                        zip: scanDetail.EventZIPCode[0]
                    };

                    scanDetail.location = geography.addressToString(scanDetail.address);
                });

                // Get unqiue array of locations
                const locations = Array.from(new Set(scanDetailsList.map(scanDetail => scanDetail.location)));

                // Lookup each location
                async.mapLimit(locations, 10, function(location, callback) {
                    geography.parseLocation(location, options, function(err, address) {
                        if (err || !address) {
                            return callback(err, address);
                        }

                        address.location = location;

                        callback(null, address);
                    });
                }, function(err, addresses) {
                    if (err) {
                        return callback(err);
                    }

                    scanDetailsList.forEach(scanDetail => {
                        const address = addresses.find(a => a && a.location === scanDetail.location);
                        let timezone = 'America/New_York';

                        if (address && address.timezone) {
                            timezone = address.timezone;
                        }

                        const event = {
                            address: scanDetail.address,
                            date: moment.tz(`${scanDetail.EventDate[0]} ${scanDetail.EventTime[0]}`, 'MMMM D, YYYY h:mm a', timezone).toDate(),
                            description: scanDetail.Event[0]
                        };

                        // Ensure event is after minDate (used to prevent data from reused tracking numbers)
                        if (event.date < _options.minDate) {
                            return;
                        }

                        if (DELIVERED_TRACKING_STATUS_CODES.includes(scanDetail.EventCode[0])) {
                            results.deliveredAt = event.date;
                        }

                        if (SHIPPED_TRACKING_STATUS_CODES.includes(scanDetail.EventCode[0])) {
                            results.shippedAt = event.date;
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

                    // Add details to the most recent event
                    if (results.events[0] && data.TrackResponse && data.TrackResponse.TrackInfo && data.TrackResponse.TrackInfo[0] && data.TrackResponse.TrackInfo[0].StatusSummary && data.TrackResponse.TrackInfo[0].StatusSummary[0]) {
                        results.events[0].details = data.TrackResponse.TrackInfo[0].StatusSummary[0];
                    }

                    // Add url to carrier tracking page
                    results.url = `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(trackingNumber)}`;

                    if (!results.shippedAt && results.deliveredAt) {
                        results.shippedAt = results.deliveredAt;
                    }

                    callback(null, results);
                });
            });
        });
    };
}

module.exports = USPS;