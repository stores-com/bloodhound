const assert = require('node:assert');
const test = require('node:test');
const util = require('node:util');

const Bloodhound = require('../../index');
const DHL = require('../../carriers/dhl');

test('DHL', async (t) => {
    const validTrackingNumbers = [
        '420944019261299999877816190127'
    ];

    await t.test('dhl.isTrackingNumberValid', async (t) => {
        const dhl = new DHL();

        const invalidTrackingNumbers = [
            '9970 4895 0367 429',
            'DT771613423732',
            '9400 1118 9922 3818 2184 07'
        ];

        await t.test('should detect valid DHL tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!dhl.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} is not recognized as a valid DHL tracking number`);
                }
            });
        });

        await t.test('should not detect invalid DHL tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (dhl.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid DHL tracking number`);
                }
            });
        });
    });

    await t.test('dhl.track', { timeout: 10000 }, async (t) => {
        await t.test('should return a valid response with no errors', async () => {
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

            const actual = await bloodhound.track(validTrackingNumbers[0], 'dhl');

            assert.equal('DHL', actual.carrier);
        });

        await t.test('should fall through to DHL UTAPI and return a response with no errors when DHL eCommerce Solutions fails for a non-IMpb number', async () => {
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

            // A bare IMpb without its 420 routing prefix, because a 420-prefixed number no
            // longer falls through to the UTAPI at all — the UTAPI answers 404 for every
            // 420-prefixed IMpb, so the fall-through only exists for other numbers now.
            const actual = await bloodhound.track('9374810912400407068201', 'dhl');

            assert.equal('DHL', actual.carrier);
        });

        await t.test('should try DHL eCommerce solutions first', async () => {
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

            // A 420-prefixed IMpb goes to DHL eCommerce Solutions regardless of Mailer ID,
            // so the 401 here comes from its access token request and surfaces directly —
            // an IMpb number never falls through to the UTAPI.
            // Asserted on the status rather than the message: the message is
            // @stores.com/http-error's "401 Unauthorized", and it gets replaced by the
            // carrier's own text whenever a response body carries an `errors[]` array.
            await assert.rejects(() => bloodhound.track(validTrackingNumbers[0], 'dhl'), (err) => {
                assert.strictEqual(err.cause.status, 401);

                return true;
            });
        });

        await t.test('should not retry a UTAPI 4xx', async () => {
            const fetchMock = t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
                detail: 'No shipment with given tracking number found.',
                status: 404,
                title: 'No result found'
            }), {
                headers: { 'content-type': 'application/json' },
                status: 404
            })));

            // No dhlEcommerceSolutions options, so this goes straight to the UTAPI and the
            // fetch count is unambiguous.
            const bloodhound = new Bloodhound({ dhl: { apiKey: 'test' } });

            await assert.rejects(() => bloodhound.track(validTrackingNumbers[0], 'dhl'), (err) => {
                assert.strictEqual(err.cause.status, 404);

                return true;
            });

            // A 404 is a permanent answer for this tracking number. Retrying spends carrier
            // calls on an outcome that cannot change, and those wasted calls are what earn
            // DHL's 429.
            assert.strictEqual(fetchMock.mock.callCount(), 1);
        });

        await t.test('should still retry a UTAPI 5xx', async () => {
            const fetchMock = t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
                detail: 'The server encountered an unexpected condition.',
                status: 500,
                title: 'Internal Server Error'
            }), {
                headers: { 'content-type': 'application/json' },
                status: 500
            })));

            const bloodhound = new Bloodhound({ dhl: { apiKey: 'test' } });

            await assert.rejects(() => bloodhound.track(validTrackingNumbers[0], 'dhl'), (err) => {
                assert.strictEqual(err.cause.status, 500);

                return true;
            });

            // async.retry's default of 5 attempts, unchanged for transient failures.
            assert.strictEqual(fetchMock.mock.callCount(), 5);
        });

        await t.test('should not multiply retries through the DHL eCommerce Solutions path', async () => {
            const fetchMock = t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
                detail: 'Too many requests within defined time period, please try again later.',
                status: 429,
                title: 'Too Many Requests'
            }), {
                headers: { 'content-type': 'application/json' },
                status: 429
            })));

            const bloodhound = new Bloodhound({
                dhl: {
                    apiKey: 'test'
                },
                dhlEcommerceSolutions: {
                    client_id: 'test',
                    client_secret: 'test',
                    environment_url: 'https://api-sandbox.dhlecs.com'
                }
            });

            // This number is valid for DHL eCommerce Solutions, so the lookup takes the
            // eCommerce path and the 429 surfaces from there.
            await assert.rejects(() => bloodhound.track('420480369374810912400407068201', 'dhl'), (err) => {
                assert.strictEqual(err.cause.status, 429);

                return true;
            });

            // One call: the access token request, which is where a 429 on every endpoint
            // stops this path. The outer retry wrapping dhlEcommerceSolutions.track()
            // multiplies the inner one rather than adding to it, so without its own filter a
            // single 429 costs five calls instead of one. An IMpb number no longer falls
            // through to the UTAPI, which is what previously made this two.
            assert.strictEqual(fetchMock.mock.callCount(), 1);
        });

        await t.test('should not retry a DHL eCommerce Solutions 4xx', async () => {
            // dhlEcommerceSolutions.track() retries internally and this file wraps it in another
            // async.retry, so the two multiply rather than add. Both need the filter: with it on
            // only the inner one, a 429 still cost five lookups, because each was a fresh outer
            // attempt. 429 rather than 404 because a 404 returns empty results instead of an
            // error and never reaches the outer retry's error path at all.
            const dhlEcommerceSolutionsTrackingNumber = '420480369374810912400407068201';

            const fetchMock = t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/auth/v4/accesstoken')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                if (url.includes('/tracking/v4/package')) {
                    return Promise.resolve(new Response(JSON.stringify({ errors: [{ message: 'Too Many Requests' }] }), {
                        headers: { 'content-type': 'application/json' },
                        status: 429
                    }));
                }

                // The UTAPI, which an IMpb number must never fall through to — asserted below.
                return Promise.resolve(new Response(JSON.stringify({ shipments: [] }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            const bloodhound = new Bloodhound({
                dhl: { apiKey: 'test' },
                dhlEcommerceSolutions: {
                    client_id: 'test',
                    client_secret: 'test',
                    environment_url: 'https://api-sandbox.dhlecs.com'
                }
            });

            await assert.rejects(() => bloodhound.track(dhlEcommerceSolutionsTrackingNumber, 'dhl'), (err) => {
                assert.strictEqual(err.cause.status, 429);

                return true;
            });

            assert.strictEqual(fetchMock.mock.calls.filter(call => call.arguments[0].includes('/tracking/v4/package')).length, 1);

            // The number is a 420-prefixed IMpb, so the eCommerce Solutions failure surfaces
            // instead of falling through to the UTAPI
            assert.strictEqual(fetchMock.mock.calls.filter(call => call.arguments[0].includes('api-eu.dhl.com')).length, 0);
        });

        await t.test('should track an IMpb number with an unrecognized Mailer ID through DHL eCommerce Solutions instead of the UTAPI', async () => {
            // 92/612/999998: a well-formed IMpb from a Mailer ID that DHL_IMPB_REGEX does not
            // recognize. These numbers previously skipped DHL eCommerce Solutions entirely and
            // went to the UTAPI, which answers 404 for every 420-prefixed IMpb regardless of
            // Mailer ID — a guaranteed failure spent against a rate-limited endpoint.
            const fetchMock = t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/auth/v4/accesstoken')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                if (url.includes('/tracking/v4/package')) {
                    return Promise.resolve(new Response(JSON.stringify({ packages: [] }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                // The UTAPI, which answers 404 for these numbers in production. The count
                // assertion below proves it is never asked.
                return Promise.resolve(new Response(JSON.stringify({
                    detail: 'No shipment with given tracking number found.',
                    status: 404,
                    title: 'No result found'
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 404
                }));
            });

            const bloodhound = new Bloodhound({
                dhl: { apiKey: 'test' },
                dhlEcommerceSolutions: {
                    client_id: 'test',
                    client_secret: 'test',
                    environment_url: 'https://api-sandbox.dhlecs.com'
                }
            });

            const actual = await bloodhound.track(validTrackingNumbers[0], 'dhl');

            assert.strictEqual(actual.carrier, 'DHL');
            assert.strictEqual(actual.events.length, 0);
            assert.strictEqual(fetchMock.mock.calls.filter(call => call.arguments[0].includes('/tracking/v4/package')).length, 1);
            assert.strictEqual(fetchMock.mock.calls.filter(call => call.arguments[0].includes('api-eu.dhl.com')).length, 0);
        });

        await t.test('should not fall through to the UTAPI when DHL eCommerce Solutions has no packages for an IMpb number', async () => {
            // The Mailer ID on this number passes DHL_IMPB_REGEX, so it reached DHL eCommerce
            // Solutions before this change too — but an empty packages array used to fall
            // through to the UTAPI, which cannot resolve any 420-prefixed IMpb. The empty
            // answer is DHL's answer; it is returned rather than traded for a guaranteed 404.
            const fetchMock = t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/auth/v4/accesstoken')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                if (url.includes('/tracking/v4/package')) {
                    return Promise.resolve(new Response(JSON.stringify({ packages: [] }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                // The UTAPI, which answers 404 for these numbers in production. The count
                // assertion below proves it is never asked.
                return Promise.resolve(new Response(JSON.stringify({
                    detail: 'No shipment with given tracking number found.',
                    status: 404,
                    title: 'No result found'
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 404
                }));
            });

            const bloodhound = new Bloodhound({
                dhl: { apiKey: 'test' },
                dhlEcommerceSolutions: {
                    client_id: 'test',
                    client_secret: 'test',
                    environment_url: 'https://api-sandbox.dhlecs.com'
                }
            });

            const actual = await bloodhound.track('420480369374810912400407068201', 'dhl');

            assert.strictEqual(actual.carrier, 'DHL');
            assert.strictEqual(actual.events.length, 0);
            assert.strictEqual(fetchMock.mock.calls.filter(call => call.arguments[0].includes('/tracking/v4/package')).length, 1);
            assert.strictEqual(fetchMock.mock.calls.filter(call => call.arguments[0].includes('api-eu.dhl.com')).length, 0);
        });

        await t.test('should set shippedAt for "PROCESSED THROUGH USPS SORT FACILITY" events from UTAPI', async () => {
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

            const actual = await bloodhound.track(validTrackingNumbers[0], 'dhl');

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

        await t.test('should return estimated delivery date for a real DHL tracking number', async () => {
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

            const actual = await bloodhound.track(validTrackingNumbers[0], 'dhl');

            assert(actual.estimatedDeliveryDate);
            assert.strictEqual(actual.estimatedDeliveryDate.earliest.toISOString(), '2026-02-18T00:00:00.000Z');
            assert.strictEqual(actual.estimatedDeliveryDate.latest.toISOString(), '2026-02-18T00:00:00.000Z');
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.earliest), true);
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.latest), true);
        });
    });
});
