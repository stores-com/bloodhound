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

    t.test('xpo.isTrackingNumberValid', { concurrency: true }, async (t) => {
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

        t.test('should detect valid XPO PRO numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!xpo.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should be recognized as a valid XPO PRO number`);
                }
            });
        });

        t.test('should not detect invalid XPO PRO numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (xpo.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid XPO PRO number`);
                }
            });
        });
    });

    t.test('xpo.track', async (t) => {
        t.test('should return tracking information for a valid PRO number', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
            assert.strictEqual(typeof actual.url, 'string');
            assert(actual.url.includes('235825413'));
        });

        t.test('should return empty events for invalid PRO number', async () => {
            const actual = await bloodhound.track('000000007', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
            assert.strictEqual(actual.events.length, 0);
        });

        t.test('should handle PRO numbers with dashes', async () => {
            const actual = await bloodhound.track('235-825-413', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
        });

        t.test('should handle PRO numbers with spaces', async () => {
            const actual = await bloodhound.track('235 825 413', 'xpo');

            assert.strictEqual(actual.carrier, 'XPO');
        });

        t.test('should include location information when available', async () => {
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

        t.test('should return raw data in results', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            assert(Object.hasOwn(actual, 'raw'));

            if (actual.raw) {
                assert(typeof actual.raw === 'object');
            }
        });

        t.test('should sort events chronologically', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            if (actual.events.length > 1) {
                for (let i = 1; i < actual.events.length; i++) {
                    const prevDate = new Date(actual.events[i - 1].date);
                    const currDate = new Date(actual.events[i].date);
                    assert(prevDate <= currDate, 'Events should be sorted chronologically (oldest first)');
                }
            }
        });

        t.test('should set deliveredAt for delivered packages', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            if (actual.deliveredAt) {
                assert(actual.deliveredAt instanceof Date);
            }
        });

        t.test('should set shippedAt for packages in transit', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            if (actual.shippedAt) {
                assert(actual.shippedAt instanceof Date);
            }
        });

        t.test('should verify event structure', async () => {
            const actual = await bloodhound.track('235825413', 'xpo');

            actual.events.forEach(event => {
                assert(Object.hasOwn(event, 'address'));
                assert(Object.hasOwn(event, 'date'));
                assert(Object.hasOwn(event, 'description'));
                assert(event.date instanceof Date);
                assert(typeof event.description === 'string');
            });
        });
    });
});
