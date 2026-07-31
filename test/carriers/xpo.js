const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const XPO = require('../../carriers/xpo');

test('XPO', async (t) => {
    const bloodhound = new Bloodhound({
        xpo: {
            api_key: process.env.XPO_API_KEY,
            password: process.env.XPO_PASSWORD,
            username: process.env.XPO_USERNAME
        }
    });

    await t.test('xpo.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const xpo = new XPO();

        const validTrackingNumbers = [
            '235825413',
            '123456701',
            '987654323',
            '012-345-605',
            '123 456 701'
        ];

        const invalidTrackingNumbers = [
            '012345601',
            '123456702',
            '12345670',
            '1234567041',
            'ABC123456',
            '1Z12345E0205271688',
            '',
            '000000000'
        ];

        await t.test('should detect valid XPO PRO numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!xpo.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should be recognized as a valid XPO PRO number`);
                }
            });
        });

        await t.test('should not detect invalid XPO PRO numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (xpo.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid XPO PRO number`);
                }
            });
        });
    });

    await t.test('xpo.track', async (t) => {
        await t.test('should return tracking information for a valid PRO number', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
            assert.strictEqual(typeof actual.url, 'string');
            assert(actual.url.includes('235825413'));
        });

        await t.test('should return empty events for invalid PRO number', async () => {
            const actual = await bloodhound.track('000000007', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
            assert.strictEqual(actual.events.length, 0);
        });

        await t.test('should handle PRO numbers with dashes', async () => {
            const actual = await bloodhound.track('235-825-413', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
        });

        await t.test('should handle PRO numbers with spaces', async () => {
            const actual = await bloodhound.track('235 825 413', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
        });

        await t.test('should include location information when available', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            const eventsWithLocation = actual.events.filter(event =>
                event.address.city || event.address.state
            );

            if (eventsWithLocation.length > 0) {
                eventsWithLocation.forEach(event => {
                    if (event.address.city) {
                        assert(typeof event.address.city === 'string');
                        assert(event.address.city.length > 0);
                    }
                    if (event.address.state) {
                        assert(typeof event.address.state === 'string');
                        assert(event.address.state.length > 0);
                    }
                });
            }
        });

        await t.test('should return raw data in results', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            assert(Object.hasOwn(actual, 'raw'));

            if (actual.raw) {
                assert(typeof actual.raw === 'object');
            }
        });

        await t.test('should sort events chronologically', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            if (actual.events.length > 1) {
                for (let i = 1; i < actual.events.length; i++) {
                    const prevDate = new Date(actual.events[i - 1].date);
                    const currDate = new Date(actual.events[i].date);
                    assert(prevDate <= currDate, 'Events should be sorted chronologically (oldest first)');
                }
            }
        });

        await t.test('should set deliveredAt for delivered packages', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            if (actual.deliveredAt) {
                assert(actual.deliveredAt instanceof Date);
            }
        });

        await t.test('should set shippedAt for packages in transit', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            if (actual.shippedAt) {
                assert(actual.shippedAt instanceof Date);
            }
        });

        await t.test('should verify event structure', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            actual.events.forEach(event => {
                assert(Object.hasOwn(event, 'address'));
                assert(Object.hasOwn(event, 'date'));
                assert(Object.hasOwn(event, 'description'));
                assert(event.date instanceof Date);
                assert(typeof event.description === 'string');
            });
        });

        // Every other test in this file calls the live XPO API, which returns the one 404 that
        // `err.message === '404 Not Found'` happens to match. This one is mocked because the
        // case worth covering is the one the live API does not produce. HttpError's message is
        // `${status} ${statusText}`, and the reason phrase is chosen by the origin and
        // normalised by nobody — httpbin answers with "INTERNAL SERVER ERROR" in
        // test/carriers/pitneyBowes.js, so an uppercase "404 NOT FOUND" is not hypothetical.
        //
        // The body also carries an errors[] array, which is inert today: @stores.com/xpo pins
        // @stores.com/http-error ~1.0.0, which leaves the message alone. 1.2.0 — the version
        // bloodhound itself uses — replaces the message with that errors[] text, so the check
        // breaks a second way once xpo moves to it.
        //
        // The status on `cause` is unaffected by either.
        await t.test('should return empty events for a 404 whose reason phrase is not "Not Found"', async (t) => {
            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.includes('/token')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'mock-token', expires_in: 3600, token_type: 'Bearer' }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                return Promise.resolve(new Response(JSON.stringify({
                    errors: [{
                        errorCode: 'NOT_FOUND',
                        message: 'No shipment found for the reference number provided'
                    }]
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 404,
                    statusText: 'NOT FOUND'
                }));
            });

            // A username the live tests do not use, so the mocked token cannot be served from
            // or written to their memory-cache entry, which is keyed `xpo_${username}`
            const mocked = new Bloodhound({
                xpo: {
                    api_key: 'test-api-key',
                    password: 'test-password',
                    username: 'test-username-mocked-404'
                }
            });

            const actual = await mocked.track('000000007', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
            assert.strictEqual(actual.events.length, 0);
        });
    });
});
