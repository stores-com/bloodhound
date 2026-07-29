const async = require('async');
const HttpError = require('@stores.com/http-error');

// These event codes indicate the shipment was delivered
const DELIVERED_EVENT_CODES = ['DLVD'];

// These event codes indicate the shipment is in the carrier's network.
//
// EXRL and INRL are deliberately absent. Both report "On its way to OnTrac" with a
// status of "Not Yet Received" and no location, and both carry the description "The
// package data was sent to OnTrac, but we have yet to receive the package from the
// sender." They mean the label exists, not that the carrier has the package, so the
// first in-network scan is ORIG.
const SHIPPED_EVENT_CODES = ['ARRD', 'LOAD', 'OFDL', 'ORIG', 'SFCT'];

function OnTrac() {
    this.isTrackingNumberValid = (trackingNumber) => {
        // Remove whitespace
        trackingNumber = trackingNumber.replace(/\s/g, '');
        trackingNumber = trackingNumber.toUpperCase();

        // 1LS prefix: 1LS + 12 alphanumeric characters (e.g., 1LSTEST00000001)
        if (/^1LS[A-Z0-9]{12}$/.test(trackingNumber)) {
            return true;
        }

        // LS prefix: LS + 8 digits (e.g., LS12345678)
        if (/^LS\d{8}$/.test(trackingNumber)) {
            return true;
        }

        // LX/LA/LI/LH/LE/LN prefix: L + [AIEHNX] + [1-3] + 7 digits (e.g., LX17635036)
        if (/^L[AIEHNX][1-3]\d{7}$/.test(trackingNumber)) {
            return true;
        }

        // D prefix: D + 14 digits (e.g., D10000000000001)
        if (/^D\d{14}$/.test(trackingNumber)) {
            return true;
        }

        return false;
    };

    this.track = async (trackingNumber, _options, callback) => {
        // Options are optional
        if (typeof _options === 'function') {
            callback = _options;
        }

        // Clean tracking number
        trackingNumber = trackingNumber.replace(/\s/g, '').toUpperCase();

        const results = {
            carrier: 'OnTrac',
            events: [],
            url: `https://www.ontrac.com/tracking/?number=${trackingNumber}`
        };

        try {
            const json = await async.retry(async () => {
                const response = await fetch(`https://webtrack.ontrac.com/PackageServices/tracking/${trackingNumber}`, {
                    signal: AbortSignal.timeout(30000)
                });

                // 404 means the tracking number was not found
                if (response.status === 404) {
                    return null;
                }

                if (!response.ok) {
                    throw await HttpError.from(response);
                }

                return await response.json();
            });

            results.raw = json;

            if (!json) {
                return callback(null, results);
            }

            const shipment = json?.Packages?.[0];

            if (!shipment) {
                return callback(null, results);
            }

            // Parse estimated delivery date
            if (shipment.UtcExpectedDeliveryDateTime) {
                const estimatedDeliveryDate = new Date(shipment.UtcExpectedDeliveryDateTime);

                results.estimatedDeliveryDate = {
                    earliest: estimatedDeliveryDate,
                    latest: estimatedDeliveryDate
                };
            }

            if (!shipment.Events) {
                return callback(null, results);
            }

            // Sort events chronologically (oldest first)
            shipment.Events.sort((a, b) => new Date(a.UtcEventDateTime) - new Date(b.UtcEventDateTime));

            for (const event of shipment.Events) {
                const eventDate = new Date(event.UtcEventDateTime);

                results.events.push({
                    address: {
                        city: event.City,
                        country: event.Country,
                        state: event.State,
                        zip: event.PostalCode
                    },
                    date: eventDate,
                    description: event.EventShortDescription
                });

                // Set shipped date from first shipping event
                if (SHIPPED_EVENT_CODES.includes(event.EventCode) && !results.shippedAt) {
                    results.shippedAt = eventDate;
                }

                // Set delivered date from delivery event
                if (DELIVERED_EVENT_CODES.includes(event.EventCode)) {
                    results.deliveredAt = eventDate;
                }
            }

            callback(null, results);
        } catch (err) {
            callback(err);
        }
    };
}

module.exports = OnTrac;
