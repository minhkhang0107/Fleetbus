# FleetBus Real-Time Bus Booking & Telemetry System State

Last updated: 2026-09-15 13:30

## 1. Unified Node.js API Server & Gateway Status (`source/server/`)
- [x] **Universal REST API Server (`source/server/apiServer.js`)**:
  - High-performance, modular Node.js HTTP server running live on `http://localhost:3000`.
  - Passenger Gateway: `/api/v1/passenger/*` (Config, Auth, Stations, Trips, Seat Map, Hold, Booking, Wallet, QR, Live Radar, Notifications, Cancel/Refund).
  - Driver Tactical Gateway: `/api/v1/driver/*` (Auth, Today Trips, Readiness, Start Trip, Manifest, QR Boarding, COD Cash Collection, Telemetry Ping & Replay, Incidents/SOS, End Trip).
  - Manager Operations Gateway: `/api/v1/ops/*` (Auth, KPIs, Fleet Radar, POS, Dispatch, Emergency Swap, Fleet & Crew, Reports).
  - External Webhooks: `/api/v1/webhooks/vietqr/ipn` and `/health` + `/api/v1/openapi.json`.
  - Static Web Portals: `/passenger`, `/driver`, `/manager` served directly from built `web_dist/` distributions with fallback to `docs/designs/`.
  - **Automated Tests**: 165/165 unit and integration tests passing across 22 suites (`npm test` / `make test`), see section 8.
  - **Lint Check**: `npm run lint` runs `tools/lint.js`, a syntax check of every JavaScript file (54 files). The earlier command checked only the first file.
  - **Universal System Build**: `npm run build` / `make build` compiles and packages all platforms, generates `build_manifest.json`, and aligns Android `local.properties`.
  - **Live E2E Flow**: Full tripartite end-to-end live flow verified (`npm run e2e` / `make e2e` / `node test/e2e_live_flow.js`).
  - **Cross-Service Event Bridge**: `FleetBusEventBridge` pub-sub linking Passenger, Driver, and Manager in real time.

## 2. Passenger Mobile App (Android & iOS Flutter: `source/passenger/`)
- [x] **Android Configuration (`source/passenger/app/android/`)**:
  - Package & Namespace: `vn.busgo.passenger` (in `AndroidManifest.xml` and `app/build.gradle`).
  - Application ID: `vn.busgo.passenger` (Flavors: `dev`, `qa`, `stg`, `production`).
  - Kotlin Activity: `source/passenger/app/android/app/src/main/kotlin/vn/busgo/passenger/MainActivity.kt` with package `vn.busgo.passenger`.
  - Permissions: camera, fine & coarse GPS, cleartext dev traffic (`android:usesCleartextTraffic="true"`), deep link scheme `busgo://`.
- [x] **iOS Configuration (`source/passenger/app/ios/`)**:
  - Bundle Identifier: `vn.busgo.passenger` (in `Info.plist` and `Runner.xcodeproj/project.pbxproj`).
  - App Transport Security: `NSAllowsArbitraryLoads` and `NSAllowsLocalNetworking` enabled for seamless local API server access.
  - Privacy Descriptions: location, camera, and photo library access permissions configured.
- [x] **Design Tokens & Typography (`resources/lib/src/theme/`)**: `#2563EB` Sapphire, `#F8FAFC` Canvas, `#0F172A` Charcoal, `#FB9821` PNR, `Geist` body font, `JetBrains Mono` code font. 0 emojis in presentation code.
- [x] **API Client Service (`data/lib/src/service/passenger_api_service.dart`)**:
  - Platform-adaptive base URL (`resolvePassengerBaseUrl`): `10.0.2.2:3000` for Android emulator, `localhost:3000` for iOS simulator/web, overridable for physical LAN.
  - Typed HTTP client covering every passenger endpoint of the spec (token, Idempotency-Key, canonical paths; Phase B). **No screen calls it yet** (`OQ-029`).
- [x] **Flutter Presentation Suite (`app/lib/src/presentation/passenger/`)**: 15 static screens (hard-coded data) covering 19 of the 25 spec screens; missing: PAX-008, 015, 022, 023, 024, 025:
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
- [x] **Android Configuration (`source/driver/app/android/`)**:
  - Package & Namespace: `vn.busgo.driver` (in `AndroidManifest.xml` and `app/build.gradle`).
  - Application ID: `vn.busgo.driver` (Flavors: `dev`, `qa`, `stg`, `production`).
  - Kotlin Activity: `source/driver/app/android/app/src/main/kotlin/vn/busgo/driver/MainActivity.kt` with package `vn.busgo.driver`.
  - Permissions: Foreground Location Service, Camera, cleartext dev traffic (`android:usesCleartextTraffic="true"`).
- [x] **iOS Configuration (`source/driver/app/ios/`)**:
  - Bundle Identifier: `vn.busgo.driver` (in `Info.plist` and `Runner.xcodeproj/project.pbxproj`).
  - App Transport Security: `NSAllowsArbitraryLoads` and `NSAllowsLocalNetworking` enabled for local API communication.
  - Background Modes: `location`, `fetch`, `remote-notification` configured.
- [x] **Tactical Design Tokens & Typography (`resources/lib/src/theme/`)**: `#0F172A` Ops Canvas, `#1E293B` Surface Panel, `#16A34A` Emerald Safe, `#DC2626` Alert Critical, `#2563EB` Action, `#D97706` Amber Warning, `Geist` & `JetBrains Mono`. Large touch targets (64–72dp). 0 emojis in presentation code.
- [x] **API Client Service (`app/lib/src/service/driver_api_service.dart`)**:
  - Platform-adaptive base URL (`resolveDriverBaseUrl`): `10.0.2.2:3000` for Android emulator, `localhost:3000` for iOS simulator/web, overridable for physical LAN.
  - Typed HTTP client covering every driver endpoint of the spec (token, Idempotency-Key, canonical paths; Phase B). **No screen calls it yet** (`OQ-029`).
- [x] **Flutter Tactical Presentation Suite (`app/lib/src/presentation/`)**: 12 static screens and dialogs covering 14 of the 19 spec screens; missing: DRI-005, 014, 016, 017, 018:
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
- [x] **API Client Service (`source/manager/app/lib/src/service/manager_api_service.dart`)**: Typed client covering every operations endpoint of the spec. **No screen calls it yet** (`OQ-029`).
- [x] **Presentation Web Suite (`source/manager/app/lib/src/presentation/manager/`)** (static screens, 9 of the 30 spec screens; the screen codes below follow an older numbering, see `docs/review/phase-B-findings.md`):
  - `manager_login_screen.dart` (`MGR-001`, `MGR-029` RBAC Login)
  - `manager_dashboard_screen.dart` (`MGR-002` Executive KPIs & Load Factor)
  - `manager_radar_map_screen.dart` (`MGR-003`, `MGR-004` 60Hz Live Fleet Radar Map)
  - `manager_dispatch_screen.dart` (`MGR-014`, `MGR-015`, `MGR-016` Dispatch Gantt Board)
  - `manager_pos_booking_screen.dart` (`MGR-019`, `MGR-020` Hotline & POS Counter Booking)
  - `manager_emergency_swap_screen.dart` (`MGR-023` Emergency Vehicle Swap Wizard)
  - `manager_fleet_roster_screen.dart` (`MGR-005`, `MGR-008` Fleet & Crew Directory)
  - `manager_reports_screen.dart` (`MGR-025`, `MGR-026` Executive Financial & OTP Reports)
  - `manager_web_shell.dart` (Desktop Sidebar Navigation Shell)

## 5. Realtime Tripartite Synchronization & Cross-Platform Verification
- [x] **Event Bridge (`source/server/core/fleetBusEventBridge.js`)**:
  - `TICKET_SETTLED`: Mobile passenger booking + VietQR webhook auto-locks seat map, registers ticket on driver manifest, logs revenue and booking on manager dashboard, sends push notification.
  - `PASSENGER_BOARDED`: Driver QR scanner boarding pass scan marks ticket as BOARDED in passenger wallet, sends boarding confirmation push, increments boarded count in manager control center.
  - `DRIVER_TELEMETRY`: 1Hz driver GPS ping broadcasts live position, speed, and heading to passenger Live Radar HUD and manager 60Hz Fleet Radar map.
  - `INCIDENT_ALERT`: Driver emergency/delay report surfaces immediately in manager Ops alert center and broadcasts push alerts to affected passengers.
  - `POS_BOOKING_CREATED`: Manager hotline counter booking reserves seat on seat map and appends passenger to driver manifest.
  - `VEHICLE_SWAPPED`: Manager emergency swap updates assigned vehicle plate for driver and pushes disruption advisory to passengers.
  - `TRIP_DELAYED`: Manager trip delay broadcast updates driver schedule and notifies passengers with adjusted ETA.
  - `TICKET_CANCELLED`: Passenger self-service cancellation recalculates refund tier, frees seat on seat map, updates driver manifest, and records refund in manager ledger.
  - `TRIP_COMPLETED`: Driver ending shift updates manager trip status to COMPLETED and sets vehicle to STANDBY.
- [x] **Tripartite Integration Test Suite (`test/integration/tripartite_sync.test.js`)**:
  - `TC-SYNC-01` to `TC-SYNC-09`: 9 comprehensive automated integration tests verifying bidirectional event flows across all 3 platforms.
- [x] **Web Manager Dart Syntax Hygiene & Anti-Patterns**:
  - Cleansed Unicode Dingbat picture arrows (`\u2794`) into typographic em-dashes across all Flutter Web screens.
  - Verified 0 picture emojis and 0 JS triple equals across all 5 manager presentation screens (`TC-MGR-WEB-06`, `TC-MGR-WEB-07`).

## 6. Universal System Build & Live Full-Flow Test Pipeline
- [x] **Build Engine (`tools/build_system.js`)**:
  - `npm run build` / `make build`: Automatically coordinates full system packaging.
  - Generates and synchronizes production-ready `web_dist/index.html` for Passenger (`54.5KB`), Driver (`25.7KB`), and Manager (`33.1KB`).
  - Configures Android environment `local.properties` (`sdk.dir=/home/david/Android/Sdk`) for Passenger and Driver mobile apps to prevent Gradle assert failures.
  - Generates `build_manifest.json` with SHA-256 checksums, platform configs, and timestamped statuses.
- [x] **Live End-to-End Flow (`node test/e2e_live_flow.js` / `npm run e2e` / `make e2e`)**:
  - Automatically spins up or connects to server on `http://localhost:3000`.
  - Step 1: Healthcheck & Service Status (`UP`, 5 core services).
  - Step 2: Passenger discovery, fuzzy station search, 2D VIP seat map, 10-minute lock, booking order creation.
  - Step 3: Napas247 / VietQR payment settlement via IPN webhook with ticket issuance.
  - Step 4: Passenger Ticket Wallet retrieval & 30s rotating dynamic HMAC QR boarding pass generation.
  - Step 5: Driver tactical auth, shift trip inspection, 6-point readiness safety checklist, start trip (`IN_TRANSIT`), camera QR boarding scan, 1Hz live GPS telemetry stream.
  - Step 6: Manager Operations login, executive KPIs (Load Factor, Gross Revenue), 60Hz live fleet radar tracking, hotline POS booking, executive OTP and punctuality report.
- [x] **Regression & Integrity Guard**:
  - 165/165 passing tests (`npm test`), see section 8.
  - Syntax check of every file (`npm run lint`).
  - Single command orchestration via `make build && make lint && make test && make e2e`.

## 7. Monorepo Build Artifact Git Hygiene & .gitignore Rules
- [x] **Monorepo Root `.gitignore` Alignment**:
  - Configured comprehensive ignore rules covering all build targets, platforms, and code generators:
    1. **Universal & Platform Build Outputs**: `build/`, `**/build/`, `dist/`, `**/dist/`, `web_dist/`, `**/web_dist/`, `out/`, `**/out/`, `build_manifest.json`.
    2. **Flutter & Dart Build Artifacts**: `.dart_tool/`, `.flutter-plugins`, `.flutter-plugins-dependencies`, `.pub-cache/`, `.pub/`, `.melos_tool/`, `**/doc/api/`, `.buildlog/`.
    3. **Dart Code Generator Artifacts**: `*.g.dart`, `*.freezed.dart`, `*.mocks.dart`, `*.gr.dart`, `*.config.dart`, `*.mapper.dart`, `*.gen.dart`, `*.graphql.dart`, `resources/lib/src/generated/`, `app/lib/ui/res/generated/`, `data/lib/src/repository/model/generated/`, `*.symbols`, `*.map.json`.
    4. **Android Build Artifacts**: `.gradle/`, `local.properties`, `**/android/app/debug/`, `**/android/app/profile/`, `**/android/app/release/`, `*.apk`, `*.aab`, `*.ap_`, `*.dex`, `*.class`, `captures/`, `.externalNativeBuild/`, `.cxx/`, `GeneratedPluginRegistrant.java`, `gradle-wrapper.jar`, `key.properties`, `*.keystore`, `*.jks`.
    5. **iOS Build Artifacts**: `Pods/`, `.symlinks/`, `Flutter.framework`, `Generated.xcconfig`, `app.flx`, `flutter_assets/`, `flutter_export_environment.sh`, `.last_build_id`, `ephemeral/`, `DerivedData/`, `.generated/`, `*.ipa`, `*.dSYM.zip`, `xcuserdata/`.
    6. **Node.js & Web Artifacts**: `node_modules/`, `.cache/`, `.parcel-cache/`, `.turbo/`, `.next/`, `.nuxt/`.
    7. **Test & Coverage Outputs**: `coverage/`, `*.lcov`, `lcov.info`, `.nyc_output/`.
    8. **Logs, IDEs & Secrets**: `*.log`, `npm-debug.log*`, `.env*` (preserving `!*.env.example` and `!source/manager/env/*.env`), `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/`.
  - Untracked `build_manifest.json` from git index while preserving local generation on disk, preventing build timestamp git churn.
  - Added dedicated `source/manager/.gitignore` to match `source/driver/` and `source/passenger/` structures.

## 8. Phase A Review: Server and API Conformance to the Spec (2026-10-06)

Review and fixes of `source/server/` against `screen-spec/`, with the spec corrected where it was inconsistent. Full record: `docs/review/` (`design.md`, `phase-A-plan.md`, `phase-A-findings.md`, `decision-log.md`).

- [x] **53 findings reviewed**; the money, ticket, seat, QR and privacy ones fixed with tests that failed first. Highlights: prices set by the server, a live hold required to book, bank webhook checks signature and amount, "Tôi đã chuyển tiền" no longer issues tickets, QR signatures are verified, refunds follow the `PAX-021` tiers and are approved once, one seat inventory for app, counter, hotline and hail, drivers see masked phones only, OTP login works over HTTP.
- [x] **Spec updated** (screens `PAX-010/012/013/014/016/021`, `DRI-001/002/005-007/009/011/012/015/017`, `MGR-001/002/020/023/027/029`, `OQ-017` to `OQ-028`, `api-screen-map`, `traceability-matrix` section 3).
- [x] **Authentication layer**: signed tokens, role matrix, ownership checks, Idempotency-Key, login lockout. **Not yet enforced in development** (`FLEETBUS_AUTH=off` by default; `enforce` in production) because the Flutter apps do not send tokens yet.
- [ ] **Open**: Flutter clients (Phase B), TOTP 2FA (`OQ-027`), 16 deferred endpoints (`api-screen-map` section 5), segment-level seat release (`OQ-028`).
- Environment variables: `FLEETBUS_TICKET_SECRET`, `FLEETBUS_TOKEN_SECRET`, `FLEETBUS_WEBHOOK_SECRET` (required in production), `FLEETBUS_AUTH` (`enforce` | `off`).

## 9. Phase B Review: Flutter Apps (2026-10-06)

Record: `docs/review/phase-B-plan.md`, `phase-B-findings.md`, `decision-log.md` (D59 to D66). No Flutter or Dart SDK on this machine, so the Dart code was read, not compiled.

- [x] **The three API clients follow the server contract** (token, Idempotency-Key, canonical paths, no identity or price sent, a method for every endpoint). Checked by `test/mobile/api_client_contract.test.js`.
- [x] **Authentication is enforced by default** (`FLEETBUS_AUTH=off` only outside production). `npm run e2e` now logs in as a passenger, a driver and a staff member and checks every step.
- [ ] **Open (`OQ-029`)**: no screen calls the API; 32 spec screens do not exist (Passenger 6, Driver 5, Manager 21); the new Dart has not been compiled. Needs a Flutter SDK.

