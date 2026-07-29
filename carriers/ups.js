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
                    date: new Date(`${activity.gmtDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}T${activity.gmtTime}Z`),
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