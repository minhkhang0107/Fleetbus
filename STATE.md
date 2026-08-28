# FleetBus Real-Time Bus Booking & Telemetry System State

Last updated: 2026-08-28 13:20

## 1. Unified Node.js API Server & Gateway Status (`source/server/`)
- [x] **Universal REST API Server (`source/server/apiServer.js`)**:
  - High-performance, modular Node.js HTTP server.
  - Passenger Gateway: `/api/v1/passenger/*` (Config, Auth OTP, Stations, Trips, 2D Seat Map, Hold, Bookings, Wallet Tickets, Rotating QR, Cancellation/Refund, Radar, Notifications).
  - Driver Tactical Gateway: `/api/v1/driver/*` (Auth, Shift Trips, Pre-start Readiness, Telemetry Ingestion, QR Scanner, COD Cash Collection, Incident SOS, Offline Sync Replay, End Trip).
  - Manager Operations Gateway: `/api/v1/ops/*` (RBAC Auth, Executive KPIs, Live Fleet Radar, Dispatch Gantt Board, POS Counter Booking, Emergency Vehicle Swap, Trip Delays, Financial Reconciliation & Refunds).
  - External Webhooks: `/api/v1/webhooks/vietqr/ipn` (Napas247 payment settlement) and `/health` + `/api/v1/openapi.json`.
  - Static Web Portals: `/passenger`, `/driver`, `/manager` (`/ops`).
  - 64/64 automated tests passing 100% Green (`npm test`).

## 2. Passenger App Autonomous Spec-to-Test Pipeline Status (PAX-001 to PAX-025)
- [x] **Phase 1: Foundation, Testing Infrastructure & Design System** (`npm test`, `npm run lint` 100% Green)
- [x] **Phase 2: Onboarding & Authentication Journey (PAX-001, PAX-002, PAX-003, PAX-022)**
- [x] **Phase 3: Discovery, Location Picker & Trip Search Journey (PAX-004, PAX-005, PAX-006, PAX-007)**
- [x] **Phase 4: Pickup Selection & Realtime 2D VIP Seat Map Engine (PAX-008, PAX-009, PAX-010)**
- [x] **Phase 5: Passenger Manifest & Checkout Review (PAX-011, PAX-012)**
- [x] **Phase 6: Payment, Ticket Wallet & Dynamic HMAC QR Code (PAX-013, PAX-014, PAX-015, PAX-016, PAX-017)**
- [x] **Phase 7: Live GPS Telemetry, Radar Tracking & Disruption Handling (PAX-018 to PAX-021, PAX-023 to PAX-025)**
- [x] **Phase 8: High-Fidelity Interactive Passenger Web App Suite & Multi-Axis Verification**

## 3. Passenger Android & iOS Mobile Client Implementation Status (`source/client/`)
- [x] **Android Manifest & Permissions (`source/client/app/android/`)**: Location, Camera, Internet, Notifications.
- [x] **iOS Info.plist (`source/client/app/ios/`)**: DisplayName `BusGo`, Bundle `vn.busgo.passenger`, Location/Camera strings.
- [x] **Flutter Client Presentation Suite (`source/client/app/lib/src/presentation/passenger/`)**:
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

## 4. Driver App Autonomous Spec-to-Test Pipeline Status (DRI-001 to DRI-019)
- [x] **Driver Tactical Design System & Tokens (`source/driver-app/core/driverTokens.js`)**
- [x] **Driver Authentication & License Safety Check (`DRI-001`)**
- [x] **Today Assigned Shift Trips (`DRI-002`)**
- [x] **Pre-Start Vehicle Readiness Inspection (`DRI-003`, `DRI-004`)**
- [x] **Active Trip Cockpit Dashboard (`DRI-005`, `DRI-006`, `DRI-014`)**
- [x] **Passenger Manifest, QR Boarding & COD Cash Collection (`DRI-007`, `DRI-009`, `DRI-010`, `DRI-012`)**
- [x] **Disruption Reporting, Offline Sync Center & End Trip (`DRI-011`, `DRI-015`, `DRI-017`, `DRI-019`)**
- [x] **Driver Tactical Cockpit Web Suite (`docs/designs/driver_cockpit.html`)**
- [x] **Driver Flutter Mobile Application (`source/driver/app/`)**

## 5. Manager Operations Control Center Status (MGR-001 to MGR-030)
- [x] **Manager Enterprise Design System & Tokens (`source/manager-app/core/managerTokens.js`)**
- [x] **Manager Authentication & RBAC (`MGR-001`, `MGR-029`)**
- [x] **Operations Executive Dashboard KPIs (`MGR-002`)**
- [x] **Live Fleet Telemetry Radar Map (`MGR-003`, `MGR-004`)**
- [x] **Interactive Dispatch Board (`MGR-014`)**
- [x] **POS Counter & Hotline Booking Engine (`MGR-019`, `MGR-020`)**
- [x] **Emergency Vehicle Replacement Wizard (`MGR-023`)**
- [x] **Financial Reconciliation & Refund Center (`MGR-021`, `MGR-022`)**
- [x] **Manager Web Portal Suite (`docs/designs/manager_portal.html`)**