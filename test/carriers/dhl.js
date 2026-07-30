const assert = require('node:assert');
const test = require('node:test');
const util = require('node:util');

const Bloodhound = require('../../index');
const DHL = require('../../carriers/dhl');

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
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
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
            }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

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
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
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
            }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

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

        t.test('should try DHL eCommerce solutions first', async () => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({ status: 401, detail: 'Unauthorized' }), {
                headers: { 'content-type': 'application/json' },
                status: 401
            })));

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

            // No packages with length to track, so this is falling through to UTAPI.
            // Asserted on the status rather than the message: the message is now
            // @stores.com/http-error's "401 Unauthorized", and it gets replaced by the
            // carrier's own text whenever a response body carries an `errors[]` array.
            assert.strictEqual(err.cause.status, 401);
            assert.equal(undefined, actual);
        });

        t.test('should set shippedAt for "PROCESSED THROUGH USPS SORT FACILITY" events from UTAPI', async () => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
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
                        timestamp: '2026-04-28T04:00:00',
                        statusCode: 'transit',
                        description: 'PROCESSED THROUGH USPS SORT FACILITY'
                    },
                    events: [
                        {
                            timestamp: '2026-04-28T04:00:00',
                            description: 'PROCESSED THROUGH USPS SORT FACILITY',
                            location: {
                                address: {
                                    addressLocality: 'FOREST PARK',
                                    countryCode: 'US',
                                    postalCode: '60130'
                                }
                            }
                        }
                    ]
                }]
            }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

            const bloodhound = new Bloodhound({
                dhl: {
                    apiKey: 'fake-api-key'
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track(validTrackingNumbers[0], 'dhl', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.equal('DHL', actual.carrier);
            assert.ok(actual.shippedAt, 'shippedAt should be set when an event description starts with "PROCESSED THROUGH USPS SORT FACILITY"');

            // Addresses come straight from the UTAPI response now that geocoding is gone:
            // `city` is addressLocality and `zip` is postalCode. `state` is undefined
            // because the UTAPI has no state field and it used to come from the geocoder.
            assert.deepStrictEqual(actual.events[0].address, {
                city: 'FOREST PARK',
                country: 'US',
                state: undefined,
                zip: '60130'
            });
        });

        t.test('should return estimated delivery date for a real DHL tracking number', async () => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
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
            }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

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
