const moment = require('moment-timezone');
const PitneyBowesClient = require('pitney-bowes');

// Remove these words from cities to turn cities like `DISTRIBUTION CENTER INDIANAPOLIS` into `INDIANAPOLIS`
const CITY_BLACKLIST = /DISTRIBUTION CENTER|INTERNATIONAL DISTRIBUTION CENTER|NETWORK DISTRIBUTION CENTER/ig;

// These tracking status codes indicate the shipment was delivered
const DELIVERED_TRACKING_STATUS_CODES = ['01', '517', 'DEL', 'PTS01'];

// These tracking status codes indicate the shipment was shipped (shows movement beyond a shipping label being created)
const SHIPPED_TRACKING_STATUS_CODES = ['000', '02', '07', '10', '131', '138', '139', '14', '141', '143', '144', '145', '146', '159', '248', '249', '30', '333', '334', '335', '336', '371', '375', '376', '377', '378', '396', '401', '403', '404', '406', '436', '437', '438', '439', '463', '464', '466', '516', '538', '81', '82', '865', '869', '870', '872', '873', '874', '876', '878', 'AD', 'ADU', 'DELU', 'IPS', 'OF', 'OFD', 'PC', 'PTS07', 'PTSAD', 'PTSMA', 'PTSOF', 'SS', 'UPROC'];

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

        const trackArgs = isImb
            ? { carrier: 'IMB', trackingNumber: trackingNumber.substring(0, 20) }
            : { carrier: 'USPS', trackingNumber };

        pitneyBowesClient.tracking(trackArgs).then((data) => {
            processTrackingData(null, data, isImb, trackingNumber, _options, options, callback);
        }).catch((err) => {
            processTrackingData(err, null, isImb, trackingNumber, _options, options, callback);
        });
    };
}

function processTrackingData(err, data, isImb, trackingNumber, _options, options, callback) {
    const results = {
        carrier: 'Pitney Bowes',
        events: [],
        raw: data
    };

    if (_options && _options.carrier && _options.carrier.toLowerCase() === 'newgistics') {
        results.carrier = 'Newgistics';
    }

    if (err) {
        // pitney-bowes raises @stores.com/http-error, whose message is `${status} ${statusText}` —
        // a reason phrase the origin picks and nobody normalises — and which 1.2.0 replaces outright
        // with the response body's errors[] text. The status on `cause` is the one part that can't
        // change.
        if (err.cause?.status === 404) {
            return callback(null, results);
        }

        return callback(err);
    }

    if (!data || !data.scanDetailsList) {
        return callback(null, results);
    }

    data.scanDetailsList.forEach(scanDetail => {
        const address = {
            city: scanDetail.eventCity,
            country: scanDetail.country,
            state: scanDetail.eventStateOrProvince,
            zip: scanDetail.postalCode
        };

        if (address.city) {
            address.city = address.city.toString().replace(CITY_BLACKLIST, '').trim();
        }

        // Use the event's UTC offset if available, otherwise fall back to defaultTimezone
        let date;

        if (scanDetail.eventTimeOffset) {
            date = moment.parseZone(`${scanDetail.eventDate}T${scanDetail.eventTime}${scanDetail.eventTimeOffset}`).toDate();
        } else {
            const timezone = options.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
            date = moment.tz(`${scanDetail.eventDate} ${scanDetail.eventTime}`, 'YYYY-MM-DD HH:mm:ss', timezone).toDate();
        }

        // Ensure event is after minDate (used to prevent data from reused tracking numbers)
        if (date < _options.minDate) {
            return;
        }

        if (DELIVERED_TRACKING_STATUS_CODES.includes(scanDetail?.scanType?.toString())) {
            results.deliveredAt = new Date(date);
        }

        if (SHIPPED_TRACKING_STATUS_CODES.includes(scanDetail?.scanType?.toString())) {
            results.shippedAt = new Date(date);
        }

        results.events.push({
            address,
            date,
            description: scanDetail.scanDescription
        });
    });

    // Add URL to carrier tracking page
    results.url = `https://pitneybowes.shipment.co/track/${trackingNumber}`;

    if (isImb) {
        results.url = `https://tracking.pb.com/${trackingNumber.substring(0, 20)}`;
    }

    if (!results.shippedAt && results.deliveredAt) {
        results.shippedAt = results.deliveredAt;
    }

    results.events.sort((a, b) => b.date - a.date);
    callback(null, results);
}

module.exports = PitneyBowes;
