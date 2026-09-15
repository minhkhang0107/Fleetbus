# MGR-020 — Manager POS Fast Seat Selector & Instant Ticket Issuance

**App:** Manager Operations Portal  
**Platform:** Web (Desktop / Thermal Printer Integration)  
**Screen Type:** Full Screen Counter Terminal  
**Priority:** P0 (Sales & Revenue)  
**Route:** `/ops/pos/checkout`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-20`, `BR-POS-001`, `UC-MGR-POS-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Fast counter seat selector and instant POS checkout: 1-click pick seats, enter passenger phone (or default guest), select payment (Counter Cash, POS Card Swipe, Counter VietQR), and trigger instant thermal ticket printing ($80\text{mm}$ ESC/POS).
- **Actor:** Station Ticket Clerk.
- **Outcome:** Ticket issued; PNR generated; ESC/POS thermal ticket printed; cash recorded in drawer.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Bán vé tại quầy (POS): Hà Nội ➔ Thanh Hóa (14:00, 27/08) [🖨️ Máy in: OK]│
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 💺 SƠ ĐỒ GHẾ NHANH (Tầng 1)          │ 💵 THANH TOÁN & THÔNG TIN KHÁCH      │
│ [ A01 - 220k ]  [ B01 - ĐÃ BÁN ]     │                                      │
│ [ A02 - 220k ]  [ B02 - TẠM GIỮ ]    │ Số điện thoại khách (Nhận vé SMS):   │
│ [ A03 - 220k ]  [ B03 - 220k ]       │ [ 0987 654 321                     ] │
│                                      │                                      │
│ 💺 TẦNG 2                            │ Tên hành khách: [ Nguyễn Văn Nam   ] │
│ [ A07 - 220k ]  [ B07 - 220k ]       │                                      │
│                                      │ Hình thức thanh toán:                │
│ 📊 ĐÃ CHỌN: Ghế A02 (1 vé)           │ [ 🔘 TIỀN MẶT ] [ ⚪ QUẸT THẺ POS ]  │
│                                      │ [ ⚪ VIETQR TẠI QUẦY ]               │
│                                      │                                      │
│                                      │ Tiền khách đưa: [ 500000 ] đ         │
│                                      │ Tiền thừa trả:  [ 280000 ] đ         │
│                                      │                                      │
│                                      │ ┌──────────────────────────────────┐ │
│                                      │ │ 📞 GIỮ CHỖ HOTLINE [F8]          │ │
│                                      │ ├──────────────────────────────────┤ │
│                                      │ │ 🖨️ XUẤT VÉ & IN NGAY [F9] (CTA)  │ │
│                                      │ └──────────────────────────────────┘ │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-POS-002`: Counter ticket issuance directly issues tickets with status `CONFIRMED` and payment status `SUCCESS` in a single database transaction.
- `BR-POS-003` (Hotline Seat Reservation Hold Policy - REV-06):
  - Khác với cơ chế khóa ghế 10 phút trên app hành khách (`LOCK_TTL = 600s`), nhân viên quầy/tổng đài viên được phép tạo lệnh giữ chỗ qua điện thoại (`source: "HOTLINE"`).
  - Thời hạn giữ chỗ (`hold_until`) được hỗ trợ theo 2 chế độ:
    1. `UNTIL_DEPARTURE_OFFSET`: Mặc định giữ ghế cho đến trước giờ khởi hành chuyến xe `T - 30 phút` (hoặc cấu hình tuyến).
    2. `CUSTOM_EXPIRY_MINUTES`: Cấu hình số phút giữ cụ thể (ví dụ: 60 phút, 120 phút).
  - Nếu quá hạn giữ chỗ (`hold_until`) mà khách chưa đến quầy nhận vé/chưa thanh toán, hệ thống tự động hoàn trả ghế về trạng thái `VACANT` để bán cho khách khác.
- **API Endpoint 1 (POS Instant Checkout):** `POST /api/v1/ops/pos/orders`
- **API Endpoint 2 (Hotline Seat Hold - REV-06):** `POST /api/v1/ops/pos/hotline-hold`
- **Request Body (Hotline Hold):**
```json
{
  "trip_id": "trp_991823",
  "seat_codes": ["B02"],
  "passenger_name": "Trần Thị Lan",
  "phone": "0912988776",
  "hold_policy": "UNTIL_DEPARTURE_OFFSET",
  "departure_offset_minutes": 30,
  "notes": "Khách đón tại Cổng ĐH Thủy Lợi, thanh toán tiền mặt khi lên xe"
}
```
- **Response `201 Created`:**
```json
{
  "status": "success",
  "data": {
    "reservation_id": "rsv_pos_99812",
    "pnr": "BG-RSV-882",
    "trip_id": "trp_991823",
    "seat_codes": ["B02"],
    "hold_status": "HELD_HOTLINE",
    "hold_until": "2026-08-27T13:30:00Z",
    "created_by": "clerk_hn_01"
  }
}
```
- **TC-MGR-020-01:** Verifies pressing `F9` executes transaction and triggers silent thermal print job.
- **TC-MGR-020-02:** Verifies creating hotline reservation holds seat with configured `hold_until` timestamp and releases correctly on expiry.

