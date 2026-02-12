const async = require('async');
const NodeGeocoder = require('node-geocoder');
const normalize = require('us-states-normalize');
const PettyCache = require('petty-cache');
const tzlookup = require('tz-lookup');

let pettyCache;

const geocode = (location, callback) => {
    async.auto({
        geocode: (callback) => {
            // Geocode the location
            async.retry((callback) => {
                exports.geocoder.geocode(location, callback);
            }, (err, results) => {
                if (err) {
                    return callback(err);
                }

                if (!results.length) {
                    return callback();
                }

                const firstResult = results[0];

                // Handle Google results
                if (!firstResult.state && firstResult.administrativeLevels && firstResult.administrativeLevels.level1short) {
                    firstResult.state = firstResult.administrativeLevels.level1short;
                }

                // Check to see if the first result has the data we need
                if (firstResult.city && firstResult.state && firstResult.zipcode) {
                    return callback(null, firstResult);
                }

                // Reverse geocode to ensure we get a city, state, and zip
                async.retry((callback) => {
                    exports.geocoder.reverse({ lat: firstResult.latitude, lon: firstResult.longitude }, callback);
                }, (err, results) => {
                    if (err) {
                        return callback(err);
                    }

                    const firstResult = results[0];

                    // Handle Google results
                    if (!firstResult.state && firstResult.administrativeLevels && firstResult.administrativeLevels.level1short) {
                        firstResult.state = firstResult.administrativeLevels.level1short;
                    }

                    callback(null, results[0]);
                });
            });
        }
    }, (err, results) => {
        if (err) {
            return callback(err);
        }

        if (!results.geocode) {
            return callback();
        }

        callback(null, {
            city: results.geocode.city,
            state: normalize(results.geocode.state),
            timezone: tzlookup(results.geocode.latitude, results.geocode.longitude)
        });
    });
}

exports.addressToString = (address) => {
    let value = '';

    if (address.city) {
        value += address.city.trim();
    }

    if (address.state) {
        if (value) {
            value += ',';
        }

        value += ` ${address.state.trim()}`;
    }

    if (address.zip) {
        value += ` ${address.zip.trim()}`;
    }

    if (address.country) {
        if (value) {
            value += ',';
        }

        value += ` ${address.country.trim()}`;
    }

    return value.trim();
};

exports.parseLocation = async.memoize((location, options, callback) => {
    // Options are optional
    if (typeof options === 'function') {
        callback = options;
        options = undefined;
    }

    if (!location) {
        return callback();
    }

    // Use Redis (via Petty Cache)
    if (options?.pettyCache) {
        if (!pettyCache) {
            pettyCache = new PettyCache(options.pettyCache.port, options.pettyCache.host, options.pettyCache.options);
        }

        // Cache between 11-12 months
        return pettyCache.fetch(`bloodhound.geocode:${location}`, (callback) => {
            geocode(location, callback);
        }, { ttl: { min: 28512000000, max: 31104000000 } }, callback);
    }

    geocode(location, callback);
});

exports.geocoder = NodeGeocoder({ apiKey: process.env.GOOGLE_API_KEY, language: 'en', provider: 'google', region: '.us' });