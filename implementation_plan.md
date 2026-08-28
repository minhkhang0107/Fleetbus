# Implementation Plan: FleetBus (BusGo) UI & System SRS Alignment via StitchMCP

Dựa trên tài liệu đặc tả tổng hợp master [bus_booking_tracking_system_spec.md](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/docs/specs/bus_booking_tracking_system_spec.md) và thiết kế hệ thống [DESIGN.md](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/docs/design/DESIGN.md), kế hoạch này quy định việc thiết kế, kiểm thử và review 13 màn hình UI giao diện qua StitchMCP.

---

## 1. Danh Mục Màn Hình & Ánh Xạ Chức Năng SRS (`bus_booking_tracking_system_spec.md`)

### 1.1. Passenger Mobile Application (Light Canvas `#F8FAFC`, Sapphire `#2563EB`)
- **F-PAS-01**: Xác thực OTP & Hồ sơ / Danh bạ người đi hộ → `PASS-01` (`b4415c98...`)
- **F-PAS-02**: Tìm kiếm Chuyến & Lọc Chặng phụ (Sub-routes) → `PASS-02` (`0eeb6c65...`)
- **F-PAS-03**: Sơ đồ Ghế Đa tầng Realtime & Redis Lock 10 Phút → `PASS-03` (`ef45253f...`)
- **F-PAS-04**: Thanh toán VietQR Dynamic & Dynamic QR Ticket HMAC → `PASS-04` (`73f0552d...`)
- **F-PAS-05**: Theo dõi Live GPS Telemetry, Speed & Geofencing ETA HUD → `PASS-05` (`be48f147...`)

### 1.2. Driver Mobile Application (Tactical Dark Cockpit `#0F172A`)
- **F-DRI-01**: Đăng nhập Ca chạy & Lịch trình chuyến xe được gán → `DRV-01` (`bbcad1d6...`)
- **F-DRI-02**: Manifest Đón/Trả, Masked Phone Call & Camera QR Scanner → `DRV-02` (`903ccc77...`)
- **F-DRI-03/04**: GPS Telemetry Engine (3s/15m), Offline Buffer & Navigation HUD → `DRV-03` (`6ebf3efa...`)

### 1.3. Admin Web CMS Portal (ATC GIS Operations Radar - Asymmetric Desktop Layout)
- **F-ADM-01**: Visual Drag-and-Drop Seat Layout Builder đa tầng → `ADM-01` (`24d4cfaf...`)
- **F-ADM-02**: Quản trị Tuyến đường, Trạm dừng & PostGIS Point Geometry → `ADM-02` (`9002fe15...`)
- **F-ADM-03**: Trip Dispatching, Gán Xe/Tài xế & Bảng giá chặng linh hoạt → `ADM-03` (`92208eff...`)
- **F-ADM-04**: GIS Live Operations Radar (Cảnh báo lệch tuyến >500m, dừng quá 20m) → `ADM-04` (`0d4217c3...`)
- **F-ADM-05**: Phòng vé POS Hotline & Điều phối Khẩn cấp / Đổi vé → `ADM-05` (`21f08db7...`)

---

## 2. Quy Chuẩn Review & Tiêu Chí Kiểm Thu

### 2.1. Đơn vị Dữ liệu Realtime & Monospace Engine
- **Mã PNR**: Chuỗi 6-8 ký tự in hoa (ví dụ: `FB9821`), hiển thị bằng font `JetBrains Mono`.
- **Biển số phương tiện**: Chuẩn biển số Việt Nam (ví dụ: `29B-123.45`), hiển thị `JetBrains Mono`.
- **Thời gian đếm ngược (Seat Lock 10m)**: Định dạng `MM:SS` (ví dụ: `09:58`), nhấp nháy khi còn < 60s.
- **Telemetry GPS**: Tốc độ `58.2 km/h`, Khoảng cách `8.5 km`, Tọa độ Lat/Lng hiển thị `JetBrains Mono`.

### 2.2. Kiểm Tra Strict Anti-Patterns (`DESIGN.md`)
- ❌ Không dùng font `Inter` hay font serif tự do.
- ❌ Không dùng màu đen thuần `#000000`.
- ❌ Không dùng Emojis (Bắt buộc 100% SVG Icons).
- ❌ Không dùng hiệu ứng Neon Outer Glow hay gradient tím/xanh AI.

---

## 3. Kế Hoạch Xác Nhận & Đánh Giá (Verification Plan)

### Kiểm Tra Cấu Trúc Code HTML/CSS:
1. Đọc mã HTML từng màn hình trong Stitch Project `13555615882856172226` qua StitchMCP.
2. Kiểm tra `tailwind.config` cho việc load đúng `Geist` và `JetBrains Mono`.
3. Kiểm tra các class Tailwind như `bg-canvas-ops`, `bg-surface-dark`, `text-pnr-orange`, `text-alert-crimson`.

### Báo Cáo Đánh Giá Tổng Hợp:
- Cập nhật toàn bộ kết quả audit chi tiết vào [walkthrough.md](file:///home/david/.gemini/antigravity-ide/brain/2262b68b-3c19-4bfa-a0bc-a6a5971cef80/walkthrough.md).
