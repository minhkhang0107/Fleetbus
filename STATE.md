# FleetBus Real-Time Bus Booking & Telemetry System State

Last updated: 2026-08-28 13:10

## 1. Passenger App Autonomous Spec-to-Test Pipeline Status (PAX-001 to PAX-025)
- [x] **Phase 1: Foundation, Testing Infrastructure & Design System** (`npm test`, `npm run lint` 100% Green)
  - Core tokens matching `DESIGN.md` (`Geist`, `JetBrains Mono`, Sapphire `#2563EB`, Canvas `#F8FAFC`, Pure Surface `#FFFFFF`, Whisper Border, 0 emojis, 100% SVG icons).
  - Crypto engine with HMAC-SHA256 30s rotating dynamic QR generator and VietQR EMVCo/Napas247 CRC16 payload builder.
  - Core domain formatters: VND currency, PNR formatter, CCCD & Vietnam phone regex, Haversine telemetry & refund tiers.
- [x] **Phase 2: Onboarding & Authentication Journey (PAX-001, PAX-002, PAX-003, PAX-022)**
  - `PAX-001` Splash & Remote Config version check (`FORCE_UPGRADE` blocking invariant).
  - `PAX-002` Phone Login with normalization (`09x` / `+84`).
  - `PAX-003` OTP verification with 60s cooldown countdown, 180s TTL, and 5-attempt brute-force protection.
  - `PAX-022` User Profile & secure JWT session management.
- [x] **Phase 3: Discovery, Location Picker & Trip Search Journey (PAX-004, PAX-005, PAX-006, PAX-007)**
  - `PAX-004` Home screen with popular routes & express search card.
  - `PAX-005` Station & Location picker with Vietnamese diacritics fuzzy search.
  - `PAX-006` Sub-route trip search engine with vehicle type filters (`VIP_CABIN`, `SLEEPER_34`), departure time slots and price sorting.
  - `PAX-007` Detailed trip itinerary, plate numbers, and amenity inspection.
- [x] **Phase 4: Pickup Selection & Realtime 2D VIP Seat Map Engine (PAX-008, PAX-009, PAX-010)**
  - `PAX-008` Station vs GPS pickup/dropoff selection.
  - `PAX-009` Interactive 2D Double Deck VIP Cabin seat map (Deck 1 & Deck 2) with middle aisle and real-time state flags.
  - `PAX-010` Distributed 10-Minute Redis Seat Hold Engine (`BR-SEAT-001` max 5 seats, auto-expiry timer, conflict race condition auto-deselect).
- [x] **Phase 5: Passenger Manifest & Checkout Review (PAX-011, PAX-012)**
  - `PAX-011` Multi-seat passenger manifest validation with CCCD and phone validation.
  - `PAX-012` Booking Review Order Summary with promo voucher discount engine (`BUSGO50K`, `VIP10`) and insurance breakdown.
- [x] **Phase 6: Payment, Ticket Wallet & Dynamic HMAC QR Code (PAX-013, PAX-014, PAX-015, PAX-016, PAX-017)**
  - `PAX-013` Dynamic VietQR Napas247 payment flow with auto-generated transfer memo.
  - `PAX-014` / `PAX-015` Webhook settlement handler, PNR generation, and e-ticket issuance.
  - `PAX-016` Passenger Ticket Wallet with tab filters (`UPCOMING`, `COMPLETED`, `CANCELLED`).
  - `PAX-017` Dynamic Rotating HMAC-SHA256 Boarding Pass (30s window) with anti-screenshot watermark and driver boarding scan verification.
- [x] **Phase 7: Live GPS Telemetry, Radar Tracking & Disruption Handling (PAX-018 to PAX-021, PAX-023 to PAX-025)**
  - `PAX-018` / `PAX-019` Live GPS Telemetry Radar HUD, vehicle speed/bearing tracking, and Haversine geofencing ETA.
  - `PAX-020` Real-time push notification center with unread count badges.
  - `PAX-021` Automated cancellation & refund tier calculator (100% >24h, 50% 12-24h, 0% <12h).
  - `PAX-024` / `PAX-025` Vehicle replacement & delay disruption broadcast service.
- [x] **Phase 8: High-Fidelity Interactive Passenger Web App Suite & Multi-Axis Verification**
  - Unified interactive web app suite delivered at `docs/designs/passenger_suite.html`.
  - HTTP Server & REST API Gateway at `source/passenger-app/server.js`.
  - Strict compliance with `DESIGN.md` (0 emojis, Geist + JetBrains Mono, Whisper borders, Sapphire `#2563EB`).

## 2. Passenger Android & iOS Mobile Implementation Status
- [x] **Android Manifest & Permissions (`source/client/app/android/`)**: Location, Camera, Internet, Notifications.
- [x] **iOS Info.plist (`source/client/app/ios/`)**: DisplayName `BusGo`, Bundle `vn.busgo.passenger`, Location/Camera strings.
- [x] **Flutter Passenger UI Presentation Screens (`source/client/app/lib/`)**: Splash, Home, Seat Map, Checkout, Rotating QR Pass, Live Radar HUD, 4-Tab Main Shell.

## 3. Driver App Autonomous Spec-to-Test Pipeline Status (DRI-001 to DRI-019)
- [x] **Driver Tactical Design System & Tokens (`source/driver-app/core/driverTokens.js`)**:
  - Tactical dark cockpit theme (`canvas-ops: #0F172A`, `surface-panel: #1E293B`, `border-tactical: #334155`, `primary-action: #2563EB`).
  - Large touch targets (64dp / 72dp), zero drive mode motion, glanceable `JetBrains Mono` telemetry numerals.
- [x] **Driver Authentication & License Safety Check (`DRI-001`)**:
  - Staff ID & PIN login with commercial FC license expiration validation (`BR-DRI-001`).
- [x] **Today Assigned Shift Trips (`DRI-002`)**:
  - Route, vehicle plate `29B-123.45`, departure schedule, and passenger booking counts.
- [x] **Pre-Start Vehicle Readiness Inspection (`DRI-003`, `DRI-004`)**:
  - 6-point safety check (tires, brakes, AC, first aid, fuel, GPS telemetry beacon).
- [x] **Active Trip Cockpit Dashboard (`DRI-005`, `DRI-006`, `DRI-014`)**:
  - 72dp/64dp glanceable operational cockpit: Speed (62 km/h), Next Stop, ETA, Boarding counters.
  - GPS Telemetry 3s sampling protocol & local offline buffer queue.
- [x] **Passenger Manifest, QR Boarding & COD Cash Collection (`DRI-007`, `DRI-009`, `DRI-010`, `DRI-012`)**:
  - Segment-based manifest filtering, 60fps dynamic QR camera scanner with HMAC verification, 1-tap manual boarding, COD cash collection recording.
- [x] **Disruption Reporting, Offline Sync Center & End Trip (`DRI-011`, `DRI-015`, `DRI-017`, `DRI-019`)**:
  - No-show declaration, delay/SOS incident broadcaster, offline telemetry batch replay, and end-of-trip settlement audit.
- [x] **Driver Tactical Cockpit Web Suite (`docs/designs/driver_cockpit.html`)**:
  - High-fidelity interactive dark cockpit suite running at `/driver`.
- [x] **Driver Flutter Mobile Application (`source/driver/app/`)**:
  - Android Manifest with foreground telemetry service and camera permissions.
  - Flutter Tactical Dark Cockpit presentation screens.

## 4. Manager Operations Control Center Status (MGR-001 to MGR-030)
- [x] **Manager Enterprise Design System & Tokens (`source/manager-app/core/managerTokens.js`)**:
  - Dark command sidebar (`#0F172A`), high-density light workspace (`#F8FAFC`), Sapphire `#2563EB`, Emerald `#16A34A`, Amber `#D97706`, Alert `#DC2626`.
- [x] **Manager Authentication & RBAC (`MGR-001`, `MGR-029`)**:
  - Multi-role permission system (Fleet Director, Dispatcher, Cashier, Controller).
- [x] **Operations Executive Dashboard KPIs (`MGR-002`)**:
  - Real-time active buses, 85.7% load factor, revenue metrics, on-time departure rate, corridor analytics.
- [x] **Live Fleet Telemetry Radar Map (`MGR-003`, `MGR-004`)**:
  - 60Hz live vehicle tracking, speed/heading, GPS status flags (LIVE/STALE/LOST).
- [x] **Interactive Dispatch Board (`MGR-014`)**:
  - Shift dispatch timeline, driver assignment, vehicle plates, booked/capacity metrics.
- [x] **POS Counter & Hotline Booking Engine (`MGR-019`, `MGR-020`)**:
  - Express ticket creation, seat assignment, instant PNR generation.
- [x] **Emergency Vehicle Replacement Wizard (`MGR-023`)**:
  - Dual-panel vehicle swap with automatic passenger seat reallocation and SMS alerts.
- [x] **Financial Reconciliation & Refund Center (`MGR-021`, `MGR-022`)**:
  - Gateway transaction ledger matching, 1-click refund approval.
- [x] **Manager Web Portal Suite (`docs/designs/manager_portal.html`)**:
  - Desktop control center running at `/manager` or `/ops`.
  - 58/58 automated tests passing 100% Green (`npm test`).