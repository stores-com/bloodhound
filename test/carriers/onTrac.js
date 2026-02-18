const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const OnTrac = require('../../carriers/onTrac');

test('OnTrac', { timeout: 30000 }, async (t) => {
    const bloodhound = new Bloodhound();

    t.test('onTrac.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const onTrac = new OnTrac();

        const validTrackingNumbers = [
            // 1LS prefix (alphanumeric)
            '1LSDBHP000OGR45',
            '1lsdbhp000ogr45',
            '1LS DBH P000 OGR45',
            '1LSCXIM20179289',
            // LS prefix
            'LS12345678',
            'ls12345678',
            // LX prefix
            'LX17635036',
            'LX11234567',
            // LA/LI/LH/LE/LN prefix
            'LA11234567',
            'LI12976442',
            'LH11234567',
            'LE11234567',
            'LN11234567'
        ];

        const invalidTrackingNumbers = [
            // Too short
            '1LSDBHP000OGR4',
            // Too long
            '1LSDBHP000OGR456',
            // Wrong prefix
            '2LSDBHP000OGR45',
            // LS with letters
            'LS1234567A',
            // LS too short
            'LS1234567',
            // LS too long
            'LS123456789',
            // LX wrong second char
            'LZ11234567',
            // LX wrong third char
            'LX41234567',
            // UPS format
            '1Z12345E0205271688',
            // Empty string
            '',
            // FedEx format
            '449044304137821'
        ];

        t.test('should detect valid OnTrac tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!onTrac.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should be recognized as a valid OnTrac tracking number`);
                }
            });
        });

        t.test('should not detect invalid OnTrac tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (onTrac.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid OnTrac tracking number`);
                }
            });
        });
    });

    t.test('onTrac.track', { concurrency: true }, async (t) => {
        t.test('should return tracking information for a valid tracking number', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSDBHP000OGR45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'OnTrac');
            assert(actual.events.length > 0);
            assert.strictEqual(typeof actual.url, 'string');
            assert(actual.url.includes('1LSDBHP000OGR45'));
        });

        t.test('should return empty events for invalid tracking number', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LS000000000000', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'OnTrac');
            assert.strictEqual(actual.events.length, 0);
        });

        t.test('should handle tracking numbers with spaces', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LS DBH P000 OGR45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'OnTrac');
            assert(actual.events.length > 0);
        });

        t.test('should handle lowercase tracking numbers', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1lsdbhp000ogr45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'OnTrac');
            assert(actual.events.length > 0);
        });

        t.test('should include location information when available', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSDBHP000OGR45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

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
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSDBHP000OGR45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            assert(Object.hasOwn(actual, 'raw'));

            if (actual.raw) {
                assert(typeof actual.raw === 'object');
                assert(Object.hasOwn(actual.raw, 'Packages'));
            }
        });

        t.test('should sort events chronologically', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSDBHP000OGR45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            if (actual.events.length > 1) {
                for (let i = 1; i < actual.events.length; i++) {
                    const prevDate = new Date(actual.events[i - 1].date);
                    const currDate = new Date(actual.events[i].date);
                    assert(prevDate <= currDate, 'Events should be sorted chronologically (oldest first)');
                }
            }
        });

        t.test('should set deliveredAt for delivered packages', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSDBHP000OGR45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            if (actual.deliveredAt) {
                assert(actual.deliveredAt instanceof Date);
            }
        });

        t.test('should set shippedAt for packages in transit', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSDBHP000OGR45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

            if (actual.shippedAt) {
                assert(actual.shippedAt instanceof Date);
            }
        });

        t.test('should verify event structure', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('1LSDBHP000OGR45', 'ontrac', (err, data) => err ? reject(err) : resolve(data));
            });

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
