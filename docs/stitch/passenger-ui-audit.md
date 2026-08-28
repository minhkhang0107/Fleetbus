# BusGo Passenger Mobile App — Google Stitch UI Audit & Completeness Report

**Dự án Google Stitch:** `BusGo Passenger Mobile App`  
**Project ID:** `15025161998194638255` (`projects/15025161998194638255`)  
**Design System Asset:** `assets/79d50e67734b4376a8e98bc08c15ecaa`  
**Quy chuẩn Taste Skill:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`  
**Ngày thực hiện kiểm toán:** 27/08/2026  
**Vai trò:** Principal Product Designer + Senior UX Architect + Senior BA + Senior Solution Architect  

---

## 1. Existing Screens (DONE)

Các màn hình đã tồn tại sẵn trong dự án Stitch trước phiên kiểm toán này và đã được thẩm định đạt chuẩn chất lượng:

- **`PAX-004-home`** — Trang chủ, Thanh tìm kiếm chuyến nhanh, Thẻ vé xe đang chạy hiển thị khoảng cách thời gian thực.
- **`PAX-006-search-results`** — Danh sách chuyến xe, Dải ngày ngang (Date Strip), Lọc hạng xe Limousine/Giường nằm, Hiển thị chỗ trống theo chặng (Segment Availability).
- **`PAX-009-seat-map`** — Sơ đồ ghế tương tác 2D Tầng 1/2, Phân định 4 trạng thái ghế (Trống, Đang chọn, Đang giữ Redis, Đã bán).
- **`PAX-012-checkout`** — Trang thanh toán & Xác nhận đơn hàng, Bộ đếm ngược 10 phút, Áp dụng Voucher, Cổng VNPAY/MoMo/VietQR/COD.
- **`PAX-017-ticket-detail-qr`** — Vé điện tử & Mã QR soát vé offline bảo mật HMAC-SHA256, Chế độ tăng độ sáng màn hình 100%.

---

## 2. New Screens (CREATED)

Toàn bộ 20 màn hình còn thiếu theo yêu cầu của `screen-spec/passenger/` và `Master SRS v3.0` đã được tạo mới trực tiếp trên dự án Stitch `15025161998194638255`:

1. **`PAX-001-splash`** — Màn hình khởi động, Nhận diện thương hiệu BusGo, Tải cấu hình Remote Config & Phiên bản ứng dụng.
2. **`PAX-002-login`** — Đăng nhập bằng số điện thoại (+84), Hỗ trợ đăng nhập nhanh Google / Apple, Chế độ xem vé khách (Guest).
3. **`PAX-003-otp`** — Xác thực mã OTP 6 số (JetBrains Mono), Đồng hồ đếm ngược 60s gửi lại mã, Bàn phím số mô phỏng.
4. **`PAX-005-location-picker`** — Bộ chọn Tỉnh/Thành phố & Bến xe phân cấp, Tab vùng Miền Bắc/Trung/Nam, Lịch sử tìm kiếm gần đây.
5. **`PAX-007-trip-detail`** — Chi tiết chuyến xe, Lưới tiện ích xe (Wifi 5G, Massage, Sạc Type-C), Sổ lộ trình dừng đỗ dọc tuyến.
6. **`PAX-008-pickup-dropoff`** — Chọn điểm đón & điểm trả khách, Hỗ trợ đón tận nơi bằng xe trung chuyển kèm biểu phí minh bạch.
7. **`PAX-010-seat-hold`** — Đồng hồ đếm ngược 10 phút khóa giữ chỗ Redis khổng lồ (`09:42`), Bottom Sheet xử lý ngoại lệ khi hết hạn giữ chỗ.
8. **`PAX-011-passenger-info`** — Biểu mẫu nhập thông tin hành khách, Tự động điền (Autofill), Nhập CCCD định danh bảo hiểm, Xuất VAT điện tử.
9. **`PAX-013-payment-processing`** — Cổng thanh toán mã VietQR động chuẩn NAPAS 24/7, Polling kiểm tra trạng thái Webhook tự động.
10. **`PAX-014-payment-result`** — Kết quả thanh toán Thành công / Đang chờ đối soát / Thất bại, Ngăn chặn thanh toán trùng lặp khi mạng chập chờn.
11. **`PAX-015-booking-success`** — Đặt vé thành công, Thẻ Boarding Pass sang trọng kèm mã PNR (`BG-88219`), Đồng bộ Lịch Google/Apple.
12. **`PAX-016-my-tickets`** — Trung tâm quản lý vé, 3 Tab: Sắp đi (Hiển thị thẻ vé nổi bật kèm nút mở QR và định vị xe), Đã hoàn thành, Đã hủy.
13. **`PAX-018-live-tracking`** — Bản đồ vector Light Mapbox định vị xe GPS thời gian thực, Tốc độ 62 km/h, Gọi điện ẩn danh bác tài.
14. **`PAX-019-eta-detail`** — Dòng thời gian tiến độ từng trạm dừng, Phân tích lưu lượng giao thông cao tốc, Chuông báo trước khi đến 15 phút.
15. **`PAX-020-notifications`** — Trung tâm thông báo vận hành, Phân loại Chuyến đi / Khuyến mại / Hệ thống, Cảnh báo xe tiếp cận gần (< 2.4 km).
16. **`PAX-021-booking-cancel-refund`** — Yêu cầu hủy vé & Tính tiền hoàn tự động theo bậc thời gian (>24h hoàn 100%), Hoàn tiền tự động về tài khoản.
17. **`PAX-022-profile`** — Hồ sơ cá nhân, Thẻ hội viên Gold Member, Ví tích điểm BusGo Xu, Quản lý phương tiện thanh toán.
18. **`PAX-023-saved-stops-contacts`** — Quản lý địa chỉ Nhà riêng / Công ty / Điểm đón quen thuộc và Danh bạ người thân đi cùng.
19. **`PAX-024-vehicle-replacement-notice`** — Xử lý thông báo đổi xe điều động khẩn cấp, Thuật toán ghép ghế tương đương (`A02 ➔ A04`), Tùy chọn chọn lại ghế hoặc hoàn tiền 100%.
20. **`PAX-025-trip-delay-disruption`** — Thông báo xe xuất bến trễ do ùn tắc giao thông, Cập nhật giờ chạy mới, Tặng voucher đền bù 30k, Đổi chuyến miễn phí.

---

## 3. Updated Existing Screens (UPDATED)

- Không có màn hình nào bị phá vỡ cấu trúc hay phải viết đè làm mất dữ liệu. Toàn bộ 5 màn hình cũ được bảo tồn làm visual anchors chuẩn cho 20 màn hình mới.

---

## 4. Remaining Missing (MISSING)

- **`NONE (0 màn hình)`** — Tất cả 25/25 màn hình thuộc Master SRS v3.0 và bộ tài liệu `screen-spec/passenger/` đã được bao phủ $100\%$.

---

## 5. Open Questions (OPEN QUESTIONS)

- **`NONE`** — Tất cả các luồng nghiệp vụ (Segment-based seat reservation, Redis Lock 10-minute hold, Offline HMAC-SHA256 QR boarding pass, Tiered cancellation policy, Vehicle replacement auto-reseating) đã được thể hiện rõ ràng và nhất quán theo đúng SRS v3.0.

---

## 6. Design Consistency: PASS

- **Bảng màu:** $100\%$ sử dụng chuẩn Semantic Design Tokens: Nền sáng `#F8FAFC`, Thẻ `#FFFFFF`, Chữ `#0F172A`, Viền `rgba(226, 232, 240, 0.7)`, Xanh Sapphire `#2563EB`, Xanh lá `#16A34A`, Vàng Amber `#D97706`, Cam PNR `#FB9821`.
- **Typography:** Display & Body sử dụng `Geist`; Numeric Data, PNR, Số ghế, Giờ chạy, Tốc độ km/h và Đồng hồ đếm ngược sử dụng `JetBrains Mono`.
- **Anti-Slop:** Không sử dụng emoji trang trí, không có gradient dạ quang tím/neon, không lồng ghép thẻ quá 2 tầng.

---

## 7. Business Coverage: PASS

- **Segment Availability:** Đảm bảo chính xác khả năng đặt chỗ theo từng chặng con dọc tuyến.
- **Realtime State Management:** Thể hiện đầy đủ 4 trạng thái Live / Reconnecting / Stale / Offline.
- **Payment & Recovery:** Đảm bảo tách biệt rõ ràng giữa mạng trễ và thanh toán thất bại, không gây trùng lặp giao dịch.
- **Exception Flows:** Đã bao phủ toàn diện Đổi xe khẩn cấp (`PAX-024`), Trễ chuyến do thiên tai/kẹt xe (`PAX-025`), Hết hạn giữ chỗ (`PAX-010`), và Hủy vé hoàn tiền tự động (`PAX-021`).
