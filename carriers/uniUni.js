const async = require('async');
const moment = require('moment-timezone');

// UniUni's public tracking page groups its scan codes into milestones. Both lists below come from that grouping.
const DELIVERED_STATES = [203, 216, 228];

// Gateway transit in (199) is the first physical scan. The rest are UniUni's in-transit and out-for-delivery milestones.
// Order received (190, 1870) is electronic only.
const SHIPPED_STATES = [195, 199, 200, 202, 212, 213, 218, 219, 220, 231, 232, 255, 1910, 4010];

// The key UniUni's own tracking page (https://www.uniuni.com/tracking/) sends with every lookup
const TRACKING_KEY = 'SMq45nJhQuNR3WHsJA6N';

function UniUni() {
    this.isTrackingNumberValid = (trackingNumber) => {
        // Remove whitespace
        trackingNumber = trackingNumber.replace(/\s/g, '');
        trackingNumber = trackingNumber.toUpperCase();

        // UniUni tracking numbers: UUS + 16 letters and digits (e.g., UUS69V2651047477274)
        return /^UUS[0-9A-Z]{16}$/.test(trackingNumber);
    };

    this.track = async (trackingNumber) => {
        // Clean tracking number
        trackingNumber = trackingNumber.replace(/\s/g, '').toUpperCase();

        const results = {
            carrier: 'UniUni',
            events: [],
            url: `https://www.uniuni.com/tracking/?no=${trackingNumber}`
        };

        // A 4xx is a permanent answer for this tracking number, so it is not retried. A transport failure has no status
        // to judge and stays retryable.
        const json = await async.retry({ errorFilter: err => !(err?.cause?.status >= 400 && err?.cause?.status < 500) }, async () => {
            const response = await fetch(`https://tracking-service-api.uniuni.ca/tracking/trackinguniuninew?id=${encodeURIComponent(trackingNumber)}&key=${TRACKING_KEY}&source=web`, {
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`, { cause: response });
            }

            return await response.json();
        });

        results.raw = json;

        if (json?.status !== 'SUCCESS') {
            throw new Error(json?.ret_msg || 'UniUni tracking lookup failed');
        }

        // A tracking number UniUni doesn't know comes back in data.invalid_tno with an empty valid_tno
        const shipment = json.data?.valid_tno?.find(shipment => shipment.tno === trackingNumber);

        if (!shipment) {
            return results;
        }

        if (shipment.estimate_time) {
            const estimatedDeliveryDate = moment.utc(shipment.estimate_time, 'YYYY-MM-DD').toDate();

            results.estimatedDeliveryDate = {
                earliest: estimatedDeliveryDate,
                latest: estimatedDeliveryDate
            };
        }

        // city and province are where the scan happened. pathAddr is the destination city on every scan, so it's not used.
        for (const event of shipment.spath_list || []) {
            results.events.push({
                address: {
                    city: event.city,
                    state: event.province
                },
                date: new Date(event.dateTime.ts * 1000),
                description: event.pathInfo,
                details: event.state
            });
        }

        // Sort events chronologically (oldest first)
        results.events.sort((a, b) => a.date - b.date);

        for (const event of results.events) {
            // Set shipped date from first shipping event
            if (SHIPPED_STATES.includes(event.details) && !results.shippedAt) {
                results.shippedAt = event.date;
            }

            // Set delivered date from delivery event
            if (DELIVERED_STATES.includes(event.details)) {
                results.deliveredAt = event.date;
            }
        }

        return results;
    };
}

module.exports = UniUni;
