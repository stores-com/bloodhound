const XPO = require('@stores.com/xpo');

// https://www.xpo.com/cdn/files/s1/XPO_API_Shipment_Tracking_Guide.pdf Appendix 6.1
const DELIVERED_STATUS_CODES = ['10', '23', '28'];
const SHIPPED_STATUS_CODES = ['1', '2', '5', '6', '8', '25', '43', '44'];

module.exports = function(options) {
    const xpo = new XPO(options);

    this.isTrackingNumberValid = (trackingNumber) => {
        trackingNumber = trackingNumber.replace(/[\s-]/g, '');

        if (!/^\d{9}$/.test(trackingNumber)) {
            return false;
        }

        if (/^0+$/.test(trackingNumber)) {
            return false;
        }

        const checkDigit = Number(trackingNumber[8]);

        return (Number(trackingNumber.slice(0, 8)) % 7) === checkDigit;
    };

    this.track = async (trackingNumber, _options, callback) => {
        if (typeof _options === 'function') {
            callback = _options;
            _options = {};
        }

        if (!_options.minDate) {
            _options.minDate = new Date(0);
        }

        trackingNumber = trackingNumber.replace(/[\s-]/g, '');

        const results = {
            carrier: 'XPO',
            events: [],
            url: `https://ext-web.ltl-xpo.com/public-app/shipments?referenceNumber=${trackingNumber}`
        };

        try {
            const json = await xpo.getShipmentStatus(trackingNumber);

            results.raw = json;

            const shipment = json?.data?.shipmentStatusDtls?.[0];

            if (!shipment) {
                return callback(null, results);
            }

            if (shipment.estimatedDeliveryDate) {
                results.estimatedDeliveryDate = {
                    earliest: new Date(shipment.estimatedDeliveryDate),
                    latest: new Date(shipment.estimatedDeliveryDate)
                };
            }

            const statusCd = shipment.shipmentStatus?.statusCd;
            const statusDate = new Date(shipment.shipmentStatus?.dateTime);
            const statusDescription = shipment.shipmentStatus?.description || shipment.shipmentStatus?.reason;

            const currSic = shipment.currSic;

            if (statusCd) {
                const trackingEvent = {
                    address: {
                        city: currSic?.cityName,
                        state: currSic?.stateCd,
                        zip: currSic?.postalCd
                    },
                    date: statusDate,
                    description: statusDescription
                };

                if (trackingEvent.date >= _options.minDate) {
                    results.events.push(trackingEvent);
                }

                if (SHIPPED_STATUS_CODES.includes(statusCd)) {
                    results.shippedAt = shipment.pkupDate ? new Date(shipment.pkupDate) : statusDate;
                }

                if (DELIVERED_STATUS_CODES.includes(statusCd)) {
                    results.deliveredAt = shipment.finalDlvrDate ? new Date(shipment.finalDlvrDate) : statusDate;

                    if (!results.shippedAt) {
                        results.shippedAt = shipment.pkupDate ? new Date(shipment.pkupDate) : results.deliveredAt;
                    }
                }
            }

            callback(null, results);
        } catch (err) {
            if (err.message === '404 Not Found') {
                return callback(null, results);
            }

            callback(err);
        }
    };
};
