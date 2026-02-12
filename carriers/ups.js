const UPS = require('@stores.com/ups');

const USPS = require('./usps');

module.exports = function(options) {
    const ups = new UPS(options);
    const usps = new USPS(options?.usps);

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
                        state: activity.location?.address?.state
                    },
                    date: new Date(`${activity.gmtDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}T${activity.gmtTime}${activity.gmtOffset}`),
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
            if (options.usps && usps.isTrackingNumberValid(trackingNumber)) {
                return usps.track(trackingNumber, _options, callback);
            }

            callback(err);
        }
    };
};