const assert = require('node:assert');
const test = require('node:test');
const util = require('node:util');

const Bloodhound = require('../../index');
const FedEx = require('../../carriers/fedEx');

// FedEx Mock Tracking Numbers
// https://developer.fedex.com/api/en-us/guides/api-reference.html#mocktrackingnumbersforfedexexpressandfedexground
// https://developer.fedex.com/api/en-us/guides/api-reference.html#mocktrackingnumbersforfedexground%C2%AEeconomy(formerlyknownasfedexsmartpost%C2%AE)
test('FedEx', async (t) => {

    t.test('fedEx.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const fedEx = new FedEx();

        const validTrackingNumbers = [
            '02931503799192766595',
            '41999998135520738841',
            '61299998620341515252',
            '74899992242124855076',
            '771613423732',
            '7716 1342 3732',
            '9261293148703201595357',
            '9274899992136003821767',
            '9611804010639001854878',
            '9611804512604749366900',
            '997048950367429',
            '9970 4895 0367 429',
            'DT771613423732'
        ];

        t.test('should detect valid FedEx tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!fedEx.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} is not recognized as a valid FedEx tracking number`);
                }
            });
        });
    });

    // `fedEx request handling` and `FedEx estimatedDeliveryDate` mock globalThis.fetch,
    // which is process-wide. These groups therefore have to run one at a time, or the
    // mock intercepts the live FedEx calls the other groups make.
    await t.test('fedEx.track', { timeout: 30000 }, async (t) => {

        const bloodhound = new Bloodhound({
            fedEx: {
                api_key: process.env.FEDEX_API_KEY,
                secret_key: process.env.FEDEX_SECRET_KEY,
                url: process.env.FEDEX_URL
            }
        });

        await t.test('FedEx Express and Ground', async (t) => {
            t.test('Shipment information sent to FedEx', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('449044304137821', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2013-12-30T18:24:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '471307761'
                            }
                        }
                    ],
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=449044304137821'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Tendered', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('149331877648230', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-04T00:54:00.000Z'),
                            description: 'In FedEx possession',
                            address: {
                                city: 'HAGERSTOWN',
                                country: 'US',
                                state: 'MD',
                                zip: '21740'
                            },
                            details: 'Tendered at FedEx location'
                        },
                        {
                            date: new Date('2014-01-02T11:07:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '22841'
                            }
                        }
                    ],
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=149331877648230'
                };

                delete actual.raw;
                assert.deepStrictEqual(actual, expected);
            });

            t.test('Picked Up', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('020207021381215', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-03T22:58:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '295545594'
                            }
                        }
                    ],
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=020207021381215'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Arrived at FedEx location', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('403934084723025', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            address: {
                                city: 'GROVE CITY',
                                country: 'US',
                                state: 'OH',
                                zip: '43123'
                            },
                            date: new Date('2014-01-04T05:43:00.000Z'),
                            description: 'Arrived at FedEx location'
                        },
                        {
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '43822'
                            },
                            date: new Date('2014-01-03T20:03:00.000Z'),
                            description: 'Shipment information sent to FedEx'
                        }
                    ],
                    shippedAt: new Date('2014-01-04T05:43:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=403934084723025'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('At local FedEx facility', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('920241085725456', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-07T11:07:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'NEW CASTLE',
                                country: 'US',
                                state: 'DE',
                                zip: '19720'
                            }
                        },
                        {
                            date: new Date('2014-01-07T03:50:12.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'LEWISBERRY',
                                country: 'US',
                                state: 'PA',
                                zip: '17339'
                            }
                        },
                        {
                            date: new Date('2014-01-06T20:26:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'LEWISBERRY',
                                country: 'US',
                                state: 'PA',
                                zip: '17339'
                            }
                        },
                        {
                            date: new Date('2014-01-04T12:24:02.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'KERNERSVILLE',
                                country: 'US',
                                state: 'NC',
                                zip: '27284'
                            }
                        },
                        {
                            date: new Date('2014-01-03T22:09:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'KERNERSVILLE',
                                country: 'US',
                                state: 'NC',
                                zip: '27284'
                            }
                        },
                        {
                            date: new Date('2014-01-03T03:48:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '27260'
                            }
                        }
                    ],
                    shippedAt: new Date('2014-01-03T22:09:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=920241085725456'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('At destination sort facility', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('568838414941', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-08T02:37:00.000Z'),
                            description: 'At destination sort facility',
                            address: {
                                city: 'PHOENIX',
                                country: 'US',
                                state: 'AZ',
                                zip: '85034'
                            }
                        },
                        {
                            date: new Date('2014-01-07T23:40:00.000Z'),
                            description: 'Departed FedEx hub',
                            address: {
                                city: 'MEMPHIS',
                                country: 'US',
                                state: 'TN',
                                zip: '38118'
                            }
                        },
                        {
                            date: new Date('2014-01-06T10:04:40.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: undefined,
                                state: undefined,
                                zip: undefined
                            }
                        },
                        {
                            date: new Date('2014-01-06T01:23:00.000Z'),
                            description: 'Arrived at FedEx hub',
                            address: {
                                city: 'MEMPHIS',
                                country: 'US',
                                state: 'TN',
                                zip: '38118'
                            }
                        }
                    ],
                    shippedAt: new Date('2014-01-06T01:23:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=568838414941'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Departed FedEx location', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('039813852990618', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-07T10:11:05.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'SAINT PAUL',
                                country: 'US',
                                state: 'MN',
                                zip: '55115'
                            }
                        },
                        {
                            date: new Date('2014-01-07T06:37:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'SAINT PAUL',
                                country: 'US',
                                state: 'MN',
                                zip: '55115'
                            }
                        },
                        {
                            date: new Date('2014-01-05T20:40:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '55117'
                            }
                        }
                    ],
                    shippedAt: new Date('2014-01-07T06:37:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=039813852990618'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('On FedEx vehicle for delivery', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('231300687629630', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-04T11:55:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'MIAMI',
                                country: 'US',
                                state: 'FL',
                                zip: '33178'
                            }
                        },
                        {
                            date: new Date('2014-01-04T10:10:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'MIAMI',
                                country: 'US',
                                state: 'FL',
                                zip: '33178'
                            }
                        },
                        {
                            date: new Date('2014-01-04T10:08:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'MIAMI',
                                country: 'US',
                                state: 'FL',
                                zip: '33178'
                            }
                        },
                        {
                            date: new Date('2014-01-04T05:11:19.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'ORLANDO',
                                country: 'US',
                                state: 'FL',
                                zip: '32809'
                            }
                        },
                        {
                            date: new Date('2014-01-03T20:04:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'ORLANDO',
                                country: 'US',
                                state: 'FL',
                                zip: '32809'
                            }
                        },
                        {
                            date: new Date('2014-01-02T14:28:56.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'KANSAS CITY',
                                country: 'US',
                                state: 'MO',
                                zip: '64161'
                            }
                        },
                        {
                            date: new Date('2014-01-02T13:21:15.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'LENEXA',
                                country: 'US',
                                state: 'KS',
                                zip: '66227'
                            }
                        },
                        {
                            date: new Date('2014-01-02T08:03:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'LENEXA',
                                country: 'US',
                                state: 'KS',
                                zip: '66227'
                            }
                        },
                        {
                            date: new Date('2014-01-01T00:08:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'WICHITA',
                                country: 'US',
                                state: 'KS',
                                zip: '67226'
                            }
                        },
                        {
                            date: new Date('2013-12-31T18:58:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '67226'
                            }
                        }
                    ],
                    shippedAt: new Date('2014-01-01T00:08:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=231300687629630'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('International shipment release', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('797806677146', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-02-06T07:53:00.000Z'),
                            description: 'International shipment release - Import',
                            address: {
                                city: 'MEMPHIS',
                                country: 'US',
                                state: 'TN',
                                zip: '38194'
                            }
                        },
                        {
                            date: new Date('2014-02-06T06:45:00.000Z'),
                            description: 'International shipment release - Import',
                            address: {
                                city: 'MEMPHIS',
                                country: 'US',
                                state: 'TN',
                                zip: '38194'
                            }
                        },
                        {
                            date: new Date('2014-02-06T06:00:00.000Z'),
                            description: 'Arrived at FedEx hub',
                            address: {
                                city: 'MEMPHIS',
                                country: 'US',
                                state: 'TN',
                                zip: '38118'
                            }
                        },
                        {
                            date: new Date('2014-02-05T20:22:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'SOMMA LOMBARDO',
                                country: 'IT',
                                state: undefined,
                                zip: '21019'
                            }
                        },
                        {
                            date: new Date('2014-02-05T19:42:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'SOMMA LOMBARDO',
                                country: 'IT',
                                state: undefined,
                                zip: '21019'
                            }
                        },
                        {
                            date: new Date('2014-02-05T16:45:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'SESTO ULTERIANO',
                                country: 'IT',
                                state: undefined,
                                zip: '20098'
                            }
                        },
                        {
                            date: new Date('2014-02-05T16:41:00.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'SESTO ULTERIANO',
                                country: 'IT',
                                state: undefined,
                                zip: '20098'
                            }
                        },
                        {
                            date: new Date('2014-02-04T20:03:00.000Z'),
                            description: 'At FedEx origin facility',
                            address: {
                                city: 'SESTO ULTERIANO',
                                country: 'IT',
                                state: undefined,
                                zip: '20098'
                            }
                        },
                        {
                            date: new Date('2014-02-04T09:58:46.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: undefined,
                                state: undefined,
                                zip: undefined
                            }
                        }
                    ],
                    shippedAt: new Date('2014-02-04T20:03:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=797806677146'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Customer not available or business closed (Delivery Exception 007)', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('377101283611590', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2013-12-18T19:22:15.000Z'),
                            description: 'Delivery exception',
                            address: {
                                city: 'SACRAMENTO',
                                country: 'US',
                                state: 'CA',
                                zip: '95828'
                            },
                            details: 'Customer not available or business closed'
                        },
                        {
                            date: new Date('2013-12-18T16:25:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'SACRAMENTO',
                                country: 'US',
                                state: 'CA',
                                zip: '95828'
                            }
                        },
                        {
                            date: new Date('2013-12-18T09:08:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'SACRAMENTO',
                                country: 'US',
                                state: 'CA',
                                zip: '95828'
                            }
                        },
                        {
                            date: new Date('2013-12-18T08:37:16.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'SACRAMENTO',
                                country: 'US',
                                state: 'CA',
                                zip: '95824'
                            }
                        },
                        {
                            date: new Date('2013-12-18T07:36:00.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'SACRAMENTO',
                                country: 'US',
                                state: 'CA',
                                zip: '95824'
                            }
                        },
                        {
                            date: new Date('2013-12-18T03:57:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'SACRAMENTO',
                                country: 'US',
                                state: 'CA',
                                zip: '95824'
                            }
                        },
                        {
                            date: new Date('2013-12-13T14:43:35.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'GROVE CITY',
                                country: 'US',
                                state: 'OH',
                                zip: '43123'
                            }
                        },
                        {
                            date: new Date('2013-12-12T22:26:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'GROVE CITY',
                                country: 'US',
                                state: 'OH',
                                zip: '43123'
                            }
                        },
                        {
                            date: new Date('2013-12-11T13:14:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '43068'
                            }
                        }
                    ],
                    shippedAt: new Date('2013-12-12T22:26:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=377101283611590'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Local Delivery Restriction (Delivery Exception 083)', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('852426136339213', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2013-12-24T00:29:46.000Z'),
                            description: 'Delivery exception',
                            address: {
                                city: 'LONG ISLAND CITY',
                                country: 'US',
                                state: 'NY',
                                zip: '11101'
                            },
                            details: 'Local delivery restriction - Delivery not attempted'
                        },
                        {
                            date: new Date('2013-12-23T09:14:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'LONG ISLAND CITY',
                                country: 'US',
                                state: 'NY',
                                zip: '11101'
                            }
                        },
                        {
                            date: new Date('2013-12-23T08:13:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'LONG ISLAND CITY',
                                country: 'US',
                                state: 'NY',
                                zip: '11101'
                            }
                        },
                        {
                            date: new Date('2013-12-23T01:06:01.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'KEASBEY',
                                country: 'US',
                                state: 'NJ',
                                zip: '08832'
                            }
                        },
                        {
                            date: new Date('2013-12-22T16:49:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'KEASBEY',
                                country: 'US',
                                state: 'NJ',
                                zip: '08832'
                            }
                        },
                        {
                            date: new Date('2013-12-19T12:03:56.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'BLOOMINGTON',
                                country: 'US',
                                state: 'CA',
                                zip: '92316'
                            }
                        },
                        {
                            date: new Date('2013-12-19T09:55:40.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'SAN DIEGO',
                                country: 'US',
                                state: 'CA',
                                zip: '92154'
                            }
                        },
                        {
                            date: new Date('2013-12-19T04:05:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'SAN DIEGO',
                                country: 'US',
                                state: 'CA',
                                zip: '92154'
                            }
                        },
                        {
                            date: new Date('2013-12-18T05:10:00.000Z'),
                            description: 'In FedEx possession',
                            address: {
                                city: 'LA MESA',
                                country: 'US',
                                state: 'CA',
                                zip: '91942'
                            },
                            details: 'Package received after final location pickup has occurred. Scheduled for pickup next business day.'
                        },
                        {
                            date: new Date('2013-12-16T03:19:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '91941'
                            }
                        }
                    ],
                    shippedAt: new Date('2013-12-19T04:05:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=852426136339213'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Incorrect Address (Delivery Exception 03)', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('797615467620', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-14T15:45:00.000Z'),
                            description: 'Delivery exception',
                            address: {
                                city: 'Baton Rouge',
                                country: 'US',
                                state: 'LA',
                                zip: '70810'
                            },
                            details: 'Incorrect address'
                        },
                        {
                            date: new Date('2014-01-14T14:06:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'BATON ROUGE',
                                country: 'US',
                                state: 'LA',
                                zip: '70816'
                            }
                        },
                        {
                            date: new Date('2014-01-14T13:12:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'BATON ROUGE',
                                country: 'US',
                                state: 'LA',
                                zip: '70816'
                            }
                        },
                        {
                            date: new Date('2014-01-14T10:34:00.000Z'),
                            description: 'At destination sort facility',
                            address: {
                                city: 'KENNER',
                                country: 'US',
                                state: 'LA',
                                zip: '70062'
                            }
                        },
                        {
                            date: new Date('2014-01-14T09:59:00.000Z'),
                            description: 'Departed FedEx hub',
                            address: {
                                city: 'MEMPHIS',
                                country: 'US',
                                state: 'TN',
                                zip: '38118'
                            }
                        },
                        {
                            date: new Date('2014-01-14T06:45:00.000Z'),
                            description: 'Arrived at FedEx hub',
                            address: {
                                city: 'MEMPHIS',
                                country: 'US',
                                state: 'TN',
                                zip: '38118'
                            }
                        },
                        {
                            date: new Date('2014-01-14T02:55:00.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'MIAMI',
                                country: 'US',
                                state: 'FL',
                                zip: '33172'
                            }
                        },
                        {
                            date: new Date('2014-01-13T15:42:39.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: undefined,
                                state: undefined,
                                zip: undefined
                            }
                        }
                    ],
                    shippedAt: new Date('2014-01-14T02:55:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=797615467620'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Unable to Deliver (Shipment Exception 099)', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('957794015041323', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-28T23:43:08.000Z'),
                            description: 'Shipment exception',
                            address: {
                                city: 'FORT WORTH',
                                country: 'US',
                                state: 'TX',
                                zip: '76119'
                            },
                            details: 'Unable to deliver'
                        },
                        {
                            date: new Date('2014-01-28T16:23:34.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'FORT WORTH',
                                country: 'US',
                                state: 'TX',
                                zip: '76119'
                            }
                        },
                        {
                            date: new Date('2014-01-28T08:41:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'FORT WORTH',
                                country: 'US',
                                state: 'TX',
                                zip: '76119'
                            }
                        },
                        {
                            date: new Date('2014-01-28T04:05:41.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'AUSTIN',
                                country: 'US',
                                state: 'TX',
                                zip: '78744'
                            }
                        },
                        {
                            date: new Date('2014-01-28T02:23:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'AUSTIN',
                                country: 'US',
                                state: 'TX',
                                zip: '78744'
                            }
                        },
                        {
                            date: new Date('2014-01-28T00:10:00.000Z'),
                            description: 'In FedEx possession',
                            address: {
                                city: 'AUSTIN',
                                country: 'US',
                                state: 'TX',
                                zip: '78704'
                            },
                            details: 'Tendered at FedEx location'
                        },
                        {
                            date: new Date('2014-01-27T22:00:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '13502'
                            }

                        }
                    ],
                    shippedAt: new Date('2014-01-28T02:23:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=957794015041323'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Returned to Sender/Shipper', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('076288115212522', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-15T14:32:31.000Z'),
                            description: 'Returning package to shipper',
                            address: {
                                city: 'GRIMES',
                                country: 'US',
                                state: 'IA',
                                zip: '50111'
                            },
                            details: 'Shipper requested shipment to be returned - Unable to deliver shipment - Returning to shipper'
                        },
                        {
                            date: new Date('2014-01-15T11:44:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'GRIMES',
                                country: 'US',
                                state: 'IA',
                                zip: '50111'
                            }
                        },
                        {
                            date: new Date('2014-01-15T10:54:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'GRIMES',
                                country: 'US',
                                state: 'IA',
                                zip: '50111'
                            }
                        },
                        {
                            date: new Date('2014-01-15T05:59:42.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'LENEXA',
                                country: 'US',
                                state: 'KS',
                                zip: '66227'
                            }
                        },
                        {
                            date: new Date('2014-01-15T04:39:10.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'KANSAS CITY',
                                country: 'US',
                                state: 'MO',
                                zip: '64161'
                            }
                        },
                        {
                            date: new Date('2014-01-14T22:17:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'KANSAS CITY',
                                country: 'US',
                                state: 'MO',
                                zip: '64161'
                            }
                        },
                        {
                            date: new Date('2014-01-14T08:28:56.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'NASHVILLE',
                                country: 'US',
                                state: 'TN',
                                zip: '37207'
                            }
                        },
                        {
                            date: new Date('2014-01-13T22:03:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'NASHVILLE',
                                country: 'US',
                                state: 'TN',
                                zip: '37207'
                            }
                        },
                        {
                            date: new Date('2014-01-11T11:18:41.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'ORLANDO',
                                country: 'US',
                                state: 'FL',
                                zip: '32809'
                            }
                        },
                        {
                            date: new Date('2014-01-11T10:34:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'ORLANDO',
                                country: 'US',
                                state: 'FL',
                                zip: '32809'
                            }
                        },
                        {
                            date: new Date('2014-01-11T04:52:26.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'TAMPA',
                                country: 'US',
                                state: 'FL',
                                zip: '33634'
                            }
                        },
                        {
                            date: new Date('2014-01-11T00:26:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'TAMPA',
                                country: 'US',
                                state: 'FL',
                                zip: '33634'
                            }
                        },
                        {
                            date: new Date('2014-01-10T20:25:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '33634'
                            }
                        }
                    ],
                    shippedAt: new Date('2014-01-11T00:26:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=076288115212522'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Clearance delay (International)', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('581190049992', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-02-06T20:21:00.000Z'),
                            description: 'Clearance delay - Import',
                            address: {
                                city: 'ROISSY CHARLES DE GAULLE CEDEX',
                                country: 'FR',
                                state: undefined,
                                zip: '95702'
                            },
                            details: 'Goods are subject to regulatory review.'
                        },
                        {
                            date: new Date('2014-02-06T20:16:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'ROISSY CHARLES DE GAULLE CEDEX',
                                country: 'FR',
                                state: undefined,
                                zip: '95702'
                            },
                            details: 'Package available for clearance'
                        },
                        {
                            date: new Date('2014-02-06T19:09:00.000Z'),
                            description: 'Clearance delay - Import',
                            address: {
                                city: 'ROISSY CHARLES DE GAULLE CEDEX',
                                country: 'FR',
                                state: undefined,
                                zip: '95702'
                            }
                        },
                        {
                            date: new Date('2014-02-06T17:44:00.000Z'),
                            description: 'Arrived at FedEx hub',
                            address: {
                                city: 'ROISSY CHARLES DE GAULLE CEDEX',
                                country: 'FR',
                                state: undefined,
                                zip: '95702'
                            }
                        },
                        {
                            date: new Date('2014-02-06T11:26:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'INDIANAPOLIS',
                                country: 'US',
                                state: 'IN',
                                zip: '46241'
                            }
                        },
                        {
                            date: new Date('2014-02-06T10:52:00.000Z'),
                            description: 'Departed FedEx hub',
                            address: {
                                city: 'INDIANAPOLIS',
                                country: 'US',
                                state: 'IN',
                                zip: '46241'
                            }
                        },
                        {
                            date: new Date('2014-02-06T05:53:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'INDIANAPOLIS',
                                country: 'US',
                                state: 'IN',
                                zip: '46241'
                            }
                        },
                        {
                            date: new Date('2014-02-05T18:08:00.000Z'),
                            description: 'Arrived at FedEx hub',
                            address: {
                                city: 'INDIANAPOLIS',
                                country: 'US',
                                state: 'IN',
                                zip: '46241'
                            }
                        },
                        {
                            date: new Date('2014-02-05T05:48:00.000Z'),
                            description: 'Shipment exception',
                            address: {
                                city: 'HEBRON',
                                country: 'US',
                                state: 'KY',
                                zip: '41048'
                            },
                            details: 'Delay beyond our control'
                        },
                        {
                            date: new Date('2014-02-05T02:30:00.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'LOVELAND',
                                country: 'US',
                                state: 'OH',
                                zip: '45140'
                            }
                        }
                    ],
                    shippedAt: new Date('2014-02-05T02:30:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=581190049992'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Delivered', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('122816215025810', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-09T18:31:00.000Z'),
                            description: 'Delivered',
                            address: {
                                city: 'Norton',
                                country: 'US',
                                state: 'VA',
                                zip: '24273'
                            }
                        },
                        {

                            date: new Date('2014-01-09T09:18:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'KINGSPORT',
                                country: 'US',
                                state: 'TN',
                                zip: '37663'
                            }
                        },
                        {
                            date: new Date('2014-01-09T09:09:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'KINGSPORT',
                                country: 'US',
                                state: 'TN',
                                zip: '37663'
                            }
                        },
                        {
                            date: new Date('2014-01-09T04:26:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'KNOXVILLE',
                                country: 'US',
                                state: 'TN',
                                zip: '37921'
                            }
                        },
                        {
                            date: new Date('2014-01-09T00:14:07.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'NASHVILLE',
                                country: 'US',
                                state: 'TN',
                                zip: '37207'
                            }
                        },
                        {
                            date: new Date('2014-01-08T21:16:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'NASHVILLE',
                                country: 'US',
                                state: 'TN',
                                zip: '37207'
                            }
                        },
                        {
                            date: new Date('2014-01-07T06:29:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'CHICAGO',
                                country: 'US',
                                state: 'IL',
                                zip: '60638'
                            }
                        },
                        {
                            date: new Date('2014-01-04T03:12:30.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'SPOKANE',
                                country: 'US',
                                state: 'WA',
                                zip: '99216'
                            }
                        },
                        {
                            date: new Date('2014-01-04T02:33:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'SPOKANE',
                                country: 'US',
                                state: 'WA',
                                zip: '99216'
                            }
                        },
                        {
                            date: new Date('2014-01-03T22:31:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '83854'
                            }
                        }
                    ],
                    deliveredAt: new Date('2014-01-09T18:31:00.000Z'),
                    shippedAt: new Date('2014-01-04T02:33:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=122816215025810'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Hold at Location', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('843119172384577', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-08T23:23:00.000Z'),
                            description: 'Ready for recipient pickup',
                            address: {
                                city: 'BERKELEY',
                                country: 'US',
                                state: 'CA',
                                zip: '94704'
                            },
                            details: 'Package available for pickup at FedEx Office: 2201 SHATTUCK AVE'
                        },
                        {
                            date: new Date('2014-01-08T23:22:50.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: undefined,
                                country: undefined,
                                state: undefined,
                                zip: '94577'
                            },
                            details: 'Tendered at FedEx Office'
                        },
                        {
                            date: new Date('2014-01-08T16:28:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            }
                        },
                        {
                            date: new Date('2014-01-08T12:08:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            }
                        },
                        {
                            date: new Date('2014-01-07T19:22:33.000Z'),
                            description: 'Delivery exception',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            },
                            details: 'Redirecting to FedEx Office'
                        },
                        {
                            date: new Date('2014-01-07T16:08:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            }
                        },
                        {
                            date: new Date('2014-01-06T03:19:19.000Z'),
                            description: 'Delivery option requested',
                            address: {
                                city: undefined,
                                country: undefined,
                                state: undefined,
                                zip: '94704'
                            },
                            details: 'Hold at FedEx Office request received - Check back later for shipment status'
                        },
                        {
                            date: new Date('2014-01-04T22:55:45.000Z'),
                            description: 'Delivery exception',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            },
                            details: 'Customer not available or business closed'
                        },
                        {
                            date: new Date('2014-01-04T16:58:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            }
                        },
                        {
                            date: new Date('2014-01-03T22:51:07.000Z'),
                            description: 'Delivery exception',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            },
                            details: 'Customer not available or business closed'
                        },
                        {
                            date: new Date('2014-01-03T16:43:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            }
                        },
                        {
                            date: new Date('2014-01-02T22:30:44.000Z'),
                            description: 'Delivery exception',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            },
                            details: 'Customer not available or business closed'
                        },
                        {
                            date: new Date('2014-01-02T17:05:00.000Z'),
                            description: 'On FedEx vehicle for delivery',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            }
                        },
                        {
                            date: new Date('2014-01-02T14:37:00.000Z'),
                            description: 'At local FedEx facility',
                            address: {
                                city: 'SAN LEANDRO',
                                country: 'US',
                                state: 'CA',
                                zip: '94577'
                            }
                        },
                        {
                            date: new Date('2013-12-31T23:26:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'SACRAMENTO',
                                country: 'US',
                                state: 'CA',
                                zip: '95824'
                            }
                        },
                        {
                            date: new Date('2013-12-27T21:46:20.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'NASHVILLE',
                                country: 'US',
                                state: 'TN',
                                zip: '37207'
                            }
                        },
                        {
                            date: new Date('2013-12-27T06:42:00.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'NASHVILLE',
                                country: 'US',
                                state: 'TN',
                                zip: '37207'
                            }
                        }
                    ],
                    shippedAt: new Date('2013-12-27T06:42:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=843119172384577'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Shipment Canceled', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('070358180009382', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2014-01-03T00:45:00.000Z'),
                            description: 'Shipment cancelled by sender',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '60188'
                            }
                        },
                        {
                            date: new Date('2014-01-03T00:16:00.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '60143'
                            }
                        }
                    ],
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=070358180009382'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

        });

        await t.test('FedEx SmartPost', async (t) => {
            t.test('Shipment information sent to FedEx', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('02394653001023698293', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2015-03-02T11:16:40.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '46143'
                            }
                        }
                    ],
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=02394653001023698293'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('In transit', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('61292701078443410536', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2015-03-03T15:57:12.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'OREGONIA',
                                country: 'US',
                                state: 'OH',
                                zip: '45054'
                            }
                        },
                        {
                            date: new Date('2015-03-03T03:24:34.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'INDIANAPOLIS',
                                country: 'US',
                                state: 'IN',
                                zip: '46241'
                            }
                        },
                        {
                            date: new Date('2015-03-03T02:41:54.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'INDIANAPOLIS',
                                country: 'US',
                                state: 'IN',
                                zip: '46241'
                            }
                        },
                        {
                            date: new Date('2015-03-02T11:16:40.000Z'),
                            description: 'Shipment information sent to FedEx',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '46143'
                            }
                        }
                    ],
                    shippedAt: new Date('2015-03-03T02:41:54.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=61292701078443410536'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Out for delivery', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('61292700726653585070', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2015-03-04T15:28:00.000Z'),
                            description: 'Out for delivery',
                            address: {
                                city: 'MENOMONEE FALLS',
                                country: 'US',
                                state: 'WI',
                                zip: '53051'
                            },
                            details: 'Out for delivery with the U.S. Postal Service'
                        },
                        {
                            date: new Date('2015-03-03T21:44:00.000Z'),
                            description: 'At U.S. Postal Service facility',
                            address: {
                                city: 'MENOMONEE FALLS',
                                country: 'US',
                                state: 'WI',
                                zip: '53051'
                            },
                            details: 'Arrived at local Post Office - Allow one to two additional days for delivery'
                        },
                        {
                            date: new Date('2015-03-03T17:30:00.000Z'),
                            description: 'Shipment information sent to U.S. Postal Service',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '53051'
                            }
                        },
                        {
                            date: new Date('2015-03-03T17:19:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'MENOMONEE FALLS',
                                country: 'US',
                                state: 'WI',
                                zip: '53051'
                            },
                            details: 'In transit to U.S. Postal Service'
                        },
                        {
                            date: new Date('2015-03-03T16:25:56.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'NEW BERLIN',
                                country: 'US',
                                state: 'WI',
                                zip: '53151'
                            }
                        },
                        {
                            date: new Date('2015-03-02T23:19:52.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'NEW BERLIN',
                                country: 'US',
                                state: 'WI',
                                zip: '53151'
                            }
                        }
                    ],
                    shippedAt: new Date('2015-03-02T23:19:52.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=61292700726653585070'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Delivered', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('02394653018047202719', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2015-03-06T18:51:00.000Z'),
                            description: 'Delivered',
                            address: {
                                city: 'THOMASVILLE',
                                country: 'US',
                                state: 'GA',
                                zip: '31757'
                            },
                            details: 'Package delivered by U.S. Postal Service to addressee'
                        },
                        {
                            date: new Date('2015-03-06T13:43:00.000Z'),
                            description: 'Out for delivery',
                            address: {
                                city: 'THOMASVILLE',
                                country: 'US',
                                state: 'GA',
                                zip: '31757'
                            },
                            details: 'Out for delivery with the U.S. Postal Service'
                        },
                        {
                            date: new Date('2015-03-05T20:03:00.000Z'),
                            description: 'At U.S. Postal Service facility',
                            address: {
                                city: 'THOMASVILLE',
                                country: 'US',
                                state: 'GA',
                                zip: '31757'
                            },
                            details: 'Arrived at local Post Office - Allow ' +
                                'one to two additional days for ' +
                                'delivery'
                        },
                        {
                            date: new Date('2015-03-05T16:13:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'THOMASVILLE',
                                country: 'US',
                                state: 'GA',
                                zip: '31757'
                            },
                            details: 'In transit to U.S. Postal Service'
                        },
                        {
                            date: new Date('2015-03-05T05:30:00.000Z'),
                            description: 'Shipment information sent to U.S. Postal Service',
                            address: {
                                city: undefined,
                                country: 'US',
                                state: undefined,
                                zip: '31757'
                            }
                        },
                        {
                            date: new Date('2015-03-05T05:04:13.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'ATLANTA',
                                country: 'US',
                                state: 'GA',
                                zip: '30349'
                            }
                        },
                        {
                            date: new Date('2015-03-04T20:46:56.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'ATLANTA',
                                country: 'US',
                                state: 'GA',
                                zip: '30349'
                            }
                        },
                        {
                            date: new Date('2015-03-04T00:37:05.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'NASHVILLE',
                                country: 'US',
                                state: 'TN',
                                zip: '37080'
                            }
                        },
                        {
                            date: new Date('2015-03-03T04:37:37.000Z'),
                            description: 'Departed FedEx location',
                            address: {
                                city: 'NEW BERLIN',
                                country: 'US',
                                state: 'WI',
                                zip: '53151'
                            }
                        },
                        {
                            date: new Date('2015-03-02T23:14:26.000Z'),
                            description: 'Arrived at FedEx location',
                            address: {
                                city: 'NEW BERLIN',
                                country: 'US',
                                state: 'WI',
                                zip: '53151'
                            }
                        }
                    ],
                    deliveredAt: new Date('2015-03-06T18:51:00.000Z'),
                    shippedAt: new Date('2015-03-02T23:14:26.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=02394653018047202719'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

        });

        // new API has no Mock Tracking Numbers for FedEx Freight LTL and our numbers have been reused/recycled
        await t.test('FedEx Freight LTL', { skip: true }, async (t) => {
            t.test('Picked Up', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('2873008051', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [{
                        address: {
                            city: undefined,
                            country: undefined,
                            state: undefined,
                            zip: undefined
                        },
                        date: new Date('2024-04-10T15:28:05.000Z'),
                        description: 'Shipment information sent to FedEx'
                    }
                    ],
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=2873008051'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('In transit', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('1960003216', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2024-04-10T20:31:00.000Z'),
                            description: 'Picked up',
                            address: {
                                city: 'CORDOVA',
                                country: 'US',
                                state: 'TN',
                                zip: '38016'
                            }
                        },
                        {
                            date: new Date('2024-04-10T15:28:05.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'DES MOINES',
                                country: 'US',
                                state: 'IA',
                                zip: '50313'
                            }
                        }
                    ],
                    shippedAt: new Date('2015-03-20T14:55:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=1960003216'
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Weather delay (Shipment Exception)', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('1208673524', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2015-03-01T20:37:39.000Z'),
                            description: 'Shipment exception',
                            address: {
                                city: 'LIBERAL',
                                country: 'US',
                                state: 'KS',
                                zip: '67901'
                            },
                            details: 'Weather - Delay in transit'
                        },
                        {
                            date: new Date('2015-02-28T12:47:00.000Z'),
                            description: 'At local facility',
                            address: {
                                city: 'LIBERAL',
                                country: 'US',
                                state: 'KS',
                                zip: '67901'
                            }
                        },

                        {
                            date: new Date('2015-02-28T09:05:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'WICHITA',
                                country: 'US',
                                state: 'KS',
                                zip: '67215'
                            }
                        },
                        {
                            date: new Date('2015-02-28T03:22:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'KANSAS CITY',
                                country: 'US',
                                state: 'MO',
                                zip: '66101'
                            }
                        },
                        {
                            date: new Date('2015-02-27T13:30:00.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'DAYTON',
                                country: 'US',
                                state: 'OH',
                                zip: '45390'
                            }
                        }
                    ],
                    shippedAt: new Date('2015-02-27T13:30:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=1208673524'
                };

                assert.deepStrictEqual(actual, expected);
            });

            t.test('Delivered', async () => {
                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('1636374036', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: [
                        {
                            date: new Date('2015-03-02T17:25:25.000Z'),
                            description: 'Delivered',
                            address: {
                                city: 'SALEM',
                                country: 'US',
                                state: 'MO',
                                zip: '65560'
                            }
                        },
                        {

                            date: new Date('2015-03-02T14:45:05.000Z'),
                            description: 'Out for delivery',
                            address: {
                                city: 'SAINT CLAIR',
                                country: 'US',
                                state: 'MO',
                                zip: '63077'
                            },
                            details: 'Manifest Number 530000067342'
                        },
                        {
                            date: new Date('2015-03-02T14:28:53.000Z'),
                            description: 'At local facility',
                            address: {
                                city: 'SAINT CLAIR',
                                country: 'US',
                                state: 'MO',
                                zip: '63077'
                            },
                            details: 'Manifest Number 530000067342'
                        },
                        {
                            date: new Date('2015-02-28T11:07:00.000Z'),
                            description: 'At local facility',
                            address: {
                                city: 'SAINT CLAIR',
                                country: 'US',
                                state: 'MO',
                                zip: '63077'
                            }
                        },
                        {
                            date: new Date('2015-02-28T10:04:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'ST. LOUIS',
                                country: 'US',
                                state: 'MO',
                                zip: '63130'
                            }
                        },
                        {
                            date: new Date('2015-02-27T15:20:00.000Z'),
                            description: 'In transit',
                            address: {
                                city: 'MAUSTON',
                                country: 'US',
                                state: 'WI',
                                zip: '53948'
                            }
                        },
                        {
                            date: new Date('2015-02-27T02:07:00.000Z'),
                            description: 'Left FedEx origin facility',
                            address: {
                                city: 'GREEN BAY',
                                country: 'US',
                                state: 'WI',
                                zip: '54301'
                            }
                        }
                    ],
                    deliveredAt: new Date('2015-03-02T17:25:25.000Z'),
                    shippedAt: new Date('2015-02-27T02:07:00.000Z'),
                    url: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=1636374036'
                };

                assert.deepStrictEqual(actual, expected);
            });
        });

        await t.test('FedEx estimatedDeliveryDate', async (t) => {
            await t.test('should handle estimatedDeliveryTimeWindow if present', async () => {
                t.mock.method(globalThis, 'fetch', (url) => {
                    if (url.endsWith('/oauth/token')) {
                        return Promise.resolve(new Response(JSON.stringify({ access_token: 'fake-token-123', expires_in: 3600, token_type: 'bearer' }), {
                            headers: { 'content-type': 'application/json' },
                            status: 200
                        }));
                    }

                    return Promise.resolve(new Response(JSON.stringify({
                        output: {
                            completeTrackResults: [{
                                trackResults: [{
                                    estimatedDeliveryTimeWindow: {
                                        window: {
                                            begins: '2024-06-01T13:00:00Z',
                                            ends: '2024-06-02T22:00:00Z'
                                        }
                                    }
                                }]
                            }]
                        }
                    }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                });

                const bloodhound = new Bloodhound({
                    fedEx: {
                        api_key: 'fake',
                        secret_key: 'fake',
                        url: 'https://apis.fedex.com',
                        expires_in: 3600
                    }
                });

                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('039813852990618', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                delete actual.raw;

                const expected = {
                    carrier: 'FedEx',
                    events: [],
                    estimatedDeliveryDate: {
                        earliest: new Date('2024-06-01T13:00:00.000Z'),
                        latest: new Date('2024-06-02T22:00:00.000Z')
                    }
                };

                assert.strictEqual(actual.estimatedDeliveryDate.earliest.toISOString(), '2024-06-01T13:00:00.000Z');
                assert.strictEqual(actual.estimatedDeliveryDate.latest.toISOString(), '2024-06-02T22:00:00.000Z');
                assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.earliest), true);
                assert.strictEqual(util.types.isDate(actual.estimatedDeliveryDate.latest), true);
                assert.deepStrictEqual(actual, expected);
            });

            await t.test('should handle missing estimatedDeliveryTimeWindow gracefully', async () => {
                t.mock.method(globalThis, 'fetch', (url) => {
                    if (url.endsWith('/oauth/token')) {
                        return Promise.resolve(new Response(JSON.stringify({ access_token: 'fake-token-123', expires_in: 3600, token_type: 'bearer' }), {
                            headers: { 'content-type': 'application/json' },
                            status: 200
                        }));
                    }

                    return Promise.resolve(new Response(JSON.stringify({
                        output: {
                            completeTrackResults: [{
                                trackResults: [{}]
                            }]
                        }
                    }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                });

                const bloodhound = new Bloodhound({
                    fedEx: {
                        api_key: 'fake',
                        secret_key: 'fake',
                        url: 'https://apis.fedex.com',
                        expires_in: 3600
                    }
                });

                const actual = await new Promise((resolve, reject) => {
                    bloodhound.track('02394653001023698293', 'fedex', (err, data) => err ? reject(err) : resolve(data));
                });

                const expected = {
                    carrier: 'FedEx',
                    events: []
                };

                delete actual.raw;

                assert.deepStrictEqual(actual, expected);
            });
        });
    });

    // The tests above either need live FedEx credentials or only assert on the parsed
    // tracking payload, which leaves how we build the two requests unverified. Mutation
    // testing showed that sending the token request as JSON instead of form data,
    // dropping the Authorization header, ignoring a non-200 token response, or
    // swallowing FedEx's WARNING alerts all left them green.
    //
    // These mock fetch directly so the request itself can be asserted, and use a
    // distinct api_key each time because getAccessToken caches the token by api_key.
    await t.test('fedEx request handling', async (t) => {
        const trackingPayload = {
            output: {
                completeTrackResults: [{
                    trackResults: [{
                        scanEvents: []
                    }]
                }]
            }
        };

        await t.test('should send the token request as form-encoded credentials', async () => {
            const fedEx = new FedEx({ api_key: 'form-encoded-key', secret_key: 'test-secret' });

            const fetchMock = t.mock.method(globalThis, 'fetch', (url) => {
                const body = url.endsWith('/oauth/token') ? { access_token: 'test-token', expires_in: 3600 } : trackingPayload;

                return Promise.resolve(new Response(JSON.stringify(body), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            await new Promise((resolve, reject) => {
                fedEx.track('449044304137821', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(fetchMock.mock.calls[0].arguments[0], 'https://apis.fedex.com/oauth/token');

            // request()'s `form` option sent x-www-form-urlencoded. URLSearchParams is
            // what reproduces that; JSON.stringify would not.
            const tokenBody = fetchMock.mock.calls[0].arguments[1].body;

            assert(tokenBody instanceof URLSearchParams);
            assert.strictEqual(tokenBody.get('client_id'), 'form-encoded-key');
            assert.strictEqual(tokenBody.get('client_secret'), 'test-secret');
            assert.strictEqual(tokenBody.get('grant_type'), 'client_credentials');
        });

        await t.test('should send the access token as a bearer header on the tracking request', async () => {
            const fedEx = new FedEx({ api_key: 'bearer-header-key', secret_key: 'test-secret' });

            const fetchMock = t.mock.method(globalThis, 'fetch', (url) => {
                const body = url.endsWith('/oauth/token') ? { access_token: 'a-real-looking-token', expires_in: 3600 } : trackingPayload;

                return Promise.resolve(new Response(JSON.stringify(body), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            await new Promise((resolve, reject) => {
                fedEx.track('449044304137821', (err, data) => err ? reject(err) : resolve(data));
            });

            assert.strictEqual(fetchMock.mock.calls[1].arguments[0], 'https://apis.fedex.com/track/v1/trackingnumbers');
            assert.strictEqual(fetchMock.mock.calls[1].arguments[1].headers.Authorization, 'Bearer a-real-looking-token');
        });

        await t.test('should return an error when the token request fails', async () => {
            const fedEx = new FedEx({ api_key: 'token-failure-key', secret_key: 'test-secret' });

            t.mock.method(globalThis, 'fetch', () => {
                return Promise.resolve(new Response(JSON.stringify({ errors: [{ message: 'Invalid client' }] }), {
                    headers: { 'content-type': 'application/json' },
                    status: 401
                }));
            });

            const args = await new Promise((resolve) => {
                fedEx.track('449044304137821', (...args) => resolve(args));
            });

            assert.strictEqual(args[0].cause.status, 401);
            assert.strictEqual(args[1], undefined);
        });

        await t.test('should surface FedEx WARNING alerts as an error', async () => {
            const fedEx = new FedEx({ api_key: 'warning-alerts-key', secret_key: 'test-secret' });

            t.mock.method(globalThis, 'fetch', (url) => {
                if (url.endsWith('/oauth/token')) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
                        headers: { 'content-type': 'application/json' },
                        status: 200
                    }));
                }

                // FedEx reports this kind of problem on a 200.
                return Promise.resolve(new Response(JSON.stringify({
                    output: {
                        alerts: [{
                            alertType: 'WARNING',
                            code: 'TRACKING.TRACKINGNUMBER.NOTFOUND',
                            message: 'Tracking number cannot be found'
                        }]
                    }
                }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200
                }));
            });

            const args = await new Promise((resolve) => {
                fedEx.track('449044304137821', (...args) => resolve(args));
            });

            assert.strictEqual(args[0].message, 'TRACKING.TRACKINGNUMBER.NOTFOUND: Tracking number cannot be found');
            assert.strictEqual(args[1], undefined);
        });
    });
});
