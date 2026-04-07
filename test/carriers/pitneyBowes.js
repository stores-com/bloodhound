const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index.js');

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
    await t.test('should return an error for invalid base URL', async () => {
        const bloodhound = new Bloodhound({
            pitneyBowes: {
                baseUrl: 'https://httpbin.org/status/500#'
            }
        });

        const err = await new Promise((resolve) => {
            bloodhound.track('9400111899223837861141', 'pitney bowes', (err) => resolve(err));
        });

        assert(err);
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

        const results = await new Promise((resolve, reject) => {
            bloodhound.track('4203300992612927005269000093974783', 'pitney bowes', (err, data) => err ? reject(err) : resolve(data));
        });

        assert.strictEqual(results.carrier, 'Pitney Bowes');
        assert.strictEqual(results.events.length, 5);
        assert(results.deliveredAt);
        assert(results.shippedAt);
        assert.strictEqual(results.url, 'https://pitneybowes.shipment.co/track/4203300992612927005269000093974783');

        // Events are in reverse order (last in mock data comes first after reverse)
        assert.strictEqual(results.events[0].description, 'Shipping Label Created, USPS Awaiting Item');
        assert.strictEqual(results.events[4].description, 'Delivered, In/At Mailbox');

        // Address parsed correctly (last event is the delivered one)
        const deliveredEvent = results.events[results.events.length - 1];
        assert.match(deliveredEvent.address.city, /spring branch/i);
        assert.strictEqual(deliveredEvent.address.state, 'TX');
        assert.strictEqual(deliveredEvent.address.zip, '78070');
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

        const results = await new Promise((resolve, reject) => {
            bloodhound.track('4203300992612927005269000093974783', 'pitney bowes', (err, data) => err ? reject(err) : resolve(data));
        });

        // The event from "DISTRIBUTION CENTER INDIANAPOLIS" should have city cleaned up
        const indianapolisEvent = results.events.find(e => e.address.state === 'IN');
        assert(indianapolisEvent);
        assert.ok(!indianapolisEvent.address.city.includes('DISTRIBUTION CENTER'));
    });

    await t.test('should set carrier to Newgistics when option is set', async (t) => {
        const originalFetch = mockFetch('4203300992612927005269000093974783');
        t.after(() => { global.fetch = originalFetch; });

        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: 'test',
                api_secret: 'test'
            }
        });

        const results = await new Promise((resolve, reject) => {
            bloodhound.track('4203300992612927005269000093974783', 'newgistics', (err, data) => err ? reject(err) : resolve(data));
        });

        assert.strictEqual(results.carrier, 'Newgistics');
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

        const results = await new Promise((resolve, reject) => {
            bloodhound.track('4203300992612927005269000093974783', 'pitney bowes', (err, data) => err ? reject(err) : resolve(data));
        });

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

        const results = await new Promise((resolve, reject) => {
            bloodhound.track('4203300992612927005269000093974783', { carrier: 'pitney bowes', minDate: new Date('2026-03-30T00:00:00Z') }, (err, data) => err ? reject(err) : resolve(data));
        });

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

        const results = await new Promise((resolve, reject) => {
            bloodhound.track('0004290252994200071698133931119', 'pitney bowes', (err, data) => err ? reject(err) : resolve(data));
        });

        // Should use IMB carrier and truncate to 20 chars
        assert(capturedUrl.includes('carrier=IMB'));
        assert(capturedUrl.includes('00042902529942000716'));
        assert.strictEqual(results.url, 'https://tracking.pb.com/00042902529942000716');
    });
});
