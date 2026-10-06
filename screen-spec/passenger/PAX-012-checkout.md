# PAX-012 — Passenger Checkout & Order Review

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen  
**Priority:** P0 (Core Journey / Blocking)  
**Route:** `/checkout`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-12`, `BR-BOOK-001`, `BR-PAY-001`, `UC-PAS-BOOK-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Provide a comprehensive financial review of the booking transaction: trip summary, pickup/dropoff points, seat assignments, itemized price breakdown (base fare, transfer surcharge, discounts/vouchers, VAT), select payment method (VNPAY, MoMo, VietQR, COD), and create the authoritative `PENDING_PAYMENT` booking record in PostgreSQL.
- **Actor:** Passenger.
- **Entry Condition:** Proceeded from `PAX-011-passenger-info.md` with active hold token.
- **Outcome:** Booking record created; user routed to `PAX-013-payment-processing.md` (or direct success for confirmed COD).

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-BOOK-001` (Booking State Machine: `PENDING_PAYMENT`), `BR-PAY-001` (Multi-Payment Channels), `UC-PAS-BOOK-001`.
- **CRITICAL INVARIANT:** Checkout submission MUST include an `Idempotency-Key` generated when entering the screen to prevent duplicate charges or double bookings on accidental double-taps.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-011 Passenger Info]
Previous Screen: [PAX-011 Passenger Info]
Next Screen: 
  ├── [PAX-013 Payment Processing] (Online payment: VNPAY / MoMo / VietQR)
  └── [PAX-015 Booking Success] (Direct confirmation for approved COD)
Exit Points:
  ├── Tap Back -> Return to PAX-011
  └── Hold Expired -> [PAX-010 Expired Modal] -> [PAX-009 Seat Map]
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Thanh toán                          [⏳ 08:30]│
├───────────────────────────────────────────────────┤
│ ┌─ TÓM TẮT CHUYẾN ĐI ──────────────────────────┐  │
│ │ Hà Nội ─────────────────────────► Thanh Hóa  │  │
│ │ 14:00 (Hôm nay, 27/08) · Limousine 34 Phòng  │  │
│ │ 🟢 Đón: Bến xe Giáp Bát (14:00)              │  │
│ │ 🔴 Trả: Bến xe Phía Bắc (17:30)              │  │
│ │ 💺 Ghế: A02 (Tầng 1) · Người đi: Nguyễn V. Nam│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ 🎟️ MÃ GIẢM GIÁ / VOUCHER                           │
│ ┌─────────────────────────────────────────────┐   │
│ │ [ Nhập mã voucher... ]        [ Áp dụng ]   │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ 💳 PHƯƠNG THỨC THANH TOÁN                         │
│ ┌─────────────────────────────────────────────┐   │
│ │ 🔘 [🏦] VNPAY (Thẻ ATM / QR Ngân hàng / Visa)│  │
│ ├─────────────────────────────────────────────┤   │
│ │ ⚪ [🟪] Ví MoMo                             │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ⚪ [📱] VietQR Chuyển khoản trực tiếp        │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ⚪ [💵] Thanh toán khi lên xe (COD)          │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ 📊 CHI TIẾT THANH TOÁN                            │
│ • Giá vé (1 vé x 220.000 đ):        220.000 đ     │
│ • Phí đón trả trung chuyển:               0 đ     │
│ • Giảm giá Voucher:                       0 đ     │
│ ─────────────────────────────────────────────     │
│ Tổng thanh toán:                    220.000 đ     │
│                                                   │
├───────────────────────────────────────────────────┤
│ Tổng tiền: 220.000 đ                              │
│ [ THANH TOÁN NGAY (CTA) ]                         │
└───────────────────────────────────────────────────┘
```

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TripSummaryCard` | Card | Yes | Booking State | Normal | Displays route, stops, and seats |
| `VoucherInput` | InputField + Button | Yes | Voucher API | Normal / Applied / Invalid | Tap "Áp dụng" validates code |
| `PaymentMethodGroup` | Radio Group | Yes | Gateway Config | 4 Options | Tap selects payment channel |
| `PriceBreakdownTable`| Table | Yes | Dynamic Calculation | Normal | Line items for fare, fees, discounts |
| `PayNowCTA` | Button | Yes | Form State | Enabled / Loading | Tap creates booking and initiates payment |

---

## 6. API Contract

### 6.1. Create Formal Booking
- **Endpoint:** `POST /api/v1/bookings/create`
- **Auth:** Optional Bearer (Guest session token supported)
- **Headers:** `Content-Type: application/json`, `Idempotency-Key: uuid`
- **Request Body:**
```json
{
  "hold_token": "hld_99218ab4c",
  "trip_id": "trp_991823",
  "pickup_stop_id": "stp_hn_gb",
  "dropoff_stop_id": "stp_th_pb",
  "contact": {
    "name": "Nguyễn Văn Nam",
    "phone": "+84987654321",
    "email": "nam.nguyen@example.com"
  },
  "passengers": [
    { "seat_code": "A02", "full_name": "Nguyễn Văn Nam", "phone": "+84987654321" }
  ],
  "payment_method": "VNPAY",
  "voucher_code": "BUSGO20"
}
```
- **Response `201 Created`:**
```json
{
  "status": "success",
  "data": {
    "booking_id": "bkg_77192a83",
    "pnr": "BG-88219",
    "booking_status": "PENDING_PAYMENT",
    "total_amount_vnd": 176000,
    "payment_id": "pay_99218a",
    "created_at": "2026-08-27T14:02:15Z"
  }
}
```

---

## 7. Business Rules
- `BR-CHECKOUT-001`: If payment method is `COD` (Cash on Delivery), maximum booking value is capped at $1,000,000\text{ VND}$ (max 3 seats) to protect operator from no-show fraud.
- `BR-CHECKOUT-003` (Server-side pricing - review FND-A13): All amounts are computed by the server from the trip seat prices. Client-sent prices are ignored. No optional add-on (for example travel insurance) is pre-selected; an add-on is charged only when the passenger turns it on explicitly.
- `BR-CHECKOUT-002`: Applying a valid voucher code dynamically re-computes `total_amount_vnd` and displays the discount line in emerald green (`#16A34A`).
- `BR-CHECKOUT-003`: Clicking "Thanh toán ngay" sets CTA to loading state and creates PostgreSQL Booking transaction within a single atomic database commit.

---

## 8. Exception Flows & Matrix

| Scenario | Trigger | UI Feedback | System Action | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Voucher Invalid / Expired | User enters invalid coupon code | Inline red text: *"Mã không hợp lệ hoặc đã hết lượt"* | Discount set to 0 đ | Re-enter code or proceed without |
| Hold Expired in Checkout | 10:00 timer hits 00:00 | Triggers `PAX-010` Expired Modal | Blocks `POST /bookings/create` | Return to Seat Map |
| Gateway Down | VNPAY maintenance flag active | VNPAY radio disabled with tag *"Bảo trì"* | Suggest alternate (MoMo / VietQR) | Select another method |

---

## 9. Analytics & Telemetry
- `CHECKOUT_VIEWED`: `{ booking_hold_token: "hld_99218ab4c", total_fare: 220000 }`
- `VOUCHER_APPLIED`: `{ voucher_code: "BUSGO20", discount_amount: 44000 }`
- `PAYMENT_METHOD_SELECTED`: `{ method: "VNPAY" }`
- `BOOKING_SUBMITTED`: `{ booking_id: "bkg_77192a83", total_amount: 176000 }`

---

## 10. UI Copy & Localization
- **Header:** *"Thanh toán & Xác nhận"*
- **Trip Summary Title:** *"Tóm tắt chuyến đi"*
- **Payment Method Title:** *"Phương thức thanh toán"*
- **COD Label:** *"Thanh toán bằng tiền mặt khi lên xe"*
- **Voucher Apply CTA:** *"Áp dụng"*
- **Pay CTA:** *"THANH TOÁN NGAY · {amount} đ"*

---

## 11. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Create booking with VNPAY
  Given the passenger is on PAX-012 with seat A02
  And selects payment method "VNPAY"
  When the passenger taps "THANH TOÁN NGAY"
  Then the app calls POST /api/v1/bookings/create with Idempotency-Key
  And receives booking_id and payment_id with 201 Created
  And transitions to PAX-013 Payment Processing.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-012-01` | Functional | Select MoMo and submit | Routes to MoMo payment processing |
| `TC-PAX-012-02` | Voucher | Apply valid 20% voucher | Total decreases by 20%, displays discount row |
| `TC-PAX-012-03` | Concurrency | Double tap CTA rapidly | Client blocks second tap, executes 1 API call |
