# Implementation Plan: Android & iOS Mobile Apps Spec & Design Alignment

Dựa trên tài liệu đặc tả hệ thống master [bus_booking_tracking_system_spec_v3_enhanced.md](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/docs/specs/bus_booking_tracking_system_spec_v3_enhanced.md), quy chuẩn thiết kế [screen-spec/passenger/DESIGN.md](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/DESIGN.md), [screen-spec/driver/DESIGN.md](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DESIGN.md) và các đặc tả màn hình `PAX-001` -> `PAX-025`, `DRI-001` -> `DRI-019`.

---

## 1. Mục Tiêu & Phạm Vi Công Việc

1. **Sửa lỗi cú pháp Dart nghiêm trọng**:
   - `async Future<...>` trong `PassengerApiClientService` và `DriverApiClientService` (cú pháp chuẩn Dart: `Future<...> ... async`).
   - Toán tử so sánh JavaScript `===` trong `PassengerSeatMapScreen` (cú pháp chuẩn Dart: `==`).
2. **Tuân thủ triệt để Quy chuẩn Design System (Zero Emojis & Design Tokens)**:
   - Loại bỏ 100% emojis vi phạm quy chuẩn `DESIGN.md` trong UI khách hàng và buồng lái tài xế (như `🚌`, `⬆️`, `⬇️`, `💵`, `✅`), thay thế bằng `IconData` / Material Icons và typography chuẩn (`Geist`, `JetBrains Mono`).
3. **Hoàn thiện Luồng Điều Hướng & Màn Hình Spec (PAX & DRI)**:
   - Sửa luồng tìm kiếm từ `PassengerHomeScreen` sang `PassengerSearchResultsScreen` (PAX-006) thay vì nhảy cóc thẳng vào `PassengerSeatMapScreen`.
   - Bổ sung các màn hình/dialog chức năng theo spec: `passenger_location_picker_screen.dart` (PAX-005), `passenger_trip_detail_screen.dart` (PAX-007), `passenger_payment_processing_screen.dart` (PAX-013/014), `passenger_cancel_refund_screen.dart` (PAX-021), `driver_trip_detail_screen.dart` (DRI-003), `driver_navigation_screen.dart` (DRI-013), `driver_incident_dialog.dart` (DRI-019), `driver_cod_dialog.dart` (DRI-012).
   - Mở rộng đầy đủ các phương thức API Client trong `passenger_api_service.dart` và `driver_api_service.dart` kết nối chính xác với backend `passengerRoutes.js` và `driverRoutes.js`.
4. **Mở rộng Bộ Kiểm Thử Tự Động (Automated Integrity Test Suite)**:
   - Bổ sung test kiểm tra tính hợp lệ của toàn bộ mã nguồn Dart (không có `===`, không có `async Future`, không có emoji).
   - Bổ sung test kiểm tra toàn vẹn API contracts và màn hình presentation.
   - Chạy 100% Green test suite `npm test` và cập nhật `STATE.md`.

---

## 2. Kế Hoạch Thực Hiện Chi Tiết (Phân Rã Atomic Tasks)

### Giai đoạn 1: Khắc phục lỗi cú pháp Dart (Syntax Self-Healing)
- [ ] **Task 1.1**: Sửa lỗi `async Future<...>` thành `Future<...> ... async` trong `source/client/data/lib/src/service/passenger_api_service.dart` và `source/driver/app/lib/src/service/driver_api_service.dart`.
- [ ] **Task 1.2**: Sửa lỗi toán tử `===` thành `==` trong `source/client/app/lib/src/presentation/passenger/passenger_seat_map_screen.dart`.

### Giai đoạn 2: Chuẩn hóa Design System & Loại bỏ Emojis
- [ ] **Task 2.1**: Loại bỏ emoji vi phạm trong các màn hình Passenger (`passenger_seat_map_screen.dart`), chuẩn hóa icon xe bus Material Icons.
- [ ] **Task 2.2**: Loại bỏ emojis trong buồng lái Driver (`driver_cockpit_dashboard.dart`, `driver_manifest_screen.dart`, `driver_qr_scanner_screen.dart`), thay bằng vector Material Icons và JetBrains Mono data pills.

### Giai đoạn 3: Hoàn thiện Luồng Nghiệp Vụ & API Passenger (PAX-001 -> PAX-025)
- [ ] **Task 3.1**: Mở rộng `PassengerApiClientService` đầy đủ các endpoints: `verifyOtp`, `homeFeed`, `createBooking`, `getTicketWallet`, `getTicketQR`, `cancelTicket`, `getLiveRadarHUD`, `getNotifications`, `getTripDetail`.
- [ ] **Task 3.2**: Bổ sung các màn hình Passenger: `passenger_location_picker_screen.dart` (PAX-005), `passenger_trip_detail_screen.dart` (PAX-007), `passenger_payment_processing_screen.dart` (PAX-013), `passenger_cancel_refund_screen.dart` (PAX-021).
- [ ] **Task 3.3**: Chuẩn hóa luồng điều hướng: từ Home bấm "TÌM KIẾM CHUYẾN XE" chuyển đến `PassengerSearchResultsScreen`, từ kết quả chuyển đến Trip Detail / Seat Map, từ Checkout chuyển đến Payment Processing rồi E-Ticket QR.

### Giai đoạn 4: Hoàn thiện Luồng Nghiệp Vụ & API Driver (DRI-001 -> DRI-019)
- [ ] **Task 4.1**: Mở rộng `DriverApiClientService` đầy đủ endpoints: `startTrip`, `getManifest`, `boardWithQr`, `markNoShow`, `collectCod`, `reportIncident`, `endTrip`.
- [ ] **Task 4.2**: Bổ sung các màn hình/dialog Driver: `driver_trip_detail_screen.dart` (DRI-003), `driver_navigation_screen.dart` (DRI-013), `driver_incident_dialog.dart` (DRI-019), `driver_cod_dialog.dart` (DRI-012).
- [ ] **Task 4.3**: Kết nối luồng hoàn chỉnh từ Login -> Today Trips -> Readiness Checklist -> Trip Detail -> Cockpit Dashboard -> Manifest / QR Scanner / Navigation / Offline Sync.

### Giai đoạn 5: Mở Rộng Kiểm Thử Tự Động & Empirical Verification
- [ ] **Task 5.1**: Mở rộng `test/mobile/mobile_client.test.js` kiểm tra toàn diện Dart syntax, zero-emoji, typography, API methods và màn hình Passenger.
- [ ] **Task 5.2**: Mở rộng `test/mobile/driver_mobile.test.js` kiểm tra toàn diện Dart syntax, zero-emoji, typography, API methods và màn hình Driver.

### Giai đoạn 6: Nghiệm Thu, Cập Nhật Trạng Thái & Walkthrough
- [ ] **Task 6.1**: Chạy `npm test` (đảm bảo 100% pass), chạy `node test/e2e_live_flow.js`, cập nhật `STATE.md` và tạo báo cáo `walkthrough.md`.

---

## 3. Verification Plan

### Automated Tests:
- `npm test`: Chạy toàn bộ test suites của platform (Node.js API, Mobile Client, Driver Mobile, Manager Web).
- `npm run lint`: Kiểm tra cú pháp mã nguồn.
- `node test/e2e_live_flow.js`: Kiểm tra live server API flow từ lúc tạo vé đến soát vé QR.

### Manual / Structural Verifications:
- Quét toàn bộ repository kiểm tra không còn bất kỳ ký tự emoji nào trong UI mobile.
- Quét không còn `===` hay `async Future` trong toàn bộ file `.dart`.
