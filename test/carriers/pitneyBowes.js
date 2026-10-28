const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index.js');
const PitneyBowes = require('../../carriers/pitneyBowes.js');

const mockTrackingResponse = {
    packageCount: 1,
    trackingNumber: '4203300992612927005269000093974783',
    carrier: 'USPS',
    serviceName: 'USPS Ground Advantage',
    deliveryDate: '2026-03-30',
    deliveryTime: '10:45:00',
    deliveryTimeOffset: '-05:00',
    deliveryLocation: 'SPRING BRANCH,TX,78070',
    deliveryLocationDescription: 'Delivered, In/At Mailbox',
    scanDetailsList: [
        {
            standardizedEventCode: 'DLD',
            scanType: '01',
            scanDescription: 'Delivered, In/At Mailbox',
            packageStatus: 'Delivered',
            eventDate: '2026-03-30',
            eventTime: '10:45:00',
            eventCity: 'SPRING BRANCH',
            eventStateOrProvince: 'TX',
            postalCode: '78070',
            country: 'US'
        },
        {
            standardizedEventCode: 'OFD',
            scanType: 'OF',
            scanDescription: 'Out for Delivery',
            packageStatus: 'OutForDelivery',
            eventDate: '2026-03-30',
            eventTime: '07:12:00',
            eventCity: 'SPRING BRANCH',
            eventStateOrProvince: 'TX',
            postalCode: '78070',
            country: 'US'
        },
        {
            standardizedEventCode: 'TRD',
            scanType: '07',
            scanDescription: 'Arrived at Post Office',
            packageStatus: 'InTransit',
            eventDate: '2026-03-30',
            eventTime: '07:01:00',
            eventCity: 'SPRING BRANCH',
            eventStateOrProvince: 'TX',
            postalCode: '78070',
            country: 'US'
        },
        {
            standardizedEventCode: 'TRD',
            scanType: 'A1',
            scanDescription: 'Arrived at USPS Regional Facility',
            packageStatus: 'InTransit',
            eventDate: '2026-03-29',
            eventTime: '18:57:00',
            eventCity: 'DISTRIBUTION CENTER INDIANAPOLIS',
            eventStateOrProvince: 'IN',
            postalCode: '46241',
            country: 'US'
        },
        {
            standardizedEventCode: 'PSR',
            scanType: 'GX',
            scanDescription: 'Shipping Label Created, USPS Awaiting Item',
            packageStatus: 'Manifest',
            eventDate: '2026-03-27',
            eventTime: '09:41:00',
            eventCity: 'ELK GROVE VILLAGE',
            eventStateOrProvince: 'IL',
            postalCode: '60007',
            country: 'US'
        }
    ],
    currentStatus: {
        standardizedEventCode: 'DLD',
        scanDescription: 'Delivered, In/At Mailbox',
        packageStatus: 'Delivered',
        eventCity: 'SPRING BRANCH',
        eventStateOrProvince: 'TX',
        postalCode: '78070'
    },
    status: 'Delivered'
};

function mockFetch(trackingNumber) {
    const originalFetch = global.fetch;

    global.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('/oauth/token')) {
            return new Response(JSON.stringify({
                access_token: 'mock_token',
                tokenType: 'BearerToken',
                issuedAt: Date.now().toString(),
                expiresIn: '36000',
                clientID: 'mock',
                org: 'pitneybowes'
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (typeof url === 'string' && url.includes(`/v1/tracking/${trackingNumber}`)) {
            return new Response(JSON.stringify(mockTrackingResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return originalFetch(url, options);
    };

    return originalFetch;
}

test('Pitney Bowes', { timeout: 30000 }, async (t) => {
    await t.test('should return an error for a base URL that answers 500', async () => {
        // httpbingo.org rather than httpbin.org, which timed out in CI on 2026-07-30 and took the
        // rest of this file's subtests down with it.
        //
        // The explicit timeout is what stops that repeating. pitney-bowes defaults its request
        // timeout to 30000ms, the same value this file sets as its test timeout, so a slow host
        // left the abort and the test timeout racing with no margin. At 5000ms the request always
        // aborts first, 25 seconds before node:test gives up, whatever the host is doing.
        const bloodhound = new Bloodhound({
            pitneyBowes: {
                baseUrl: 'https://httpbingo.org/status/500#',
                timeout: 5000
            }
        });

        await assert.rejects(() => bloodhound.track('9400111899223837861141', 'pitney bowes'));
    });

    await t.test('should return tracking events with delivered and shipped dates', async (t) => {
        const originalFetch = mockFetch('4203300992612927005269000093974783');
        t.after(() => { global.fetch = originalFetch; });

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        assert.strictEqual(results.carrier, 'Pitney Bowes');
        assert.strictEqual(results.events.length, 5);
        assert(results.deliveredAt);
        assert(results.shippedAt);
        assert.strictEqual(results.url, 'https://pitneybowes.shipment.co/track/4203300992612927005269000093974783');

        // Events are sorted by date descending (most recent first)
        assert.strictEqual(results.events[0].description, 'Delivered, In/At Mailbox');
        assert.strictEqual(results.events[4].description, 'Shipping Label Created, USPS Awaiting Item');

        // Address parsed correctly (first event is the delivered one)
        const deliveredEvent = results.events[0];
        assert.match(deliveredEvent.address.city, /spring branch/i);
        assert.strictEqual(deliveredEvent.address.state, 'TX');
        assert.strictEqual(deliveredEvent.address.zip, '78070');
    });

    await t.test('should not turn a malformed scan timestamp into a valid-looking date', async (t) => {
        // A scan whose eventDate lost a digit. Parsed loosely, Moment ignores the format mismatch
        // and reads '2026-03-3' as the 3rd — a real Date, 27 days before the scan actually
        // happened, that lands in deliveredAt with nothing marking it as junk. Parsed strictly it
        // is an Invalid Date, which a caller can at least see.
        //
        // Only one scan here so the event ordering cannot absorb the bad date.
        const originalFetch = global.fetch;
        t.after(() => { global.fetch = originalFetch; });

        global.fetch = async (url) => {
            if (typeof url === 'string' && url.includes('/oauth/token')) {
                return new Response(JSON.stringify({ access_token: 'mock_token', expiresIn: '36000' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 200
                });
            }

            return new Response(JSON.stringify({
                carrier: 'USPS',
                packageCount: 1,
                scanDetailsList: [
                    {
                        country: 'US',
                        eventCity: 'SPRING BRANCH',
                        eventDate: '2026-03-3',
                        eventStateOrProvince: 'TX',
                        eventTime: '10:45:00',
                        packageStatus: 'Delivered',
                        postalCode: '78070',
                        scanDescription: 'Delivered, In/At Mailbox',
                        scanType: '01',
                        standardizedEventCode: 'DLD'
                    }
                ],
                status: 'Delivered',
                trackingNumber: '4203300992612927005269000093974783'
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });
        };

        const bloodhound = new Bloodhound({
            defaultTimezone: 'America/Chicago',
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        assert.strictEqual(results.events.length, 1);
        assert.ok(Number.isNaN(results.events[0].date.getTime()), `expected an Invalid Date, got ${String(results.events[0].date)}`);
        assert.ok(Number.isNaN(results.deliveredAt.getTime()), 'a malformed scan must not produce a usable deliveredAt');
    });

    await t.test('should strip DISTRIBUTION CENTER from city names', async (t) => {
        const originalFetch = mockFetch('4203300992612927005269000093974783');
        t.after(() => { global.fetch = originalFetch; });

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        // The event from "DISTRIBUTION CENTER INDIANAPOLIS" should have city cleaned up
        const indianapolisEvent = results.events.find(e => e.address.state === 'IN');
        assert(indianapolisEvent);
        assert.ok(!indianapolisEvent.address.city.includes('DISTRIBUTION CENTER'));
    });

    await t.test('should return empty events for 404 Not Found', async (t) => {
        const originalFetch = global.fetch;
        t.after(() => { global.fetch = originalFetch; });

        global.fetch = async (url, options) => {
            if (typeof url === 'string' && url.includes('/oauth/token')) {
                return new Response(JSON.stringify({
                    access_token: 'mock_token',
                    tokenType: 'BearerToken',
                    issuedAt: Date.now().toString(),
                    expiresIn: '36000',
                    clientID: 'mock',
                    org: 'pitneybowes'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (typeof url === 'string' && url.includes('/v1/tracking/')) {
                return new Response('Not Found', { status: 404, statusText: 'Not Found' });
            }

            return originalFetch(url, options);
        };

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        assert.strictEqual(results.carrier, 'Pitney Bowes');
        assert.strictEqual(results.events.length, 0);
    });

    await t.test('should return empty events for a 404 whose reason phrase is not "Not Found"', async (t) => {
        // The test above passes only because HttpError's message is exactly "404 Not Found",
        // and that message is `${status} ${statusText}` — a reason phrase the origin chooses
        // and nobody normalises. The "invalid base URL" test above proves it varies: httpbin
        // answers with "INTERNAL SERVER ERROR", so the same server on a 404 would produce
        // "404 NOT FOUND" and a check matching the message would miss it.
        //
        // The body below also carries an errors[] array. That is inert today: pitney-bowes
        // pins @stores.com/http-error ~1.0.0, which does not touch the message. The version
        // bloodhound itself uses, 1.2.0, replaces the message with that errors[] text — so
        // when pitney-bowes moves to it, the message check breaks a second way.
        //
        // The status on `cause` is unaffected by either.
        const originalFetch = global.fetch;

        t.after(() => { global.fetch = originalFetch; });

        global.fetch = async (url, options) => {
            if (typeof url === 'string' && url.includes('/oauth/token')) {
                return new Response(JSON.stringify({
                    access_token: 'mock_token',
                    clientID: 'mock',
                    expiresIn: '36000',
                    issuedAt: Date.now().toString(),
                    org: 'pitneybowes',
                    tokenType: 'BearerToken'
                }), { headers: { 'Content-Type': 'application/json' }, status: 200 });
            }

            if (typeof url === 'string' && url.includes('/v1/tracking/')) {
                return new Response(JSON.stringify({
                    errors: [{
                        errorCode: 'PB-TRACKING-0001',
                        message: 'Tracking information is not available for this parcel'
                    }]
                }), { headers: { 'Content-Type': 'application/json' }, status: 404, statusText: 'NOT FOUND' });
            }

            return originalFetch(url, options);
        };

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        assert.strictEqual(results.carrier, 'Pitney Bowes');
        assert.strictEqual(results.events.length, 0);
    });

    await t.test('should filter events before minDate', async (t) => {
        const originalFetch = mockFetch('4203300992612927005269000093974783');
        t.after(() => { global.fetch = originalFetch; });

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', { carrier: 'pitney bowes', minDate: new Date('2026-03-30T00:00:00Z') });

        // Only events on or after 2026-03-30 should be included
        assert(results.events.length < 5);
        assert(results.events.length > 0);
    });

    await t.test('should use IMB carrier for 31-digit tracking numbers', async (t) => {
        const originalFetch = global.fetch;
        t.after(() => { global.fetch = originalFetch; });

        let capturedUrl;
        global.fetch = async (url, options) => {
            if (typeof url === 'string' && url.includes('/oauth/token')) {
                return new Response(JSON.stringify({
                    access_token: 'mock_token',
                    tokenType: 'BearerToken',
                    issuedAt: Date.now().toString(),
                    expiresIn: '36000',
                    clientID: 'mock',
                    org: 'pitneybowes'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (typeof url === 'string' && url.includes('/v1/tracking/')) {
                capturedUrl = url;
                return new Response(JSON.stringify(mockTrackingResponse), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return originalFetch(url, options);
        };

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('0004290252994200071698133931119', 'pitney bowes');

        // Should use IMB carrier and truncate to 20 chars
        assert(capturedUrl.includes('carrier=IMB'));
        assert(capturedUrl.includes('00042902529942000716'));
        assert.strictEqual(results.url, 'https://tracking.pb.com/00042902529942000716');
    });

    await t.test('should work when track is called without an options argument', async (t) => {
        const originalFetch = mockFetch('4203300992612927005269000093974783');
        t.after(() => { global.fetch = originalFetch; });

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        assert(results);
        assert(results.events.length > 0);
    });

    await t.test('should return empty events when response has no scanDetailsList', async (t) => {
        const originalFetch = global.fetch;
        t.after(() => { global.fetch = originalFetch; });

        global.fetch = async (url, options) => {
            if (typeof url === 'string' && url.includes('/oauth/token')) {
                return new Response(JSON.stringify({
                    access_token: 'mock_token',
                    tokenType: 'BearerToken',
                    issuedAt: Date.now().toString(),
                    expiresIn: '36000',
                    clientID: 'mock',
                    org: 'pitneybowes'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (typeof url === 'string' && url.includes('/v1/tracking/')) {
                return new Response(JSON.stringify({
                    trackingNumber: '4203300992612927005269000093974783',
                    carrier: 'USPS'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            return originalFetch(url, options);
        };

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        assert.strictEqual(results.carrier, 'Pitney Bowes');
        assert.strictEqual(results.events.length, 0);
    });

    await t.test('should set shippedAt to deliveredAt when only delivered', async (t) => {
        const originalFetch = global.fetch;
        t.after(() => { global.fetch = originalFetch; });

        global.fetch = async (url, options) => {
            if (typeof url === 'string' && url.includes('/oauth/token')) {
                return new Response(JSON.stringify({
                    access_token: 'mock_token',
                    tokenType: 'BearerToken',
                    issuedAt: Date.now().toString(),
                    expiresIn: '36000',
                    clientID: 'mock',
                    org: 'pitneybowes'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (typeof url === 'string' && url.includes('/v1/tracking/')) {
                return new Response(JSON.stringify({
                    trackingNumber: '4203300992612927005269000093974783',
                    carrier: 'USPS',
                    scanDetailsList: [
                        {
                            standardizedEventCode: 'DLD',
                            scanType: '01',
                            scanDescription: 'Delivered',
                            packageStatus: 'Delivered',
                            eventDate: '2026-03-30',
                            eventTime: '10:45:00',
                            eventCity: 'SPRING BRANCH',
                            eventStateOrProvince: 'TX',
                            postalCode: '78070',
                            country: 'US'
                        }
                    ]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            return originalFetch(url, options);
        };

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        assert(results.deliveredAt);
        assert(results.shippedAt);
        assert.strictEqual(results.shippedAt.getTime(), results.deliveredAt.getTime());
    });

    await t.test('should work when the carrier is called directly without options', async (t) => {
        const originalFetch = mockFetch('4203300992612927005269000093974783');
        t.after(() => { global.fetch = originalFetch; });

        const carrier = new PitneyBowes({ api_key: 'test', api_secret: 'test' });

        const results = await carrier.track('4203300992612927005269000093974783');

        assert(results);
        assert(results.events.length > 0);
    });

    await t.test('should fall back to defaultTimezone when eventTimeOffset is missing', async (t) => {
        const originalFetch = global.fetch;
        t.after(() => { global.fetch = originalFetch; });

        global.fetch = async (url) => {
            if (typeof url === 'string' && url.includes('/oauth/token')) {
                return new Response(JSON.stringify({
                    access_token: 'mock_token',
                    tokenType: 'BearerToken',
                    issuedAt: Date.now().toString(),
                    expiresIn: '36000',
                    clientID: 'mock',
                    org: 'pitneybowes'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (typeof url === 'string' && url.includes('/v1/tracking/')) {
                return new Response(JSON.stringify({
                    trackingNumber: '4203300992612927005269000093974783',
                    carrier: 'USPS',
                    scanDetailsList: [
                        {
                            standardizedEventCode: 'DLD',
                            scanType: '01',
                            scanDescription: 'Delivered',
                            packageStatus: 'Delivered',
                            eventDate: '2026-03-30',
                            eventTime: '10:45:00',
                            eventCity: 'SPRING BRANCH',
                            eventStateOrProvince: 'TX',
                            postalCode: '78070',
                            country: 'US'
                        }
                    ]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            return originalFetch(url);
        };

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test',
                defaultTimezone: 'America/Chicago'
            }
        });

        const results = await bloodhound.track('4203300992612927005269000093974783', 'pitney bowes');

        assert.strictEqual(results.events.length, 1);
        assert(results.events[0].date instanceof Date);
    });
});
