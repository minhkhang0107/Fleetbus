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
- `BR-POS-004` (One inventory for every channel - review FND-A45): Counter and hotline sales use the same seat inventory as the passenger app. A sale needs at least one seat (`400 NO_SEAT_SELECTED`), existing seats (`400 SEAT_NOT_FOUND`), a valid payment method `CASH_POS`, `CARD_POS` or `BANK_TRANSFER` (`400 INVALID_PAYMENT_METHOD`), and seats that are free: `409 SEAT_ALREADY_BOOKED` for a sold seat and `409 SEAT_LOCKED_BY_OTHER` for a seat held by someone else. A POS ticket carries the real route, departure time and paid fare, so it can be cancelled and refunded like an online ticket (`PAX-021`).
- `BR-POS-005` (Hotline hold locks the seat and is collected at the counter - review FND-A46): A hotline hold locks its seats in the shared inventory until `hold_until`, so neither the app nor another counter can sell them, and the lock lapses by itself at expiry (the held count of the trip goes down at the next read or sale). A hold needs free seats, a valid caller phone (`400 INVALID_PHONE`), a policy `UNTIL_DEPARTURE_OFFSET` or `CUSTOM_EXPIRY_MINUTES` (`400 INVALID_HOLD_POLICY`) and a positive duration (`400 INVALID_HOLD_DURATION`). When the caller arrives, the counter issues the ticket with `reservation_id` and exactly the held seats (`409 RESERVATION_MISMATCH` otherwise); the hold becomes `CONVERTED` and the seats are not counted twice.
- `BR-POS-007` (Segment sales - Phase E review, `OQ-028`): `POST /ops/pos/orders` and `POST /ops/pos/hotline-hold` take optional `pickupStopId` and `dropoffStopId` (none means the whole route) and check the segment like `PAX-008` (`400 STOP_NOT_FOUND`, `INVALID_SEGMENT`, `STOP_NOT_ALLOWED`); the seats must be free for that segment (`409 SEAT_ALREADY_BOOKED`, `SEAT_LOCKED_BY_OTHER`, `SEAT_BLOCKED`). A sale from a reservation covers the segment that was held. The fare does not depend on the segment (`OQ-032`).
- `BR-POS-006` (Hotline limit per caller - Phase C review FND-C05): One phone number may hold at most 4 seats at the same time across all trips (`400 HOTLINE_LIMIT_EXCEEDED`, with `held_seats`). Holds that have expired or been cancelled do not count. A refused hold locks nothing. The blacklist of repeat ghost callers and the reminder before expiry of the old flow are not part of this version (`OQ-031`).
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

