# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bloodhound is a Node.js package that provides a unified interface for retrieving tracking data from multiple shipping carriers (Amazon, DHL, FedEx, UPS, USPS) in a common format. The package focuses on proper timestamp parsing with timezone handling and automatic carrier detection.

**Note**: As of v2.3.0, the UPS integration uses the new OAuth 2.0 API via the @stores.com/ups package, requiring `client_id` and `client_secret` for configuration.

## Key Commands

### Testing
- Run all tests: `npm test`
- Run tests with coverage: `npm run coveralls`
- Individual test files are in `test/carriers/` and can be run with: `node --test --test-timeout=30000 test/carriers/[carrier].js`

### Linting
There is no explicit lint command, but the project uses ESLint with configuration in `eslint.config.js`. You can run:
- `npx eslint .` to lint all files
- `npx eslint [file]` to lint a specific file

## Architecture Overview

### Core Structure
- `index.js`: Main entry point that instantiates carrier classes and provides the unified `track()` and `guessCarrier()` methods
- `carriers/`: Individual carrier implementations (amazon.js, dhl.js, fedEx.js, ups.js, usps.js, pitneyBowes.js, dhlEcommerceSolutions.js)
- `util/`: Utility modules for shared functionality
  - `geography.js`: Handles geocoding and timezone lookups for proper timestamp parsing
  - `checkDigit.js`: Validation utilities for tracking numbers

### Key Design Patterns

1. **Carrier Interface**: Each carrier module exports a constructor function with:
   - `isTrackingNumberValid()`: Validates tracking number format
   - `track()`: Retrieves tracking data and returns standardized format

2. **Timestamp Handling**: The system geocodes event locations to determine proper timezones when carriers don't provide UTC offsets. This is a critical feature that differentiates Bloodhound.

3. **Caching Strategy**: 
   - In-memory caching via `memory-cache` for geocoding results
   - Optional Redis caching via `petty-cache` configuration

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
- Error handling should follow the Node.js callback pattern: `callback(err, data)`
- When adding new carriers, implement both `isTrackingNumberValid()` and `track()` methods
- Geocoding is expensive - always check cache before making API calls
- The project uses CommonJS modules (`require`/`module.exports`)