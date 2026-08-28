# FleetBus Real-Time Bus Booking & Telemetry System State

Last updated: 2026-08-27 11:18

## Master Spec & UI Alignment Status
- [x] **Master SRS Spec & Navigation Architecture**: Synchronized with `docs/specs/bus_booking_tracking_system_spec.md` and all 15 module specs.
- [x] **Unified 4-Item Passenger Bottom Menu (Trang chủ, Chuyến đi, Thông báo, Cá nhân)**:
  - **Tab 1: `Trang chủ`** (`home` SVG icon) ➔ `02_passenger_trip_search.html` (Active on Home/Search).
  - **Tab 2: `Chuyến đi`** (`directions_bus` SVG icon) ➔ `06b_passenger_my_trips.html` (Active on My Trips).
  - **Tab 3: `Thông báo`** (`notifications` SVG icon + unread red/primary dot badge).
  - **Tab 4: `Cá nhân`** (`person` SVG icon) ➔ `01b_passenger_profile.html` (Active on User Profile).
  - *Design System Standard*: In-place update on existing pages, 100% compliant with `taste-skill` v2 anti-slop guidelines (`bg-white/95 backdrop-blur-md dark:bg-slate-900/95`, Whisper border `border-t border-slate-200 dark:border-slate-800`, active sapphire pill `bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold px-4 py-1 rounded-xl`).
- [x] **Seamless 5-Step Booking Journey (Sequential CTAs & Links)**:
  1. `PASS-02-SEARCH` (Bước 1): Tìm kiếm chuyến xe & lọc giờ xuất bến (`02_passenger_trip_search.html`) ➔ `[ CHỌN CHUYẾN ➔ ]`.
  2. `PASS-02B-PICKUP` (Bước 2): Chọn điểm đón 2 kiểu (Đón tận nơi GPS <10km vs. Trạm cố định) (`03b_passenger_pickup_selection.html`) ➔ `[ TIẾP TỤC: CHỌN GHẾ ➔ ]`.
  3. `PASS-03-SEATS` (Bước 3): Sơ đồ chọn Cabin VIP 2 tầng, bộ đếm ngược giữ chỗ 10p (`03_passenger_seat_booking.html`) ➔ `[ TIẾP TỤC: XÁC NHẬN ĐƠN ➔ ]`.
  4. `PASS-03C-REVIEW` (Bước 4): Review tóm tắt đơn vé chuẩn Grab (`03c_passenger_booking_review.html`) ➔ `[ TIẾP TỤC THANH TOÁN ➔ ]`.
  5. `PASS-04-PAYMENT` (Bước 5): Thanh toán VietQR Napas247, sao chép 1 chạm, vé QR xoay 30s (`04_passenger_payment_ticket.html`).
- [x] **Complete High-Fidelity UI Screens Suite (20 screens in `docs/designs/`)**:
  1. `PASS-00-SPLASH`: `00_splash_screen.html`
  2. `PASS-01-LOGIN`: `01_passenger_login.html`
  3. `PASS-01-REGISTER`: `01_passenger_register.html`
  4. `PASS-01B-PROFILE`: `01b_passenger_profile.html`
  5. `PASS-02-SEARCH`: `02_passenger_trip_search.html`
  6. `PASS-02B-PICKUP`: `03b_passenger_pickup_selection.html`
  7. `PASS-03-SEATS`: `03_passenger_seat_booking.html`
  8. `PASS-03C-REVIEW`: `03c_passenger_booking_review.html`
  9. `PASS-04-PAYMENT`: `04_passenger_payment_ticket.html`
  10. `PASS-04B-TICKETS`: `04b_passenger_my_tickets.html`
  11. `PASS-05-TRACKING`: `05_passenger_live_tracking.html`
  12. `PASS-06-MY-TRIPS`: `06b_passenger_my_trips.html`
  13. `DRV-01-SHIFT`: `06_driver_auth_shift.html`
  14. `DRV-02-MANIFEST`: `07_driver_passenger_manifest.html`
  15. `DRV-04-NAVIGATION`: `08_driver_telemetry_navigation.html`
  16. `ADM-01-BUILDER`: `09_admin_fleet_seat_builder.html`
  17. `ADM-02-ROUTES`: `10_admin_routes_stops.html`
  18. `ADM-03-DISPATCH`: `11_admin_trip_dispatch.html`
  19. `ADM-04-RADAR`: `12_admin_live_operations_radar.html`
  20. `ADM-05-POS`: `13_admin_pos_emergency.html`