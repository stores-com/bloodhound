const HttpError = require('@stores.com/http-error');

// These event codes indicate the shipment was delivered
const DELIVERED_EVENT_CODES = ['Delivered'];

// These event codes indicate the shipment is in the carrier's network
const SHIPPED_EVENT_CODES = ['PickupDone', 'Received', 'InTransit', 'Departed', 'ArrivedAtSortCenter'];

function Amazon() {
    // Helper function to convert Amazon event codes to readable descriptions
    const parseEventDescription = (eventCode, statusSummary) => {
        const eventMap = {
            'ArrivedAtDeliveryCenter': 'Arrived at delivery center',
            'ArrivedAtSortCenter': 'Arrived at sort center',
            'AttemptFail': 'Delivery attempt failed',
            'CreationConfirmed': 'Shipping label created',
            'Delivered': 'Package delivered',
            'DeliveryAttempted': 'Delivery attempted',
            'Departed': 'Departed facility',
            'Exception': 'Exception occurred',
            'Held': 'Package held',
            'InTransit': 'Package in transit',
            'InTransitToCustomer': 'In transit to customer',
            'LabelCreated': 'Shipping label created',
            'OutForDelivery': 'Out for delivery',
            'OutForReturn': 'Out for return',
            'PickupDone': 'Package picked up',
            'Received': 'Package received at facility',
            'Refused': 'Package refused',
            'Returned': 'Package returned',
            'ReturnReceived': 'Return received',
            'Sorted': 'Package sorted',
            'Transferred': 'Package transferred',
            'Undeliverable': 'Package undeliverable'
        };

        // Use status summary if available, otherwise fall back to event code mapping
        if (statusSummary && statusSummary.localisedStringId) {
            // Convert localized string IDs to readable text
            const summaryMap = {
                'swa_rex_arrived_at_sort_center': 'Arrived at sort center',
                'swa_rex_delivered': 'Package delivered',
                'swa_rex_detail_arrived_at_delivery_Center': 'Arrived at delivery center',
                'swa_rex_detail_attempted': 'Delivery attempted',
                'swa_rex_detail_creation_confirmed': 'Shipping label created',
                'swa_rex_detail_delivered': 'Package delivered',
                'swa_rex_detail_departed': 'Departed facility',
                'swa_rex_detail_exception': 'Exception occurred',
                'swa_rex_detail_held': 'Package held',
                'swa_rex_detail_in_transit': 'Package in transit',
                'swa_rex_detail_pickedUp': 'Package picked up',
                'swa_rex_detail_refused': 'Package refused',
                'swa_rex_detail_returned': 'Package returned',
                'swa_rex_detail_undeliverable': 'Package undeliverable',
                'swa_rex_intransit': 'Package in transit',
                'swa_rex_ofd': 'Out for delivery',
                'swa_rex_shipping_label_created': 'Shipping label created'
            };

            return summaryMap[statusSummary.localisedStringId] || statusSummary.localisedStringId;
        }

        return eventMap[eventCode] || eventCode;
    };

    this.isTrackingNumberValid = trackingNumber => {
        // Remove whitespace
        trackingNumber = trackingNumber.replace(/\s/g, '');
        trackingNumber = trackingNumber.toUpperCase();

        // Amazon Shipping tracking numbers: TB + (A|B|C) + 12 digits
        return /^TB[A-CM][0-9]{12}$/.test(trackingNumber);
    };

    this.track = async (trackingNumber, _options = {}) => {
        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        // Clean tracking number
        trackingNumber = trackingNumber.replace(/\s/g, '').toUpperCase();

        const res = await fetch(`https://track.amazon.com/api/tracker/${trackingNumber}`, {
            signal: AbortSignal.timeout(30000)
        });

        if (!res.ok) {
            throw await HttpError.from(res);
        }

        const json = await res.json();

        const results = {
            carrier: 'Amazon',
            events: [],
            raw: json,
            url: `https://track.amazon.com/tracking/${trackingNumber}`
        };

        if (!json) {
            // No data returned, return empty results
            return results;
        }

        if (json.progressTracker) {
            const progressTracker = typeof json.progressTracker === 'string' ? JSON.parse(json.progressTracker) : json.progressTracker;

            if (progressTracker.summary.metadata.expectedDeliveryDate) {
                let dateValue = progressTracker.summary.metadata.expectedDeliveryDate;
                if (typeof dateValue === 'object' && dateValue.date) {
                    dateValue = dateValue.date;
                }
                const isoDate = new Date(dateValue);
                results.estimatedDeliveryDate = {
                    earliest: isoDate,
                    latest: isoDate
                };
            }
        }

        // Parse event history for detailed tracking events
        if (json.eventHistory) {
            const eventHistory = typeof json.eventHistory === 'string' ? JSON.parse(json.eventHistory) : json.eventHistory;
            if (eventHistory.eventHistory && Array.isArray(eventHistory.eventHistory)) {
                for (let i = 0; i < eventHistory.eventHistory.length; i++) {
                    const event = eventHistory.eventHistory[i];

                    const trackingEvent = {
                        address: {},
                        date: new Date(event.eventTime),
                        description: parseEventDescription(event.eventCode, event.statusSummary),
                        details: event.eventCode
                    };

                    // Add location information if available
                    if (event.location) {
                        trackingEvent.address = {
                            city: event.location.city,
                            state: event.location.stateProvince,
                            country: event.location.countryCode,
                            zip: event.location.postalCode
                        };
                    }

                    // Set shipping date for events that indicate movement in carrier network
                    if (SHIPPED_EVENT_CODES.includes(event.eventCode) && !results.shippedAt) {
                        results.shippedAt = new Date(event.eventTime);
                    }

                    // Set delivery date for delivery events
                    if (DELIVERED_EVENT_CODES.includes(event.eventCode)) {
                        results.deliveredAt = new Date(event.eventTime);
                    }

                    // Filter events after minDate
                    if (trackingEvent.date >= _options.minDate) {
                        results.events.push(trackingEvent);
                    }
                }
            }
        }
        results.events.sort((a, b) => a.date - b.date);

        return results;
    };
}

module.exports = Amazon;