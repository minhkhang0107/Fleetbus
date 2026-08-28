# FleetBus Real-Time Bus Booking & Telemetry System State

Last updated: 2026-08-28 12:00

## Passenger App Autonomous Spec-to-Test Pipeline Status (PAX-001 to PAX-025)
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

## Android & iOS Native Mobile Application Implementation Status
- [x] **Android Configuration & Platform Manifest (`source/client/app/android/`)**:
  - Package ID `vn.busgo.passenger`, app label `BusGo`.
  - Telemetry & GPS permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`).
  - Hardware camera permission for QR ticket scanning (`CAMERA`).
  - Deep link handler (`https://busgo.vn/trip/*` & `busgo://app`).
- [x] **iOS Configuration & Privacy Descriptors (`source/client/app/ios/`)**:
  - Bundle Identifier `vn.busgo.passenger`, Display Name `BusGo`, version 3.0.0 (412).
  - `NSLocationWhenInUseUsageDescription` & `NSLocationAlwaysAndWhenInUseUsageDescription` for station lookup & live bus tracking.
  - `NSCameraUsageDescription` & `NSPhotoLibraryUsageDescription` for boarding pass scanning and ticket saving.
- [x] **Flutter Mobile Domain & Presentation Screens (`source/client/app/lib/`)**:
  - `passenger_splash_screen.dart` (`PAX-001` Animated logo & version handshake).
  - `passenger_home_screen.dart` (`PAX-004` & `PAX-005` Search & Station picker).
  - `passenger_seat_map_screen.dart` (`PAX-008` & `PAX-009` & `PAX-010` 2D VIP Cabin Seat Matrix).
  - `passenger_checkout_screen.dart` (`PAX-011` & `PAX-012` Manifest info form & voucher).
  - `passenger_ticket_qr_screen.dart` (`PAX-015` & `PAX-017` Dynamic rotating HMAC-SHA256 QR ticket).
  - `passenger_live_radar_screen.dart` (`PAX-018` & `PAX-019` Live GPS Radar Telemetry HUD).
  - `passenger_main_shell.dart` (Unified 4-item bottom navigation: Trang chủ, Chuyến đi, Radar GPS, Cá nhân).
  - 41/41 automated tests passing 100% Green (`npm test`).