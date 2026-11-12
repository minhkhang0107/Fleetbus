# SPEC: CẢI TIẾN CƠ CHẾ ĐÓN KHÁCH TẬN NHÀ & THEO DÕI XE TRÊN BẢN ĐỒ (DYNAMIC ETA & TRACKING)

- **Mã định danh Spec**: `SPEC-HOME-PICKUP-TRACKING-V2`
- **Tài liệu liên quan**: `FLOW-06`, `DRI-020`, `PAX-018`, `PAX-019`, Decision `D143`, `D144`, `D159`
- **Phiên bản**: 2.0
- **Ngày ban hành**: 23/10/2026
- **Tác giả / Thảo luận**: Gemini & Claude Code

---

## 1. MỤC TIÊU & BỐI CẢNH

Hệ thống FleetBus đã hỗ trợ luồng đón khách tận nhà cơ bản:
1. Hành khách chọn đón tận nhà, cộng phụ phí 50.000đ, xếp vào khung đón 75–30 phút trước giờ xuất bến.
2. Tài xế nhận danh sách đón, bấm "Bắt đầu đón khách" và gửi vị trí xe.
3. Hành khách theo dõi qua bản đồ radar trên Flutter (`flutter_map` OpenStreetMap).

### Các hạn chế cần giải quyết:
1. **Bản đồ & Icon xe**: Xe di chuyển mỗi 5–10s bị giật cục/teleport, có thể cắt chéo qua góc cua hoặc trôi vào nhà dân do thiếu thuật toán chiếu tim đường (snap-to-polyline) và nội suy (interpolation).
2. **Tính toán ETA**: Công thức cũ ($d \times 1.3 / 20\text{ km/h} + 3\text{ phút}$) chưa phản ánh đúng kẹt xe thực tế và chưa tự động dồn thời gian khi khách phía trước xin thêm thời gian (`pickup_ready`).
3. **Cảnh báo ngõ hẹp**: Chưa có cơ chế phát hiện ngõ nhỏ/xe quá khổ từ lúc đặt vé; tài xế đến nơi mới báo không vào được khiến hành khách bị động.
4. **Trải nghiệm thông báo mốc**: Khách không biết chính xác còn bao nhiêu phút xe tới nếu không liên tục mở app.

---

## 2. KIẾN TRÚC GIẢI PHÁP & QUY TẮC NGHIỆP VỤ (BUSINESS RULES)

### 2.1. Bản đồ & Trực quan hóa xe (Google Maps & Smooth Tracking)
- **Ràng buộc ToS**: Tuân thủ điều khoản Google Maps Platform — khi dùng Routes API của Google, app khách hiển thị bằng `google_maps_flutter`.
- **Client-Side Polyline Snap & Interpolation**:
  - Tọa độ GPS từ xe được chiếu vuông góc lên đường tim tuyến (polyline).
  - Client animate marker dọc theo polyline trong khoảng thời gian $\Delta t$ giữa 2 lần ping với tần số 8–10 FPS.
  - **Dead Reckoning**: Nếu mất tín hiệu GPS tạm thời ($> 10\text{s}$), xe tiếp tục trôi với tốc độ suy giảm ($0.8 \times v$) tối đa 15s rồi dừng, không bao giờ chạy vượt qua điểm đón của khách.
  - **Bearing Smoothing**: Khi tốc độ xe $< 3\text{ km/h}$ (dừng đèn đỏ, đón khách), khóa góc xoay của icon xe để chống xoay tròn do nhiễu la bàn GPS.

### 2.2. Động cơ tính toán ETA đa điểm đón (Multi-Stop Queue ETA Engine)
1. **Ngưỡng khoảng cách cửa**:
   - `HOME_NEAR_METERS = 300`: Ngưỡng xe tiếp cận khu vực đón (kích hoạt thông báo M3).
   - `HOME_AT_DOOR_METERS = 50`: Ngưỡng xe thực sự tới trước cửa/điểm hẹn ($v \approx 0$).
2. **Thuật toán cộng dồn hàng đợi (Queue Accumulator)**:
   $$\text{ETA}(Pax_k) = \text{Time}_{\text{Traffic}}(\text{Xe} \to Pax_1) + \text{Dwell}_1 + \sum_{i=1}^{k-1} \left[ \text{Time}_{\text{Traffic}}(Pax_i \to Pax_{i+1}) + \text{Dwell}_{i+1} \right]$$
   - $\text{Dwell}_i = \max(\text{DEFAULT\_DWELL} - \text{Thời gian đã chờ}, \text{Thời gian khách xin thêm})$.
   - Khi $Pax_i$ gửi yêu cầu `NEED_2` hoặc `NEED_5`, hệ thống tự động dồn thêm 2–5 phút vào ETA của toàn bộ hành khách từ $Pax_{i+1}$ trở đi.
3. **ETA Hysteresis (Chống nhảy số giật lùi)**:
   - ETA hiển thị cho khách chỉ giảm dần từng phút, không nhảy lùi ngược lại trừ khi có sự cố kẹt xe đột ngột tăng $> 5\text{ phút}$.

### 2.3. Quy trình 4 mốc thông báo (Milestone Engine M1 $\to$ M4)
- **M1 (T-30 phút hoặc Xe bắt đầu đón khách)**: Thông báo xe bắt đầu lộ trình gom khách, báo số thứ tự đón của khách trong hàng đợi.
- **M2 (T-15 phút hoặc Cự ly $\le 3\text{ km}$)**: Nhắc khách chuẩn bị hành lý và sẵn sàng.
- **M3 (T-5 phút hoặc Cự ly $\le 300\text{ m}$)**: Mời khách bước ra điểm đón.
- **M4 (Tại cửa $\le 50\text{ m}$)**: Xe đã đến cửa; kích hoạt đồng hồ đếm ngược thời gian chờ tối đa (5 phút) trên cả app khách và tablet tài xế.

### 2.4. Phân loại xe & Cảnh báo ngõ hẹp (Vehicle Accessibility & Smart Alley)
- Tách biệt hai trường dữ liệu:
  - `home_address`: Địa chỉ nhà thực tế của khách (số nhà, ngách, ngõ).
  - `pickup_point`: Tọa độ và mô tả điểm đón thực tế của xe (đầu ngõ, điểm hẹn).
- **Phân loại xe**:
  - Xe 9–11 chỗ: Khả năng tiếp cận ngõ $\ge 2.5\text{m}$.
  - Xe 16 chỗ: Khả năng tiếp cận ngõ $\ge 3.0\text{m}$.
  - Xe 29–34 chỗ: Chỉ đón trả trên trục đường chính $\ge 5.0\text{m}$.
- **Gợi ý điểm hẹn đầu ngõ**: Khi khách nhập địa chỉ có từ khóa ngõ/ngách/hẻm đối với xe lớn, app gợi ý chọn điểm hẹn đón tại đầu ngõ trục đường lớn.

---

## 3. THIẾT KẾ DỮ LIỆU & API CONTRACTS

### 3.1. Cập nhật Tracking Data (`GET /api/v1/trips/:tripId/tracking`)
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_hn_th_01",
    "vehicle_plate": "29B-882.19",
    "bus_lat": 20.985,
    "bus_lng": 105.842,
    "speed_kmh": 22.5,
    "bearing_deg": 182.0,
    "queue_position": 2,
    "queue_total": 4,
    "eta_minutes": 14,
    "distance_km": 2.8,
    "milestone": "M2_PREPARING",
    "home_pickup": {
      "address": "12 Ngõ 34 Giải Phóng",
      "meeting_point": "Đầu ngõ 34 Giải Phóng",
      "at_door": false,
      "near_door": false,
      "wait_seconds_remaining": null
    }
  }
}
```

### 3.2. Sự kiện SSE Stream (`/api/v1/trips/:tripId/tracking/stream`)
Bổ sung payload sự kiện:
- `TYPE: HOME_ETA_UPDATE`: Đẩy khi ETA thay đổi hoặc khi khách phía trước xin thêm thời gian.
- `TYPE: HOME_MILESTONE`: Kích hoạt các mốc thông báo M1, M2, M3, M4.
