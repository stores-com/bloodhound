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
});
