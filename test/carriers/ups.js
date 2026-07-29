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

    await t.test('ups.track', async (t) => {
        await t.test('should return tracking data', async () => {
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
                                        location: { address: { city: 'Hodgkins', countryCode: 'US', stateProvince: 'IL' } },
                                        status: { description: 'Arrived at Facility', type: 'I' }
                                    },
                                    {
                                        gmtDate: '20251210',
                                        gmtTime: '05:59:00',
                                        gmtOffset: '+00:00',
                                        location: { address: { city: 'Maumee', countryCode: 'US', stateProvince: 'OH' } },
                                        status: { description: 'Departed from Facility', type: 'I' }
                                    },
                                    {
                                        gmtDate: '20251210',
                                        gmtTime: '02:08:47',
                                        gmtOffset: '+00:00',
                                        location: { address: { city: 'Maumee', countryCode: 'US', stateProvince: 'OH' } },
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

        await t.test('should correctly convert non-UTC gmtOffset events to UTC', async () => {
            // Regression test for two bugs in the UPS activity mapping:
            //
            // Bug 1 — Timestamps: gmtDate+gmtTime are already UTC values. Appending gmtOffset
            // caused JavaScript to treat the UTC time as a local time and shift it again by the
            // offset, producing timestamps offset-hours too late. For example:
            //   gmtDate: "20260717", gmtTime: "20:16:53", gmtOffset: "-07:00"
            //   Bug:  new Date("2026-07-17T20:16:53-07:00") → 2026-07-18T03:16:53Z  (7h too late)
            //   Fix:  new Date("2026-07-17T20:16:53Z")      → 2026-07-17T20:16:53Z  (correct)
            //
            // Bug 2 — State field: the UPS API returns state in `stateProvince`, not `state`.
            // Reading `address?.state` always produced undefined.
            nock('https://wwwcie.ups.com')
                .post('/security/v1/oauth/token')
                .reply(200, {
                    access_token: 'mock-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                });

            nock('https://wwwcie.ups.com')
                .get('/api/track/v1/details/1Z6V86420323794365')
                .query(true)
                .reply(200, {
                    trackResponse: {
                        shipment: [{
                            inquiryNumber: '1Z6V86420323794365',
                            package: [{
                                trackingNumber: '1Z6V86420323794365',
                                activity: [
                                    {
                                        // Las Vegas, NV — PDT (UTC-7)
                                        // Local time: 2026-07-17 13:16:53 PDT
                                        // gmtDate+gmtTime are already UTC: 2026-07-17T20:16:53Z
                                        gmtDate: '20260717',
                                        gmtTime: '20:16:53',
                                        gmtOffset: '-07:00',
                                        location: { address: { city: 'LAS VEGAS', countryCode: 'US', stateProvince: 'NV' } },
                                        status: { description: 'DELIVERED', type: 'D' }
                                    },
                                    {
                                        // Hodgkins, IL — CDT (UTC-5)
                                        // Local time: 2026-07-15 15:10:00 CDT
                                        // gmtDate+gmtTime are already UTC: 2026-07-15T20:10:00Z
                                        gmtDate: '20260715',
                                        gmtTime: '20:10:00',
                                        gmtOffset: '-05:00',
                                        location: { address: { city: 'Hodgkins', countryCode: 'US', stateProvince: 'IL' } },
                                        status: { description: 'Departed from Facility', type: 'I' }
                                    },
                                    {
                                        // New Stanton, PA — EDT (UTC-4)
                                        // Local time: 2026-07-14 23:52:47 EDT
                                        // gmtDate+gmtTime are already UTC: 2026-07-15T03:52:47Z
                                        gmtDate: '20260715',
                                        gmtTime: '03:52:47',
                                        gmtOffset: '-04:00',
                                        location: { address: { city: 'New Stanton', countryCode: 'US', stateProvince: 'PA' } },
                                        status: { description: 'Arrived at Facility', type: 'I' }
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
                bloodhound.track('1Z6V86420323794365', 'ups', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'UPS');
            assert.strictEqual(actual.events.length, 3);

            // Delivered — Las Vegas PDT (-07:00): gmtTime 20:16:53Z must not be shifted
            assert.strictEqual(actual.events[0].date.toISOString(), '2026-07-17T20:16:53.000Z');
            assert.strictEqual(actual.events[0].address.state, 'NV');
            assert.strictEqual(actual.deliveredAt.toISOString(), '2026-07-17T20:16:53.000Z');

            // Departed — Hodgkins CDT (-05:00): gmtTime 20:10:00Z must not be shifted
            assert.strictEqual(actual.events[1].date.toISOString(), '2026-07-15T20:10:00.000Z');
            assert.strictEqual(actual.events[1].address.state, 'IL');

            // Arrived — New Stanton EDT (-04:00): gmtTime 03:52:47Z must not be shifted
            assert.strictEqual(actual.events[2].date.toISOString(), '2026-07-15T03:52:47.000Z');
            assert.strictEqual(actual.events[2].address.state, 'PA');
            assert.strictEqual(actual.shippedAt.toISOString(), '2026-07-15T03:52:47.000Z');
        });

        await t.test('should skip activities with an incomplete timestamp', async () => {
            nock('https://wwwcie.ups.com')
                .post('/security/v1/oauth/token')
                .reply(200, {
                    access_token: 'mock-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                });

            nock('https://wwwcie.ups.com')
                .get('/api/track/v1/details/1Z6V86420323794365')
                .query(true)
                .reply(200, {
                    trackResponse: {
                        shipment: [{
                            inquiryNumber: '1Z6V86420323794365',
                            package: [{
                                trackingNumber: '1Z6V86420323794365',
                                activity: [
                                    {
                                        gmtDate: '20260717',
                                        gmtOffset: '-07:00',
                                        location: { address: { city: 'Las Vegas', countryCode: 'US', stateProvince: 'NV' } },
                                        status: { description: 'Missing gmtTime', type: 'D' }
                                    },
                                    {
                                        gmtOffset: '-05:00',
                                        gmtTime: '20:10:00',
                                        location: { address: { city: 'Hodgkins', countryCode: 'US', stateProvince: 'IL' } },
                                        status: { description: 'Missing gmtDate', type: 'D' }
                                    },
                                    {
                                        gmtDate: '20260715',
                                        gmtOffset: '-04:00',
                                        gmtTime: '03:52:47',
                                        location: { address: { city: 'New Stanton', countryCode: 'US', stateProvince: 'PA' } },
                                        status: { description: 'Arrived at Facility', type: 'I' }
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
                bloodhound.track('1Z6V86420323794365', 'ups', (err, data) => err ? reject(err) : resolve(data));
            });

            // Only the complete activity survives. Without the guard the missing gmtDate threw a TypeError that
            // failed the whole request, and the missing gmtTime set deliveredAt to an Invalid Date.
            assert.strictEqual(actual.events.length, 1);
            assert.strictEqual(actual.events[0].date.toISOString(), '2026-07-15T03:52:47.000Z');
            assert.strictEqual(actual.events[0].address.state, 'PA');
            assert.strictEqual(actual.deliveredAt, undefined);
            assert.strictEqual(actual.shippedAt.toISOString(), '2026-07-15T03:52:47.000Z');
        });
    });
});
