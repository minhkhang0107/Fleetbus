# FleetBus Real-Time Bus Booking & Telemetry System State

Last updated: 2026-08-28 14:02

## 1. Unified Node.js API Server & Gateway Status (`source/server/`)
- [x] **Universal REST API Server (`source/server/apiServer.js`)**:
  - High-performance, modular Node.js HTTP server running live on `http://localhost:3000`.
  - Passenger Gateway: `/api/v1/passenger/*` (Config, Auth OTP, Stations, Trips, 2D Seat Map, Hold, Bookings, Wallet Tickets, Rotating QR, Cancellation/Refund, Radar, Notifications).
  - Driver Tactical Gateway: `/api/v1/driver/*` (Auth, Shift Trips, Pre-start Readiness, Telemetry Ingestion, QR Scanner, COD Cash Collection, Incident SOS, Offline Sync Replay, End Trip).
  - Manager Operations Gateway: `/api/v1/ops/*` (RBAC Auth, Executive KPIs, Live Fleet Radar, Fleet Roster, Crew Directory, Routes, Dispatch Gantt Board, POS Counter Booking, Emergency Vehicle Swap, Trip Delays, Financial Reconciliation, Refunds, Executive Reports).
  - External Webhooks: `/api/v1/webhooks/vietqr/ipn` (Napas247 payment settlement) and `/health` + `/api/v1/openapi.json`.
  - Static Web Portals: `/passenger`, `/driver`, `/manager` (`/ops`).
  - **Automated Tests**: 68/68 unit and integration tests passing 100% Green (`npm test`).
  - **Live E2E Flow**: Full end-to-end live flow verified (`node test/e2e_live_flow.js`).

## 2. Passenger Mobile App (Android & iOS Flutter: `source/client/`)
- [x] **Android Configuration (`source/client/app/android/`)**:
  - Package: `vn.busgo.passenger`, deep link `busgo://`.
  - Permissions: `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`, `VIBRATE`.
- [x] **iOS Configuration (`source/client/app/ios/Runner/Info.plist`)**:
  - Bundle Identifier: `vn.busgo.passenger`, Display Name: `BusGo`.
  - Usage Strings: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`.
- [x] **Flutter Presentation Suite (`source/client/app/lib/src/presentation/passenger/`)**:
  - `passenger_splash_screen.dart` (`PAX-001` Version check & handshake)
  - `passenger_login_screen.dart` (`PAX-002`, `PAX-003` Phone OTP input & 60s cooldown timer)
  - `passenger_home_screen.dart` (`PAX-004`, `PAX-005` Express search & station selector)
  - `passenger_search_results_screen.dart` (`PAX-006`, `PAX-007` Filterable trips & amenities)
  - `passenger_seat_map_screen.dart` (`PAX-008`, `PAX-009`, `PAX-010` 2D VIP Cabin Seat Matrix)
  - `passenger_checkout_screen.dart` (`PAX-011`, `PAX-012` Manifest info form, CCCD & voucher)
  - `passenger_ticket_qr_screen.dart` (`PAX-013`, `PAX-015`, `PAX-017` Dynamic 30s rotating HMAC QR)
  - `passenger_wallet_screen.dart` (`PAX-016`, `PAX-021` Ticket Wallet & cancellation refund)
  - `passenger_live_radar_screen.dart` (`PAX-018`, `PAX-019` Live GPS Radar HUD & ETA)
  - `passenger_notifications_screen.dart` (`PAX-020`, `PAX-024`, `PAX-025` Push notification center & delay alerts)
  - `passenger_main_shell.dart` (Unified 4-tab bottom navigation)
  - `passenger_api_service.dart` (`source/client/data/lib/` Complete Flutter API Client)

## 3. Driver Mobile App (Android & iOS Flutter: `source/driver/`)
- [x] **Android Configuration (`source/driver/app/android/`)**:
  - Package: `vn.busgo.driver`, label `BusGo Driver`.
  - Permissions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `WAKE_LOCK`, `CAMERA`.
- [x] **iOS Configuration (`source/driver/app/ios/Runner/Info.plist`)**:
  - Bundle Identifier: `vn.busgo.driver`, Display Name: `BusGo Driver`.
  - Privacy Strings: `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`.
  - Background Modes: `location`, `fetch`, `remote-notification`.
- [x] **Flutter Tactical Presentation Suite (`source/driver/app/lib/src/presentation/`)**:
  - `driver_login_screen.dart` (`DRI-001` Staff ID / PIN login & FC license check)
  - `driver_today_trips_screen.dart` (`DRI-002`, `DRI-003` Assigned shift trips & countdown)
  - `driver_readiness_screen.dart` (`DRI-004` Pre-start 6-point readiness inspection)
  - `driver_cockpit_dashboard.dart` (`DRI-005`, `DRI-006`, `DRI-014` Tactical dark HUD cockpit 72dp/64dp)
  - `driver_manifest_screen.dart` (`DRI-007`, `DRI-010`, `DRI-012` Passenger manifest, 1-tap boarding & COD collection)
  - `driver_qr_scanner_screen.dart` (`DRI-009` Dynamic 30s rotating HMAC QR ticket scanner)
  - `driver_offline_sync_screen.dart` (`DRI-015`, `DRI-019` Offline queue replay & SOS incident reporting)
  - `main_shell_screen.dart` (4-tab tactical driver navigation)
  - `driver_api_service.dart` (Flutter API client for `/api/v1/driver/*`)

## 4. Manager Operations Control Center Platform Status (MGR-001 to MGR-030)
- [x] **Manager Enterprise Design System & Tokens (`source/manager-app/core/managerTokens.js`)**
- [x] **Manager Authentication & RBAC (`MGR-001`, `MGR-029`)**
- [x] **Operations Executive Dashboard KPIs (`MGR-002`)**
- [x] **Live Fleet Telemetry Radar Map (`MGR-003`, `MGR-004`)**
- [x] **Fleet Roster & Vehicle Management (`MGR-005`, `MGR-006`, `MGR-007`)**
- [x] **Driver & Crew Directory (`MGR-008`, `MGR-009`, `MGR-010`)**
- [x] **Route & Corridor Management (`MGR-011`, `MGR-012`, `MGR-013`)**
- [x] **Interactive Dispatch Board (`MGR-014`, `MGR-015`, `MGR-016`)**
- [x] **Station & Bay Management (`MGR-017`, `MGR-018`)**
- [x] **POS Counter & Hotline Booking Engine (`MGR-019`, `MGR-020`)**
- [x] **Emergency Vehicle Replacement Wizard (`MGR-023`)**
- [x] **Trip Delay & Disruption Management (`MGR-024`)**
- [x] **Financial Reconciliation & Refund Center (`MGR-021`, `MGR-022`)**
- [x] **Executive Financial & Punctuality Reports (`MGR-025`, `MGR-026`, `MGR-027`, `MGR-028`, `MGR-030`)**
- [x] **Manager Web Portal Suite (`docs/designs/manager_portal.html`)**