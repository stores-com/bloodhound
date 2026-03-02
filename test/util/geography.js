const assert = require('node:assert');
const test = require('node:test');

const NodeGeocoder = require('node-geocoder');

const geography = require('../../util/geography');

test('geography.addressToString', { concurrency: true }, async (t) => {
    t.test('New York', () => {
        const address = {
            city: 'New York'
        };

        assert.strictEqual(geography.addressToString(address), 'New York');
    });

    t.test('NY', () => {
        const address = {
            state: 'NY'
        };

        assert.strictEqual(geography.addressToString(address), 'NY');
    });

    t.test('New York, NY', () => {
        const address = {
            city: 'New York',
            state: 'NY'
        };

        assert.strictEqual(geography.addressToString(address), 'New York, NY');
    });

    t.test('New York, NY 10001', () => {
        const address = {
            city: 'New York',
            state: 'NY',
            zip: '10001'
        };

        assert.strictEqual(geography.addressToString(address), 'New York, NY 10001');
    });

    t.test('New York, NY 10001, US', () => {
        const address = {
            city: 'New York',
            country: 'US',
            state: 'NY',
            zip: '10001'
        };

        assert.strictEqual(geography.addressToString(address), 'New York, NY 10001, US');
    });

    t.test('US', () => {
        const address = {
            country: 'US'
        };

        assert.strictEqual(geography.addressToString(address), 'US');
    });
});

test('geography.parseLocation', { timeout: 15000 }, async (t) => {
    t.test('should not error on empty strings', async () => {
        const actual = await new Promise((resolve, reject) => {
            geography.parseLocation('', (err, actual) => err ? reject(err) : resolve(actual));
        });

        assert.deepStrictEqual(actual, undefined);
    });

    t.test('New York NY', async () => {
        const actual = await new Promise((resolve, reject) => {
            geography.parseLocation('New York NY', (err, actual) => err ? reject(err) : resolve(actual));
        });

        assert.strictEqual(actual.city, 'New York');
        assert.strictEqual(actual.state, 'NY');
        assert.strictEqual(actual.timezone, 'America/New_York');
    });

    t.test('O FALLON, MO', async () => {
        const actual = await new Promise((resolve, reject) => {
            geography.parseLocation('O FALLON, MO', (err, actual) => err ? reject(err) : resolve(actual));
        });

        assert.strictEqual(actual.city, 'O\'Fallon');
        assert.strictEqual(actual.state, 'MO');
        assert.strictEqual(actual.timezone, 'America/Chicago');
    });
});

test('petty-cache', { concurrency: true, timeout: 15000 }, async (t) => {
    t.test('should store results in Redis (via petty-cache) - Carrollton, TX', async () => {
        const actual = await new Promise((resolve, reject) => {
            geography.parseLocation('Carrollton, TX', { pettyCache: {} }, (err, actual) => err ? reject(err) : resolve(actual));
        });

        const expected = {
            city: 'Carrollton',
            state: 'TX',
            timezone: 'America/Chicago'
        };

        assert.deepStrictEqual(actual, expected);
    });

    t.test('should store results in Redis (via petty-cache) - Lake Saint Louis, MO', async () => {
        const actual = await new Promise((resolve, reject) => {
            geography.parseLocation('Lake Saint Louis, MO', { pettyCache: {} }, (err, actual) => err ? reject(err) : resolve(actual));
        });

        const expected = {
            city: 'Lake Saint Louis',
            state: 'MO',
            timezone: 'America/Chicago'
        };

        assert.deepStrictEqual(actual, expected);
    });
});

test('geography.parseLocation without GOOGLE_API_KEY', { timeout: 15000 }, async (t) => {
    const originalKey = process.env.GOOGLE_API_KEY;

    t.before(() => {
        delete process.env.GOOGLE_API_KEY;
    });

    t.after(() => {
        if (originalKey) {
            process.env.GOOGLE_API_KEY = originalKey;
        }
    });

    t.test('should return null when GOOGLE_API_KEY is not set', async () => {
        const actual = await new Promise((resolve, reject) => {
            geography.parseLocation('Los Angeles, CA', (err, actual) => err ? reject(err) : resolve(actual));
        });

        assert.strictEqual(actual, null);
    });
});

test('Google geocoder', async (t) => {
    const geocoder = geography.geocoder;
    geography.geocoder = NodeGeocoder({ apiKey: process.env.GOOGLE_API_KEY, language: 'en', provider: 'google', region: '.us' });

    t.after(() => {
        geography.geocoder = geocoder;
    });

    t.test('Los Angeles, CA', async () => {
        const actual = await new Promise((resolve, reject) => {
            geography.parseLocation('Los Angeles, CA', (err, actual) => err ? reject(err) : resolve(actual));
        });

        const expected = {
            city: 'Los Angeles',
            state: 'CA',
            timezone: 'America/Los_Angeles'
        };

        assert.deepStrictEqual(actual, expected);
    });
});
