const assert = require('node:assert');
const test = require('node:test');

const nock = require('nock');

const Bloodhound = require('../../index');
const UPS = require('../../carriers/ups');

test('UPS', async (t) => {
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
            nock('https://wwwcie.ups.com')
                .post('/security/v1/oauth/token')
                .reply(200, {
                    access_token: 'mock-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                });

            nock('https://wwwcie.ups.com')
                .get('/api/track/v1/details/1Z5338FF0107231059')
                .query(true)
                .reply(200, {
                    trackResponse: {
                        shipment: [{
                            inquiryNumber: '1Z5338FF0107231059',
                            package: [{
                                trackingNumber: '1Z5338FF0107231059',
                                activity: [
                                    {
                                        gmtDate: '20251211',
                                        gmtTime: '15:41:00',
                                        gmtOffset: '+00:00',
                                        location: { address: { city: 'Hodgkins', countryCode: 'US', state: 'IL' } },
                                        status: { description: 'Arrived at Facility', type: 'I' }
                                    },
                                    {
                                        gmtDate: '20251210',
                                        gmtTime: '05:59:00',
                                        gmtOffset: '+00:00',
                                        location: { address: { city: 'Maumee', countryCode: 'US', state: 'OH' } },
                                        status: { description: 'Departed from Facility', type: 'I' }
                                    },
                                    {
                                        gmtDate: '20251210',
                                        gmtTime: '02:08:47',
                                        gmtOffset: '+00:00',
                                        location: { address: { city: 'Maumee', countryCode: 'US', state: 'OH' } },
                                        status: { description: 'Arrived at Facility', type: 'I' }
                                    },
                                    {
                                        gmtDate: '20251208',
                                        gmtTime: '21:40:24',
                                        gmtOffset: '+00:00',
                                        location: { address: { countryCode: 'US' } },
                                        status: { description: 'Shipper created a label, UPS has not received the package yet.', type: 'M' }
                                    }
                                ]
                            }]
                        }]
                    }
                });

            const bloodhound = new Bloodhound({
                ups: {
                    client_id: 'test-client-id',
                    client_secret: 'test-client-secret'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1Z5338FF0107231059', 'ups', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'UPS');
            assert.strictEqual(actual.deliveredAt, undefined);
            assert.strictEqual(actual.shippedAt.toISOString(), '2025-12-10T02:08:47.000Z');
            assert.strictEqual(actual.url, 'https://www.ups.com/track?tracknum=1Z5338FF0107231059');
            assert.strictEqual(actual.events.length, 4);
        });
    });
});
