# FleetBus Real-Time Bus Booking & Telemetry System State

Last updated: 2026-09-03 17:36

## 1. Unified Node.js API Server & Gateway Status (`source/server/`)
- [x] **Universal REST API Server (`source/server/apiServer.js`)**:
  - High-performance, modular Node.js HTTP server running live on `http://localhost:3000`.
  - Passenger Gateway: `/api/v1/passenger/*` (Config, Auth, Stations, Trips, Seat Map, Hold, Booking, Wallet, QR, Live Radar, Notifications, Cancel/Refund).
  - Driver Tactical Gateway: `/api/v1/driver/*` (Auth, Today Trips, Readiness, Start Trip, Manifest, QR Boarding, COD Cash Collection, Telemetry Ping & Replay, Incidents/SOS, End Trip).
  - Manager Operations Gateway: `/api/v1/ops/*` (Auth, KPIs, Fleet Radar, POS, Dispatch, Emergency Swap, Fleet & Crew, Reports).
  - External Webhooks: `/api/v1/webhooks/vietqr/ipn` and `/health` + `/api/v1/openapi.json`.
  - Static Web Portals: `/passenger`, `/driver`, `/manager`.
  - **Automated Tests**: 79/79 unit and integration tests passing 100% Green across 14 suites (`npm test`).
  - **Lint Check**: 100% Clean (`npm run lint`).
  - **Live E2E Flow**: Full end-to-end live flow verified (`node test/e2e_live_flow.js`).

## 2. Passenger Mobile App (Android & iOS Flutter: `source/client/`)
- [x] **Android Configuration (`source/client/app/android/`)**: Package `vn.busgo.passenger`, camera, fine & coarse GPS, deep link scheme `busgo://`.
- [x] **iOS Configuration (`source/client/app/ios/Runner/Info.plist`)**: Bundle ID `vn.busgo.passenger`, location & camera privacy descriptions.
- [x] **Design Tokens & Typography (`resources/lib/src/theme/`)**: `#2563EB` Sapphire, `#F8FAFC` Canvas, `#0F172A` Charcoal, `#FB9821` PNR, `Geist` body font, `JetBrains Mono` code font. 0 emojis in presentation code.
- [x] **API Client Service (`data/lib/src/service/passenger_api_service.dart`)**: Complete typed HTTP integration covering `getAppConfig`, `requestOtp`, `verifyOtp`, `getHomeFeed`, `searchStations`, `searchTrips`, `getTripDetail`, `getSeatMap`, `holdSeats`, `createBookingOrder`, `getTicketWallet`, `getTicketQR`, `getLiveRadarHUD`, `getNotifications`, `cancelTicket`.
- [x] **Flutter Presentation Suite (`app/lib/src/presentation/passenger/`)**: 15 screens covering PAX-001 to PAX-025:
  - `passenger_splash_screen.dart` (PAX-001: Splash & handshake)
  - `passenger_login_screen.dart` (PAX-002: Phone & OTP login)
  - `passenger_home_screen.dart` (PAX-004: Home feed with location pickers & recommendations)
  - `passenger_location_picker_screen.dart` (PAX-005: Location & stop picker with fuzzy matching)
  - `passenger_search_results_screen.dart` (PAX-006: Trip search results with filters)
  - `passenger_trip_detail_screen.dart` (PAX-007: Trip detail with route timeline & amenities)
  - `passenger_seat_map_screen.dart` (PAX-009, PAX-010: 2D VIP seat map with 10-minute hold)
  - `passenger_checkout_screen.dart` (PAX-011, PAX-012: Checkout order review & vouchers)
  - `passenger_payment_processing_screen.dart` (PAX-013, PAX-014: VietQR Napas 247 dynamic QR & hold timer)
  - `passenger_ticket_qr_screen.dart` (PAX-017: Dynamic 30s rotating HMAC QR boarding pass)
  - `passenger_wallet_screen.dart` (PAX-016: Ticket wallet with filter tabs)
  - `passenger_cancel_refund_screen.dart` (PAX-021: Tiered cancellation rules & refund calculator)
  - `passenger_live_radar_screen.dart` (PAX-018, PAX-019: Real-time GPS bus radar HUD)
  - `passenger_notifications_screen.dart` (PAX-020: Broadcast notifications center)
  - `passenger_main_shell.dart` (Bottom navigation shell)

## 3. Driver Mobile App (Android & iOS Flutter: `source/driver/`)
- [x] **Android Configuration (`source/driver/app/android/`)**: Package `vn.busgo.driver`, Foreground Location Service, Camera.
- [x] **iOS Configuration (`source/driver/app/ios/Runner/Info.plist`)**: Bundle ID `vn.busgo.driver`, Background Location, Camera.
- [x] **Tactical Design Tokens & Typography (`resources/lib/src/theme/`)**: `#0F172A` Ops Canvas, `#1E293B` Surface Panel, `#16A34A` Emerald Safe, `#DC2626` Alert Critical, `#2563EB` Action, `#D97706` Amber Warning, `Geist` & `JetBrains Mono`. Large touch targets (64–72dp). 0 emojis in presentation code.
- [x] **API Client Service (`app/lib/src/service/driver_api_service.dart`)**: Complete typed HTTP integration covering `login`, `getTodayTrips`, `submitReadinessCheck`, `startTrip`, `sendTelemetry`, `getManifest`, `boardWithQr`, `collectCod`, `replayOfflineTelemetry`, `endTrip`, `reportIncident`.
- [x] **Flutter Tactical Presentation Suite (`app/lib/src/presentation/`)**: 12 screens & dialogs covering DRI-001 to DRI-019:
  - `driver_login_screen.dart` (DRI-001: Staff ID & PIN login)
  - `driver_today_trips_screen.dart` (DRI-002: Shift trip assignment list)
  - `driver_trip_detail_screen.dart` (DRI-003: Pre-start route overview & stop timeline)
  - `driver_readiness_screen.dart` (DRI-004: 6-point safety checklist)
  - `driver_cockpit_dashboard.dart` (DRI-006, DRI-007, DRI-008: Tactical cockpit HUD with speed & ETA)
  - `driver_manifest_screen.dart` (DRI-010, DRI-011: Passenger manifest with masked phone & COD)
  - `driver_qr_scanner_screen.dart` (DRI-009: 200ms camera reticle QR ticket validator)
  - `driver_navigation_screen.dart` (DRI-013: Turn-by-turn navigation & corridor guidance)
  - `driver_offline_sync_screen.dart` (DRI-015: SQLite offline telemetry batch sync)
  - `driver_incident_dialog.dart` (DRI-019: Quick incident report & SOS delay dispatch)
  - `driver_cod_dialog.dart` (DRI-012: COD cash collection receipt confirmation)
  - `main_shell_screen.dart` (Tactical shell with bottom bar)

## 4. Manager Operations Web App (Flutter Web Monorepo: `source/manager/`)
- [x] **Build Output Directory**: Compiled into `source/manager/web_dist/` via `flutter build web --web-renderer canvaskit` and served live at `http://localhost:3000/manager`.
- [x] **Melos & Make Orchestration**: `source/manager/melos.yaml` & `source/manager/makefile` supporting `make run_web`, `make build_dev_web`, `make build_prod_web`.
- [x] **Web Entrypoint (`source/manager/app/web/index.html`, `manifest.json`)**: Configured with Canvaskit WASM renderer, Geist font typography, and dark enterprise styling.
- [x] **Theme Tokens (`source/manager/resources/lib/src/theme/app_colors.dart`)**: Enterprise Slate & Cyan palette matching DESIGN.md (`#0B0F17`, `#131B2A`, `#06B6D4`, `#10B981`, `#EF4444`).
- [x] **API Client Service (`source/manager/app/lib/src/service/manager_api_service.dart`)**: Full integration with `/api/v1/ops/*`.
- [x] **Presentation Web Suite (`source/manager/app/lib/src/presentation/manager/`)**:
  - `manager_login_screen.dart` (`MGR-001`, `MGR-029` RBAC Login)
  - `manager_dashboard_screen.dart` (`MGR-002` Executive KPIs & Load Factor)
  - `manager_radar_map_screen.dart` (`MGR-003`, `MGR-004` 60Hz Live Fleet Radar Map)
  - `manager_dispatch_screen.dart` (`MGR-014`, `MGR-015`, `MGR-016` Dispatch Gantt Board)
  - `manager_pos_booking_screen.dart` (`MGR-019`, `MGR-020` Hotline & POS Counter Booking)
  - `manager_emergency_swap_screen.dart` (`MGR-023` Emergency Vehicle Swap Wizard)
  - `manager_fleet_roster_screen.dart` (`MGR-005`, `MGR-008` Fleet & Crew Directory)
  - `manager_reports_screen.dart` (`MGR-025`, `MGR-026` Executive Financial & OTP Reports)
  - `manager_web_shell.dart` (Desktop Sidebar Navigation Shell)