const assert = require('node:assert');
const test = require('node:test');
const util = require('node:util');

const Bloodhound = require('../../index');
const Amazon = require('../../carriers/amazon');

test('Amazon', { timeout: 30000 }, async (t) => {
    const bloodhound = new Bloodhound();

    await t.test('amazon.isTrackingNumberValid', async (t) => {
        const amazon = new Amazon();

        const validTrackingNumbers = [
            'TBA321677302718',
            'TBA123456789012',
            'TBM123456789012',
            'TBC123456789012',
            'TBA 3216 7730 2718',
            'tba321677302718'
        ];

        const invalidTrackingNumbers = [
            // Too short (12 chars total, only 9 after TBA)
            'TBA123456789',
            // Too long (>16 after TB)
            'TBA123456789012345678901',
            // Invalid second letter (not A, B, or C)
            'TBD123456789012',
            'TBE123456789012',
            'TBZ123456789012',
            // Mixed alphanumeric (not just digits after third letter)
            'TBZ123A456B789C0',
            'TBY12345ABCDE67',
            // Wrong prefix
            'XYZ123456789012',
            // Wrong prefix (only one letter)
            'T123456789012',
            // UPS format
            '1Z12345E0205271688',
            // Random numbers
            '1234567890',
            // Empty string
            '',
            // Too short
            'TBA',
            // Wrong prefix (no T)
            'AB123456789012',
            // Wrong prefix
            'A123456789012'
        ];

        await t.test('should detect valid Amazon tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!amazon.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should be recognized as a valid Amazon tracking number`);
                }
            });
        });

        await t.test('should not detect invalid Amazon tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (amazon.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid Amazon tracking number`);
                }
            });
        });
    });

    await t.test('amazon.track', async (t) => {
        await t.test('should return tracking information for a valid delivered package', { skip: true }, async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('TBA322242594054', 'amazon', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'Amazon');
            assert(actual.events.length > 0);
            assert.strictEqual(typeof actual.url, 'string');
            assert(actual.url.includes('TBA322242594054'));

            const hasDeliveredEvent = actual.events.some(event =>
                event.description.toLowerCase().includes('delivered') ||
                event.description.toLowerCase().includes('package delivered')
            );

            if (actual.deliveredAt) {
                assert(hasDeliveredEvent, 'Should have delivered event when deliveredAt is set');
                assert(actual.deliveredAt instanceof Date);
            }

            if (actual.shippedAt) {
                assert(actual.shippedAt instanceof Date);
            }

            actual.events.forEach(event => {
                assert(Object.hasOwn(event, 'address'));
                assert(Object.hasOwn(event, 'date'));
                assert(Object.hasOwn(event, 'description'));
                assert(event.date instanceof Date);
                assert(typeof event.description === 'string');
                assert(event.description.length > 0);
            });
        });

        await t.test('should handle tracking numbers with spaces', { skip: true }, async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('TBA 3222 4259 4054', 'amazon', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'Amazon');
            assert(actual.events.length > 0);
        });

        await t.test('should handle lowercase tracking numbers', { skip: true }, async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('tba322242594054', 'amazon', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'Amazon');
            assert(actual.events.length > 0);
        });

        await t.test('should return empty events for invalid tracking number', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('TBA000000000000', 'amazon', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.carrier, 'Amazon');
            assert.strictEqual(actual.events.length, 0);
        });

        await t.test('should include location information when available', async () => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
                progressTracker: JSON.stringify({
                    summary: {
                        metadata: {}
                    }
                }),
                eventHistory: JSON.stringify({
                    eventHistory: [
                        {
                            eventTime: '2025-06-20T10:30:00.000Z',
                            eventCode: 'PickupDone',
                            statusSummary: {
                                localisedStringId: 'swa_rex_detail_pickedUp'
                            },
                            location: {
                                city: 'Seattle',
                                stateProvince: 'WA',
                                countryCode: 'US',
                                postalCode: '98109'
                            }
                        },
                        {
                            eventTime: '2025-06-21T14:20:00.000Z',
                            eventCode: 'InTransit',
                            statusSummary: {
                                localisedStringId: 'swa_rex_intransit'
                            },
                            location: {
                                city: 'Portland',
                                stateProvince: 'OR',
                                countryCode: 'US',
                                postalCode: '97204'
                            }
                        }
                    ]
                })
            }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('TBA321677302718', 'amazon', (err, data) => err ? reject(err) : resolve(data));
            });

            const eventsWithLocation = actual.events.filter(event =>
                event.address.city || event.address.state || event.address.country
            );

            assert(eventsWithLocation.length > 0, 'Should have at least one event with location data');

            eventsWithLocation.forEach(event => {
                if (event.address.city) {
                    assert(typeof event.address.city === 'string');
                    assert(event.address.city.length > 0);
                }
                if (event.address.state) {
                    assert(typeof event.address.state === 'string');
                    assert(event.address.state.length > 0);
                }
                if (event.address.country) {
                    assert(typeof event.address.country === 'string');
                    assert(event.address.country.length > 0);
                }
            });
        });

        await t.test('should return raw data in results', async () => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
                progressTracker: JSON.stringify({
                    summary: {
                        metadata: {}
                    }
                }),
                eventHistory: JSON.stringify({
                    eventHistory: []
                })
            }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('TBA321677302718', 'amazon', (err, data) => err ? reject(err) : resolve(data));
            });

            assert(Object.hasOwn(actual, 'raw'));

            if (actual.raw) {
                assert(typeof actual.raw === 'object');
                assert(Object.hasOwn(actual.raw, 'eventHistory'));
                assert(Object.hasOwn(actual.raw, 'progressTracker'));
            }
        });

        await t.test('should sort events chronologically', async () => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
                progressTracker: JSON.stringify({
                    summary: {
                        metadata: {}
                    }
                }),
                eventHistory: JSON.stringify({
                    eventHistory: [
                        {
                            eventTime: '2025-06-21T14:20:00.000Z',
                            eventCode: 'InTransit',
                            statusSummary: {
                                localisedStringId: 'swa_rex_intransit'
                            }
                        },
                        {
                            eventTime: '2025-06-22T18:00:00.000Z',
                            eventCode: 'Delivered',
                            statusSummary: {
                                localisedStringId: 'swa_rex_delivered'
                            }
                        },
                        {
                            eventTime: '2025-06-20T10:30:00.000Z',
                            eventCode: 'PickupDone',
                            statusSummary: {
                                localisedStringId: 'swa_rex_detail_pickedUp'
                            }
                        }
                    ]
                })
            }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('TBA321677302718', 'amazon', (err, data) => err ? reject(err) : resolve(data));
            });

            if (actual.events.length > 1) {
                for (let i = 1; i < actual.events.length; i++) {
                    const prevDate = new Date(actual.events[i - 1].date);
                    const currDate = new Date(actual.events[i].date);
                    assert(prevDate <= currDate, 'Events should be sorted chronologically (oldest first)');
                }
            }
        });

        await t.test('should return estimatedDeliveryDate for a real Amazon tracking number', async () => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify({
                progressTracker: JSON.stringify({
                    summary: {
                        metadata: {
                            expectedDeliveryDate: '2025-06-23T08:00:00.000Z'
                        }
                    }
                }),
                eventHistory: JSON.stringify({
                    eventHistory: []
                })
            }), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('TBA322242594054', 'amazon', (err, data) => err ? reject(err) : resolve(data));
            });

            assert(actual.estimatedDeliveryDate);
            assert.strictEqual(actual.estimatedDeliveryDate.earliest.toISOString(), '2025-06-23T08:00:00.000Z');
            assert.strictEqual(actual.estimatedDeliveryDate.latest.toISOString(), '2025-06-23T08:00:00.000Z');
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.earliest), true);
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.latest), true);
        });
    });
});
