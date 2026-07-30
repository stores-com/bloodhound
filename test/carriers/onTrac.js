const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const OnTrac = require('../../carriers/onTrac');

// Captured verbatim on 2026-07-29 by requesting a tracking number OnTrac no longer has
// on file. The live response also carries a per-request `traceId`, omitted here because
// it changes on every call.
const NOT_FOUND_RESPONSE = {
    Status: 404,
    Title: 'Not Found',
    Type: 'https://tools.ietf.org/html/rfc9110#section-15.5.5'
};

// Captured on 2026-07-29 from a real OnTrac shipment, then sanitized so it can live in
// a public repo: the tracking number was replaced, the delivery event's city/state/zip
// were swapped for another location in the same timezone, and the response's Consignee,
// PodText, VpodImageUrl, SignatureImageString and Reference fields were dropped. Every
// field this package reads is exactly as OnTrac returned it — the codes, the
// descriptions and all eleven timestamps are untouched.
//
// Two things worth knowing, both of which this fixture is here to pin down:
//
// 1. OnTrac returns events newest-first, so the chronological sort is load-bearing.
// 2. `UtcEventDateTime` really is UTC. Each event also carries `ZonedEventDateTime` and
//    `TimeZone`, and this shipment moved through both America/Chicago and
//    America/New_York facilities — the origin scan is 2026-07-22 locally and 2026-07-23
//    in UTC. Those two fields are kept purely as evidence; the package never reads them.
//
// `UtcExpectedDeliveryDateTime` is the odd one out: despite the name OnTrac returns it
// with the facility's offset rather than in UTC. The offset is explicit, so `new Date()`
// still resolves it to the correct instant.
const TRACKING_RESPONSE = {
    Packages: [{
        Events: [
            {
                City: 'WARREN',
                Country: 'US',
                EventCode: 'DLVD',
                EventLongDescription: 'Your package has been delivered',
                EventShortDescription: 'Package Delivered',
                PostalCode: '48089',
                State: 'MI',
                Status: 'Delivered',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-07-24T21:50:59+00:00',
                ZonedEventDateTime: '2026-07-24T17:50:59-04:00'
            },
            {
                City: 'ROMULUS',
                Country: 'US',
                EventCode: 'OFDL',
                EventLongDescription: 'Your package is out for delivery',
                EventShortDescription: 'Out for Delivery',
                PostalCode: '48174',
                State: 'MI',
                Status: 'In Transit',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-07-24T15:21:09+00:00',
                ZonedEventDateTime: '2026-07-24T11:21:09-04:00'
            },
            {
                City: 'ROMULUS',
                Country: 'US',
                EventCode: 'LOAD',
                EventLongDescription: 'Your package has been loaded onto a vehicle',
                EventShortDescription: 'Loaded onto vehicle',
                PostalCode: '48174',
                State: 'MI',
                Status: 'In Transit',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-07-24T11:56:04+00:00',
                ZonedEventDateTime: '2026-07-24T07:56:04-04:00'
            },
            {
                City: 'ROMULUS',
                Country: 'US',
                EventCode: 'SFCT',
                EventLongDescription: 'Package received by your local OnTrac facility and is processing for delivery, see Estimated Delivery Date',
                EventShortDescription: 'Arrived at Final Servicing Facility',
                PostalCode: '48174',
                State: 'MI',
                Status: 'In Transit',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-07-24T08:54:26+00:00',
                ZonedEventDateTime: '2026-07-24T04:54:26-04:00'
            },
            {
                City: 'LOCKBOURNE',
                Country: 'US',
                EventCode: 'ARRD',
                EventLongDescription: 'Your package has been received and is on its way to your OnTrac Facility, see Estimated Delivery Date',
                EventShortDescription: 'Arrived at Facility',
                PostalCode: '43137',
                State: 'OH',
                Status: 'In Transit',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-07-24T00:14:47+00:00',
                ZonedEventDateTime: '2026-07-23T20:14:47-04:00'
            },
            {
                City: 'ROMEOVILLE',
                Country: 'US',
                EventCode: 'ORIG',
                EventLongDescription: 'Your package has been received and is on its way to your OnTrac Facility, see Estimated Delivery Date',
                EventShortDescription: 'Origin Scan',
                PostalCode: '60446',
                State: 'IL',
                Status: 'In Transit',
                TimeZone: 'America/Chicago',
                UtcEventDateTime: '2026-07-23T01:52:28+00:00',
                ZonedEventDateTime: '2026-07-22T20:52:28-05:00'
            },
            {
                City: null,
                Country: null,
                EventCode: 'INRL',
                EventLongDescription: 'The package data was sent to OnTrac, but we have yet to receive the package from the sender. Tracking will update once it arrives. Please contact the sender for more information',
                EventShortDescription: 'On its way to OnTrac',
                PostalCode: null,
                State: null,
                Status: 'Not Yet Received',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-07-21T15:30:25+00:00',
                ZonedEventDateTime: '2026-07-21T11:30:25-04:00'
            }
        ],
        Tracking: '1LSTEST00000001',
        UtcExpectedDeliveryDateTime: '2026-07-24T14:00:00-04:00'
    }]
};

// A second real shipment, captured and sanitized the same way. This one exists because
// it carries an EXRL scan, which is the code we used to treat as shipped. OnTrac reports
// it as "Not Yet Received" with no location and says outright that it does not have the
// package yet, so shippedAt has to come from the ORIG scan 18 hours later instead.
const EXRL_TRACKING_RESPONSE = {
    Packages: [{
        Events: [
            {
                City: 'ORLANDO',
                Country: 'US',
                EventCode: 'DLVD',
                EventLongDescription: 'Your package has been delivered',
                EventShortDescription: 'Package Delivered',
                PostalCode: '32801',
                State: 'FL',
                Status: 'Delivered',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-02-03T18:30:43+00:00',
                ZonedEventDateTime: '2026-02-03T13:30:43-05:00'
            },
            {
                City: 'ORLANDO',
                Country: 'US',
                EventCode: 'OFDL',
                EventLongDescription: 'Your package is out for delivery',
                EventShortDescription: 'Out for Delivery',
                PostalCode: '32819',
                State: 'FL',
                Status: 'In Transit',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-02-03T15:09:50+00:00',
                ZonedEventDateTime: '2026-02-03T10:09:50-05:00'
            },
            {
                City: 'ORLANDO',
                Country: 'US',
                EventCode: 'LOAD',
                EventLongDescription: 'Your package has been loaded onto a vehicle',
                EventShortDescription: 'Loaded onto vehicle',
                PostalCode: '32819',
                State: 'FL',
                Status: 'In Transit',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-02-03T14:38:04+00:00',
                ZonedEventDateTime: '2026-02-03T09:38:04-05:00'
            },
            {
                City: 'ORLANDO',
                Country: 'US',
                EventCode: 'SFCT',
                EventLongDescription: 'Package received by your local OnTrac facility and is processing for delivery, see Estimated Delivery Date',
                EventShortDescription: 'Arrived at Final Servicing Facility',
                PostalCode: '32819',
                State: 'FL',
                Status: 'In Transit',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-02-03T03:58:36+00:00',
                ZonedEventDateTime: '2026-02-02T22:58:36-05:00'
            },
            {
                City: 'ORLANDO',
                Country: 'US',
                EventCode: 'ORIG',
                EventLongDescription: 'Your package has been received and is on its way to your OnTrac Facility, see Estimated Delivery Date',
                EventShortDescription: 'Origin Scan',
                PostalCode: '32819',
                State: 'FL',
                Status: 'In Transit',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-02-03T03:56:01+00:00',
                ZonedEventDateTime: '2026-02-02T22:56:01-05:00'
            },
            {
                City: null,
                Country: null,
                EventCode: 'EXRL',
                EventLongDescription: 'The package data was sent to OnTrac, but we have yet to receive the package from the sender. Tracking will update once it arrives. Please contact the sender for more information',
                EventShortDescription: 'On its way to OnTrac',
                PostalCode: null,
                State: null,
                Status: 'Not Yet Received',
                TimeZone: 'America/New_York',
                UtcEventDateTime: '2026-02-02T09:36:08+00:00',
                ZonedEventDateTime: '2026-02-02T04:36:08-05:00'
            }
        ],
        Tracking: '1LSTEST00000002',
        UtcExpectedDeliveryDateTime: '2026-02-03T00:00:00-05:00'
    }]
};

test('OnTrac', { timeout: 30000 }, async (t) => {
    const bloodhound = new Bloodhound();

    await t.test('onTrac.isTrackingNumberValid', async (t) => {
        const onTrac = new OnTrac();

        const validTrackingNumbers = [
            // 1LS prefix (alphanumeric)
            '1LSTEST00000001',
            '1lstest00000001',
            '1LS TES T000 00001',
            '1LSTEST00000002',
            // LS prefix
            'LS12345678',
            'ls12345678',
            // LX prefix
            'LX17635036',
            'LX11234567',
            // LA/LI/LH/LE/LN prefix
            'LA11234567',
            'LI12976442',
            'LH11234567',
            'LE11234567',
            'LN11234567',
            // D prefix — the format OnTrac issues for most of our current shipments
            'D10000000000001',
            'd10000000000001'
        ];

        const invalidTrackingNumbers = [
            // Too short
            '1LSTEST0000001',
            // Too long
            '1LSTEST000000012',
            // Wrong prefix
            '2LSTEST00000001',
            // LS with letters
            'LS1234567A',
            // LS too short
            'LS1234567',
            // LS too long
            'LS123456789',
            // LX wrong second char
            'LZ11234567',
            // LX wrong third char
            'LX41234567',
            // UPS format
            '1Z12345E0205271688',
            // Empty string
            '',
            // FedEx format
            '449044304137821',
            // D with 13 digits
            'D1000000000000',
            // D with 15 digits
            'D100000000000000',
            // D with letters
            'D1000000000000A',
            // C prefix — OnTrac 404s every one of these, so we don't claim them
            'C12340000000001'
        ];

        await t.test('should detect valid OnTrac tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!onTrac.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should be recognized as a valid OnTrac tracking number`);
                }
            });
        });

        await t.test('should not detect invalid OnTrac tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (onTrac.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid OnTrac tracking number`);
                }
            });
        });
    });

    await t.test('onTrac.track', async (t) => {
        await t.test('should return tracking data', async () => {
            const fetchMock = t.mock.method(globalThis, 'fetch', () => {
                return Promise.resolve(new Response(JSON.stringify(TRACKING_RESPONSE), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSTEST00000001', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(fetchMock.mock.callCount(), 1);
            assert.strictEqual(fetchMock.mock.calls[0].arguments[0], 'https://webtrack.ontrac.com/PackageServices/tracking/1LSTEST00000001');

            assert.strictEqual(actual.carrier, 'OnTrac');
            assert.strictEqual(actual.events.length, 7);
            assert.strictEqual(actual.url, 'https://www.ontrac.com/tracking/?number=1LSTEST00000001');

            // ORIG is the earliest event carrying a code we count as shipped. INRL is
            // earlier still, but OnTrac hasn't taken possession at that point.
            assert.strictEqual(actual.shippedAt.toISOString(), '2026-07-23T01:52:28.000Z');
            assert.strictEqual(actual.deliveredAt.toISOString(), '2026-07-24T21:50:59.000Z');

            // UtcExpectedDeliveryDateTime is '2026-07-24T14:00:00-04:00' — 2pm at an
            // America/New_York facility, which is 18:00Z.
            assert.strictEqual(actual.estimatedDeliveryDate.earliest.toISOString(), '2026-07-24T18:00:00.000Z');
            assert.strictEqual(actual.estimatedDeliveryDate.latest.toISOString(), '2026-07-24T18:00:00.000Z');
        });

        await t.test('should sort events oldest first without shifting any timestamp', async () => {
            // OnTrac sends events newest-first, so this is what proves we reversed them.
            // The origin scan is also the one that catches an offset bug: it happened at
            // 20:52:28 on 2026-07-22 at an America/Chicago facility, which is 01:52:28 on
            // 2026-07-23 in UTC — a different calendar day. Applying that -05:00 offset to
            // UtcEventDateTime, which is already UTC, shifts this event off 2026-07-23.
            // That is the bug that was live in ups.js until #167.
            //
            // Reading ZonedEventDateTime instead would be harmless — it carries an explicit
            // offset for the same instant, so it parses identically. The danger is only in
            // re-applying an offset to a value that already has one.
            t.mock.method(globalThis, 'fetch', () => {
                return Promise.resolve(new Response(JSON.stringify(TRACKING_RESPONSE), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSTEST00000001', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.deepStrictEqual(actual.events.map(event => event.date.toISOString()), [
                '2026-07-21T15:30:25.000Z',
                '2026-07-23T01:52:28.000Z',
                '2026-07-24T00:14:47.000Z',
                '2026-07-24T08:54:26.000Z',
                '2026-07-24T11:56:04.000Z',
                '2026-07-24T15:21:09.000Z',
                '2026-07-24T21:50:59.000Z'
            ]);
        });

        await t.test('should map each event address and description', async () => {
            t.mock.method(globalThis, 'fetch', () => {
                return Promise.resolve(new Response(JSON.stringify(TRACKING_RESPONSE), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSTEST00000001', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            // The origin scan, second-oldest.
            assert.deepStrictEqual(actual.events[1].address, {
                city: 'ROMEOVILLE',
                country: 'US',
                state: 'IL',
                zip: '60446'
            });

            assert.strictEqual(actual.events[1].description, 'Origin Scan');

            // Description comes from EventShortDescription, not EventLongDescription.
            assert.strictEqual(actual.events[6].description, 'Package Delivered');

            // OnTrac sends no location at all before it has the package, and we pass that
            // through as-is rather than filling in a placeholder.
            assert.deepStrictEqual(actual.events[0].address, {
                city: null,
                country: null,
                state: null,
                zip: null
            });
        });

        await t.test('should not treat an EXRL scan as shipped', async () => {
            t.mock.method(globalThis, 'fetch', () => {
                return Promise.resolve(new Response(JSON.stringify(EXRL_TRACKING_RESPONSE), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSTEST00000002', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.events.length, 6);

            // EXRL is the oldest event, at 2026-02-02T09:36:08Z. Counting it as shipped
            // put shippedAt 18 hours before OnTrac had the package.
            assert.strictEqual(actual.events[0].description, 'On its way to OnTrac');
            assert.strictEqual(actual.shippedAt.toISOString(), '2026-02-03T03:56:01.000Z');
            assert.strictEqual(actual.deliveredAt.toISOString(), '2026-02-03T18:30:43.000Z');
        });

        await t.test('should return no events when OnTrac reports the tracking number is not found', async () => {
            t.mock.method(globalThis, 'fetch', () => {
                return Promise.resolve(new Response(JSON.stringify(NOT_FOUND_RESPONSE), {
                    headers: { 'content-type': 'application/json' },
                    status: 404
                }));
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSTEST00000003', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'OnTrac');
            assert.strictEqual(actual.events.length, 0);
            assert.strictEqual(actual.raw, null);
            assert.strictEqual(actual.url, 'https://www.ontrac.com/tracking/?number=1LSTEST00000003');
        });

        await t.test('should strip whitespace and uppercase the tracking number before requesting it', async () => {
            // Called on the carrier directly, not through bloodhound.track: index.js
            // normalizes the tracking number itself at index.js:138-139, so a call through
            // Bloodhound would pass either way and prove nothing about this file.
            const onTrac = new OnTrac();

            const fetchMock = t.mock.method(globalThis, 'fetch', () => {
                return Promise.resolve(new Response(JSON.stringify(NOT_FOUND_RESPONSE), {
                    headers: { 'content-type': 'application/json' },
                    status: 404
                }));
            });

            const actual = await new Promise((resolve, reject) => {
                onTrac.track('1ls tes t000 00003', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(fetchMock.mock.calls[0].arguments[0], 'https://webtrack.ontrac.com/PackageServices/tracking/1LSTEST00000003');
            assert.strictEqual(actual.url, 'https://www.ontrac.com/tracking/?number=1LSTEST00000003');
        });

        await t.test('should return an error when OnTrac responds with a server error', async () => {
            const fetchMock = t.mock.method(globalThis, 'fetch', () => {
                return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
            });

            await assert.rejects(new Promise((resolve, reject) => {
                bloodhound.track('1LSTEST00000003', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            }), (err) => {
                assert.strictEqual(err.name, 'HttpError');
                assert.strictEqual(err.cause.status, 500);

                return true;
            });

            // carriers/onTrac.js wraps the request in async.retry, which defaults to
            // 5 attempts.
            assert.strictEqual(fetchMock.mock.callCount(), 5);
        });
    });
});
