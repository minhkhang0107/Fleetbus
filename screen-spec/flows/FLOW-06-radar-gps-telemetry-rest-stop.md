# FLOW-06: Radar GPS Telemetry 60Hz, Cảnh Báo Mất Sóng & Trạm Dừng (Fleet Telemetry & Rest-Stop HUD)

**Mã tài liệu:** `FLOW-06`  
**Phiên bản:** 1.0  
**Liên kết màn hình:** [DRI-006](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-006-driving-hud-route.md), [DRI-014](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-014-gps-hardware-health.md), [PAX-018](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-018-live-trip-tracking.md), [PAX-019](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-019-rest-stop-companion.md), [MGR-003](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-003-active-fleet-map.md), [MGR-005](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-005-delay-incident-command.md)

---

## 1. Mục Tiêu & Mô Tả Nghiệp Vụ

Việc giám sát phương tiện theo thời gian thực (Realtime Fleet Telemetry) đóng vai trò trung tâm trong an toàn giao thông và trải nghiệm hành khách:
1. **Radar mượt mà (Smooth 60Hz Rendering)**: Máy tính bảng tài xế bắn tọa độ GPS tần suất $3\text{s}$/lần qua giao thức nhẹ MQTT; tầng Web frontend của Manager và Mobile App của Hành khách sử dụng thuật toán nội suy quán tính (Dead Reckoning Interpolation) để tạo chuyển động xe trôi mượt mà 60 khung hình/giây trên bản đồ.
2. **Cảnh báo mất sóng viễn thông (> 60 giây)**: Khi xe đi qua đèo núi hiểm trở hoặc hầm đường bộ làm mất tín hiệu GPS quá 60 giây, hệ thống tự động kích hoạt trạng thái "MẤT TÍN HIỆU" (Stale GPS Alert), thông báo cho hành khách và kích hoạt giao thức kiểm tra an toàn tại phòng điều hành trung tâm.
3. **Quản lý trạm dừng nghỉ thông minh (Rest Stop Companion HUD)**: Khi xe dừng chân tại trạm dịch vụ (20–30 phút), tài xế kích hoạt đồng hồ đếm ngược. Toàn bộ hành khách nhận được thông báo đồng bộ trên màn hình `PAX-019`, có chuông báo động nhắc lên xe khi còn 5 phút tránh việc khách bị bỏ quên.

---

## 2. Sơ Đồ Trình Tự Tương Tác (Mermaid Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor DRI as 🚍 Thiết Bị Tablet Lái Xe (Android Service)
    participant MQTT as 🛰️ MQTT Broker (Mosquitto/EMQX)
    participant GW as ⚙️ Telemetry Processor & Watchdog
    participant WS as ⚡ WebSocket Realtime Server
    actor MGR as 🖥️ Điều Hành Trung Tâm (MGR-003)
    actor PAX as 📱 Hành Khách Trên Xe (PAX-018/PAX-019)

    %% Giai đoạn 1: Bắn tọa độ liên tục
    Note over DRI,MQTT: 1. Định vị liên tục qua MQTT (Mỗi 3 giây)
    loop Mỗi 3 giây trong suốt hành trình
        DRI->>MQTT: Publish topic: "fleet/trips/TRIP101/telemetry"<br/>{lat: 20.985, lng: 105.842, speed: 78, heading: 145, satCount: 14}
        MQTT->>GW: Consumer xử lý tọa độ & cập nhật vị trí xe
        GW->>WS: Broadcast room "trip:TRIP101" event: "telemetry_tick"<br/>{lat: 20.985, lng: 105.842, speed: 78, heading: 145}
        par Nội suy hiển thị mượt 60Hz
            WS-->>MGR: Bản đồ ATC MGR-003 cập nhật marker xe chạy mượt (Dead-reckoning)
            WS-->>PAX: Màn hình PAX-018 hiển thị xe di chuyển trên bản đồ vệ tinh
        end
    end

    %% Giai đoạn 2: Cảnh báo mất sóng > 60s
    Note over DRI,MGR: 2. Xe vào vùng núi mất sóng (Stale GPS Watchdog > 60s)
    DRI--xMQTT: Mất kết nối 4G/GPS do đi vào hẻm núi
    GW->>GW: Heartbeat Timer đếm: Đã quá 60 giây không nhận được gói tin nào từ TRIP101
    GW->>WS: Broadcast event: "stale_gps_warning"<br/>{tripId: "TRIP101", lastSeenSecondsAgo: 65, status: "SIGNAL_LOST"}
    
    par Cảnh báo Trung tâm
        WS-->>MGR: MGR-003 nhấp nháy xe màu Vàng Cam kèm nhãn: [CẢNH BÁO MẤT TÍN HIỆU 65s]
        MGR->>MGR: Kích hoạt nút gọi khẩn cấp bộ đàm / gọi phụ xe
    and Cảnh báo Hành khách
        WS-->>PAX: PAX-018 hiện thông báo: "Xe đang qua khu vực sóng yếu, vị trí hiển thị theo ước lượng"
    end

    %% Giai đoạn 3: Dừng nghỉ & Đếm ngược lên xe
    Note over DRI,PAX: 3. Ghé trạm dừng nghỉ & Đồng hồ đếm ngược (PAX-019)
    DRI->>DRI: Xe tấp vào Trạm Dừng Nghỉ Phủ Lý -> Nhấn nút [NGHỈ 20 PHÚT] (DRI-006)
    DRI->>GW: POST /api/v1/driver/trips/TRIP101/rest-stop/start<br/>{stopName: "Trạm Dừng Phủ Lý", durationMinutes: 20}
    activate GW
    GW->>WS: Broadcast room "trip:TRIP101" event: "rest_stop_started"<br/>{stopName: "Trạm Dừng Phủ Lý", durationMinutes: 20, departAt: "15:45"}
    deactivate GW

    WS-->>PAX: Màn hình PAX-019 bật chế độ Nghỉ Ngơi: Đồng hồ đếm ngược 20:00
    WS-->>MGR: MGR-003 đánh dấu xe trạng thái: "ĐANG NGHỈ CHÂN TẠI TRẠM"

    Note over PAX: Khi đồng hồ đếm ngược còn 5 phút (T-5 min)
    PAX->>PAX: PAX-019 rung mạnh + phát âm thanh chuông báo: "Xe sắp xuất phát trong 5 phút! Quý khách vui lòng trở lại ghế ngồi"
    DRI->>DRI: Hết 20 phút -> Bấm [KẾT THÚC NGHỈ - TIẾP TỤC HÀNH TRÌNH] -> Xe lăn bánh
```

---

## 3. Thông Số Kỹ Thuật Viễn Thông (Telemetry SLA)

| Chỉ số | Giá trị chuẩn | Cơ chế bù đắp khi mất mạng |
| :--- | :--- | :--- |
| **Tần suất gửi MQTT** | $3\text{s}$ / lần (Băng thông ~120 bytes/gói) | Bộ đệm cục bộ Tablet lưu tối đa 500 gói tin và gửi dồn burst khi có sóng. |
| **Độ trễ truyền dẫn** | $< 350\text{ms}$ (từ lúc GPS bắt tọa độ tới lúc web manager vẽ lên màn hình) | Sử dụng WebSocket binary packing tối ưu. |
| **Ngưỡng Stale Watchdog** | $60\text{s}$ không nhận gói tin | Cảnh báo mức 1 (Màu Vàng). Sau $15\text{ phút}$ chuyển Cảnh báo mức 2 (Màu Đỏ - Nghi ngờ tai nạn). |
| **Độ chính xác đếm ngược trạm dừng** | Đồng bộ theo thời gian chuẩn Unix NTP Server | Tránh sai lệch giữa đồng hồ điện thoại khách và đồng hồ tablet tài xế. |
