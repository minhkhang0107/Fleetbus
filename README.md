# FleetBus: Nền Tảng Đặt Vé & Điều Hành Xe Khách Trực Tuyến Thời Gian Thực

Hệ sinh thái công nghệ toàn diện phục vụ quản lý và vận hành nhà xe liên tỉnh, bao gồm 3 phân hệ ứng dụng độc lập kết nối qua cổng **Unified Node.js API Gateway**:

1. 📱 **Passenger App** (`source/passenger/`): Ứng dụng di động Flutter & Web dành cho Hành khách (Đặt vé, chọn ghế 2D, thanh toán VietQR Napas247, ví vé xoay mã HMAC QR 30s, theo dõi GPS Radar HUD).
2. 🚌 **Driver App** (`source/driver/`): Ứng dụng di động Flutter & Web buồng lái dành cho Tài xế (Điểm danh ca, kiểm tra an toàn 6 điểm, quét QR vé siêu tốc, thu hộ COD, truyền GPS Telemetry 1Hz, xử lý ngoại tuyến).
3. 🖥️ **Manager Operations Center** (`source/manager/`): Cổng web điều hành thời gian thực dành cho Quản lý & Điều độ (Bản đồ radar hạm đội 60Hz, điều độ xe/tài xế, bán vé POS/Hotline, đổi xe khẩn cấp, báo cáo doanh thu & đúng giờ).
4. 🌐 **Unified API Gateway & Services** (`source/server/`): Máy chủ Node.js REST API Server cung cấp dịch vụ tập trung và cổng thanh toán tự động IPN Webhook (chứa `services/passenger`, `services/driver`, `services/manager`).

---

## 1. Hướng Dẫn Build & Kiểm Thử Full Luồng (Quick Start)

Từ thư mục gốc của dự án, bạn có thể thực hiện toàn bộ quy trình build và kiểm thử khép kín qua `make` hoặc `npm`:

### Bảng Lệnh Tiêu Chuẩn

| Tác vụ | Lệnh `make` | Lệnh `npm` | Chi tiết chức năng |
| :--- | :--- | :--- | :--- |
| **Build toàn bộ hệ thống** | `make build` | `npm run build` | Đóng gói 3 web dist, tự cấu hình Android `local.properties`, xuất `build_manifest.json` |
| **Kiểm tra cú pháp (Lint)** | `make lint` | `npm run lint` | Kiểm tra cú pháp 100% JS, Tests, Build tools |
| **Chạy 99 bài test tự động** | `make test` | `npm test` | Chạy 15 test suites kiểm thử đơn vị, mobile platform, web manager, server |
| **Kiểm thử full luồng E2E** | `make e2e` | `npm run e2e` | Chạy kịch bản live E2E xuyên suốt 3 bên với server trực tiếp |
| **Quy trình tổng hợp chuẩn** | `make build && make test && make e2e` | `npm run build && npm test && npm run e2e` | Đóng gói, kiểm thử đơn vị và chạy live E2E toàn trình |
| **Khởi chạy Server Gateway** | `make start_server` | `npm start` | Khởi động Unified API Gateway tại cổng 3000 |

---

## 2. Chi Tiết Cơ Chế Build Hợp Nhất (Universal Build Engine)

Khi chạy `make build` hoặc `npm run build` ([tools/build_system.js](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/tools/build_system.js)):

1. **Đóng gói phân phối Web độc lập (`web_dist/`)**:
   - `source/passenger/web_dist/index.html` (54.5 KB): Giao diện đặt vé hành khách hoàn chỉnh.
   - `source/driver/web_dist/index.html` (25.7 KB): Giao diện buồng lái tài xế chiến thuật 60Hz.
   - `source/manager/web_dist/index.html` (33.1 KB): Trung tâm chỉ huy vận hành và radar đoàn xe.
   - Máy chủ API Gateway ưu tiên nạp trực tiếp các gói trong `web_dist/` khi truy cập `/passenger`, `/driver`, `/manager`.
2. **Cấu hình môi trường Android tự động**:
   - Tự động quét và nhận diện Android SDK tại `/home/david/Android/Sdk`.
   - Sinh file `local.properties` cho cả Passenger (`source/passenger/app/android/local.properties`) và Driver (`source/driver/app/android/local.properties`), xử lý triệt để lỗi dừng build của Gradle khi thiếu `flutter.sdk`.
3. **Kê khai Build (`build_manifest.json`)**:
   - Ghi lại định danh phiên bản, thời điểm build, kích thước file và mã băm SHA-256 của từng thành phần.

---

## 3. Kịch Bản Kiểm Thử Full Luồng (Live End-to-End Flow)

Khi chạy `make e2e` hoặc `npm run e2e` ([test/e2e_live_flow.js](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/test/e2e_live_flow.js)), hệ thống tự khởi động server API trên `http://localhost:3000` và kiểm tra chuỗi 6 bước liên thông thực tế:

1. **System Healthcheck**: Kiểm tra sức khỏe hệ thống và 5 core microservices (`UP`).
2. **Passenger Booking Journey**: Handshake app version, tìm bến xe fuzzy, tìm chuyến xe, hiển thị sơ đồ ghế VIP 2D, khóa ghế 10 phút, tạo đơn hàng booking (PNR).
3. **Napas247 / VietQR Payment Settlement**: Giả lập IPN Webhook thanh toán thành công, đối soát tự động và phát hành vé điện tử.
4. **Passenger Ticket Wallet & Dynamic HMAC QR**: Nạp vé vào ví, sinh mã QR HMAC động xoay mã mỗi 30 giây bảo mật cao.
5. **Driver Tactical Cockpit**: Đăng nhập tài xế, xem lịch trình hôm nay, hoàn thành kiểm tra an toàn 6 điểm, bắt đầu chuyến xe (`IN_TRANSIT`), quét QR camera đón khách (đồng bộ đổi trạng thái vé), truyền dữ liệu GPS Telemetry 1Hz.
6. **Manager Operations Control Center**: Đăng nhập quản lý, giám sát KPI đoàn xe & tỷ lệ lấp đầy, theo dõi bản đồ radar hạm đội 60Hz, xuất vé quầy POS hotline, xem báo cáo doanh thu và tỷ lệ đúng giờ OTP.

---

## 4. Quản Lý Phân Hệ Di Động & Web (Flutter Monorepos)

```bash
# Passenger App (Flutter / Melos):
make client_bootstrap     # Cài đặt và liên kết Monorepo
make client_sync          # Sinh mã đa ngôn ngữ và build_runner
make client_build_dev     # Build file APK Develop với dart-defines
make client_build_prod    # Build file APK Production

# Driver Cockpit App (Flutter / Melos):
make driver_bootstrap     # Cài đặt và liên kết Monorepo
make driver_sync          # Sinh mã buồng lái
make driver_build_dev     # Build file APK buồng lái Develop
make driver_build_prod    # Build file APK buồng lái Production

# Manager Web App (Flutter Web / Melos):
make manager_bootstrap    # Cài đặt và liên kết Monorepo
make manager_sync         # Sinh mã Manager Web
make manager_run_web      # Chạy Manager Web trực tiếp trên Chrome
make manager_build_dev    # Build web phân phối Develop
make manager_build_prod   # Build web phân phối Production
```

---

## 5. Cổng Web Trực Tiếp Khi Server Đang Chạy

Khởi động máy chủ bằng `make start_server` hoặc `npm start`:
- 📱 Web Hành khách: [http://localhost:3000/passenger](http://localhost:3000/passenger)
- 🚌 Buồng lái Tài xế: [http://localhost:3000/driver](http://localhost:3000/driver)
- 🖥️ Trung tâm Điều hành: [http://localhost:3000/manager](http://localhost:3000/manager)
- 🩺 Kiểm tra sức khỏe hệ thống: [http://localhost:3000/health](http://localhost:3000/health)
- 📑 Tài liệu OpenAPI Spec: [http://localhost:3000/api/v1/openapi.json](http://localhost:3000/api/v1/openapi.json)

---

## 6. Tài Liệu Kỹ Thuật Tham Khảo

- 📖 [Tài Liệu Chi Tiết Trạng Thái Hệ Thống (STATE.md)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/STATE.md)
- 📋 [Báo Cáo Kiểm Thử & Walkthrough Thực Nghiệm (walkthrough.md)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/walkthrough.md)
- 📱 [Hướng Dẫn Phân Hệ Hành Khách (source/passenger/README.md)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/source/passenger/README.md)
- 🚌 [Hướng Dẫn Phân Hệ Tài Xế (source/driver/README.md)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/source/driver/README.md)
- 🖥️ [Hướng Dẫn Phân Hệ Quản Lý (source/manager/README.md)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/source/manager/README.md)
