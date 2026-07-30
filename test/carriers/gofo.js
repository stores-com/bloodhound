const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const GOFO = require('../../carriers/gofo');

test('GOFO', { timeout: 30000 }, async (t) => {
    const bloodhound = new Bloodhound();

    t.test('gofo.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const gofo = new GOFO();

        const validTrackingNumbers = [
            'CR000485623975',
            'cr000485623975',
            'CR 0004 8562 3975'
        ];

        const invalidTrackingNumbers = [
            // Too short
            'CR12345678901',
            // Too long
            'CR0004856239751',
            // Wrong prefix
            'AB000485623975',
            // Invalid characters in CR format
            'CR00048562397A',
            // GF format (not auto-detected, but can be tracked explicitly)
            'GF1234567890CN',
            // UPS format
            '1Z12345E0205271688',
            // Random numbers
            '1234567890',
            // Empty string
            '',
            // FedEx format
            '449044304137821'
        ];

        t.test('should detect valid GOFO tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!gofo.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should be recognized as a valid GOFO tracking number`);
                }
            });
        });

        t.test('should not detect invalid GOFO tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (gofo.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid GOFO tracking number`);
                }
            });
        });
    });

    t.test('gofo.track', { concurrency: true }, async (t) => {
        t.test('should return tracking information for a valid tracking number', async () => {
            const actual = await bloodhound.track('CR000485623975', 'gofo');

            assert.strictEqual(actual.carrier, 'GOFO');
            assert(actual.events.length > 0);
            assert.strictEqual(typeof actual.url, 'string');
            assert(actual.url.includes('CR000485623975'));
        });

        t.test('should return empty events for invalid tracking number', async () => {
            const actual = await bloodhound.track('CR000000000000', 'gofo');

            assert.strictEqual(actual.carrier, 'GOFO');
            assert.strictEqual(actual.events.length, 0);
        });

        t.test('should handle tracking numbers with spaces', async () => {
            const actual = await bloodhound.track('CR 0004 8562 3975', 'gofo');

            assert.strictEqual(actual.carrier, 'GOFO');
            assert(actual.events.length > 0);
        });

        t.test('should handle lowercase tracking numbers', async () => {
            const actual = await bloodhound.track('cr000485623975', 'gofo');

            assert.strictEqual(actual.carrier, 'GOFO');
            assert(actual.events.length > 0);
        });

        t.test('should include location information when available', async () => {
            const actual = await bloodhound.track('CR000485623975', 'gofo');

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
            const actual = await bloodhound.track('CR000485623975', 'gofo');

            assert(Object.hasOwn(actual, 'raw'));

            if (actual.raw) {
                assert(typeof actual.raw === 'object');
                assert(Object.hasOwn(actual.raw, 'success'));
                assert(Object.hasOwn(actual.raw, 'data'));
            }
        });

        t.test('should sort events chronologically', async () => {
            const actual = await bloodhound.track('CR000485623975', 'gofo');

            if (actual.events.length > 1) {
                for (let i = 1; i < actual.events.length; i++) {
                    const prevDate = new Date(actual.events[i - 1].date);
                    const currDate = new Date(actual.events[i].date);
                    assert(prevDate <= currDate, 'Events should be sorted chronologically (oldest first)');
                }
            }
        });

        t.test('should set deliveredAt for delivered packages', async () => {
            const actual = await bloodhound.track('CR000485623975', 'gofo');

            if (actual.deliveredAt) {
                assert(actual.deliveredAt instanceof Date);
            }
        });

        t.test('should set shippedAt for packages in transit', async () => {
            const actual = await bloodhound.track('CR000485623975', 'gofo');

            if (actual.shippedAt) {
                assert(actual.shippedAt instanceof Date);
            }
        });

        t.test('should verify event structure', async () => {
            const actual = await bloodhound.track('CR000485623975', 'gofo');

            actual.events.forEach(event => {
                assert(Object.hasOwn(event, 'address'));
                assert(Object.hasOwn(event, 'date'));
                assert(Object.hasOwn(event, 'description'));
                assert(event.date instanceof Date);
                assert(typeof event.description === 'string');
                assert(event.description.length > 0);
            });
        });
    });
});
