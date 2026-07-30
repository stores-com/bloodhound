const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const DhlEcommerceSolutions = require('../../carriers/dhlEcommerceSolutions');

test('DHL eCommerce Solutions', async (t) => {
    const validTrackingNumbers = [
        '420480369374810912400407068201'
    ];

    t.test('dhlEcommerceSolutions.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const dhlEcommerceSolutions = new DhlEcommerceSolutions({
            client_id: process.env.DHL_ECOMMERCE_CLIENT_ID,
            client_secret: process.env.DHL_ECOMMERCE_CLIENT_SECRET,
            environment_url: process.env.DHL_ECOMMERCE_SOLUTIONS_ENVIRONMENT_URL
        });

        const invalidTrackingNumbers = [
            '9970 4895 0367 429',
            'DT771613423732',
            '9400 1118 9922 3818 2184 07'
        ];

        t.test('should detect valid DHL eCommerce Solutions tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!dhlEcommerceSolutions.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} is not recognized as a valid DHL tracking number`);
                }
            });
        });

        t.test('should not detect invalid DHL eCommerce Solutions tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (dhlEcommerceSolutions.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid DHL tracking number`);
                }
            });
        });
    });

    t.test('dhlEcommerceSolutions.track', { skip: true, timeout: 10000 }, async (t) => {
        const bloodhound = new Bloodhound({
            dhlEcommerceSolutions: {
                client_id: process.env.DHL_ECOMMERCE_SOLUTIONS_CLIENT_ID,
                client_secret: process.env.DHL_ECOMMERCE_SOLUTIONS_CLIENT_SECRET,
                environment_url: process.env.DHL_ECOMMERCE_SOLUTIONS_ENVIRONMENT_URL
            }
        });

        t.test('should return a DHL error when no packages are associated with tracking number', async () => {
            const [err, actual] = await new Promise((resolve) => {
                bloodhound.track(validTrackingNumbers[0], 'dhl', (...args) => resolve(args));
            });

            // No packages with length to track, so this is falling through to UTAPI.
            // Asserted on the status rather than the message, which is now
            // @stores.com/http-error's "401 Unauthorized".
            assert.strictEqual(err.cause.status, 401);
            assert.equal(undefined, actual);
        });
    });

    // The block above is skipped and needs live sandbox credentials, which left the
    // whole tracking path untested. These mock DHL's own fetch calls instead, so they
    // run everywhere and cover how we tell "DHL has never heard of this number" apart
    // from "DHL is broken" — the distinction carriers/dhl.js relies on to decide
    // whether to fall through to the UTAPI.
    await t.test('dhlEcommerceSolutions.track error handling', async (t) => {
        await t.test('should return empty results when DHL reports the tracking number is not found', async () => {
            const dhlEcommerceSolutions = new DhlEcommerceSolutions({
                client_id: 'not-found-client',
                client_secret: 'test-secret',
                environment_url: 'https://api-sandbox.dhlecs.com'
            });

            const fetchMock = t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/auth/v4/accesstoken')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                // DHL returns its own text in `errors[]`, and @stores.com/http-error
                // promotes that over the status line — so err.message here is
                // "No packages found for the given tracking number", not "404 Not Found".
                // Matching on the message is what this guards against.
                return Promise.resolve(new Response(JSON.stringify({ errors: [{ message: 'No packages found for the given tracking number' }] }), {
                    headers: { 'content-type': 'application/json' },
                    status: 404
                }));
            });

            const args = await new Promise((resolve) => {
                dhlEcommerceSolutions.track(validTrackingNumbers[0], (...args) => resolve(args));
            });

            assert.strictEqual(args[0], null);
            assert.strictEqual(args[1].carrier, 'DHL');
            assert.strictEqual(args[1].events.length, 0);
            assert(fetchMock.mock.callCount() > 0);
        });

        await t.test('should propagate a server error instead of reporting it as not found', async () => {
            const dhlEcommerceSolutions = new DhlEcommerceSolutions({
                client_id: 'server-error-client',
                client_secret: 'test-secret',
                environment_url: 'https://api-sandbox.dhlecs.com'
            });

            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/auth/v4/accesstoken')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
            });

            const args = await new Promise((resolve) => {
                dhlEcommerceSolutions.track(validTrackingNumbers[0], (...args) => resolve(args));
            });

            assert.strictEqual(args[0].cause.status, 500);
            assert.strictEqual(args[1], undefined);
        });
    });
});
