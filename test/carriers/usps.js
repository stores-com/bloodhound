const assert = require('node:assert');
const test = require('node:test');
const util = require('node:util');

const nock = require('nock');

const Bloodhound = require('../../index');
const USPS = require('../../carriers/usps.js');

test('USPS', { timeout: 10000 }, async (t) => {
    const bloodhound = new Bloodhound({
        usps: {
            userId: process.env.USPS_USERID
        }
    });

    t.test('usps.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const usps = new USPS();

        const validTrackingNumbers = [
            '9400111899223818218407',
            '9400 1118 9922 3818 2184 07',
            '9400 1118 9956 1482 6100 74',
            '9400 1118 9922 3837 8204 90',
            '9400 1118 9922 3837 8611 41',
            '9400111699000271800200',
            '9405511699000273008898',
            '9400111899223830191139',
            '9400111899223830191054',
            '9400111899223830191368',
            '9405511899223830661741',
            '9405503699300049053172',
            '9400109699938860246573',
            '94 0010 9699 9388 6024 6573',
            '420921559505500020714300000128',
            '420 92155 95 0550 0020 7143 0000 0128',
            '4209215512349505500020714300000128',
            '420 92155 1234 95 0550 0020 7143 0000 0128',
            'EC207920162US',
            'EC 207 920 162 US',
            'ec 207 920 162 us',
            '9274899992136003821767',
            '92 7489 9992 1360 0382 1767',
            '92023901003036542400961407',
            '92748999997295513123034457',
            '92748901377803583000610270',
            '4205690192023901019233001401555746',
            '4206810692612927005269000028978091',
            '70131710000012912087'
        ];

        const invalidTrackingNumbers = [
            // incorrect check digit (last digit)
            '4206810692612927005269000028978090'
        ];

        t.test('should detect valid USPS tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!usps.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} is not recognized as a valid USPS tracking number`);
                }
            });
        });

        t.test('should not detect invalid USPS tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (usps.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid USPS tracking number`);
                }
            });
        });
    });

    t.test('Error Handling', { timeout: 60000 }, async (t) => {
        t.test('should return an error for invalid base URL', async () => {
            const bloodhound = new Bloodhound({
                usps: {
                    //baseUrl: 'https://httpbin.org/delay/10#',
                    baseUrl: 'https://localhost:99999',
                    userId: process.env.USPS_USERID
                }
            });

            const err = await new Promise((resolve) => {
                bloodhound.track('9400111899223837861141', 'usps', (err) => resolve(err));
            });

            assert(err);
        });
    });

    t.test('Invalid USPS Access', async (t) => {
        const bloodhound = new Bloodhound({
            usps: {
                baseUrl: 'https://google.com',
                userId: process.env.USPS_USERID
            }
        });

        t.test('should return an error for invalid URL', async () => {
            const err = await new Promise((resolve) => {
                bloodhound.track('9400111899223837861141', 'usps', (err) => resolve(err));
            });

            assert(err);
        });
    });

    t.test('Invalid USPS Credentials', { concurrency: true }, async (t) => {
        t.test('should return an error for invalid USERID', async () => {
            const bloodhound = new Bloodhound({
                usps: {
                    userId: 'invalid'
                }
            });

            const err = await new Promise((resolve) => {
                bloodhound.track('9400111899223837861141', 'usps', (err) => resolve(err));
            });

            assert(err);
        });

        t.test('should return an error for a tracking number that contains invalid characters', async () => {
            const err = await new Promise((resolve) => {
                bloodhound.track('12c &^trackf0', 'usps', (err) => resolve(err));
            });

            assert(err);
        });
    });

    t.test('USPS Tracking', async (t) => {
        t.test('should return a shippedAt field when results have no shipping status', { skip: true }, async () => {
            const bloodhound = new Bloodhound({
                usps: {
                    userId: process.env.USPS_USERID
                }
            });

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('4207866492612927005269000029964826', 'usps', (err, data) => err ? reject(err) : resolve(data));
            });

            const expected = {
                carrier: 'USPS',
                events: [
                    {
                        address: {
                            city: 'LA',
                            country: '',
                            state: 'CA',
                            zip: '91423'
                        },
                        date: new Date('2019-07-19T20:57:00.000Z'),
                        description: 'Delivered, Front Door/Porch',
                        details: 'Your item was delivered at the front door or porch at 1:57 pm on July 19, 2019 in SHERMAN OAKS, CA 91423.'
                    },
                    {
                        address: {
                            city: 'Carrollton',
                            country: '',
                            state: 'TX',
                            zip: '75010'
                        },
                        date: new Date('2019-07-10T16:08:00.000Z'),
                        description: 'Picked Up by Shipping Partner, USPS Awaiting Item'
                    }
                ],
                deliveredAt: new Date('2019-07-19T20:57:00.000Z'),
                url: 'https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=4207866492612927005269000029964826',
                shippedAt: new Date('2019-07-19T20:57:00.000Z')
            };

            assert.deepStrictEqual(actual, expected);
        });

        t.test('should return an empty result if there is no tracking information available ', async () => {
            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('0987654321234567890', 'usps', (err, data) => err ? reject(err) : resolve(data));
            });

            const expected = {
                carrier: 'USPS',
                events: []
            };

            delete actual.raw;

            assert.deepStrictEqual(actual, expected);
        });

        t.test('should return tracking information with no errors', async () => {
            await new Promise((resolve, reject) => {
                bloodhound.track('9400111899223835077162', 'usps', (err) => err ? reject(err) : resolve());
            });
        });

        t.test('should skip Track Details that do no have time stamps', async () => {
            await new Promise((resolve, reject) => {
                bloodhound.track('9400110200830244685403', 'usps', (err) => err ? reject(err) : resolve());
            });
        });

        t.test('should return estimatedDeliveryDate when available in USPS response', async () => {
            const bloodhound = new Bloodhound({
                usps: {
                    userId: process.env.USPS_USERID
                }
            });

            nock('https://production.shippingapis.com')
                .get('/ShippingAPI.dll')
                .query(true)
                .reply(200, `
                <TrackResponse>
                  <TrackInfo>
                    <ExpectedDeliveryDate>July 28, 2025</ExpectedDeliveryDate>
                    <TrackSummary>
                      <EventTime>12:00 pm</EventTime>
                      <EventDate>July 28, 2025</EventDate>
                      <Event>Delivered</Event>
                      <EventCity></EventCity>
                      <EventState></EventState>
                      <EventZIPCode></EventZIPCode>
                      <EventCountry></EventCountry>
                      <EventCode>01</EventCode>
                    </TrackSummary>
                  </TrackInfo>
                </TrackResponse>
              `);

            const actual = await new Promise((resolve, reject) => {
                bloodhound.track('9400150105798014348298', 'usps', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(actual.estimatedDeliveryDate.earliest.toISOString(), '2025-07-28T00:00:00.000Z');
            assert.strictEqual(actual.estimatedDeliveryDate.latest.toISOString(), '2025-07-28T00:00:00.000Z');
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.earliest), true, 'earliest is not a valid Date object');
            assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.latest), true, 'latest is not a valid Date object');
        });
    });
});
