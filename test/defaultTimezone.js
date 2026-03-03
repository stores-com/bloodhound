const assert = require('node:assert');
const test = require('node:test');

const nock = require('nock');

const Bloodhound = require('../index.js');

test('defaultTimezone', async (t) => {
    // Disable geocoding so defaultTimezone is used as the fallback
    const originalKey = process.env.GOOGLE_API_KEY;

    t.before(() => {
        delete process.env.GOOGLE_API_KEY;
    });

    t.after(() => {
        if (originalKey) {
            process.env.GOOGLE_API_KEY = originalKey;
        }
    });

    t.test('should default to local machine timezone when not specified', () => {
        const bloodhound = new Bloodhound();
        // Constructor should not throw when no defaultTimezone is provided
        assert.ok(bloodhound);
    });

    t.test('should propagate defaultTimezone to USPS carrier options', async () => {
        nock('https://apis.usps.com')
            .post('/oauth2/v3/token')
            .reply(200, {
                access_token: 'test_token',
                expires_in: 3600
            });

        nock('https://apis.usps.com')
            .post('/tracking/v3r2/tracking')
            .reply(200, [{
                statusCategory: 'In Transit',
                statusSummary: 'In Transit to Next Facility',
                trackingEvents: [{
                    eventType: 'In Transit to Next Facility',
                    eventTimestamp: '2025-07-28T12:00:00',
                    eventCity: 'LOS ANGELES',
                    eventState: 'CA',
                    eventZIPCode: '90001',
                    eventCountry: 'US',
                    statusCategory: 'In Transit'
                }]
            }]);

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

    t.test('should use different timezone when configured differently', async () => {
        nock('https://apis.usps.com')
            .post('/oauth2/v3/token')
            .reply(200, {
                access_token: 'test_token',
                expires_in: 3600
            });

        nock('https://apis.usps.com')
            .post('/tracking/v3r2/tracking')
            .reply(200, [{
                statusCategory: 'In Transit',
                statusSummary: 'In Transit to Next Facility',
                trackingEvents: [{
                    eventType: 'In Transit to Next Facility',
                    eventTimestamp: '2025-07-28T12:00:00',
                    eventCity: 'LOS ANGELES',
                    eventState: 'CA',
                    eventZIPCode: '90001',
                    eventCountry: 'US',
                    statusCategory: 'In Transit'
                }]
            }]);

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
