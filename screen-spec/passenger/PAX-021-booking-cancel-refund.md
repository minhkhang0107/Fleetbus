# PAX-021 — Passenger Booking Detail, Cancellation & Refund Policy

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen / Policy & Refund Flow  
**Priority:** P1 (Important Operational Flow)  
**Route:** `/booking/:bookingId/cancel`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-21`, `BR-CANCEL-001`, `BR-REFUND-001`, `UC-PAS-CAN-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Allow passengers to inspect booking policies, initiate voluntary cancellation requests for issued tickets, review automatic policy-calculated refund amounts and deduction fees, select a refund destination (Original Payment Gateway or BusGo Wallet), and track refund status.
- **Actor:** Passenger.
- **Entry Condition:** Tapped "Hủy vé & Yêu cầu hoàn tiền" on `PAX-017-ticket-detail-qr.md` or Booking Detail.
- **Outcome:** Cancellation submitted; tickets marked `CANCELLED`; refund request generated (`REFUND_REQUESTED`); seats released back into segment inventory.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-CANCEL-001` (Tiered Cancellation Policy), `BR-REFUND-001` (Idempotent Refund Gateway Triggers), `UC-PAS-CAN-001`.
- **CANCELLATION POLICY TIERS:**
  - $\ge 12\text{ hours}$ before departure: **100% Refund** (0% fee).
  - $6\text{ to } 12\text{ hours}$ before departure: **80% Refund** (20% fee).
  - $< 6\text{ hours}$ before departure: **0% Refund** (Non-refundable).
  - Trip cancelled by Operator: **100% Full Refund + 50,000 VND Apology Voucher**.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-017 Ticket Detail]
Previous Screen: [PAX-017 Ticket Detail]
Next Screen: [PAX-016 My Tickets] (Tab: Đã hủy)
Exit Points:
  ├── Tap Back -> Return to PAX-017 without cancelling
  └── Confirm Cancel -> Calls cancel API -> Displays Refund Confirmation Modal -> Navigates to PAX-016
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Hủy vé & Yêu cầu hoàn tiền                    │
├───────────────────────────────────────────────────┤
│ ┌─ TICKET BEING CANCELLED ─────────────────────┐  │
│ │ Mã đặt chỗ: BG-88219 · Ghế: A02              │  │
│ │ Tuyến: Hà Nội ➔ Thanh Hóa (14:00, 27/08/2026)│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ 📊 TÍNH TOÁN HOÀN TIỀN THEO CHÍNH SÁCH            │
│ ┌─────────────────────────────────────────────┐   │
│ │ • Giá vé ban đầu:                 176.000 đ │   │
│ │ • Thời gian hủy: Trước giờ chạy 14 tiếng    │   │
│ │ • Mức phí hủy (0%):                     0 đ │   │
│ │ ─────────────────────────────────────────── │   │
│ │ 🟢 SỐ TIỀN BẠN NHẬN LẠI:          176.000 đ │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ 💳 PHƯƠNG THỨC HOÀN TIỀN                          │
│ ┌─────────────────────────────────────────────┐   │
│ │ 🔘 Hoàn về tài khoản thanh toán ban đầu     │   │
│ │    (VNPAY / Thẻ MBBank · 1 - 3 ngày làm việc)│  │
│ ├─────────────────────────────────────────────┤   │
│ │ ⚪ Hoàn vào Ví BusGo (Nhận ngay lập tức)    │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ 📝 LÝ DO HỦY VÉ (Tùy chọn)                        │
│ [ 🔘 Đổi kế hoạch đi lại ]  [ ⚪ Đặt nhầm vé ]    │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ XÁC NHẬN HỦY VÉ VÀ HOÀN TIỀN (CTA) ]            │
└───────────────────────────────────────────────────┘
```

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PolicyCalculationBox` | Card | Yes | Policy API | Tier Highlight | Displays exact calculated refund |
| `RefundMethodGroup` | Radio Group | Yes | User Selection | Original / Wallet | Tap selects refund channel |
| `CancelReasonChips` | Chip Group | No | Static List | Selectable | Tap records feedback reason |
| `ConfirmCancelCTA` | Danger Button | Yes | Form State | Red Background | Tap triggers confirmation dialog |

---

## 6. API Contract

### 6.1. Calculate Refund Quote
- **Endpoint:** `GET /api/v1/bookings/{bookingId}/cancel-quote`
- **Auth:** Bearer
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "booking_id": "bkg_77192a83",
    "total_paid_vnd": 176000,
    "cancellation_fee_vnd": 0,
    "refund_amount_vnd": 176000,
    "fee_percentage": 0,
    "hours_until_departure": 14.2,
    "is_cancellable": true
  }
}
```

### 6.2. Submit Cancellation & Refund
- **Endpoint:** `POST /api/v1/bookings/{bookingId}/cancel`
- **Headers:** `Idempotency-Key: uuid`
- **Request Body:**
```json
{
  "reason": "CHANGED_PLAN",
  "refund_channel": "ORIGINAL_PAYMENT_METHOD"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "booking_id": "bkg_77192a83",
    "status": "CANCELLED",
    "refund_id": "ref_88192a",
    "refund_status": "PROCESSING",
    "refund_amount_vnd": 176000
  }
}
```

---

## 7. Business Rules
- `BR-CANCEL-001`: If `hours_until_departure < 6`, cancellation is blocked by server unless trip was officially marked `DELAYED` ($>30\text{m}$) or `CANCELLED` by operator.
- `BR-CANCEL-002`: Submitting cancellation immediately frees up the seat in Redis and PostgreSQL and broadcasts `SEAT_RELEASED` to realtime subscribers.

---

## 8. UI Copy & Localization
- **Header:** *"Hủy vé & Yêu cầu hoàn tiền"*
- **Calculation Title:** *"Chi tiết hoàn tiền"*
- **Confirm CTA:** *"XÁC NHẬN HỦY VÉ"*
- **Dialog Warning:** *"Bạn có chắc chắn muốn hủy vé? Thao tác này không thể hoàn tác và ghế sẽ được mở bán lại."*

---

## 9. Acceptance Criteria & Test Matrix
- **AC-001:** Given a trip departing in 14 hours, user cancels and receives 100% refund quote (176.000 đ) with 0 đ fee.
- **TC-PAX-021-01:** Submitting cancellation releases seat and navigates to "Đã hủy" ticket tab.
