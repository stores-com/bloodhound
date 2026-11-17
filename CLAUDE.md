# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bloodhound is a Node.js package that provides a unified interface for retrieving tracking data from multiple shipping carriers (Amazon, DHL, DHL eCommerce Solutions, FedEx, GOFO, OnTrac, Pitney Bowes, UniUni, UPS, USPS, XPO) in a common format. The package focuses on proper timestamp parsing with timezone handling and automatic carrier detection.

**Note**: The UPS integration uses the OAuth 2.0 API via the @stores.com/ups package, which needs `client_id` and `client_secret` in its configuration.

## Key Commands

### Testing
- Run all tests: `npm test`
- Coverage: CI runs the `--experimental-test-coverage` lcov command and uploads with `coverallsapp/github-action`; `npm run coveralls` needs a `coveralls` binary the repo doesn't declare
- Individual test files are in `test/carriers/` and can be run with: `node --test --test-force-exit --test-reporter=spec test/carriers/[carrier].js`

### Linting
There is no explicit lint command, but the project uses ESLint with configuration in `eslint.config.js`. You can run:
- `npx eslint .` to lint all files
- `npx eslint [file]` to lint a specific file

## Architecture Overview

### Core Structure
- `index.js`: Main entry point that instantiates carrier classes and provides the unified `track()` and `guessCarrier()` methods
- `carriers/`: Individual carrier implementations (amazon.js, dhl.js, dhlEcommerceSolutions.js, fedEx.js, gofo.js, onTrac.js, pitneyBowes.js, uniUni.js, ups.js, usps.js, xpo.js)
- `util/`: Utility modules for shared functionality
  - `checkDigit.js`: Validation utilities for tracking numbers

### Key Design Patterns

1. **Carrier Interface**: Each carrier module exports a constructor function with:
   - `isTrackingNumberValid()`: Validates tracking number format
   - `track(trackingNumber, [options])`: `async`; resolves with tracking data in the standardized format

2. **Timestamp Handling**: Carriers that supply a UTC offset are parsed directly. Carriers that supply a bare local timestamp (DHL, Pitney Bowes and USPS) are interpreted in the `defaultTimezone` option, falling back to the host machine's timezone; UPS falls back to UTC instead. Bloodhound does not geocode.

3. **Caching Strategy**: Bloodhound keeps no cache of its own; the carrier client packages it wraps cache their own access tokens.

4. **Response Format**: All carriers return data in this structure:
   ```json
   {
     "events": [
       {
         "address": { "city": "", "state": "", "zip": "" },
         "date": "ISO 8601 timestamp",
         "description": "Event description"
       }
     ],
     "shippedAt": "ISO 8601 timestamp",
     "deliveredAt": "ISO 8601 timestamp"
   }
   ```

## Development Guidelines

- Carrier validation logic uses specific patterns for each carrier's tracking number format
- Carrier `track()` methods are `async` and return the results object. Errors are thrown, not passed to a callback — nothing in the package takes a callback
- When adding new carriers, implement both `isTrackingNumberValid()` and `track()` methods
- The project uses CommonJS modules (`require`/`module.exports`)