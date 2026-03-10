const assert = require('node:assert');
const test = require('node:test');
const util = require('node:util');

const nock = require('nock');

const Bloodhound = require('../../index');
const USPS = require('../../carriers/usps.js');

test('USPS', { timeout: 10000 }, async (t) => {
    const bloodhound = new Bloodhound({
        usps: {
            client_id: process.env.USPS_CLIENT_ID,
            client_secret: process.env.USPS_CLIENT_SECRET
        }
    });

    t.test('usps.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const usps = new USPS();

        const validTrackingNumbers = [
            '9400111899223818218407',
            '9400 1118 9922 3818 2184 07',
            '9400 1118 9956 1482 6100 74',
            '9400 1118 9922 3837 8204 90',
            '9400 1118 9922 3837 8611 41',
            '9400111699000271800200',
            '9405511699000273008898',
            '9400111899223830191139',
            '9400111899223830191054',
            '9400111899223830191368',
            '9405511899223830661741',
            '9405503699300049053172',
            '9400109699938860246573',
            '94 0010 9699 9388 6024 6573',
            '420921559505500020714300000128',
            '420 92155 95 0550 0020 7143 0000 0128',
            '4209215512349505500020714300000128',
            '420 92155 1234 95 0550 0020 7143 0000 0128',
            'EC207920162US',
            'EC 207 920 162 US',
            'ec 207 920 162 us',
            '9274899992136003821767',
            '92 7489 9992 1360 0382 1767',
            '92023901003036542400961407',
            '92748999997295513123034457',
            '92748901377803583000610270',
            '4205690192023901019233001401555746',
            '4206810692612927005269000028978091',
            '70131710000012912087'
        ];

        const invalidTrackingNumbers = [
            // incorrect check digit (last digit)
            '4206810692612927005269000028978090'
        ];

        t.test('should detect valid USPS tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!usps.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} is not recognized as a valid USPS tracking number`);
                }
            });
        });

        t.test('should not detect invalid USPS tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (usps.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid USPS tracking number`);
                }
            });
        });
    });

    t.test('Error Handling', { concurrency: true }, async (t) => {
        t.test('should return an error for invalid credentials', async () => {
            const bloodhound = new Bloodhound({
                usps: {
                    client_id: 'invalid',
                    client_secret: 'invalid',
                    environment_url: 'https://apis.usps.com'
                }
            });

            const err = await new Promise((resolve) => {
                bloodhound.track('9400111899223837861141', 'usps', (err) => resolve(err));
            });

            assert(err);
        });

        t.test('should return empty results for a tracking number that contains invalid characters', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('12c &^trackf0', 'usps', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.deepStrictEqual(actual.events, []);
        });
    });

    t.test('USPS Tracking', { concurrency: true }, async (t) => {
        t.test('should return an empty result if there is no tracking information available', async () => {
            nock('https://apis.usps.com')
                .post('/oauth2/v3/token')
                .reply(200, {
                    access_token: 'test_token',
                    expires_in: 3600
                });

            nock('https://apis.usps.com')
                .post('/tracking/v3r2/tracking')
                .reply(200, []);

            const bloodhound = new Bloodhound({
                usps: {
                    client_id: process.env.USPS_CLIENT_ID,
                    client_secret: process.env.USPS_CLIENT_SECRET,
                    environment_url: 'https://apis.usps.com'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('0987654321234567890', 'usps', (err, data) => err ? reject(err) : resolve(data));
            });

            const expected = {
                carrier: 'USPS',
                events: []
            };

            delete actual.raw;

            assert.deepStrictEqual(actual, expected);
        });

        t.test('should return estimatedDeliveryDate when available in USPS response', async () => {
            nock('https://apis.usps.com')
                .post('/oauth2/v3/token')
                .reply(200, {
                    access_token: 'test_token',
                    expires_in: 3600
                });

            nock('https://apis.usps.com')
                .post('/tracking/v3r2/tracking')
                .reply(200, [{
                    expectedDeliveryDate: '2025-07-28',
                    statusCategory: 'Delivered',
                    statusSummary: 'Delivered',
                    trackingEvents: [{
                        eventType: 'Delivered',
                        eventTimestamp: '2025-07-28T12:00:00Z',
                        eventCity: '',
                        eventState: '',
                        eventZIPCode: '',
                        eventCountry: 'US',
                        statusCategory: 'Delivered'
                    }]
                }]);

            const bloodhound = new Bloodhound({
                usps: {
                    client_id: process.env.USPS_CLIENT_ID,
                    client_secret: process.env.USPS_CLIENT_SECRET,
                    environment_url: 'https://apis.usps.com'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('9400150105798014348298', 'usps', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.estimatedDeliveryDate.earliest.toISOString(), '2025-07-28T00:00:00.000Z');
            assert.strictEqual(actual.estimatedDeliveryDate.latest.toISOString(), '2025-07-28T00:00:00.000Z');
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.earliest), true, 'earliest is not a valid Date object');
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.latest), true, 'latest is not a valid Date object');
        });

        t.test('should set shippedAt from top-level statusCategory when per-event statusCategory is missing', async () => {
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
                        eventType: 'Arrived at USPS Facility',
                        eventCode: 'A1',
                        eventTimestamp: '2026-03-09T09:37:33Z',
                        eventCity: 'JACKSON',
                        eventState: 'MS',
                        eventZIPCode: '',
                        eventCountry: 'US'
                    }, {
                        eventType: 'Shipping Label Created',
                        eventCode: 'GX',
                        eventTimestamp: '2026-02-27T15:26:20Z',
                        eventCity: 'CARROLLTON',
                        eventState: 'TX',
                        eventZIPCode: '75010',
                        eventCountry: 'US'
                    }]
                }]);

            const bloodhound = new Bloodhound({
                usps: {
                    client_id: process.env.USPS_CLIENT_ID,
                    client_secret: process.env.USPS_CLIENT_SECRET,
                    environment_url: 'https://apis.usps.com'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('9400150106151109769726', 'usps', (err, data) => err ? reject(err) : resolve(data));
            });

            assert(actual.shippedAt, 'shippedAt should be set');
            assert(util.types.isDate(actual.shippedAt), 'shippedAt should be a Date');
        });

        t.test('should set deliveredAt from top-level statusCategory when per-event statusCategory is missing', async () => {
            nock('https://apis.usps.com')
                .post('/oauth2/v3/token')
                .reply(200, {
                    access_token: 'test_token',
                    expires_in: 3600
                });

            nock('https://apis.usps.com')
                .post('/tracking/v3r2/tracking')
                .reply(200, [{
                    statusCategory: 'Delivered',
                    statusSummary: 'Delivered, In/At Mailbox',
                    trackingEvents: [{
                        eventType: 'Delivered, In/At Mailbox',
                        eventCode: '01',
                        eventTimestamp: '2026-03-10T14:30:00Z',
                        eventCity: 'JACKSON',
                        eventState: 'MS',
                        eventZIPCode: '39201',
                        eventCountry: 'US'
                    }]
                }]);

            const bloodhound = new Bloodhound({
                usps: {
                    client_id: process.env.USPS_CLIENT_ID,
                    client_secret: process.env.USPS_CLIENT_SECRET,
                    environment_url: 'https://apis.usps.com'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('9400150106151109769726', 'usps', (err, data) => err ? reject(err) : resolve(data));
            });

            assert(actual.deliveredAt, 'deliveredAt should be set');
            assert(util.types.isDate(actual.deliveredAt), 'deliveredAt should be a Date');
            assert(actual.shippedAt, 'shippedAt should also be set');
        });
    });
});
