# FleetBus: Nền Tảng Đặt Vé & Điều Hành Xe Khách Trực Tuyến Thời Gian Thực

Hệ sinh thái công nghệ toàn diện phục vụ quản lý và vận hành nhà xe liên tỉnh, bao gồm 3 phân hệ ứng dụng độc lập kết nối qua cổng **Unified Node.js API Gateway**:

1. 📱 **Passenger App** (`source/client/`): Ứng dụng di động Flutter dành cho Hành khách (Đặt vé, chọn ghế 2D, thanh toán VietQR Napas247, ví vé xoay mã HMAC QR 30s, theo dõi GPS Radar HUD).
2. 🚌 **Driver App** (`source/driver/`): Ứng dụng di động Flutter buồng lái dành cho Tài xế (Điểm danh ca, kiểm tra an toàn 6 điểm, quét QR vé siêu tốc, thu hộ COD, truyền GPS Telemetry 3s/lần, xử lý ngoại tuyến).
3. 🖥️ **Manager Operations Center** (`source/manager-app/`): Cổng web điều hành thời gian thực dành cho Quản lý & Điều độ (Bản đồ radar hạm đội 60Hz, điều độ xe/tài xế, bán vé POS/Hotline, đổi xe khẩn cấp, báo cáo doanh thu & đúng giờ).
4. 🌐 **Unified API Gateway** (`source/server/`): Máy chủ Node.js REST API Server cung cấp dịch vụ tập trung và cổng thanh toán tự động IPN Webhook.

---

## 1. Hướng Dẫn Nhanh Bằng Make (Quick Start Cheat Sheet)

Từ thư mục gốc của dự án, bạn có thể thực hiện mọi tác vụ build và kiểm thử qua `make`:

```bash
# 1. Kiểm tra toàn bộ hệ thống (68 test suites)
make test

# 2. Khởi chạy máy chủ API Gateway (Port 3000)
make start_server

# 3. Kiểm thử chuỗi vận hành khép kín trực tiếp (Live E2E Flow)
make e2e

# 4. Quản lý ứng dụng Hành khách (Passenger App)
make client_bootstrap  # Cài đặt và liên kết Monorepo
make client_sync       # Sinh mã đa ngôn ngữ và build_runner
make client_build_dev  # Build file APK môi trường Develop
make client_build_prod # Build file APK môi trường Production

# 5. Quản lý ứng dụng Tài xế (Driver Cockpit App)
make driver_bootstrap  # Cài đặt và liên kết Monorepo
make driver_sync       # Sinh mã buồng lái
make driver_build_dev  # Build file APK buồng lái Develop
make driver_build_prod # Build file APK buồng lái Production
```

---

## 2. Hướng Dẫn Chi Tiết Từng Phân Hệ

- 📱 [Hướng Dẫn Build App Hành Khách (Passenger App README)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/source/client/README.md)
- 🚌 [Hướng Dẫn Build App Tài Xế (Driver App README)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/source/driver/README.md)
- 🖥️ [Hướng Dẫn Phân Hệ Quản Lý & Điều Hành (Manager Operations)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/source/manager-app/)
- 📖 [Tài Liệu Chi Tiết Trạng Thái Hệ Thống (STATE.md)](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/STATE.md)

---

## 3. Cổng Web Trực Tiếp Khi Server Đang Chạy

Khi khởi động máy chủ bằng `make start_server` hoặc `npm start`:
- 📱 Web Hành khách: [http://localhost:3000/passenger](http://localhost:3000/passenger)
- 🚌 Buồng lái Tài xế: [http://localhost:3000/driver](http://localhost:3000/driver)
- 🖥️ Trung tâm Điều hành: [http://localhost:3000/manager](http://localhost:3000/manager)
- 🩺 Kiểm tra sức khỏe hệ thống: [http://localhost:3000/health](http://localhost:3000/health)
- 📑 Tài liệu OpenAPI Spec: [http://localhost:3000/api/v1/openapi.json](http://localhost:3000/api/v1/openapi.json)
