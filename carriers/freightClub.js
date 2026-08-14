const FreightClub = require('freight-club');
const moment = require('moment-timezone');

// These tracking categories indicate the shipment was delivered
const DELIVERED_TRACKING_CATEGORIES = ['Delivered'];

// These tracking categories indicate the shipment was shipped (shows movement beyond a booking being registered with the carrier)
const SHIPPED_TRACKING_CATEGORIES = ['Damage Exception', 'Delivery Exception', 'In Transit', 'In Transit (Delivery)', 'In Transit (Picked Up)', 'In Transit (Terminal)', 'Lost in Transit', 'Missed Delivery', 'Picked Up', 'Refused', 'Returned', 'Scheduled for Delivery'];

module.exports = function(options) {
    const freightClub = new FreightClub(options);

    // Freight Club timestamps arrive without a UTC offset and are interpreted in this timezone
    const defaultTimezone = options?.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    this.isTrackingNumberValid = (trackingNumber) => {
        trackingNumber = trackingNumber.replace(/\s/g, '').toUpperCase();

        return /^FCT\d+$/.test(trackingNumber);
    };

    this.track = async (trackingNumber, _options = {}) => {
        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        trackingNumber = trackingNumber.replace(/\s/g, '').toUpperCase();

        const results = {
            carrier: 'Freight Club',
            events: [],
            // Freight Club's tracking page has no documented deep link that carries the tracking number
            url: 'https://app.freightclub.com/Tracking'
        };

        let events;

        try {
            events = await freightClub.getShipmentTracking({ trackingNo: trackingNumber });
        } catch (err) {
            // A tracking number Freight Club doesn't know (or has no scans for yet) is a 400
            // carrying Error Code 8100, not a 404. The body is a bare JSON string rather than an
            // errors[] envelope, so the HttpError message stays "400 Bad Request" and the code
            // is only on err.text.
            if (err.cause?.status === 400 && err.text?.includes('Error Code 8100')) {
                return results;
            }

            throw err;
        }

        results.raw = events;

        if (!Array.isArray(events)) {
            return results;
        }

        // SortOrder is Freight Club's canonical chronology; sort a copy ascending (oldest to newest) so raw keeps the API's original order
        const sortedEvents = events.slice().sort((a, b) => a.SortOrder - b.SortOrder);

        sortedEvents.forEach(event => {
            const _event = {
                address: {
                    city: event.City,
                    country: event.Country,
                    state: event.State
                },
                date: moment.tz(event.Date, ['M/D/YYYY h:mm:ss A', 'M/D/YYYY'], defaultTimezone).toDate(),
                description: event.Description
            };

            // Ensure event is after minDate (used to prevent data from reused tracking numbers)
            if (_event.date < _options.minDate) {
                return;
            }

            if (!results.deliveredAt && DELIVERED_TRACKING_CATEGORIES.includes(event.TrackingCategory)) {
                results.deliveredAt = _event.date;
            }

            if (!results.shippedAt && SHIPPED_TRACKING_CATEGORIES.includes(event.TrackingCategory)) {
                results.shippedAt = _event.date;
            }

            results.events.push(_event);
        });

        // Reverse to get events in order Most Recent - Least Recent
        results.events.reverse();

        if (!results.shippedAt && results.deliveredAt) {
            results.shippedAt = results.deliveredAt;
        }

        return results;
    };
};
