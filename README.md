# Bloodhound

[![Build Status](https://github.com/stores-com/bloodhound/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/stores-com/bloodhound/actions?query=workflow%3Abuild+branch%3Amain)
[![Coverage Status](https://coveralls.io/repos/github/stores-com/bloodhound/badge.svg?branch=main&t=Bh7x2Q)](https://coveralls.io/github/stores-com/bloodhound?branch=main)
[![npm version](https://img.shields.io/npm/v/@stores.com/bloodhound)](https://www.npmjs.com/package/@stores.com/bloodhound)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Elvis Presley & Bloodhound - Photo - 1964](https://res.cloudinary.com/mediocre/image/upload/v1562632498/rpkudq0xpyysdty9nkzk.jpg)

Bloodhound is a Node.js package that allows you to retrieve tracking data from shipping carriers (Amazon, DHL, FedEx, GOFO, UPS, USPS, XPO) in a common format.

This module was inspired by the excellent `shipit` module. We built Bloodhound to provide better support for parsing of timestamps (read more below).

## Features

**Common format**

Bloodhound interfaces with several carrier APIs and returns results in a single, unified format.
Each carrier activity/movement/scan is represented as an event with a description, geographic location (city/state), and timestamp.

**Timestamps**

When it comes to timestamps there are two types of carrier APIs: those that include a UTC offset which can be easily parsed as proper dates, and those that provide timestamp strings with no offset at all.

When Bloodhound encounters a timestamp without a UTC offset it interprets it in the `defaultTimezone` option, falling back to the local machine's timezone — except UPS, which falls back to UTC. Bloodhound does not geocode, so it cannot know the timezone of the event's own location: a scan in a different timezone than `defaultTimezone` will be off by the difference between them.

**Carrier Guessing**

Bloodhound can guess the carrier given a tracking number explicity through the `bloodhound.guessCarrier(trackingNumber)` method. Bloodhound will also try to guess the carrier when tracking a package without specifying a carrier when using the `bloodhound.track(trackingNumber)` method.

**Shipped/Delivered Dates**

Bloodhound also examines each of the activity/movement/scan events for "shipped" and "delievered" event types (beyond simple electronic events like "shipping label created" or "manifest file sent"). When a matching event type is encountered Bloodhound returns a `shippedAt` and `deliveredAt` date.

## Supported Carriers
- Amazon
- DHL
- FedEx
- GOFO
- UPS
- USPS
- XPO

**Estimated Delivery Dates**

Bloodhound provides estimated delivery date information when available from carriers. This feature returns a date range with the earliest and latest expected delivery times, giving you a reliable delivery window for packages.

This feature is supported across all major carriers (Amazon, DHL, FedEx, UPS, and USPS) when the carrier provides this information. For carriers that only provide a single delivery date estimate, both `earliest` and `latest` will contain the same value.

Note that estimated delivery dates are dynamic and may change as packages move through the delivery network. Carriers update these estimates based on real-time shipping conditions, weather, and routing changes. It's recommended to track packages periodically to get the most current delivery estimates.

## Getting Started

```javascript
const Bloodhound = require('@stores.com/bloodhound');

const bloodhound = new Bloodhound({
    usps: {
        userId: 'USPS_USER_ID'
    }
});

const data = await bloodhound.track('tracking number', { carrier: 'USPS' });

console.log(data);
```

## API

### new Bloodhound(options)

Creates a new Bloodhound client. Each carrier requires a different combination of credentials (API keys, account numbers, passwords, user IDs, etc).

When Bloodhound encounters a timestamp without a UTC offset it interprets it in the `defaultTimezone` option, falling back to the local machine's timezone — except UPS, which falls back to UTC.

```javascript
const Bloodhound = require('@stores.com/bloodhound');

const bloodhound = new Bloodhound({
    dhl: {
        apiKey: 'DHL API key from https://developer.dhl.com'
    },
    fedEx: {
        api_key: 'abcdefghijklmnopqrstuvwxyz',
        secret_key: 'abcdefghijklmnopqrstuvwxyz'
    },
    ups: {
        client_id: 'YOUR_UPS_CLIENT_ID',
        client_secret: 'YOUR_UPS_CLIENT_SECRET'
    },
    usps: {
        userId: 'USPS_USER_ID'
    },
    xpo: {
        api_key: 'YOUR_XPO_API_KEY',
        password: 'YOUR_XPO_PASSWORD',
        username: 'YOUR_XPO_USERNAME'
    }
});

const data = await bloodhound.track('tracking number', 'FedEx');

console.log(data);
```

**amazon**

The Amazon Shipping carrier does not require any configuration. It works with Amazon Shipping tracking numbers (TBA/TBM/TBC format).

**gofo**

The GOFO Express carrier does not require any configuration. It works with GOFO tracking numbers (CR + 12 digits format).

**dhl**

The DHL API requires an API key: https://developer.dhl.com.

**defaultTimezone**

Carriers that return timestamps without a UTC offset — currently DHL, Pitney Bowes, USPS, and UPS Mail Innovations — have their event timestamps interpreted in this timezone.

If not provided, DHL, Pitney Bowes and USPS use the local machine's timezone, which means the same tracking number can produce different timestamps on different machines. Set it explicitly. UPS uses UTC instead, so a Mail Innovations scan is never interpreted in the timezone of whichever machine happens to be running.

```javascript
const bloodhound = new Bloodhound({
    defaultTimezone: 'America/Chicago'
});
```

**ups**

The UPS API requires OAuth 2.0 credentials (client_id and client_secret). You can obtain these credentials from the UPS Developer Portal: https://developer.ups.com/

**usps**

The USPS API requires OAuth 2.0 credentials (Consumer Key and Consumer Secret). You can obtain these credentials from the USPS Developer Portal by creating a USPS Business Account: https://developers.usps.com/getting-started

**xpo**

The XPO LTL API requires OAuth 2.0 credentials (api_key, username, and password). Contact XPO at LTLWebAPISupport@xpo.com to request API access.

### bloodhound.guessCarrier(trackingNumber)

Guesses the carrier of the specified tracking number.

```javascript
const carrier = bloodhound.guessCarrier('tracking number');
console.log(carrier);

```

### bloodhound.track(trackingNumber, [options])

Returns a promise that resolves with tracking data for the specified tracking number.

```javascript
const data = await bloodhound.track('tracking number', { carrier: 'USPS' });

console.log(data);
```

**Data**
```json
{
    "carrier": "USPS",
    "deliveredAt": "2019-06-30T18:03:00.000Z",
    "estimatedDeliveryDate": {
        "earliest": "2019-06-28T13:00:00.000Z",
        "latest": "2019-06-30T21:00:00.000Z"
    },
    "events": [
        {
            "address": {
                "city": "CARROLLTON",
                "country": "US",
                "state": "TX",
                "zip": "75010"
            },
            "date": "2019-06-30T18:03:00.000Z",
            "description": "Delivered, Front Door/Porch"
        },
        {
            "address": {
                "city": "CARROLLTON",
                "country": "US",
                "state": "TX",
                "zip": "75010"
            },
            "date": "2019-05-13T17:32:00.000Z",
            "description": "Sorting Complete"
        }
    ],
    "raw": {},
    "shippedAt": "2019-05-13T17:32:00.000Z",
    "url": "https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=..."
}
```