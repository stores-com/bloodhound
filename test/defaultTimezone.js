const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../index.js');

// One USPS scan in Los Angeles with no UTC offset, which is the case defaultTimezone
// exists to resolve.
const TRACKING_RESPONSE = [{
    statusCategory: 'In Transit',
    statusSummary: 'In Transit to Next Facility',
    trackingEvents: [{
        eventCity: 'LOS ANGELES',
        eventCountry: 'US',
        eventState: 'CA',
        eventTimestamp: '2025-07-28T12:00:00',
        eventType: 'In Transit to Next Facility',
        eventZIPCode: '90001',
        statusCategory: 'In Transit'
    }]
}];

test('defaultTimezone', async (t) => {
    await t.test('should default to local machine timezone when not specified', () => {
        const bloodhound = new Bloodhound();
        // Constructor should not throw when no defaultTimezone is provided
        assert.ok(bloodhound);
    });

    await t.test('should propagate defaultTimezone to USPS carrier options', async () => {
        t.mock.method(globalThis, 'fetch', (url) => {
            const body = url.endsWith('/oauth2/v3/token') ? { access_token: 'test_token', expires_in: 3600 } : TRACKING_RESPONSE;

            return Promise.resolve(new Response(JSON.stringify(body), {
                headers: { 'content-type': 'application/json' },
                status: 200
            }));
        });

        const bloodhound = new Bloodhound({
            defaultTimezone: 'America/Los_Angeles',
            usps: {
                client_id: 'test',
                client_secret: 'test',
                environment_url: 'https://apis.usps.com'
            }
        });

        const actual = await new Promise((resolve, reject) => {
            bloodhound.track('9400111899223837861141', 'usps', (err, data) => err ? reject(err) : resolve(data));
        });

        // The event date should be parsed using America/Los_Angeles, not America/New_York
        const event = actual.events[0];
        assert.ok(event);
        assert.strictEqual(event.date.toISOString(), '2025-07-28T19:00:00.000Z');
    });

    await t.test('should use different timezone when configured differently', async () => {
        t.mock.method(globalThis, 'fetch', (url) => {
            const body = url.endsWith('/oauth2/v3/token') ? { access_token: 'test_token', expires_in: 3600 } : TRACKING_RESPONSE;

            return Promise.resolve(new Response(JSON.stringify(body), {
                headers: { 'content-type': 'application/json' },
                status: 200
            }));
        });

        const bloodhound = new Bloodhound({
            defaultTimezone: 'America/New_York',
            usps: {
                client_id: 'test',
                client_secret: 'test',
                environment_url: 'https://apis.usps.com'
            }
        });

        const actual = await new Promise((resolve, reject) => {
            bloodhound.track('9400111899223837861141', 'usps', (err, data) => err ? reject(err) : resolve(data));
        });

        const event = actual.events[0];
        assert.ok(event);
        // Same local time parsed as Eastern should produce a different UTC time than Pacific
        assert.strictEqual(event.date.toISOString(), '2025-07-28T16:00:00.000Z');
    });
});
