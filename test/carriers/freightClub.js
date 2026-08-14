const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index');
const FreightClub = require('../../carriers/freightClub');

// The sandbox testing token Freight Club publishes in its API documentation
const apiToken = 'dqhMY4nwmlADEoOHJ1IkYhnT3arc9aZSMYC4iOlYVNz6jFMqwhLWgTEheQLeMRQqlzHtKhNYZeDG0j8INN0GYAZ2ZqR7HCsVwMZQbIw9knXVY5vAy5Kh7CKp3qhPuNrUxpOvhpu19zvb6xLx5bYL4Lk2g_6XtgUqYlweGw2dKZTIJy3WGhOlkrGOAJFjd-Bt_gXTFT4AZAfs9-1xZ8jKQQMXlWyn3OvI_O-mxKtycWFdy-XzMQ1_1bhOTXmb_fWf2vVOfkT4GXdCkgbsKgbQOHlid8LE-qgNJfEPw3tRqrlRzz8IfdHwpPBjm9qINYaUuj7VxYDjJISRE67m6d9v9Zt5IAQjk4hSp_k5YmPrudazuK_leLILjlBwyZBsy_ObmhvXdEwVqrTxAmBoe4EjOao1qF9igfusQ_NOVmI0FWc7X56Ju907qdc6g9ZMWac5qsaeC-te6F2JEKjyQfBc6l4Qxu-Q_ioSt1uBdOVNLhEADYlUyM49hFuBEvrLlAxklt3Z7qrdmqolGpBYfmKYNVQ8PSD0IGnCVgWiKPZSIVxeiukXy-MhJcUkGUCplPAAcLB952BxuNUGZH5as0xh-ces6_Rid2pbqpnbZ1W1dOXrnCCqbIgnwJi6c8v53cHJoUUbQjjqerJ8QC2_eWWjCiuoDtfRj5ODUcO2Ogeh3EdbjHVUrZ3KwfC7lKCCWpOXeo1uTO6noHQyEyBQW_R3AKWAjpl-r-om2VgQKkJRkFs';

const createEvents = () => [
    {
        CarrierCode: 'PILOT;PAAF;',
        City: 'Tacoma',
        Country: 'US',
        Date: '8/19/2022 7:30:00 AM',
        Description: 'ARRIVED AT TERMINAL',
        ShipmentNumber: 59086014,
        Signatory_Name: null,
        SortOrder: 3,
        State: 'WA',
        Status: 'AT',
        Time: null,
        TrackingCategory: 'In Transit (Terminal)',
        TrackingNumber: 'FCT1009624087737139200',
        WayBillNumber: '300574292'
    },
    {
        CarrierCode: 'PILOT;PAAF;',
        City: 'Seattle',
        Country: 'US',
        Date: '8/17/2022 6:04:05 PM',
        Description: 'WAITING FOR PICKUP',
        ShipmentNumber: 59086014,
        Signatory_Name: null,
        SortOrder: 1,
        State: 'WA',
        Status: 'IWP',
        Time: null,
        TrackingCategory: 'Pending Pickup',
        TrackingNumber: 'FCT1009624087737139200',
        WayBillNumber: '300574292'
    },
    {
        CarrierCode: 'PILOT;PAAF;',
        City: 'Action',
        Country: 'US',
        Date: '8/24/2022 1:23:45 PM',
        Description: 'DELIVERED',
        ShipmentNumber: 59086014,
        Signatory_Name: 'R PERSON',
        SortOrder: 4,
        State: 'MT',
        Status: 'DL',
        Time: null,
        TrackingCategory: 'Delivered',
        TrackingNumber: 'FCT1009624087737139200',
        WayBillNumber: '300574292'
    },
    {
        CarrierCode: 'PILOT;PAAF;',
        City: 'Seattle',
        Country: 'US',
        Date: '8/18/2022 9:15:00 AM',
        Description: 'PICKED UP',
        ShipmentNumber: 59086014,
        Signatory_Name: null,
        SortOrder: 2,
        State: 'WA',
        Status: 'PU',
        Time: null,
        TrackingCategory: 'In Transit (Picked Up)',
        TrackingNumber: 'FCT1009624087737139200',
        WayBillNumber: '300574292'
    }
];

test('Freight Club', async (t) => {
    const bloodhound = new Bloodhound({
        defaultTimezone: 'America/Los_Angeles',
        freightClub: {
            api_token: apiToken
        }
    });

    await t.test('freightClub.isTrackingNumberValid', { concurrency: true }, async (t) => {
        const freightClub = new FreightClub();

        const validTrackingNumbers = [
            'FCT1009624087737139200',
            'FCT1537605522453168128',
            'fct1009624087737139200',
            'FCT 1009624087737139200'
        ];

        const invalidTrackingNumbers = [
            '',
            'FCT',
            'FCUPSG1507963',
            '1Z12345E0205271688',
            '235825413',
            '9400111699000271800200'
        ];

        await t.test('should detect valid Freight Club tracking numbers', () => {
            validTrackingNumbers.forEach(trackingNumber => {
                if (!freightClub.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should be recognized as a valid Freight Club tracking number`);
                }
            });
        });

        await t.test('should not detect invalid Freight Club tracking numbers', () => {
            invalidTrackingNumbers.forEach(trackingNumber => {
                if (freightClub.isTrackingNumberValid(trackingNumber)) {
                    assert.fail(`${trackingNumber} should not be recognized as a valid Freight Club tracking number`);
                }
            });
        });
    });

    await t.test('freightClub.track', async (t) => {
        // The live sandbox has tracking data for no shipment (Error Code 8100), its own documentation's example included, which is exactly the not-found answer this asserts
        await t.test('should return empty events for a tracking number Freight Club does not know', async () => {
            const actual = await bloodhound.track('FCT1009624087737139200', 'freight club');

            assert.strictEqual(actual.carrier, 'Freight Club');
            assert.strictEqual(actual.events.length, 0);
            assert.strictEqual(actual.url, 'https://app.freightclub.com/Tracking');
        });

        await t.test('should return tracking information for a delivered shipment', async (t) => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify(createEvents()), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

            const actual = await bloodhound.track('FCT1009624087737139200', 'freight club');

            assert.strictEqual(actual.carrier, 'Freight Club');
            assert.strictEqual(actual.events.length, 4);

            // Events run Most Recent - Least Recent regardless of the order Freight Club returned them in
            assert.strictEqual(actual.events[0].description, 'DELIVERED');
            assert.strictEqual(actual.events[3].description, 'WAITING FOR PICKUP');

            // Timestamps carry no UTC offset and are interpreted in defaultTimezone (America/Los_Angeles here)
            assert.deepStrictEqual(actual.events[3].date, new Date('2022-08-18T01:04:05.000Z'));
            assert.deepStrictEqual(actual.events[3].address, { city: 'Seattle', country: 'US', state: 'WA' });

            // shippedAt comes from the first movement category, deliveredAt from Delivered
            assert.deepStrictEqual(actual.shippedAt, new Date('2022-08-18T16:15:00.000Z'));
            assert.deepStrictEqual(actual.deliveredAt, new Date('2022-08-24T20:23:45.000Z'));

            assert.deepStrictEqual(actual.raw, createEvents());
        });

        await t.test('should not set shippedAt or deliveredAt before the shipment moves', async (t) => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify([createEvents()[1]]), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

            const actual = await bloodhound.track('FCT1009624087737139200', 'freight club');

            assert.strictEqual(actual.events.length, 1);
            assert.strictEqual(actual.events[0].description, 'WAITING FOR PICKUP');
            assert.strictEqual(actual.shippedAt, undefined);
            assert.strictEqual(actual.deliveredAt, undefined);
        });

        await t.test('should ignore events before minDate', async (t) => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify(createEvents()), {
                headers: { 'content-type': 'application/json' },
                status: 200
            })));

            const actual = await bloodhound.track('FCT1009624087737139200', { carrier: 'freight club', minDate: new Date('2022-08-18T12:00:00.000Z') });

            assert.strictEqual(actual.events.length, 3);
            assert.strictEqual(actual.events[2].description, 'PICKED UP');
        });

        await t.test('should throw an HttpError for a 400 that is not Error Code 8100', async (t) => {
            t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(JSON.stringify('Error Code 8101: At least one of tracking parameter should has the value or might the parameter name is incorrect'), {
                headers: { 'content-type': 'application/json' },
                status: 400
            })));

            await assert.rejects(bloodhound.track('FCT1009624087737139200', 'freight club'), err => {
                assert.strictEqual(err.cause.status, 400);
                return true;
            });
        });
    });
});
