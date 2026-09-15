# FLOW-01: Đặt Vé, Giữ Chỗ & Thanh Toán VietQR Tức Thì (Instant Booking & Settlement)

**Mã tài liệu:** `FLOW-01`  
**Phiên bản:** 1.0  
**Liên kết màn hình:** [PAX-009](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-009-seat-selection.md), [PAX-010](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-010-seat-hold-timer.md), [PAX-012](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-012-payment-methods.md), [PAX-013](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-013-vietqr-transfer.md), [PAX-014](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-014-payment-success.md), [MGR-013](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-013-seat-inventory-matrix.md), [MGR-017](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-017-booking-management.md)

---

## 1. Mục Tiêu & Mô Tả Nghiệp Vụ

Luồng cho phép hành khách chọn ghế trên sơ đồ xe 2 tầng, hệ thống khóa giữ chỗ bằng Redis Distributed Lock trong thời gian đếm ngược 10 phút, tạo mã VietQR động chuẩn EMVCo kèm mã tham chiếu độc nhất (`REF-{bookingId}`). Khi người dùng chuyển khoản qua ứng dụng Mobile Banking, cổng thanh toán bắn Webhook IPN về Backend, hệ thống kích hoạt xác nhận thanh toán tức thì (< 1.5s), tự động xuất vé điện tử và đồng bộ sơ đồ ghế thời gian thực sang Manager Operations Portal và Driver Tactical Cockpit.

---

## 2. Sơ Đồ Trình Tự Tương Tác (Mermaid Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor PAX as 📱 Khách Hàng (Passenger App)
    participant GW as ⚙️ API Gateway / Redis Lock
    participant DB as 🗄️ PostgreSQL Database
    participant WS as ⚡ WebSocket Event Bus
    actor BANK as 🏦 Ngân Hàng / App Banking
    actor MGR as 🖥️ Điều Hành (Manager Portal)
    actor DRI as 🚍 Tài Xế (Driver Cockpit)

    %% 1. Chọn ghế và Giữ chỗ
    Note over PAX,GW: 1. Giai đoạn chọn ghế & Giữ chỗ 10 phút (Locking)
    PAX->>GW: POST /api/v1/passenger/bookings/hold<br/>{tripId, seatNumbers: ["A01", "A02"], passengerId}
    activate GW
    GW->>GW: Redis SETNX lock:seat:TRIP101:A01 EX 600
    alt Ghế đã bị người khác chọn
        GW-->>PAX: 409 Conflict {error: "SEAT_ALREADY_HELD"}
    else Khóa thành công
        GW->>DB: INSERT INTO bookings (status: 'HELD', expire_at: NOW() + 10m)
        GW->>WS: Broadcast room "trip:TRIP101" event: "seat_status_changed"<br/>{seats: ["A01", "A02"], status: "HOLDING"}
        WS-->>MGR: Cập nhật ma trận ghế MGR-013 (Màu vàng đếm ngược)
        WS-->>DRI: Cập nhật danh sách ghế chặng DRI-007
        GW-->>PAX: 200 OK {bookingId: "BKG-789", expireAt: 1726416000, ttlSeconds: 600}
    end
    deactivate GW

    %% 2. Tạo mã VietQR
    Note over PAX,GW: 2. Phát sinh mã thanh toán VietQR EMVCo
    PAX->>GW: POST /api/v1/passenger/bookings/BKG-789/vietqr
    activate GW
    GW-->>PAX: 200 OK {qrData: "00020101021238580010A000000727...", amount: 480000, transferContent: "BUSGO BKG789"}
    deactivate GW

    %% 3. Thanh toán qua Ngân hàng
    Note over PAX,BANK: 3. Khách quét QR trên App Ngân Hàng (Napas247)
    PAX->>BANK: Quét mã QR & Xác thực sinh trắc học FaceID / OTP
    BANK->>BANK: Xử lý trừ tiền tài khoản & chuyển Napas247

    %% 4. Webhook IPN & Tức Thì Đồng Bộ
    Note over BANK,GW: 4. Ngân hàng gửi Webhook IPN về Gateway
    BANK->>GW: POST /api/v1/webhooks/vietqr-ipn<br/>{reference: "BKG789", amount: 480000, transId: "NAPAS998822"}
    activate GW
    GW->>GW: Kiểm tra Idempotency & Đối soát số tiền
    GW->>DB: UPDATE bookings SET status='CONFIRMED', payment_status='PAID'
    GW->>DB: INSERT INTO tickets (ticketId, qr_payload, status='ISSUED')
    GW->>WS: Emit to user "booking:BKG-789" event: "payment_confirmed"<br/>{bookingId: "BKG-789", tickets: [...]}
    GW->>WS: Broadcast room "trip:TRIP101" event: "seat_status_changed"<br/>{seats: ["A01", "A02"], status: "CONFIRMED"}
    GW-->>BANK: 200 OK {status: "SUCCESS"}
    deactivate GW

    %% 5. Giao diện người dùng cập nhật
    WS-->>PAX: Màn hình PAX-013 tự chuyển sang PAX-014 (Vé Điện Tử Kèm QR)
    WS-->>MGR: Màn hình MGR-013 chuyển ghế A01, A02 sang Đỏ (Đã bán)
    WS-->>DRI: Màn hình DRI-007 thêm 2 hành khách vào danh sách đón
```

---

## 3. Các Điểm Kiểm Soát & Xử Lý Ngoại Lệ (Exception & Failure Handling)

| Tình huống ngoại lệ | Cơ chế xử lý kỹ thuật | Trạng thái hiển thị giao diện |
| :--- | :--- | :--- |
| **Hết hạn 10 phút chưa thanh toán** | Redis TTL Key Expired → Scheduler bắn worker xóa booking `HELD` → Giải phóng ghế. | PAX-010 hiển thị popup hết giờ, MGR-013 trả ghế về màu Xanh (Trống). |
| **Khách chuyển thiếu tiền** | Webhook ghi nhận `PARTIALLY_PAID`, gửi tin nhắn SMS cảnh báo bổ sung kèm link thanh toán. | PAX-013 hiển thị cảnh báo: "Đã nhận 400.000đ / 480.000đ. Vui lòng chuyển thêm 80.000đ". |
| **Khách chuyển thừa tiền** | Webhook ghi nhận `OVERPAID`, hệ thống xác nhận vé và ghi có số tiền thừa vào số dư ví hoàn tự động. | MGR-017 cảnh báo gắn tag `CẦN_HOÀN_TIỀN_THỪA`. |
| **Webhook trễ / Mất mạng ngân hàng** | Khách nhấn "Tôi đã chuyển tiền" trên PAX-013 → Gọi `GET /api/v1/passenger/bookings/:id/verify-payment` để cưỡng bức truy vấn API ngân hàng. | Spinner quay kiểm tra trực tiếp trạng thái lệnh Napas. |
