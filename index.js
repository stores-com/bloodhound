const Amazon = require('./carriers/amazon');
const DHL = require('./carriers/dhl');
const FedEx = require('./carriers/fedEx');
const GOFO = require('./carriers/gofo');
const OnTrac = require('./carriers/onTrac');
const PitneyBowes = require('./carriers/pitneyBowes');
const UniUni = require('./carriers/uniUni');
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

    // UPS gets the caller's value unresolved: Mail Innovations activities are the only UPS timestamps without an
    // offset, and they assume UTC rather than the host machine's timezone when the caller sets no defaultTimezone
    if (options.ups) {
        options.ups.defaultTimezone = options.defaultTimezone;
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
    const uniUni = new UniUni(options && options.uniUni);
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
        } else if (uniUni.isTrackingNumberValid(trackingNumber)) {
            return 'UniUni';
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
        // 3.x accepted a callback. Throw instead of returning a promise the caller isn't awaiting.
        if (typeof callback === 'function' || typeof options === 'function') {
            throw new TypeError('bloodhound.track() no longer accepts a callback. Await the returned promise instead.');
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

        // These stay rejections rather than throws. Only misuse of the removed callback argument
        // throws synchronously; everything a caller can hit at runtime arrives on the promise,
        // which is where it did before the carriers returned promises of their own.
        if (!trackingNumber) {
            return Promise.reject(new Error('Tracking number is not specified.'));
        }

        // Try to guess the carrier
        if (!options.carrier) {
            options.carrier = this.guessCarrier(trackingNumber);

            // If we still don't know the carrier return an error
            if (!options.carrier) {
                return Promise.reject(new Error('Unknown carrier.'));
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
        } else if (options.carrier === 'pitney bowes') {
            carrier = pitneyBowes;
        } else if (options.carrier === 'uniuni') {
            carrier = uniUni;
        } else if (options.carrier === 'ups') {
            carrier = ups;
        } else if (options.carrier === 'usps') {
            carrier = usps;
        } else if (options.carrier === 'xpo') {
            carrier = xpo;
        } else {
            return Promise.reject(new Error(`Carrier ${options.carrier} is not supported.`));
        }

        return carrier.track(trackingNumber, options);
    };
}

module.exports = Bloodhound;