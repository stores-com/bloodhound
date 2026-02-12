const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const UPS = require('../../carriers/ups');

test('UPS', { timeout: 25000 }, async (t) => {
    const bloodhound = new Bloodhound({
        ups: {
            client_id: process.env.UPS_CLIENT_ID,
            client_secret: process.env.UPS_CLIENT_SECRET
        }
    });

    t.test('ups.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const ups = new UPS();

        const validTrackingNumbers = [
            '1Z 6V86 4203 2379 4365',
            '1Z 12345E 66 05272234',
            'H9205817377',
            '1Z12345E6605272234',
            '1Z6V86420323794365',
            '1Z12345E0305271640',
            '1Z12345E0205271688',
            '1Z12345E0393657226',
            '1Z12345E1305277940',
            '1Z12345E6205277936',
            '1Z12345E1505270452',
            '1Z648616E192760718',
            '1ZWX0692YP40636269',
            '1Z12345E5991872040',
            '1Z12345E0390105056',
            '1Z12345E0290424025',
            '1Z12345E0194845039',
            '1z3913yy0344313151'
        ];

        const invalidTrackingNumbers = [
            '1Z12345E020527079'
        ];

        t.test('should detect valid UPS tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!ups.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} is not recognized as a valid UPS tracking number`);
                }
            });
        });

        t.test('should not detect invalid UPS tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (ups.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid UPS tracking number`);
                }
            });
        });
    });

    t.test('ups.track', async (t) => {
        t.test('should return tracking data', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1Z5338FF0107231059', 'ups', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'UPS');
            assert.strictEqual(actual.deliveredAt, undefined);
            assert.strictEqual(actual.shippedAt.toISOString(), '2024-03-18T18:03:06.000Z');
            assert.strictEqual(actual.url, 'https://www.ups.com/track?tracknum=1Z5338FF0107231059');
            assert.strictEqual(actual.events.length, 17);
        });
    });
});
