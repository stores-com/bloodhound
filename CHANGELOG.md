# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.6.0] - 2026-04-07
### Changed
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
