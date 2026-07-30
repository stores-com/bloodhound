const Amazon = require('./carriers/amazon');
const DHL = require('./carriers/dhl');
const FedEx = require('./carriers/fedEx');
const GOFO = require('./carriers/gofo');
const OnTrac = require('./carriers/onTrac');
const PitneyBowes = require('./carriers/pitneyBowes');
const XPO = require('./carriers/xpo');
const UPS = require('./carriers/ups');
const USPS = require('./carriers/usps');

function Bloodhound(options) {
    // Options are optional
    if (!options) {
        options = {};
    }

    // Propagate defaultTimezone to carriers that need it
    const defaultTimezone = options.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Ensure DHL options exist
    if (!options.dhl) {
        options.dhl = {};
    }

    options.dhl.defaultTimezone = defaultTimezone;

    if (options.pitneyBowes) {
        options.pitneyBowes.defaultTimezone = defaultTimezone;
    }

    if (options.usps) {
        options.usps.defaultTimezone = defaultTimezone;
    }

    // Allow DHL to use DHL eCommerce Solutions
    if (options.dhlEcommerceSolutions) {
        options.dhl.dhlEcommerceSolutions = options.dhlEcommerceSolutions;
    }

    const amazon = new Amazon(options && options.amazon);
    const dhl = new DHL(options && options.dhl);
    const fedEx = new FedEx(options && options.fedEx);
    const gofo = new GOFO(options && options.gofo);
    const onTrac = new OnTrac(options && options.onTrac);
    const pitneyBowes = new PitneyBowes(options && options.pitneyBowes);
    const xpo = new XPO(options && options.xpo);
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
        } else if (onTrac.isTrackingNumberValid(trackingNumber)) {
            return 'OnTrac';
        } else if (xpo.isTrackingNumberValid(trackingNumber)) {
            return 'XPO';
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
                } else if (['lasership', 'ontrac'].includes(options.carrier)) {
                    carrier = onTrac;
                } else if (['newgistics', 'pitney bowes'].includes(options.carrier)) {
                    carrier = pitneyBowes;
                } else if (options.carrier === 'ups') {
                    carrier = ups;
                } else if (options.carrier === 'usps') {
                    carrier = usps;
                } else if (options.carrier === 'xpo') {
                    carrier = xpo;
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