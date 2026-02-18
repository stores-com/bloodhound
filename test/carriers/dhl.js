const assert = require('node:assert');
const test = require('node:test');
const util = require('node:util');

const nock = require('nock');

const Bloodhound = require('../../index');
const DHL = require('../../carriers/dhl');

nock.enableNetConnect();

test('DHL', async (t) => {
    const validTrackingNumbers = [
        '420944019261299999877816190127'
    ];

    t.test('dhl.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const dhl = new DHL();

        const invalidTrackingNumbers = [
            '9970 4895 0367 429',
            'DT771613423732',
            '9400 1118 9922 3818 2184 07'
        ];

        t.test('should detect valid DHL tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!dhl.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} is not recognized as a valid DHL tracking number`);
                }
            });
        });

        t.test('should not detect invalid DHL tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (dhl.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid DHL tracking number`);
                }
            });
        });
    });

    t.test('dhl.track', { timeout: 10000 }, async (t) => {
        t.test('should return a valid response with no errors', async () => {
            nock('https://api-eu.dhl.com')
                .get('/track/shipments')
                .query({ trackingNumber: validTrackingNumbers[0] })
                .reply(200, {
                    shipments: [{
                        id: '698E011D2920F49AA1243104',
                        service: 'ecommerce',
                        origin: {
                            address: {
                                addressLocality: 'CARROLLTON',
                                countryCode: 'US',
                                postalCode: '75010'
                            }
                        },
                        status: {
                            timestamp: '2026-02-12T10:34:42',
                            statusCode: 'pre-transit',
                            description: 'LABEL CREATED'
                        },
                        events: []
                    }]
                });

            const bloodhound = new Bloodhound({
                dhl: {
                    apiKey: 'fake-api-key'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track(validTrackingNumbers[0], 'dhl', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.equal('DHL', actual.carrier);
        });

        t.test('should fall through to DHL UTAPI and return a response with no errors when DHL eCommerce Solutions fails', async () => {
            nock('https://api-eu.dhl.com')
                .get('/track/shipments')
                .query({ trackingNumber: validTrackingNumbers[0] })
                .reply(200, {
                    shipments: [{
                        id: '698E011D2920F49AA1243104',
                        service: 'ecommerce',
                        origin: {
                            address: {
                                addressLocality: 'CARROLLTON',
                                countryCode: 'US',
                                postalCode: '75010'
                            }
                        },
                        status: {
                            timestamp: '2026-02-12T10:34:42',
                            statusCode: 'pre-transit',
                            description: 'LABEL CREATED'
                        },
                        events: []
                    }]
                });

            const bloodhound = new Bloodhound({
                dhl: {
                    apiKey: 'fake-api-key'
                },
                dhlEcommerceSolutions: {
                    client_id: 'fail',
                    client_secret: 'fail',
                    environment_url: process.env.DHL_ECOMMERCE_SOLUTIONS_ENVIRONMENT_URL
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track(validTrackingNumbers[0], 'dhl', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.equal('DHL', actual.carrier);
        });

        t.test('should fall through to USPS and return a response with no errors when DHL UTAPI fails', async () => {
            nock('https://apis.usps.com')
                .post('/oauth2/v3/token')
                .reply(200, { access_token: 'fake-token', expires_in: 3600 });

            nock('https://apis.usps.com')
                .post('/tracking/v3r2/tracking')
                .reply(200, [{
                    trackingEvents: []
                }]);

            const bloodhound = new Bloodhound({
                dhl: {
                    apiKey: '123'
                },
                usps: {
                    client_id: process.env.USPS_CLIENT_ID,
                    client_secret: process.env.USPS_CLIENT_SECRET,
                    environment_url: 'https://apis.usps.com'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track(validTrackingNumbers[0], 'dhl', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.equal('USPS', actual.carrier);
        });

        t.test('should try DHL eCommerce solutions first', async () => {
            nock('https://api-eu.dhl.com')
                .get('/track/shipments')
                .query({ trackingNumber: validTrackingNumbers[0] })
                .times(5)
                .reply(401, { status: 401, detail: 'Unauthorized' });

            const bloodhound = new Bloodhound({
                dhlEcommerceSolutions: {
                    client_id: process.env.DHL_ECOMMERCE_SOLUTIONS_CLIENT_ID,
                    client_secret: process.env.DHL_ECOMMERCE_SOLUTIONS_CLIENT_SECRET,
                    environment_url: process.env.DHL_ECOMMERCE_SOLUTIONS_ENVIRONMENT_URL
                }
            });

            const [err, actual] = await new Promise((resolve) => {
                bloodhound.track(validTrackingNumbers[0], 'dhl', (...args) => resolve(args));
            });

            // No packages with length to track, so this is falling through to UTAPI
            assert.equal(err.message.includes('401 GET https://api-eu.dhl.com/track/shipments'), true);
            assert.equal(undefined, actual);
        });

        t.test('should return estimated delivery date for a real DHL tracking number', async () => {
            nock('https://api-eu.dhl.com')
                .get('/track/shipments')
                .query({ trackingNumber: validTrackingNumbers[0] })
                .reply(200, {
                    shipments: [{
                        id: '698E011D2920F49AA1243104',
                        service: 'ecommerce',
                        origin: {
                            address: {
                                addressLocality: 'CARROLLTON',
                                countryCode: 'US',
                                postalCode: '75010'
                            }
                        },
                        status: {
                            timestamp: '2026-02-12T10:34:42',
                            statusCode: 'transit',
                            description: 'IN TRANSIT'
                        },
                        estimatedTimeOfDelivery: '2026-02-18',
                        events: []
                    }]
                });

            const bloodhound = new Bloodhound({
                dhl: {
                    apiKey: 'fake-api-key'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track(validTrackingNumbers[0], 'dhl', (err, data) => err ? reject(err) : resolve(data));
            });

            assert(actual.estimatedDeliveryDate);
            assert.strictEqual(actual.estimatedDeliveryDate.earliest.toISOString(), '2026-02-18T00:00:00.000Z');
            assert.strictEqual(actual.estimatedDeliveryDate.latest.toISOString(), '2026-02-18T00:00:00.000Z');
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.earliest), true);
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.latest), true);
        });
    });
});
