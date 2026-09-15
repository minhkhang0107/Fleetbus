# Kế Hoạch Hiện Thực Hóa Thay Đổi Spec (Spec Changes Implementation Plan)

## 1. Bối cảnh & Mục tiêu (Context & Objectives)
Sau phiên thẩm định thiết kế hướng người dùng thực tế (User-Centric Spec Review), 7 điểm cải tiến cốt lõi (`REV-01` đến `REV-07`) đã được chuẩn hóa vào hệ thống đặc tả `screen-spec/` và Governance Open Questions (`OQ-009` đến `OQ-015`).

Kế hoạch này vạch ra các bước cụ thể để cập nhật mã nguồn (Backend Services, Crypto Engine, API Gateway, và Test Suites) nhằm đáp ứng 100% các yêu cầu nghiệp vụ mới mà không gây breaking change đến hệ thống hiện tại.

---

## 2. Danh Mục Các Hạng Mục Cải Tiến Nghiệp Vụ

| Mã | Phạm Vi | Màn Hình Liên Quan | Mô Tả Thay Đổi Nghiệp Vụ |
| :--- | :--- | :--- | :--- |
| **REV-01** | Passenger / Core | `PAX-017`, `PAX-016` | Hỗ trợ vé đoàn: QR tổng (Group Boarding QR), Carousel chuyển vé, tính năng chia sẻ/ủy quyền vé qua SMS kèm mã PIN 6 số offline. |
| **REV-02** | Passenger / Pay | `PAX-013`, `PAX-014` | Tăng cường độ tin cậy thanh toán: Tự động poll trạng thái khi quay lại app (3s fallback) + nút bấm thủ công "Tôi đã chuyển tiền". |
| **REV-03** | Core / Driver | `DRI-009`, `cryptoEngine` | Đồng bộ cấu trúc QR: Tăng độ trễ cho phép lên $\pm 2$ chu kỳ ($\pm 60\text{s}$), hỗ trợ payload JSON chữ ký tĩnh offline và kiểm tra mã PIN 6 số. |
| **REV-04** | Driver / COD | `DRI-012`, `DRI-017` | Xử lý thối tiền lẻ khi phụ xe thiếu tiền: Ghi nhận biên lai nợ tiền thừa nhận tại trạm dừng nghỉ (`REST_STOP_DEBT_RECEIPT`) hoặc hoàn vào ví BusGo (`WALLET_CREDIT`). |
| **REV-05** | Driver / Ops | `DRI-006`, `DRI-007` | Đón khách vẫy dọc đường (`Onboard Hail Passenger`): Cho phép tài xế chọn ghế trống, tạo vé lên xe ngay lập tức và thu tiền mặt. |
| **REV-06** | Manager / POS | `MGR-020` | Cơ chế giữ chỗ qua Tổng đài/Hotline với thời hạn linh hoạt: Giữ đến trước giờ xuất bến `T - 30 phút` hoặc thời gian tùy chỉnh, tự động nhả ghế khi hết hạn. |
| **REV-07** | Passenger / Track | `PAX-018`, `PAX-019` | Chỉ báo trạng thái GPS mất sóng/cũ quá 60s và hiển thị trạng thái dừng nghỉ kèm thời gian dự kiến tiếp tục hành trình. |

---

## 3. Kế Hoạch Thực Hiện Theo Giai Đoạn (Phased Execution Tasks)

### Giai Đoạn 1: Nâng Cấp Crypto Engine & Xác Thực Vé Đa Phương Thức (REV-01, REV-03)
- **Tập tin:** `source/server/services/passenger/core/cryptoEngine.js`
- **Nhiệm vụ 1.1:**
  - Cập nhật `verifyDynamicTicketQR`: Mở rộng độ trễ `Math.abs(currentWindow - scannedWindow) <= 2` ($\pm 60\text{s}$ drift window tolerance).
  - Thêm `generateGroupBoardingQR(tickets, secretKey, timestampMs)` và hàm xác thực `verifyGroupBoardingQR`.
  - Thêm `generateOfflineSignedTicket(ticket, secretKey)` và `verifyOfflineSignedTicket(payload, secretKey)`.
  - Thêm tiện ích tạo và xác thực mã PIN 6 chữ số offline: `generateTicketPin(ticketId, secretKey)` và `verifyTicketPin(ticketId, pin, secretKey)`.
- **Nhiệm vụ 1.2:** Cập nhật kiểm thử `test/passenger/core.test.js` để bao quát:
  - Kiểm tra độ trễ QR 60s.
  - Xác thực vé nhóm QR.
  - Xác thực mã PIN offline 6 số.

### Giai Đoạn 2: Thanh Toán Linh Hoạt, Chia Sẻ Vé & Telemetry Trạm Dừng (REV-01, REV-02, REV-07)
- **Tập tin:**
  - `source/server/services/passenger/modules/payment.js`
  - `source/server/services/passenger/modules/tracking.js`
- **Nhiệm vụ 2.1:**
  - Thêm phương thức `checkPaymentStatus(orderId, { manualTrigger })` cho phép xác nhận ngay lập tức khi khách nhấn "Tôi đã chuyển tiền".
  - Thêm phương thức `getGroupBoardingPass(orderIdOrPnr, mockNow)` xuất QR gộp cho toàn bộ vé trong đơn hàng.
  - Thêm phương thức `delegateTicket(ticketId, { delegateToPhone, delegateToName })` tạo mã chia sẻ và mã PIN 6 số gửi cho người đi cùng.
- **Nhiệm vụ 2.2:**
  - Cập nhật `getLiveTrackingHUD` trong `tracking.js` để phát hiện dữ liệu GPS bị cũ (> 60s) và trả về cảnh báo `is_stale: true`, `stale_warning`.
  - Hỗ trợ trạng thái dừng nghỉ `is_at_rest_stop: true`, kèm tên trạm dừng và thời gian nghỉ dự kiến (`estimated_rest_minutes`).
- **Nhiệm vụ 2.3:** Bổ sung unit tests trong `test/passenger/payment.test.js` và `test/passenger/tracking.test.js`.

### Giai Đoạn 3: Driver Cockpit: Xử Lý Tiền Thừa COD & Đón Khách Dọc Đường (REV-04, REV-05)
- **Tập tin:** `source/server/services/driver/modules/driverService.js`
- **Nhiệm vụ 3.1:**
  - Cập nhật `collectCod(tripId, ticketId, { amount_collected_vnd, fare_amount_vnd, change_settlement_method })`:
    - Hỗ trợ 3 hình thức: `CASH_RETURNED`, `REST_STOP_DEBT_RECEIPT`, `WALLET_CREDIT`.
    - Tự động sinh mã biên lai nợ tiền thừa `DR-XXXX-XXK` khi chọn `REST_STOP_DEBT_RECEIPT`.
  - Thêm phương thức `onboardHailPassenger(tripId, data, mockNow)`:
    - Kiểm tra ghế trống trên chuyến xe.
    - Tạo vé mới với trạng thái `BOARDED`, `Payment` ghi nhận `SUCCESS` (thu tiền mặt tại chỗ).
    - Cập nhật sĩ số xe và doanh thu ca trực của tài xế.
  - Cập nhật `boardPassengerByQR(tripId, qrOrPin, mockNow)`:
    - Hỗ trợ quét vé đơn TOTP ($\pm 2$ window).
    - Hỗ trợ quét vé đoàn (Group QR) và tự động cho toàn bộ hành khách trong nhóm lên xe.
    - Hỗ trợ nhập thủ công mã PIN 6 số khi máy hành khách hết pin / vỡ màn hình.
- **Nhiệm vụ 3.2:** Bổ sung kiểm thử trong `test/driver/driver.test.js`.

### Giai Đoạn 4: Manager Operations: Giữ Chỗ Hotline Linh Hoạt (REV-06)
- **Tập tin:** `source/server/services/manager/modules/managerService.js`
- **Nhiệm vụ 4.1:**
  - Thêm phương thức `createHotlineHold({ tripId, passengerName, phone, seatCodes, holdPolicy, departureOffsetMinutes, customExpiryMinutes, notes, agentStaffId })`.
  - Tính toán chính xác thời hạn `hold_until` theo chính sách `UNTIL_DEPARTURE_OFFSET` (trước giờ xe chạy $T - 30$ phút) hoặc `CUSTOM_EXPIRY_MINUTES`.
  - Thêm hàm dọn dẹp / nhả ghế tự động `releaseExpiredHotlineHolds(mockNow)`.
- **Nhiệm vụ 4.2:** Bổ sung kiểm thử trong `test/manager/manager.test.js`.

### Giai Đoạn 5: Đấu Nối API Gateway & Kiểm Thử Toàn Diện (End-to-End Verification)
- **Tập tin:**
  - `source/server/services/passenger/server.js`
  - `source/server/services/api_gateway.js`
- **Nhiệm vụ 5.1:** Đấu nối các REST endpoints:
  - `POST /api/v1/passenger/payments/:orderId/verify-status`
  - `GET /api/v1/passenger/orders/:orderId/group-qr`
  - `POST /api/v1/passenger/tickets/:ticketId/delegate`
  - `POST /api/v1/driver/trips/:tripId/onboard-hail`
  - `POST /api/v1/ops/pos/hotline-hold`
- **Nhiệm vụ 5.2:** Chạy kiểm thử toàn hệ thống:
  - `npm test` (Tất cả unit & integration tests)
  - `npm run lint` (Kiểm tra cú pháp)
  - `npm run build` (Biên dịch toàn diện)
  - `npm run e2e` (Kiểm thử toàn trình)
