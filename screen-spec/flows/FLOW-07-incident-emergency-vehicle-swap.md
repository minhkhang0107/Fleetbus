# FLOW-07: Sự Cố Kỹ Thuật, Đổi Xe Khẩn Cấp & Tái Phân Bổ Ghế (Incident & Emergency Swap)

**Mã tài liệu:** `FLOW-07`  
**Phiên bản:** 1.0  
**Liên kết màn hình:** [DRI-019](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-019-incident-report-sos.md), [MGR-005](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-005-delay-incident-command.md), [MGR-023](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-023-vehicle-swap-wizard.md), [PAX-024](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-024-incident-delay-banner.md), [PAX-025](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-025-seat-reassignment-modal.md)

---

## 1. Mục Tiêu & Mô Tả Nghiệp Vụ

Trong vận tải đường dài, các sự cố bất khả kháng như hỏng hóc động cơ, nổ lốp, va chạm giao thông hoặc tắc đường nghiêm trọng là những tình huống khẩn cấp đòi hỏi sự phối hợp nhịp nhàng giữa Tài xế, Phòng điều hành trung tâm và Hành khách:
1. **Báo cáo sự cố tức thì (SOS Dispatch < 10 giây)**: Tài xế nhấn nút báo sự cố trên `DRI-019` kèm hình ảnh hiện trường, tọa độ GPS tự động và mức độ nghiêm trọng (Cần cứu hộ / Cần xe thay thế trung chuyển).
2. **Quy trình đổi xe thông minh (Vehicle Swap Wizard)**: Điều hành viên chọn một xe dự phòng gần nhất trên `MGR-023`. Hệ thống tự động chạy thuật toán tái phân bổ ghế (Seat Re-mapping Engine) nhằm giữ nguyên tối đa vị trí tương đương (ghế tầng dưới cho người già/trẻ em, giữ ghế cạnh nhau cho nhóm đi chung).
3. **Đồng bộ hành khách minh bạch (Transparency Push)**: Toàn bộ hành khách nhận được thông báo giải thích lý do, biển số xe cứu hộ mới, số điện thoại tài xế mới và sơ đồ ghế mới đã cập nhật trên `PAX-024` và `PAX-025` để không bị hoang mang.

---

## 2. Sơ Đồ Trình Tự Tương Tác (Mermaid Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor DRI_OLD as 🚍 Tài Xế Gặp Sự Cố (DRI-019)
    actor MGR as 🖥️ Chỉ Huy Điều Hành (MGR-005/MGR-023)
    participant GW as ⚙️ Gateway & Re-mapping Engine
    participant DB as 🗄️ PostgreSQL Database
    participant WS as ⚡ WebSocket & Push Notification
    actor DRI_NEW as 🚍 Xe Cứu Hộ Được Điều Động
    actor PAX as 📱 Hành Khách Trên Xe (PAX-024/PAX-025)

    %% Giai đoạn 1: Báo cáo sự cố khẩn cấp
    Note over DRI_OLD,MGR: 1. Phát tín hiệu SOS Sự cố kỹ thuật (DRI-019)
    DRI_OLD->>DRI_OLD: Xe bị sự cố hỏng hộp số tại Km 125 Cao tốc Pháp Vân - Cầu Giẽ
    DRI_OLD->>DRI_OLD: Mở màn hình DRI-019: Chọn "HỎNG ĐỘNG CƠ / XE KHÔNG THỂ CHẠY TIẾP"
    DRI_OLD->>GW: POST /api/v1/driver/trips/TRIP101/incidents<br/>{severity: "CRITICAL", type: "MECHANICAL_BREAKDOWN", requireSwap: true, note: "Hỏng hộp số"}
    activate GW
    GW->>DB: INSERT INTO trip_incidents (...)
    GW->>WS: Broadcast to room "manager_operations" event: "critical_incident_alert"<br/>{tripId: "TRIP101", plate: "29B-123.45", location: "Km 125"}
    GW-->>DRI_OLD: 200 OK {incidentId: "INC-99", status: "DISPATCHING"}
    deactivate GW

    %% Giai đoạn 2: Điều hành mở Wizard đổi xe
    Note over MGR,GW: 2. Trung tâm điều phối xe thay thế & Tái phân bổ ghế (MGR-023)
    WS-->>MGR: Còi báo động đỏ vang lên tại màn hình MGR-005!
    MGR->>MGR: Mở MGR-023 (Vehicle Swap Wizard)
    MGR->>MGR: Chọn xe dự phòng 29B-888.99 (Đang đỗ tại Bến xe Phủ Lý, cách 12km)
    MGR->>GW: POST /api/v1/ops/trips/TRIP101/swap-vehicle<br/>{replacementBusId: "BUS-888", replacementDriverId: "DRV-99", algorithm: "PRESERVE_GROUPS"}
    activate GW
    GW->>GW: Chạy thuật toán Seat Re-mapping Engine:<br/>- Chuyển 34 hành khách sang xe mới<br/>- Giữ nguyên số ghế A01->A01 nếu sơ đồ trùng khớp<br/>- Tạo vé điện tử mới với chữ ký mới
    GW->>DB: UPDATE trips SET vehicle_id='BUS-888', driver_id='DRV-99'
    GW->>WS: Broadcast room "trip:TRIP101" event: "trip_vehicle_swapped"<br/>{newPlate: "29B-888.99", etaMinutes: 25}
    GW-->>MGR: 200 OK {swapSuccess: true, remappedCount: 34}
    deactivate GW

    %% Giai đoạn 3: Thông báo điều phối xe cứu hộ và Hành khách
    Note over WS,PAX: 3. Thông báo tức thì cho Hành Khách & Xe Cứu Hộ
    par Xe Cứu Hộ Nhận Lệnh Xuất Phát
        WS-->>DRI_NEW: Thiết bị tablet xe 29B-888.99 bật còi: "NHẬN NHIỆM VỤ TRUNG CHUYỂN CỨU HỘ CHUYẾN TRIP101"
        DRI_NEW->>DRI_NEW: Nhận danh sách 34 khách & vị trí GPS của xe bị hỏng -> Lập tức xuất phát
    and Hành Khách Nhận Thông Báo Minh Bạch
        WS-->>PAX: Màn hình PAX-024 bật banner màu Cam: "Xe gặp sự cố kỹ thuật nhẹ. Xe cứu hộ 29B-888.99 đang đến (Dự kiến 25 phút)"
        PAX->>PAX: Bấm xem chi tiết (PAX-025): Hiển thị số ghế mới được bảo lưu nguyên vẹn, mã QR soát vé xe mới
    end
```

---

## 3. Thuật Toán Tái Phân Bổ Ghế (Seat Re-mapping Logic)

1. **Nguyên tắc Đồng Hạng (Tier Matching)**:
   - Hành khách ở vé VIP / Giường nằm đơn tầng 1 được ưu tiên xếp vào hạng giường nằm tương đương trên xe thay thế.
2. **Bảo toàn Nhóm Đi Chung (Cluster Preservation)**:
   - Các vé thuộc cùng một `booking_id` phải được xếp cạnh nhau hoặc cùng một khoang giường liền kề.
3. **Chính sách Bồi Thường Tự Động (Auto Compensation Voucher)**:
   - Nếu thời gian trễ do sự cố vượt quá $45\text{ phút}$, hệ thống tự động phát hành một Voucher giảm giá $20\%$ cho chuyến đi tiếp theo gửi thẳng vào ví voucher trên Passenger App của từng người.
