const moment = require('moment-timezone');
const UPS = require('@stores.com/ups');

module.exports = function(options) {
    const ups = new UPS(options);

    this.isTrackingNumberValid = (trackingNumber) => {
        // Remove whitespace
        trackingNumber = trackingNumber.replace(/\s/g, '');
        trackingNumber = trackingNumber.toUpperCase();

        // https://www.ups.com/us/en/tracking/help/tracking/tnh.page
        if (/^1Z[0-9A-Z]{16}$/.test(trackingNumber)) {
            return true;
        }

        if (/^(H|T|J|K|F|W|M|Q|A)\d{10}$/.test(trackingNumber)) {
            return true;
        }

        return false;
    };

    this.track = async (trackingNumber, _options, callback) => {
        // Options are optional
        if (typeof _options === 'function') {
            callback = _options;
            _options = {};
        }

        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        try {
            const trackingData = await ups.getTracking(trackingNumber, _options);

            const results = {
                carrier: 'UPS',
                events: [],
                raw: trackingData,
                url: `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`
            };

            trackingData?.trackResponse?.shipment?.[0]?.package?.[0]?.activity?.forEach(activity => {
                // UPS sometimes returns an activity without a complete timestamp. Reading .replace() off a missing
                // gmtDate threw a TypeError that failed the entire tracking request, and a missing gmtTime
                // interpolated the string "undefined" into an Invalid Date that then flowed into deliveredAt and
                // shippedAt. Parse first and skip only the activity we can't place in time.
                let date;

                if (activity.gmtDate && activity.gmtTime) {
                    date = new Date(`${activity.gmtDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}T${activity.gmtTime}Z`);
                } else {
                    // Mail Innovations shipments carry no gmtDate, gmtTime or gmtOffset anywhere in the response —
                    // only `date` and `time`, which are the facility's local time with no offset. Interpret them in
                    // defaultTimezone the way dhl, pitneyBowes and usps do. Unlike those carriers this does not fall
                    // back to the host machine's timezone, which would make the same tracking number produce
                    // different timestamps on a laptop and in production.
                    //
                    // Parsed strictly on purpose: loosely, a missing `time` yields midnight in defaultTimezone and a
                    // truncated `date` yields the first of the month, both plausible-looking wrong timestamps that
                    // would flow into deliveredAt and shippedAt. Strict parsing leaves them Invalid so they're skipped.
                    date = moment.tz(`${activity.date} ${activity.time}`, 'YYYYMMDD HHmmss', true, options?.defaultTimezone || 'UTC').toDate();
                }

                if (isNaN(date.getTime())) {
                    return;
                }

                const event = {
                    address: {
                        city: activity.location?.address?.city,
                        country: activity.location?.address?.countryCode,
                        // The UPS API returns the state abbreviation in the `stateProvince` field,
                        // not `state`. Mapping to `state` here for consistency with other carriers.
                        state: activity.location?.address?.stateProvince
                    },
                    // The UPS API returns `gmtDate` and `gmtTime` as UTC values, along with a
                    // separate `gmtOffset` field representing the facility's local timezone offset.
                    // `gmtDate` and `gmtTime` are already UTC — appending `Z` produces the correct
                    // UTC timestamp. Previously `gmtOffset` was appended instead, which caused
                    // JavaScript to interpret the already-UTC time as a local time and shift it
                    // again by the offset, producing timestamps that were offset-hours too late.
                    //
                    // Example — Las Vegas delivery (PDT, -07:00):
                    //   gmtDate: "20260717", gmtTime: "20:16:53", gmtOffset: "-07:00"
                    //   Incorrect: new Date("2026-07-17T20:16:53-07:00") → 2026-07-18T03:16:53Z (7h too late)
                    //   Correct:   new Date("2026-07-17T20:16:53Z")      → 2026-07-17T20:16:53Z
                    date,
                    description: activity.status?.description?.trim()
                };

                if (activity?.status?.type === 'D') {
                    results.deliveredAt = event.date;
                } else if (activity?.status?.type === 'I') {
                    results.shippedAt = event.date;
                }

                results.events.push(event);
            });

            callback(null, results);
        } catch (err) {
            callback(err);
        }
    };
};