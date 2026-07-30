const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const UPS = require('../../carriers/ups');

test('UPS', async (t) => {
    await t.test('ups.isTrackingNumberValid', async (t) => {
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

        await t.test('should detect valid UPS tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!ups.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} is not recognized as a valid UPS tracking number`);
                }
            });
        });

        await t.test('should not detect invalid UPS tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (ups.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid UPS tracking number`);
                }
            });
        });
    });

    await t.test('ups.track', async (t) => {
        await t.test('should return tracking data', async () => {
            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/security/v1/oauth/token')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600, token_type: 'Bearer' }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                return Promise.resolve(new Response(JSON.stringify({
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
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
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
            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/security/v1/oauth/token')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600, token_type: 'Bearer' }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                return Promise.resolve(new Response(JSON.stringify({
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
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
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

        await t.test('should not apply gmtOffset for any offset UPS returns', async () => {
            // Captured from 1Z999AA10123456784, UPS's own published sample tracking number,
            // so it contains no customer data. Seven of its seventeen activities, each
            // verbatim, chosen to cover every distinct gmtOffset in the response
            // (-07:00, -06:00, -05:00, -04:00 and +01:00), all four status types
            // (D, I, M, X) and both activities that carry no city.
            //
            // The +01:00 activity matters most: every fixture before this one used a
            // negative offset, so nothing proved the sign was irrelevant. gmtDate and
            // gmtTime are already UTC, so the expected instants below are simply
            // gmtDate + gmtTime with gmtOffset ignored. Applying the offset — the bug
            // fixed in #167 — moves every one of them.
            const activity = [
                {
                    gmtDate: '20251205',
                    gmtOffset: '-06:00',
                    gmtTime: '16:29:38',
                    location: {
                        address: {
                            city: 'LONGVIEW',
                            countryCode: 'US',
                            stateProvince: 'TX'
                        }
                    },
                    status: {
                        code: '9E',
                        description: 'DELIVERED ',
                        type: 'D'
                    }
                },
                {
                    gmtDate: '20251205',
                    gmtOffset: '-06:00',
                    gmtTime: '16:20:03',
                    location: {
                        address: {
                            city: 'Longview',
                            countryCode: 'US',
                            stateProvince: 'TX'
                        }
                    },
                    status: {
                        code: 'OT',
                        description: 'Out For Delivery Today',
                        type: 'I'
                    }
                },
                {
                    gmtDate: '20251205',
                    gmtOffset: '-06:00',
                    gmtTime: '12:42:00',
                    location: {
                        address: {}
                    },
                    status: {
                        code: '18',
                        description: 'A late flight has caused a delay. Your package is scheduled to arrive today later than the communicated delivery time.',
                        type: 'X'
                    }
                },
                {
                    gmtDate: '20251205',
                    gmtOffset: '-05:00',
                    gmtTime: '09:34:00',
                    location: {
                        address: {
                            city: 'Louisville',
                            countryCode: 'US',
                            stateProvince: 'KY'
                        }
                    },
                    status: {
                        code: 'DP',
                        description: 'Departed from Facility',
                        type: 'I'
                    }
                },
                {
                    gmtDate: '20250820',
                    gmtOffset: '-04:00',
                    gmtTime: '19:35:41',
                    location: {
                        address: {
                            city: 'Swainsboro',
                            countryCode: 'US',
                            stateProvince: 'GA'
                        }
                    },
                    status: {
                        code: 'ZO',
                        description: 'The UPS Access Point\u2122 location has prepared the package for return to UPS or pickup by UPS.',
                        type: 'X'
                    }
                },
                {
                    gmtDate: '20250820',
                    gmtOffset: '-07:00',
                    gmtTime: '13:14:28',
                    location: {
                        address: {
                            city: 'Goodyear',
                            countryCode: 'US',
                            stateProvince: 'AZ'
                        }
                    },
                    status: {
                        code: 'OR',
                        description: 'Arrived at Facility',
                        type: 'I'
                    }
                },
                {
                    gmtDate: '20260216',
                    gmtOffset: '+01:00',
                    gmtTime: '14:50:07',
                    location: {
                        address: {
                            countryCode: 'DE'
                        }
                    },
                    status: {
                        code: 'MP',
                        description: 'Shipper created a label, UPS has not received the package yet. ',
                        type: 'M'
                    }
                }
            ];

            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/security/v1/oauth/token')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600, token_type: 'Bearer' }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                return Promise.resolve(new Response(JSON.stringify({
                    trackResponse: {
                        shipment: [{
                            inquiryNumber: '1Z999AA10123456784',
                            package: [{
                                activity,
                                trackingNumber: '1Z999AA10123456784'
                            }]
                        }]
                    }
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            const bloodhound = new Bloodhound({
                ups: {
                    client_id: 'test-client-id',
                    client_secret: 'test-client-secret'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1Z999AA10123456784', 'ups', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.deepStrictEqual(actual.events.map(event => event.date.toISOString()), [
                '2025-12-05T16:29:38.000Z',
                '2025-12-05T16:20:03.000Z',
                '2025-12-05T12:42:00.000Z',
                '2025-12-05T09:34:00.000Z',
                '2025-08-20T19:35:41.000Z',
                '2025-08-20T13:14:28.000Z',
                '2026-02-16T14:50:07.000Z'
            ]);

            // The two activities with no location still produce an event.
            assert.strictEqual(actual.events.length, 7);
        });

        await t.test('should return no events when UPS reports the tracking number is not found', async () => {
            // Captured verbatim. This is the most common outcome in our own data by a wide
            // margin, and nothing tested it: UPS answers 200 with a warnings array and no
            // `package` key at all, so every optional chain in the carrier has to hold.
            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/security/v1/oauth/token')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600, token_type: 'Bearer' }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                return Promise.resolve(new Response(JSON.stringify({
                    trackResponse: {
                        shipment: [{
                            inquiryNumber: '1ZW1R264YW05926068',
                            warnings: [{
                                code: 'TW0001',
                                message: 'Tracking Information Not Found'
                            }]
                        }]
                    }
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            const bloodhound = new Bloodhound({
                ups: {
                    client_id: 'test-client-id',
                    client_secret: 'test-client-secret'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1ZW1R264YW05926068', 'ups', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'UPS');
            assert.strictEqual(actual.events.length, 0);
            assert.strictEqual(actual.deliveredAt, undefined);
            assert.strictEqual(actual.shippedAt, undefined);
        });

        await t.test('should return no events when UPS omits the inquiry number entirely', async () => {
            // Same warnings shape, but with no `inquiryNumber` either. UPS returns this for
            // input it cannot parse as a tracking number at all.
            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/security/v1/oauth/token')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600, token_type: 'Bearer' }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                return Promise.resolve(new Response(JSON.stringify({
                    trackResponse: {
                        shipment: [{
                            warnings: [{
                                code: 'TW0001',
                                message: 'Tracking Information Not Found'
                            }]
                        }]
                    }
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
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
            assert.strictEqual(actual.events.length, 0);
        });

        await t.test('should return an error when UPS rejects the inquiry number', async () => {
            // Captured verbatim: UPS answers 400 with its own error envelope rather than a
            // warnings array. That has to surface as an error, not as an empty shipment.
            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/security/v1/oauth/token')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600, token_type: 'Bearer' }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                return Promise.resolve(new Response(JSON.stringify({
                    response: {
                        errors: [{
                            code: 'TV1002',
                            message: 'Invalid inquiry number'
                        }]
                    }
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 400
                }));
            });

            const bloodhound = new Bloodhound({
                ups: {
                    client_id: 'test-client-id',
                    client_secret: 'test-client-secret'
                }
            });

            const args = await new Promise((resolve) => {
                bloodhound.track('1Z5338FF0107231059', 'ups', (...args) => resolve(args));
            });

            assert.strictEqual(args[0].cause.status, 400);
            assert.strictEqual(args[1], undefined);
        });
    });
});
