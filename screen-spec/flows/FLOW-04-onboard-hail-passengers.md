# FLOW-04: Đón Khách Vẫy Dọc Đường & Khóa Ghế Thời Gian Thực (Onboard Hail Passengers)

**Mã tài liệu:** `FLOW-04`  
**Phiên bản:** 1.0  
**Liên kết màn hình:** [DRI-006](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-006-driving-hud-route.md), [DRI-007](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-007-passenger-manifest-route.md), [PAX-009](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-009-seat-selection.md), [MGR-013](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-013-seat-inventory-matrix.md), [MGR-017](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-017-booking-management.md)

---

## 1. Mục Tiêu & Mô Tả Nghiệp Vụ

Trong hành trình xe khách chạy liên tỉnh, tài xế thường xuyên bắt gặp khách vẫy dọc quốc lộ hoặc các nút giao đường gom cao tốc. 
Thách thức lớn nhất là:
1. **Xung đột ghế (Seat Collision)**: Nếu khách vẫy bước lên xe ngồi vào ghế B05, nhưng cùng lúc đó một hành khách ở chặng kế tiếp đang mở ứng dụng Passenger App để đặt online ghế B05. Nếu không khóa tức thì, sẽ xảy ra tình huống "1 ghế bán 2 người".
2. **Thao tác lái xe nhanh (< 5 giây)**: Tài xế hoặc phụ xe chỉ có vài giây để chọn ghế trống, xác nhận chặng xuống và thu tiền mà không làm gián đoạn hành trình.

Giải pháp:
- Phụ xe mở sơ đồ ghế trực quan trên `DRI-007`. Các ghế trống được tô màu xanh lá cây kèm số tiền chặng tương ứng.
- Chạm vào ghế trống -> Nhấn "Đón khách vẫy" -> Hệ thống lập tức bắn Distributed Lock lên Redis và phát sóng WebSocket tới toàn bộ máy khách đang xem sơ đồ ghế chuyến đó.
- Ghế lập tức đổi sang màu Đỏ (Đã bán) trên App của hành khách trực tuyến và bảng điều hành Manager.

---

## 2. Sơ Đồ Trình Tự Tương Tác (Mermaid Sequence Diagram)

> [!TIP]
> **Tùy chọn tải & xem bản vẽ UML:** [Xem ảnh Vector SVG](./images/FLOW-04-onboard-hail-passengers.svg) | [Xem ảnh PNG HD](./images/FLOW-04-onboard-hail-passengers.png)

![UML Sequence Diagram FLOW-04](./images/FLOW-04-onboard-hail-passengers.svg)

```mermaid
sequenceDiagram
    autonumber
    actor HAIL as 🚶 Khách Vẫy Dọc Đường
    actor DRI as 🚍 Phụ Xe / Tài Xế (DRI-007)
    participant GW as ⚙️ API Gateway & Redis Lock
    participant DB as 🗄️ Database
    participant WS as ⚡ WebSocket Event Bus
    actor ONLINE as 📱 Khách Đang Đặt Online (PAX-009)
    actor MGR as 🖥️ Điều Hành Viên (MGR-013)

    %% Khách vẫy lên xe
    Note over HAIL,DRI: 1. Khách vẫy xe tại Nút giao QL1A
    HAIL->>DRI: Bước lên xe, xin đi về "Thị trấn Phủ Lý"
    DRI->>DRI: Mở màn hình DRI-007 -> Chạm vào ghế B05 (Màu xanh - Ghế trống)
    DRI->>DRI: Chọn điểm xuống: "Phủ Lý" -> Giá chặng: 120.000đ -> Bấm "Xác Nhận Đón Nhanh"

    %% Gửi request lên Gateway
    Note over DRI,GW: 2. Kích hoạt khóa ghế & Tạo vé nhanh (< 300ms)
    DRI->>GW: POST /api/v1/driver/trips/TRIP101/hail-passengers<br/>{seatNumber: "B05", dropoffStop: "PHU_LY", fare: 120000, passengerName: "Khách Vẫy QL1A"}
    activate GW
    GW->>GW: Redis SETNX lock:seat:TRIP101:B05 (Tránh xung đột online)
    GW->>DB: INSERT INTO bookings (trip_id, seat_number, type='HAIL_PASSENGER', status='CONFIRMED')
    GW->>DB: INSERT INTO tickets (ticket_id: "TK-HAIL-99", status='BOARDED')
    GW->>WS: Broadcast room "trip:TRIP101" event: "seat_status_changed"<br/>{seat: "B05", status: "SOLD", by: "DRIVER_HAIL"}
    GW-->>DRI: 200 OK {ticketId: "TK-HAIL-99", seatNumber: "B05", fare: 120000}
    deactivate GW

    %% Đồng bộ tức thì tới các bên
    Note over WS,MGR: 3. Phát sóng thời gian thực chống xung đột ghế
    par Đến Khách Đang Chọn Ghế Online
        WS-->>ONLINE: Sự kiện "seat_status_changed": Ghế B05 lập tức hóa Đỏ (Đã bán)
        ONLINE->>ONLINE: Nếu khách đang bấm chọn B05 -> Bật popup: "Ghế vừa được mua bởi hành khách khác"
    and Đến Màn Hình Điều Hành Trạm
        WS-->>MGR: Cập nhật sơ đồ ghế MGR-013: Ghế B05 chuyển sang màu Tím (Khách vẫy dọc đường)
        MGR->>MGR: Doanh thu chuyến xe tự động nhảy thêm +120.000đ
    end

    %% Thu tiền và in vé nếu cần
    DRI->>HAIL: Thu 120.000đ tiền mặt, hướng dẫn khách vào ngồi ghế B05
```

---

## 3. Các Ràng Buộc & Tiêu Chí An Toàn

1. **Khóa phân tán nguyên tử (Atomic Redis Lock)**: Thao tác giữ ghế của tài xế sử dụng chung cơ chế Redis Lock với hành khách đặt online, bảo đảm không bao giờ xảy ra Race Condition.
2. **Khách vẫy không có số điện thoại**: Hệ thống tự sinh mã tham chiếu đại diện `HAIL-{HHmm}-{Seat}` để phụ xe không phải mất thời gian nhập liệu khi xe đang di chuyển.
3. **Phân biệt nguồn vé trên Báo cáo**: Doanh thu từ khách vẫy được gắn nhãn riêng `SOURCE: ONBOARD_HAIL` để quản lý kiểm tra đối chiếu tỷ lệ lấp đầy ghế và tính minh bạch của tổ lái xe.
