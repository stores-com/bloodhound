const assert = require('node:assert');
const test = require('node:test');

const Bloodhound = require('../../index.js');

test('Newgistics', { timeout: 30000 }, async (t) => {
    t.test('should return an error for invalid base URL', async () => {
        const bloodhound = new Bloodhound({
            pitneyBowes: {
                baseUrl: 'https://httpbin.org/status/500#'
            }
        });

        const err = await new Promise((resolve) => {
            bloodhound.track('9400111899223837861141', 'newgistics', (err) => resolve(err));
        });

        assert(err);
    });
});

test('Pitney Bowes', { timeout: 30000 }, async (t) => {
    t.test('should not return an error', { skip: true }, async () => {
        const bloodhound = new Bloodhound({
            pitneyBowes: {
                api_key: process.env.PITNEY_BOWES_API_KEY,
                api_secret: process.env.PITNEY_BOWES_API_SECRET
            }
        });

        await new Promise((resolve, reject) => {
            bloodhound.track('4203300992612927005269000093974783', { carrier: 'Pitney Bowes', minDate: new Date('2020-08-06T14:10:56.000Z') }, (err) => err ? reject(err) : resolve());
        });
    });
});
