# FLOW-05: Giữ Chỗ Qua Hotline & Tự Động Thu Hồi Ghế (Hotline Seat Hold & Auto-Release)

**Mã tài liệu:** `FLOW-05`  
**Phiên bản:** 1.0  
**Liên kết màn hình:** [MGR-020](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-020-hotline-booking-modal.md), [MGR-013](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-013-seat-inventory-matrix.md), [MGR-017](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-017-booking-management.md), [PAX-009](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-009-seat-selection.md), [DRI-007](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-007-passenger-manifest-route.md)

---

## 1. Mục Tiêu & Mô Tả Nghiệp Vụ

Một lượng lớn khách hàng quen hoặc người lớn tuổi đặt vé thông qua Tổng đài Hotline của nhà xe (Call Center).
Đặc thù của đặt vé qua điện thoại:
1. **Khách xin giữ chỗ nhưng chưa thanh toán ngay**: Nhà xe cam kết giữ ghế đến trước giờ xe xuất bến 2 tiếng (hoặc theo hạn nộp tiền do tổng đài viên thiết lập: 30 phút, 2 tiếng, 24 tiếng).
2. **Nguy cơ bỏ bom vé (Ghost Booking)**: Nếu khách đổi ý không đi mà không gọi báo hủy, ghế đó sẽ bị khóa lãng phí, khiến khách trên mạng hoặc khách tại quầy không mua được.

Hệ thống cung cấp giải pháp **Giữ Chỗ Hotline Có Thời Gian Sống (Hotline Hold TTL) & Tự Động Thu Hồi**:
- Tổng đài viên thao tác giữ ghế trên modal `MGR-020`, thiết lập thời gian hết hạn (`expireAt`).
- Hệ thống gửi tin nhắn SMS / Zalo ZNS kèm đường link thanh toán trực tuyến VietQR cho hành khách.
- Một Background Scheduler (Cron Worker) chạy định kỳ mỗi 60 giây kiểm tra các đơn hàng hotline quá hạn.
- Nếu quá hạn mà khách chưa thanh toán: Đơn tự động hủy, ghế tự động mở lại trạng thái "Trống" trên toàn hệ thống thời gian thực.

---

## 2. Sơ Đồ Trình Tự Tương Tác (Mermaid Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor CALLER as 📞 Khách Gọi Hotline
    actor OPR as 🎧 Tổng Đài Viên (MGR-020)
    participant GW as ⚙️ API Gateway
    participant DB as 🗄️ PostgreSQL Database
    participant CRON as ⏰ Scheduler Worker (Cron/BullMQ)
    participant WS as ⚡ WebSocket Event Bus
    actor ONLINE as 📱 Khách Đặt Online (PAX-009)
    actor DRI as 🚍 Tài Xế (DRI-007)

    %% 1. Tiếp nhận cuộc gọi & Giữ chỗ
    Note over CALLER,OPR: 1. Khách gọi Hotline đặt vé xe về quê
    CALLER->>OPR: "Giúp tôi giữ 2 ghế A08, A09 chuyến 19:00 tối nay"
    OPR->>OPR: Mở MGR-020: Nhập SĐT, Họ tên khách, chọn 2 ghế A08, A09
    OPR->>OPR: Đặt thời hạn giữ chỗ: "Đến 17:00 (Trước 2 tiếng)"
    OPR->>GW: POST /api/v1/ops/bookings/hotline-hold<br/>{tripId: "TRIP101", seats: ["A08", "A09"], phone: "0912345678", holdUntil: "2026-09-15T17:00:00Z"}
    activate GW
    GW->>DB: INSERT INTO bookings (type='HOTLINE_HOLD', status='HELD', expire_at='2026-09-15T17:00:00Z')
    GW->>WS: Broadcast event: "seat_status_changed"<br/>{seats: ["A08", "A09"], status: "HOTLINE_HOLD", expireAt: "17:00"}
    GW-->>OPR: 200 OK {bookingId: "HOT-55", paymentUrl: "https://busgo.vn/pay/HOT-55"}
    deactivate GW
    
    %% Thông báo SMS & Hiển thị trạng thái
    WS-->>ONLINE: Ghế A08, A09 chuyển sang màu Cam (Giữ chỗ Tổng đài - Không thể chọn)
    WS-->>DRI: Sơ đồ xe DRI-007 ghi chú "Ghế A08, A09: Giữ chỗ Hotline đến 17h"
    GW->>CALLER: Bắn tin nhắn SMS Brandname: "BusGo: Quý khách đã giữ ghế A08, A09. Vui lòng thanh toán trước 17:00 tại: busgo.vn/pay/HOT-55"

    %% 2. Quá hạn thanh toán & Tự động thu hồi ghế
    Note over CRON,WS: 2. Đến 17:01 - Khách không thanh toán -> Tự động thu hồi ghế
    CRON->>DB: SELECT * FROM bookings WHERE type='HOTLINE_HOLD' AND status='HELD' AND expire_at <= NOW()
    activate CRON
    DB-->>CRON: Trả về booking HOT-55 (Quá hạn 1 phút)
    CRON->>DB: UPDATE bookings SET status='AUTO_EXPIRED_CANCELLED' WHERE id='HOT-55'
    CRON->>WS: Broadcast event: "seat_status_changed"<br/>{seats: ["A08", "A09"], status: "AVAILABLE", reason: "HOTLINE_EXPIRED"}
    deactivate CRON

    %% 3. Tức thì mở bán lại cho cộng đồng
    Note over WS,DRI: 3. Giải phóng ghế tức thì cho hành khách khác
    par Cập nhật Khách Online
        WS-->>ONLINE: Ghế A08, A09 lập tức đổi từ Cam sang Xanh Lá Cây (Trống)
        ONLINE->>ONLINE: Khách khác có thể nhấn chọn mua ngay lập tức!
    and Cập nhật Bảng Điều Hành
        WS-->>OPR: MGR-013 chuyển ghế về Xanh, xóa tag giữ chỗ
    and Cập nhật Tài Xế
        WS-->>DRI: DRI-007 xóa tên khách khỏi danh sách chờ đón
    end
```

---

## 3. Chính Sách Nghiệp Vụ Chống Lạm Dụng Giữ Chỗ

1. **Giới hạn số ghế / SĐT**: Mỗi số điện thoại gọi hotline chỉ được giữ tối đa 4 ghế cùng lúc nếu chưa có tiền cọc.
2. **Danh sách đen (Blacklist Ghost Callers)**: Nếu một số điện thoại có 3 lần giữ chỗ hotline để tự động hết hạn mà không đi trong vòng 30 ngày, hệ thống sẽ tự động hạ mức ưu tiên và yêu cầu chuyển khoản 100% trước khi cho phép giữ chỗ tiếp theo.
3. **Cảnh báo trước khi hết hạn (Pre-expiry Reminder)**: Trước thời điểm hủy ghế 15 phút, hệ thống tự động bắn 1 thông báo Zalo ZNS / SMS nhắc nhở hành khách thanh toán.
