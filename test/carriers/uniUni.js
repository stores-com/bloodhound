const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const UniUni = require('../../carriers/uniUni');

// Trimmed from UniUni's response for UUS69V2651047477274, out of order on purpose
const shipmentFixture = {
    data: {
        invalid_tno: '',
        valid_tno: [{
            estimate_time: '2026-10-05',
            spath_list: [
                { city: 'SAN DIEGO', dateTime: { ts: 1791134461 }, pathAddr: 'SAN DIEGO,CA', pathInfo: 'Delivered', province: 'CA', state: 203 },
                { city: '', dateTime: { ts: 1790700450 }, pathAddr: 'UNI DATA CENTER', pathInfo: 'Order received', province: '', state: 190 },
                { city: 'Dallas', dateTime: { ts: 1790722248 }, pathAddr: 'SAN DIEGO,CA', pathInfo: 'Gateway transit in', province: 'TX', state: 199 },
                { city: 'SAN DIEGO', dateTime: { ts: 1791124507 }, pathAddr: 'SAN DIEGO,CA', pathInfo: 'Out for delivery', province: 'CA', state: 202 }
            ],
            state: 203,
            tno: 'UUS69V2651047477274'
        }]
    },
    err_code: 1,
    ret_msg: '',
    status: 'SUCCESS'
};

function jsonResponse(body, status) {
    return Promise.resolve(new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: status || 200
    }));
}

test('UniUni', { timeout: 30000 }, async (t) => {
    const bloodhound = new Bloodhound();

    await t.test('uniUni.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const uniUni = new UniUni();

        const validTrackingNumbers = [
            'UUS69V2651047477274',
            'UUS6A52651744503857',
            'uus69v2651047477274',
            'UUS6 9V26 5104 7477 274'
        ];

        const invalidTrackingNumbers = [
            // Too short
            'UUS69V265104747727',
            // Too long
            'UUS69V26510474772741',
            // Wrong prefix
            'UUC69V2651047477274',
            // Invalid characters
            'UUS69V265104747727-',
            // GOFO format
            'CR000485623975',
            // UPS format
            '1Z12345E0205271688',
            // FedEx format
            '449044304137821',
            // Empty string
            ''
        ];

        await t.test('should detect valid UniUni tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!uniUni.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should be recognized as a valid UniUni tracking number`);
                }
            });
        });

        await t.test('should not detect invalid UniUni tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (uniUni.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid UniUni tracking number`);
                }
            });
        });
    });

    await t.test('uniUni.track', { concurrency: true }, async (t) => {
        await t.test('should return tracking information for a delivered shipment', async () => {
            const actual = await bloodhound.track('UUS6A52651744503857', 'UniUni');

            assert.strictEqual(actual.carrier, 'UniUni');
            assert(actual.events.length > 0);
            assert(actual.url.includes('UUS6A52651744503857'));
            assert(actual.shippedAt instanceof Date);
            assert(actual.deliveredAt instanceof Date);
            assert(actual.shippedAt <= actual.deliveredAt);

            actual.events.forEach(event => {
                assert(Object.hasOwn(event, 'address'));
                assert(event.date instanceof Date);
                assert(!isNaN(event.date));
                assert.strictEqual(typeof event.description, 'string');
                assert(event.description.length > 0);
            });

            for (let i = 1; i < actual.events.length; i++) {
                assert(actual.events[i - 1].date <= actual.events[i].date, 'Events should be sorted chronologically (oldest first)');
            }
        });

        await t.test('should guess the carrier from the tracking number', async () => {
            const actual = await bloodhound.track('uus69v2651047477274');

            assert.strictEqual(actual.carrier, 'UniUni');
            assert(actual.events.length > 0);
        });

        await t.test('should return empty events for an unknown tracking number', async () => {
            const actual = await bloodhound.track('UUS0000000000000000', 'uniuni');

            assert.strictEqual(actual.carrier, 'UniUni');
            assert.strictEqual(actual.events.length, 0);
            assert.strictEqual(actual.deliveredAt, undefined);
        });
    });

    await t.test('uniUni.track with a mocked response', async (t) => {
        await t.test('should map events, shippedAt, deliveredAt and estimatedDeliveryDate', async (t) => {
            t.mock.method(globalThis, 'fetch', () => jsonResponse(shipmentFixture));

            const actual = await new UniUni().track('UUS69V2651047477274');

            assert.deepStrictEqual(actual.events.map(event => event.details), [190, 199, 202, 203]);
            assert.deepStrictEqual(actual.events[1].address, { city: 'Dallas', state: 'TX' });
            assert.strictEqual(actual.events[3].description, 'Delivered');
            assert.strictEqual(actual.shippedAt.toISOString(), new Date(1790722248 * 1000).toISOString());
            assert.strictEqual(actual.deliveredAt.toISOString(), new Date(1791134461 * 1000).toISOString());
            assert.strictEqual(actual.estimatedDeliveryDate.earliest.toISOString(), '2026-10-05T00:00:00.000Z');
            assert.strictEqual(actual.estimatedDeliveryDate.latest.toISOString(), '2026-10-05T00:00:00.000Z');
        });

        await t.test('should not retry a 4xx', async (t) => {
            const fetchMock = t.mock.method(globalThis, 'fetch', () => jsonResponse({}, 403));

            await assert.rejects(() => new UniUni().track('UUS69V2651047477274'), (err) => {
                assert.strictEqual(err.cause.status, 403);

                return true;
            });

            assert.strictEqual(fetchMock.mock.calls.length, 1);
        });

        await t.test('should retry a 5xx', async (t) => {
            const fetchMock = t.mock.method(globalThis, 'fetch', () => jsonResponse({}, 500));

            await assert.rejects(() => new UniUni().track('UUS69V2651047477274'), (err) => {
                assert.strictEqual(err.cause.status, 500);

                return true;
            });

            // async.retry's default of 5 attempts
            assert.strictEqual(fetchMock.mock.calls.length, 5);
        });

        await t.test('should reject when UniUni does not answer SUCCESS', async (t) => {
            t.mock.method(globalThis, 'fetch', () => jsonResponse({ data: null, ret_msg: 'invalid key', status: 'FAILED' }));

            await assert.rejects(() => new UniUni().track('UUS69V2651047477274'), { message: 'invalid key' });
        });
    });
});
