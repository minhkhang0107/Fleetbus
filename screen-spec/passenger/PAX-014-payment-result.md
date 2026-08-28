# PAX-014 — Passenger Payment Result & Late Success Recovery

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen State Resolver  
**Priority:** P0 (Core Journey / Financial)  
**Route:** `/payment/result`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-14`, `BR-PAY-002`, `UC-PAS-PAY-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Handle all non-instant payment outcomes: Payment Processing / Pending Verification, Payment Failed (insufficient funds, OTP timeout), Payment Expired, and edge-case **Late Payment Success** (where money was deducted from customer's bank after the 10-minute hold expired and the seat was reassigned).
- **Actor:** Passenger.
- **Entry Condition:** Gateway webview callback, payment polling resolution, or deep link return.
- **Outcome:** Passenger clearly understands payment status and is guided to success, retry, or customer support refund recovery.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-PAY-002` (Late Payment Recovery Policy), `UC-PAS-PAY-002`.
- **LATE SUCCESS RESOLUTION RULE:** If webhook arrives after hold expiry and the seat is no longer available:
  1. Payment is marked `UNMATCHED_OVERDUE`.
  2. Booking status transitions to `PAYMENT_EXPIRED_REFUND_PENDING`.
  3. UI displays dedicated Late Payment Resolution screen offering **1-Tap Auto-Refund** or **Free Rebooking Support**.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-013 Payment Processing]
Previous Screen: [PAX-013 Payment Processing]
Next Screen:
  ├── [PAX-015 Booking Success] (If status === SUCCESS)
  ├── [PAX-012 Checkout] (If status === FAILED / User Retries)
  └── [PAX-016 My Tickets] (If user leaves pending verification)
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

### 4.1. Payment Failed State Wireframe
```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ ❌ ]                        │
│            THANH TOÁN KHÔNG THÀNH CÔNG            │
│                                                   │
│  Giao dịch thanh toán 176.000 đ chưa hoàn tất.    │
│  Lý do: Số dư tài khoản không đủ hoặc thẻ bị từ chối│
│                                                   │
│  Mã đơn hàng: BG-88219 · Mã GD: VP-998822         │
│  Thời gian giữ ghế còn lại: 03:20                 │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │           THỬ LẠI PHƯƠNG THỨC KHÁC (CTA)    │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ Chọn thanh toán khi lên xe (COD) ]             │
│  [ Quay về trang chủ ]                            │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 4.2. Late Payment Success State Wireframe
```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ ⚠️ ]                        │
│          GIAO DỊCH ĐÃ ĐƯỢC THANH TOÁN             │
│            (Hết thời gian giữ chỗ)                │
│                                                   │
│  Tài khoản của bạn đã bị trừ 176.000 đ.           │
│  Tuy nhiên, do giao dịch hoàn tất sau thời gian   │
│  giữ chỗ (10 phút), ghế A02 đã có khách khác đặt. │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │     NHẬN HOÀN TIỀN 100% VỀ TÀI KHOẢN (CTA)  │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │     LIÊN HỆ TỔNG ĐÀI ĐỔI CHUYẾN MIỄN PHÍ    │  │
│  │              (Hotline: 1900 6868)           │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `StatusIconAnimation` | Lottie / SVG | Yes | Payment Status | Success / Failed / Late | Plays status animation |
| `StatusTitle` | Typography | Yes | Payment Status | Bold ($22\text{px}$) | None |
| `ErrorReasonBox` | Alert Box | Conditional | Gateway Error Code | Red border / Slate text | None |
| `RetryCTA` | Button | Yes | Flow State | Primary Blue | Pops back to PAX-012 with hold active |
| `SwitchToCodCTA` | Button | Conditional | Trip COD Policy | Secondary Outline | Converts booking to COD mode |
| `AutoRefundCTA` | Button | Conditional | Late Payment | Emerald Button | Triggers instant refund workflow |

---

## 6. API Contract

### 6.1. Query Payment Status
- **Endpoint:** `GET /api/v1/payments/{paymentId}/status`
- **Auth:** Optional Bearer
- **Response `200 OK` (Late Success):**
```json
{
  "status": "success",
  "data": {
    "payment_id": "pay_99218a",
    "payment_status": "LATE_SUCCESS_SEAT_LOST",
    "amount_vnd": 176000,
    "gateway_ref": "VNPAY_14882199",
    "resolution_options": {
      "auto_refund_available": true,
      "hotline": "19006868"
    }
  }
}
```

---

## 7. Business Rules
- `BR-RESULT-001`: If payment status is `SUCCESS`, automatically advance to `PAX-015-booking-success.md` within $1.5\text{ seconds}$.
- `BR-RESULT-002`: If user taps "Nhận hoàn tiền 100%", client triggers `POST /api/v1/payments/{id}/refund-request` and displays confirmation toast.

---

## 8. Analytics & Telemetry
- `PAYMENT_RESULT_VIEWED`: `{ payment_id: "pay_99218a", status: "FAILED" | "LATE_SUCCESS" }`
- `PAYMENT_RETRY_CLICKED`: `{ from_method: "VNPAY" }`
- `LATE_REFUND_REQUESTED`: `{ payment_id: "pay_99218a", amount: 176000 }`

---

## 9. UI Copy & Localization
- **Failed Title:** *"Thanh toán không thành công"*
- **Failed Subtitle:** *"Giao dịch của bạn bị gián đoạn. Vui lòng thử lại trước khi hết thời gian giữ chỗ."*
- **Retry CTA:** *"Thử lại phương thức khác"*
- **Late Title:** *"Giao dịch thanh toán trễ hạn"*
- **Refund CTA:** *"Hoàn tiền 100% về tài khoản"*

---

## 10. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Payment failure with remaining hold time
  Given the payment gateway returns CANCELLED
  And there is still 3 minutes remaining on the seat hold
  When PAX-014 renders
  Then it displays the Payment Failed screen with the remaining timer
  And tapping "Thử lại" returns to PAX-012 with the hold preserved.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-014-01` | Error | Gateway returns insufficient funds | Displays clear explanation in Vietnamese |
| `TC-PAX-014-02` | Edge Case | Late webhook arrival after lock expiry | Displays Late Payment refund recovery screen |
