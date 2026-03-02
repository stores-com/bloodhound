# Bloodhound

[![Build Status](https://github.com/stores-com/bloodhound/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/stores-com/bloodhound/actions?query=workflow%3Abuild+branch%3Amain)
[![Coverage Status](https://coveralls.io/repos/github/stores-com/bloodhound/badge.svg)](https://coveralls.io/github/stores-com/bloodhound)
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

When it comes to timestamps there are two types of carrier APIs: those that include a UTC offset which can be easily parsed as proper dates, and those that provide timestamp strings that need to be interepreted based on the local timezone of the geographic location for the event.

When Bloodhound encounters a timestamp without a UTC offset if looks up the timezone by geocoding the event's geographic location. The returned results contain proper dates in the correct timezone.

Geocode results are cached in-memory locally. Geocode results can optionally be cached remotely in Redis.

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

bloodhound.track('tracking number', { carrier: 'USPS' }, function(err, data) {
    console.log(data);
});
```

## API

### new Bloodhound(options)

Creates a new Bloodhound client. Each carrier requires a different combination of credentials (API keys, account numbers, passwords, user IDs, etc).

By default, when Bloodhound encounters a timestamp without a UTC offset it will geocode using OpenStreetMap (which does not require an API key). You can optionally use a different geocoder. You can also optionally cache geocode results in Redis.

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
    geocoder: {
        apiKey: 'GOOGLE_API_KEY',
        language: 'en',
        provider: 'google',
        region: '.us'
    },
    pettyCache: {
        host: '127.0.0.1',
        options: {
            auth_pass: 'secret'
        },
        port: 6379
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

bloodhound.track('tracking number', 'FedEx', function(err, data) {
    console.log(data);
});
```

**amazon**

The Amazon Shipping carrier does not require any configuration. It works with Amazon Shipping tracking numbers (TBA/TBM/TBC format).

**gofo**

The GOFO Express carrier does not require any configuration. It works with GOFO tracking numbers (CR + 12 digits format).

**dhl**

The DHL API requires an API key: https://developer.dhl.com.

*geocoder**

By default Bloodhound uses the OpenStreetMap geocode provider. You can optionally specify geocoder options which are passed to the [node-geocode](https://www.npmjs.com/package/node-geocoder) module.

**pettyCache**

By default Bloodhound caches geocode results in-memory locally. You can optionally enable caching of geocoder results to a remote Redis server. These options are passed to the [petty-cache](https://www.npmjs.com/package/petty-cache) module.

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

### bloodhound.track(trackingNumber, [options,] callback)

Retrieves tracking data for the specified tracking number.

```javascript
bloodhound.track('tracking number', { carrier: 'USPS' }, function(err, data) {
    console.log(data);
});
```

**Data**
```json
{
    "deliveredAt": "2019-06-30T18:03:00.000Z",
    "estimatedDeliveryDate": {
        "earliest": "2019-06-28T13:00:00.000Z",
        "latest": "2019-06-30T21:00:00.000Z"
    },
    "events": [
        {
            "address": {
                "city": "CARROLLTON",
                "state": "TX",
                "zip": "75010"
            },
            "date": "2019-06-30T18:03:00.000Z",
            "description": "Delivered, Front Door/Porch"
        },
        {
            "address": {
                "city": "CARROLLTON",
                "state": "TX",
                "zip": "75010"
            },
            "date": "2019-05-13T17:32:00.000Z",
            "description": "Sorting Complete"
        }
    ],
    "shippedAt": "2019-05-13T17:32:00.000Z"
}
```