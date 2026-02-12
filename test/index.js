const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../index.js');

test('Error handling', { concurrency: true, timeout: 20000 }, async (t) => {
    const bloodhound = new Bloodhound({
        fedEx: {
            api_key: process.env.FEDEX_API_KEY,
            secret_key: process.env.FEDEX_SECRET_KEY,
            url: process.env.FEDEX_URL
        }
    });

    t.test('Should return an error when a tracking number is not specified', async () => {
        const err = await new Promise((resolve) => {
            bloodhound.track(null, 'fedex', (err) => resolve(err));
        });

        assert(err);
        assert.strictEqual(err.message, 'Tracking number is not specified.');
    });

    t.test('Should return an error when a carrier is not specified', async () => {
        const err = await new Promise((resolve) => {
            bloodhound.track('hello world', { carrier: null }, (err) => resolve(err));
        });

        assert(err);
        assert.strictEqual(err.message, 'Unknown carrier.');
    });

    t.test('Should return an error when a carrier is not supported', async () => {
        const err = await new Promise((resolve) => {
            bloodhound.track('449044304137821', 'foo', (err) => resolve(err));
        });

        assert(err);
        assert.strictEqual(err.message, 'Carrier foo is not supported.');
    });

    t.test('Should not return an error when a carrier is not specified but carrier can be guessed', async () => {
        await new Promise((resolve, reject) => {
            bloodhound.track('449044304137821', { carrier: null }, (err) => err ? reject(err) : resolve());
        });
    });
});

test('bloodhound.track', { concurrency: true }, async (t) => {
    const bloodhound = new Bloodhound({
        fedEx: {
            api_key: process.env.FEDEX_API_KEY,
            secret_key: process.env.FEDEX_SECRET_KEY,
            url: process.env.FEDEX_URL
        }
    });

    t.test('should support callbacks', async () => {
        const data = await new Promise((resolve, reject) => {
            bloodhound.track('449044304137821', 'fedex', (err, data) => err ? reject(err) : resolve(data));
        });

        assert.strictEqual(data.carrier, 'FedEx');
        assert(data.events.length > 0);
    });

    t.test('should support async/await', async () => {
        const data = await bloodhound.track('449044304137821', 'fedex');

        assert.strictEqual(data.carrier, 'FedEx');
        assert(data.events.length > 0);
    });

    t.test('should reject when using async/await with no tracking number', async () => {
        await assert.rejects(() => bloodhound.track(null, 'fedex'), {
            message: 'Tracking number is not specified.'
        });
    });

    t.test('should reject when using async/await with unknown carrier', async () => {
        await assert.rejects(() => bloodhound.track('hello world'), {
            message: 'Unknown carrier.'
        });
    });
});

test('bloodhound.guessCarrier', { concurrency: true }, async (t) => {
    const bloodhound = new Bloodhound();

    t.test('Should return an error for an unknown carrier', () => {
        assert.strictEqual(bloodhound.guessCarrier('hello world'), undefined);
    });

    t.test('Should guess a FedEx tracking number', () => {
        assert.strictEqual(bloodhound.guessCarrier('61299998620341515252'), 'FedEx');
    });

    t.test('Should guess a USPS tracking number', () => {
        assert.strictEqual(bloodhound.guessCarrier('9400111699000271800200'), 'USPS');
    });
});
