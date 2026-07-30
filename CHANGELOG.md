# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.1] - 2026-07-30
### Fixed
- XPO and Pitney Bowes: detect a not-found tracking number by response status rather than by error message — the same fix 4.0.0 made for DHL eCommerce Solutions. Both siblings raise `@stores.com/http-error`, whose message is `"<status> <statusText>"`, and the reason phrase is chosen by the origin rather than normalised by anything: a 404 arriving as `"404 NOT FOUND"` was turned into a hard error instead of an empty `events` array. `@stores.com/http-error` 1.2.0 also replaces that message outright with the response body's `errors[]` text, which would break the check a second way once those two packages move off `~1.0.0`. `err.cause.status` is unaffected by either

## [4.0.0] - 2026-07-30
### Added
- OnTrac: recognize the `D` + 14 digits tracking number format (e.g. `D10000000000001`) in `isTrackingNumberValid()`, so `guessCarrier()` resolves it to OnTrac
- UPS: `defaultTimezone` now applies to UPS. Mail Innovations shipments return no `gmtDate`, `gmtTime` or `gmtOffset` anywhere in the response — only a facility-local `date` and `time` with no offset — so those activities are interpreted in `defaultTimezone`. Unlike DHL, Pitney Bowes and USPS, UPS assumes UTC when `defaultTimezone` is not set rather than the host machine's timezone. Activities that do carry `gmtDate`/`gmtTime` are unaffected

### Changed
- **BREAKING:** DHL and USPS event timestamps are now interpreted in `defaultTimezone` (falling back to the host machine's timezone) instead of the timezone geocoded from the event's location. A scan in a different timezone than `defaultTimezone` will be off by the difference between them, which can move a date across midnight. Set `defaultTimezone` explicitly
- **BREAKING:** DHL `events[].address.city` now comes from the UTAPI's `addressLocality` rather than the geocoder, and `events[].address.state` is `undefined` — the UTAPI has no state field, so it was previously only available via geocoding
- **BREAKING:** USPS `events[].address.city` and `.state` are no longer corrected by the geocoder, so they are returned exactly as USPS supplies them
- **BREAKING:** DHL and FedEx use native `fetch` instead of the deprecated `request` module, and reject with `@stores.com/http-error` rather than a plain `Error`. `err.name` is `"HttpError"` and `err.message` is `"<status> <statusText>"` — replaced entirely by the response body's `errors[]` text when it carries any — with the `Response` on `err.cause`, so the status is `err.cause.status`. FedEx previously rejected with `http-errors`, which put the status on `err.status`/`err.statusCode`; DHL previously rejected with a plain `Error` whose message was `"<status> <method> <url> <body>"`. Code that inspects an error's type, message text or `status` property needs updating
- Updated dhl-ecommerce-solutions to ~0.5.0 (async/await, native fetch, `@stores.com/http-error`)

### Removed
- **BREAKING:** `bloodhound.track()` no longer accepts a callback and always returns a promise. The signature is now `track(trackingNumber, [options])`. Passing a function in either the options or the callback position throws a `TypeError` rather than silently returning a promise the caller never awaits, so callers must `await` the returned promise (or attach `.then()`/`.catch()`) instead
- **BREAKING:** removed geocoding. `util/geography.js` is gone, along with the `geocoder` and `pettyCache` options and the `node-geocoder`, `petty-cache`, `tz-lookup` and `us-states-normalize` dependencies. `GOOGLE_API_KEY` is no longer read
- Removed the `request` module. `carriers/dhl.js` and `carriers/fedEx.js` required it without it ever being declared as a dependency — it resolved transitively through `node-geocoder`, so removing geocoding would have broken them at require time on a fresh install
- Removed the `http-errors` dependency, replaced by `@stores.com/http-error`, and the `xml2js` dependency, which nothing required

### Fixed
- UPS: skip an activity whose timestamp is incomplete instead of failing the whole request. A missing `gmtDate` threw a `TypeError` that discarded every other activity for the shipment, and a missing `gmtTime` produced an Invalid Date that flowed into `deliveredAt`/`shippedAt`. Only an activity that cannot be placed in time at all is dropped now
- DHL eCommerce Solutions: detect a not-found tracking number by response status rather than by error message. 0.5.0 raises `@stores.com/http-error` — whose message is `"404 Not Found"` rather than `"Not Found"`, and is replaced entirely by the carrier's own text when the response body carries an `errors[]` array — so the previous exact-match check would have stopped recognizing a 404 and turned it into a hard error instead of falling through to the DHL UTAPI
- OnTrac: `shippedAt` is no longer set from an `EXRL` scan. OnTrac reports `EXRL` as "Not Yet Received" with no location, meaning the label exists but the carrier does not have the package yet, so `shippedAt` now comes from the first `ORIG` scan. Affected packages will report a later `shippedAt` than before
- UPS: `gmtDate`/`gmtTime` are already UTC, so appending `gmtOffset` shifted every event timestamp a second time. Event dates, `shippedAt` and `deliveredAt` for non-UTC facilities were offset-hours too late
- UPS: read `stateProvince` rather than `state` for `address.state`, which was always `undefined`

## [3.5.3] - 2026-05-02
### Fixed
- DHL UTAPI: recognize `"PROCESSED THROUGH USPS SORT FACILITY"` as a shipped status so `shippedAt` is populated for DHL eCommerce packages already in the USPS network

## [3.5.2] - 2026-04-07
### Fixed
- Fixed event sorting — replace broken `.reverse()` with proper date descending sort

## [3.5.1] - 2026-04-07
### Fixed
- Changed default Pitney Bowes tracking carrier from `FDR` (Newgistics) to `USPS`

## [3.5.0] - 2026-04-07
### Changed
- Updated pitney-bowes to v1.0.0 (async/await, native fetch, `@stores.com/http-error`)
- Replaced callback-based `pitneyBowesClient.tracking()` with Promise-based call
- Removed `async.retry` wrapper from Pitney Bowes carrier

### Added
- Added comprehensive tests for Pitney Bowes carrier (tracking events, delivered/shipped detection, city blacklist, Newgistics carrier, 404 handling, minDate filtering, IMB tracking)

## [3.4.3] - 2026-03-10
### Fixed
- Fixed USPS `shippedAt`/`deliveredAt` never being set with v3r2 API. The API returns `statusCategory` at the top level only, not on individual `trackingEvents`. Added fallback to check top-level `statusCategory`.
- Added `'On the Way'` to `SHIPPED_STATUS_CATEGORIES` to match v3r2 API values.
- Fixed CI workflow to use `USPS_CLIENT_ID`/`USPS_CLIENT_SECRET` instead of legacy `USPS_USERID`.
- Fixed invalid characters test to expect empty results instead of an error, matching v3r2 API behavior.

## [3.4.0] - 2026-03-02
### Added
- Added configurable `defaultTimezone` option.
- Skip geocoding when `GOOGLE_API_KEY` is not set.

## [3.3.0] - 2026-02-18
### Changed
- Migrated USPS carrier integration to use the @stores.com/usps package.

## [3.2.0] - 2026-02-18
### Added
- Added OnTrac tracking support for LaserShip-origin tracking numbers (1LS, LS, LX/LA/LI/LH/LE/LN prefixes).

## [3.1.0] - 2026-02-12
### Added
- Added XPO Logistics LTL tracking support for PRO number tracking numbers.

## [3.0.0] - 2026-02-12
### Changed
- Renamed package from `@mediocre/bloodhound` to `@stores.com/bloodhound`.

## [2.4.0] - 2025-12-04
### Added
- Added GOFO Express tracking support for CR-prefixed tracking numbers.

## [2.3.0] - 2025-09-11
### Changed
- Migrated UPS carrier integration to use the new OAuth 2.0 API via @mediocre/ups package.
  - **BREAKING**: Configuration changed from `accessKey`, `username`, `password` to `client_id`, `client_secret`
  - Improved timezone handling using GMT offsets provided by the new API
  - Simplified implementation by delegating to @mediocre/ups package

### Improved
- UPS tracking now uses the modern REST API with better reliability
- Timezone handling for UPS events is now more accurate with GMT offsets

## [2.2.0] - 2025-07-30
### Added
- Added estimatedDeliveryDate support across Amazon, DHL, FedEx, UPS and USPS carriers.

## [2.1.0] - 2025-06-27
### Added
- Added Amazon Shipping tracking support for TBA/TBM/TBC tracking numbers.

## [2.0.0] - 2024-08-30
### Changed
- Migrated the FedEx carrier integration away from the deprecated WSDL endpoints to the new OAuth/JSON endpoints.

## [1.13.0] - 2024-05-08
### Changed
- Updated DHL to use "description" and "remark" fields (see https://developer.dhl.com/api-reference/shipment-tracking?language_content_entity=en#release-notes-section/ecommerce-status-code).

## [1.12.0] - 2024-05-08
### Changed
- Updated FedEx to return the most recent tracking number data when FedEx creates a duplicate tracking number.

## [1.11.0] - 2021-06-13
### Changed
- Updated DHL to use DHL eCommerce Solutions first if configured.

## [1.10.0] - 2021-06-13
### Changed
- Updated DHL to use DHL eCommerce Solutions if configured.

## [1.9.0] - 2021-06-08
### Changed
- Updated the DHL API to use https://developer.dhl.com/api-reference/shipment-tracking.

## [1.8.1] - 2021-07-31
### Changed
- Updated the pitney-bowes module to ~0.3.0.

## [1.8.0] - 2021-07-27
### Changed
- Changed the tracking page URL for Pitney Bowes.

## [1.7.5] - 2021-03-17
### Changed
- Changed the default URL for USPS to use https (instead of http).
