const async = require('async');

// These process codes indicate the shipment was delivered
const DELIVERED_PROCESS_CODES = ['205'];

// These process codes indicate the shipment is in the carrier's network
const SHIPPED_PROCESS_CODES = ['200', '201', '202', '203', '208', '412'];

function GOFO() {
    this.isTrackingNumberValid = (trackingNumber) => {
        // Remove whitespace
        trackingNumber = trackingNumber.replace(/\s/g, '');
        trackingNumber = trackingNumber.toUpperCase();

        // GOFO tracking numbers: CR + 12 digits (e.g., CR000485623975)
        return /^CR\d{12}$/.test(trackingNumber);
    };

    this.track = async (trackingNumber, _options, callback) => {
        // Options are optional
        if (typeof _options === 'function') {
            callback = _options;
        }

        // Clean tracking number
        trackingNumber = trackingNumber.replace(/\s/g, '').toUpperCase();

        const results = {
            carrier: 'GOFO',
            events: [],
            url: `https://www.gofoexpress.com/tracking.html?searchID=${trackingNumber}`
        };

        try {
            const json = await async.retry(async () => {
                const response = await fetch('https://www.gofoexpress.com/cnee-api/consignee/track/query', {
                    body: JSON.stringify({ numberList: [trackingNumber] }),
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    method: 'POST',
                    signal: AbortSignal.timeout(30000)
                });

                if (!response.ok) {
                    throw new Error(`${response.status} ${response.statusText}`, { cause: response });
                }

                return await response.json();
            });

            results.raw = json;

            const shipment = json?.data?.success?.[0];

            if (!shipment) {
                return callback(null, results);
            }

            for (const event of shipment.trackEventList) {
                const eventDate = new Date(event.processDate);

                results.events.push({
                    address: {
                        city: event.processCity,
                        state: event.processProvince,
                        zip: event.processPostCode
                    },
                    date: eventDate,
                    description: event.processContent,
                    details: event.processCode
                });

                // Set shipped date from first shipping event
                if (SHIPPED_PROCESS_CODES.includes(event.processCode) && !results.shippedAt) {
                    results.shippedAt = eventDate;
                }

                // Set delivered date from delivery event
                if (DELIVERED_PROCESS_CODES.includes(event.processCode)) {
                    results.deliveredAt = eventDate;
                }
            }

            // Sort events chronologically (oldest first)
            results.events.sort((a, b) => a.date - b.date);

            callback(null, results);
        } catch (err) {
            callback(err);
        }
    };
}

module.exports = GOFO;
