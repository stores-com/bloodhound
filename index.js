const NodeGeocoder = require('node-geocoder');

const Amazon = require('./carriers/amazon');
const DHL = require('./carriers/dhl');
const FedEx = require('./carriers/fedEx');
const GOFO = require('./carriers/gofo');
const PitneyBowes = require('./carriers/pitneyBowes');
const UPS = require('./carriers/ups');
const USPS = require('./carriers/usps');

const geography = require('./util/geography');

function Bloodhound(options) {
    // Options are optional
    if (!options) {
        options = {};
    }

    // Optionally specify geocoder options
    if (options.geocoder) {
        geography.geocoder = NodeGeocoder(options.geocoder);
    }

    if (options.pettyCache) {
        // Allow DHL to cache geocode results in Redis (via petty-cache)
        if (options.dhl) {
            options.dhl.pettyCache = options.pettyCache;
        }

        // Allow PitneyBowes to cache geocode results in Redis (via petty-cache)
        if (options.pitneyBowes) {
            options.pitneyBowes.pettyCache = options.pettyCache;
        }

        // Allow UPS to cache geocode results in Redis (via petty-cache)
        if (options.ups) {
            options.ups.pettyCache = options.pettyCache;
        }

        // Allow USPS to cache geocode results in Redis (via petty-cache)
        if (options.usps) {
            options.usps.pettyCache = options.pettyCache;
        }
    }

    // Ensure DHL options exist
    if (!options.dhl) {
        options.dhl = {};
    }

    // Allow DHL to use DHL eCommerce Solutions
    if (options.dhlEcommerceSolutions) {
        options.dhl.dhlEcommerceSolutions = options.dhlEcommerceSolutions;
    }

    // Allow DHL to use USPS
    if (options.usps) {
        options.dhl.usps = options.usps;
    }

    // Allow UPS to use USPS for UPS Mail Innovations tracking numbers
    if (options.ups && options.usps) {
        options.ups.usps = options.usps;
    }

    const amazon = new Amazon(options && options.amazon);
    const dhl = new DHL(options && options.dhl);
    const fedEx = new FedEx(options && options.fedEx);
    const gofo = new GOFO(options && options.gofo);
    const pitneyBowes = new PitneyBowes(options && options.pitneyBowes);
    const ups = new UPS(options && options.ups);
    const usps = new USPS(options && options.usps);

    this.guessCarrier = (trackingNumber) => {
        if (amazon.isTrackingNumberValid(trackingNumber)) {
            return 'Amazon';
        } else if (dhl.isTrackingNumberValid(trackingNumber)) {
            return 'DHL';
        } else if (fedEx.isTrackingNumberValid(trackingNumber)) {
            return 'FedEx';
        } else if (gofo.isTrackingNumberValid(trackingNumber)) {
            return 'GOFO';
        } else if (ups.isTrackingNumberValid(trackingNumber)) {
            return 'UPS';
        } else if (usps.isTrackingNumberValid(trackingNumber)) {
            return 'USPS';
        } else {
            return undefined;
        }
    };

    this.track = (trackingNumber, options, callback) => {
        // Options are optional
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        // Backwards compatibility
        if (typeof options === 'string') {
            options = {
                carrier: options
            };
        }

        if (!options) {
            options = {};
        }

        const executor = () => {
            return new Promise((resolve, reject) => {
                if (!trackingNumber) {
                    return reject(new Error('Tracking number is not specified.'));
                }

                // Try to guess the carrier
                if (!options.carrier) {
                    options.carrier = this.guessCarrier(trackingNumber);

                    // If we still don't know the carrier return an error
                    if (!options.carrier) {
                        return reject(new Error('Unknown carrier.'));
                    }
                }

                options.carrier = options.carrier.toLowerCase();
                trackingNumber = trackingNumber.replace(/\s/g, '');
                trackingNumber = trackingNumber.toUpperCase();

                let carrier;

                if (['amazon', 'amazon shipping'].includes(options.carrier)) {
                    carrier = amazon;
                } else if (options.carrier === 'dhl') {
                    carrier = dhl;
                } else if (options.carrier === 'fedex') {
                    carrier = fedEx;
                } else if (options.carrier === 'gofo') {
                    carrier = gofo;
                } else if (['newgistics', 'pitney bowes'].includes(options.carrier)) {
                    carrier = pitneyBowes;
                } else if (options.carrier === 'ups') {
                    carrier = ups;
                } else if (options.carrier === 'usps') {
                    carrier = usps;
                } else {
                    return reject(new Error(`Carrier ${options.carrier} is not supported.`));
                }

                carrier.track(trackingNumber, options, (err, data) => err ? reject(err) : resolve(data));
            });
        };

        if (callback) {
            executor().then((result) => callback(null, result)).catch(callback);
        } else {
            return executor();
        }
    };
}

module.exports = Bloodhound;