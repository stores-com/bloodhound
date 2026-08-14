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

    await t.test('Should return an error when a tracking number is not specified', async () => {
        await assert.rejects(() => bloodhound.track(null, 'fedex'), {
            message: 'Tracking number is not specified.'
        });
    });

    await t.test('Should return an error when a carrier is not specified', async () => {
        await assert.rejects(() => bloodhound.track('hello world', { carrier: null }), {
            message: 'Unknown carrier.'
        });
    });

    await t.test('Should return an error when a carrier is not supported', async () => {
        await assert.rejects(() => bloodhound.track('449044304137821', 'foo'), {
            message: 'Carrier foo is not supported.'
        });
    });

    await t.test('Should not return an error when a carrier is not specified but carrier can be guessed', async () => {
        await bloodhound.track('449044304137821', { carrier: null });
    });

    await t.test('Should throw when a callback is passed instead of options', () => {
        assert.throws(() => bloodhound.track('449044304137821', () => {}), {
            message: 'bloodhound.track() no longer accepts a callback. Await the returned promise instead.',
            name: 'TypeError'
        });
    });

    await t.test('Should throw when a callback is passed after options', () => {
        assert.throws(() => bloodhound.track('449044304137821', 'fedex', () => {}), {
            message: 'bloodhound.track() no longer accepts a callback. Await the returned promise instead.',
            name: 'TypeError'
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

    await t.test('should resolve with tracking data', async () => {
        const data = await bloodhound.track('449044304137821', 'fedex');

        assert.strictEqual(data.carrier, 'FedEx');
        assert(data.events.length > 0);
    });

    await t.test('should reject when the carrier cannot be guessed', async () => {
        await assert.rejects(() => bloodhound.track('hello world'), {
            message: 'Unknown carrier.'
        });
    });
});

test('bloodhound.guessCarrier', { concurrency: true }, async (t) => {
    const bloodhound = new Bloodhound();

    await t.test('Should return an error for an unknown carrier', () => {
        assert.strictEqual(bloodhound.guessCarrier('hello world'), undefined);
    });

    await t.test('Should guess a FedEx tracking number', () => {
        assert.strictEqual(bloodhound.guessCarrier('61299998620341515252'), 'FedEx');
    });

    await t.test('Should guess a Freight Club tracking number', () => {
        assert.strictEqual(bloodhound.guessCarrier('FCT1009624087737139200'), 'Freight Club');
    });

    await t.test('Should guess a USPS tracking number', () => {
        assert.strictEqual(bloodhound.guessCarrier('9400111699000271800200'), 'USPS');
    });
});
