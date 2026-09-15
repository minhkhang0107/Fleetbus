# FLOW-02: Xuất Vé QR & Soát Vé Đa Phương Thức (Multimodal Boarding & Verification)

**Mã tài liệu:** `FLOW-02`  
**Phiên bản:** 1.0  
**Liên kết màn hình:** [PAX-015](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-015-ticket-detail-qr.md), [PAX-016](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-016-trip-companion-hud.md), [DRI-008](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-008-boarding-manifest.md), [DRI-009](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-009-qr-scanner-hud.md), [DRI-010](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-010-manual-boarding-entry.md), [DRI-011](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-011-no-show-confirmation.md), [MGR-004](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-004-realtime-trip-detail.md)

---

## 1. Mục Tiêu & Mô Tả Nghiệp Vụ

Quy trình soát vé tại cửa xe là mắt xích quan trọng nhằm tối đa hóa tốc độ lên xe (< 2 giây/hành khách), ngăn chặn gian lận vé (chụp màn hình gửi cho người khác đi nhờ), đồng thời hỗ trợ vận hành liên tục ngay cả khi xe ở trong tầng hầm bến xe hoặc khu vực mất sóng di động hoàn toàn (0G/2G).

Hệ thống cung cấp 4 chế độ xác thực linh hoạt:
1. **Dynamic TOTP QR**: Mã QR tự làm mới mỗi 30 giây bằng chữ ký HMAC-SHA256, Gateway và Tablet chấp nhận sai số dung sai `+-2` bước thời gian (cửa sổ 90 giây) để khắc phục lệch đồng hồ thiết bị.
2. **Group QR (Vé nhóm)**: Một mã QR đại diện duy nhất cho nhóm 2–5 hành khách, tài xế quét 1 lần và chọn xác nhận toàn bộ hoặc từng người có mặt.
3. **Mã PIN 6 số ngoại tuyến (Offline PIN)**: Khi điện thoại khách hết pin hoặc màn hình nứt vỡ không quét được QR, tài xế nhập mã PIN in trên SMS/Zalo; tablet đối soát trực tiếp trong cơ sở dữ liệu SQLite cục bộ.
4. **Offline Sync**: Tất cả giao dịch soát vé offline được lưu vào hàng đợi SQLite Outbox và tự động đẩy lên máy chủ ngay khi có lại kết nối 4G/Wi-Fi.

---

## 2. Sơ Đồ Trình Tự Tương Tác (Mermaid Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor PAX as 📱 Hành Khách (Passenger App)
    actor DRI as 🚍 Phụ Xe / Tài Xế (Driver Tablet)
    participant LOC as 💾 Driver Local SQLite Cache
    participant GW as ⚙️ API Gateway Server
    participant WS as ⚡ WebSocket Event Bus
    actor MGR as 🖥️ Điều Hành Trung Tâm (Manager Portal)

    %% Giai đoạn tải dữ liệu trước chuyến đi
    Note over DRI,GW: 0. Chuẩn bị trước chuyến đi (Pre-trip Synchronization)
    DRI->>GW: GET /api/v1/driver/trips/TRIP101/manifest
    activate GW
    GW-->>DRI: 200 OK {tickets: [...], pinList: [...], publicKeys: [...]}
    deactivate GW
    DRI->>LOC: Lưu toàn bộ danh sách vé & mã hash PIN vào bảng local_manifest

    %% Chế độ 1: Dynamic QR Check-in
    Note over PAX,DRI: Chế độ 1: Quét Dynamic QR (Hành khách có mạng hoặc App đã lưu OTP)
    PAX->>PAX: Mở màn hình PAX-015: Sinh mã QR TOTP (cập nhật mỗi 30s)
    DRI->>DRI: Mở camera quét trên DRI-009 (Quét siêu tốc < 500ms)
    
    alt Xe có kết nối mạng (Online)
        DRI->>GW: POST /api/v1/driver/trips/TRIP101/boarding/scan<br/>{qrPayload: "BUSGO:TK101:1726416000:a8f9c...", method: "QR"}
        activate GW
        GW->>GW: Xác thực HMAC Signature & Cửa sổ thời gian (+-2 window)
        GW->>GW: Kiểm tra trạng thái vé (Tránh Double Check-in)
        GW-->>DRI: 200 OK {status: "BOARDED", passengerName: "Nguyễn Văn A", seat: "A01"}
        GW->>WS: Broadcast room "trip:TRIP101" event: "passenger_boarded"<br/>{ticketId: "TK101", seat: "A01", time: "14:30"}
        deactivate GW
    else Xe mất mạng (Offline 0G/2G)
        DRI->>LOC: Kiểm tra chữ ký cục bộ & mã vé TK101 trong local_manifest
        LOC-->>DRI: Hợp lệ -> Đánh dấu status='BOARDED_OFFLINE'
        DRI->>LOC: Ghi nhật ký vào local_outbox_queue (pending sync)
        DRI->>DRI: Phát âm thanh Ting! & Màn hình xanh báo "HỢP LỆ (NGOẠI TUYẾN)"
    end

    %% Chế độ 2: Mã PIN dự phòng
    Note over PAX,DRI: Chế độ 2: Điện thoại khách hết pin / Hỏng màn hình (PIN Fallback)
    PAX-->>DRI: Đọc mã PIN 6 số nhận qua SMS (VD: 829104)
    DRI->>DRI: Chuyển sang màn hình DRI-010 (Nhập PIN thủ công)
    DRI->>LOC: SELECT * FROM local_manifest WHERE pin_code='829104'
    LOC-->>DRI: Tìm thấy vé hợp lệ cho ghế B03 (Trần Thị B)
    DRI->>DRI: Chạm "Xác nhận lên xe" -> Cập nhật trạng thái

    %% Chế độ 3: Khách vắng mặt (No-Show)
    Note over DRI,MGR: Chế độ 3: Xử lý khách không đến (No-Show Workflow)
    DRI->>DRI: Đến giờ xuất bến, kiểm tra danh sách khách chưa lên trên DRI-008
    DRI->>DRI: Chọn khách ghế A05 -> Nhấn "Báo vắng mặt (No-show)" (DRI-011)
    DRI->>GW: POST /api/v1/driver/trips/TRIP101/tickets/TK105/no-show<br/>{reason: "GỌI_3_CUỘC_KHÔNG_NGHE_MÁY", waitMinutes: 10}
    activate GW
    GW->>WS: Broadcast event: "seat_status_changed" {seat: "A05", status: "VACANT"}
    GW-->>DRI: 200 OK {status: "NO_SHOW_RECORDED"}
    deactivate GW

    %% Đồng bộ dữ liệu lên Trung tâm
    WS-->>MGR: Cập nhật MGR-004: Khách đã lên xe: 34/36, Vắng mặt: 1, Còn lại: 1
    WS-->>PAX: Màn hình PAX-016 chuyển sang giao diện "Đã lên xe - Theo dõi lộ trình"
```

---

## 3. Quy Định An Ninh & Chống Gian Lận (Security Rules)

1. **Anti-Replay Attack**: Mã QR chứa `nonce` và `timestamp`. Một mã QR đã quét thành công trên bất kỳ thiết bị nào sẽ bị từ chối ngay lập tức nếu cố quét lại lần thứ hai (`409 TICKET_ALREADY_USED`).
2. **Mã PIN OTP Salted**: Mã PIN 6 số được sinh tự động bằng hàm mật mã ngẫu nhiên kèm salt bí mật của chuyến xe, chỉ có hiệu lực duy nhất trong ngày khởi hành của chuyến đi đó.
3. **Dung sai thời gian (Time Drift Margin)**: Để tránh trường hợp đồng hồ trên điện thoại hành khách bị chạy chậm hoặc nhanh hơn đồng hồ chuẩn NTP của server, thuật toán TOTP cho phép sai lệch tối đa $\pm 2$ chu kỳ (tổng biên độ $90\text{s}$).
