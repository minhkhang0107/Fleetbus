# FleetBus Real-Time Bus Booking & Telemetry System State

Last updated: 2026-08-28 14:26

## 1. Unified Node.js API Server & Gateway Status (`source/server/`)
- [x] **Universal REST API Server (`source/server/apiServer.js`)**:
  - High-performance, modular Node.js HTTP server running live on `http://localhost:3000`.
  - Passenger Gateway: `/api/v1/passenger/*`
  - Driver Tactical Gateway: `/api/v1/driver/*`
  - Manager Operations Gateway: `/api/v1/ops/*`
  - External Webhooks: `/api/v1/webhooks/vietqr/ipn` and `/health` + `/api/v1/openapi.json`.
  - Static Web Portals: `/passenger`, `/driver`, `/manager`.
  - **Automated Tests**: 73/73 unit and integration tests passing 100% Green (`npm test`).
  - **Live E2E Flow**: Full end-to-end live flow verified (`node test/e2e_live_flow.js`).

## 2. Passenger Mobile App (Android & iOS Flutter: `source/client/`)
- [x] **Android Configuration (`source/client/app/android/`)**: Package `vn.busgo.passenger`.
- [x] **iOS Configuration (`source/client/app/ios/Runner/Info.plist`)**: Bundle ID `vn.busgo.passenger`.
- [x] **Flutter Presentation Suite (`source/client/app/lib/src/presentation/passenger/`)**: 11 screens covering PAX-001 to PAX-025.

## 3. Driver Mobile App (Android & iOS Flutter: `source/driver/`)
- [x] **Android Configuration (`source/driver/app/android/`)**: Package `vn.busgo.driver`, Foreground Service & Camera.
- [x] **iOS Configuration (`source/driver/app/ios/Runner/Info.plist`)**: Bundle ID `vn.busgo.driver`, Background Location & Camera.
- [x] **Flutter Tactical Presentation Suite (`source/driver/app/lib/src/presentation/`)**: 8 screens covering DRI-001 to DRI-019.

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