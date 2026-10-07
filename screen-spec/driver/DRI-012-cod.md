# DRI-012 — Driver COD Cash Collection & Receipt Handover

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen / Financial Confirmation  
**Priority:** P0 (Core Operational / Financial)  
**Route:** `/driver/trip/:id/cod/:ticketId`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-12`, `BR-COD-001`, `UC-DRI-COD-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Allow drivers/assistants to collect cash for Cash-On-Delivery (COD) unpaid bookings when the passenger boards, calculate change due, record cash handover, transition the payment status to `SUCCESS`, issue an electronic receipt via SMS, and mark the ticket `BOARDED`.
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** Scanned COD ticket on `DRI-009` or tapped "Thu COD" on `DRI-007`.
- **Outcome:** Cash recorded; payment reconciled; ticket marked `BOARDED`.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Thu tiền mặt (COD) khi lên xe                 │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ FARE SUMMARY CARD ──────────────────────────┐  │
│ │ Mã đặt chỗ: BG-88219 · Ghế: A02              │  │
│ │ Hành khách: Nguyễn Văn Nam                   │  │
│ │                                              │  │
│ │ 💵 SỐ TIỀN CẦN THU:          220.000 đ       │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  Số tiền khách đưa (Tính tiền thừa):              │
│  ┌─────────────────────────────────────────────┐  │
│  │ [ 500000 ] đ                                │  │
│  └─────────────────────────────────────────────┘  │
│  [ 250k ]  [ 300k ]  [ 500k ]  [ Đúng số tiền ]   │
│                                                   │
│ ┌─ CHANGE CALCULATION ─────────────────────────┐  │
│ │ 🟢 TIỀN THỪA TRẢ KHÁCH:      280.000 đ       │  │
│ │                                              │  │
│ │ Phương thức thối tiền:                       │  │
│ │ [🔘 Trả đủ tiền mặt]                         │  │
│ │ [⚪ Ghi nợ tiền thừa - Trả tại trạm nghỉ]     │  │
│ │ [⚪ Nạp ví thành viên (SĐT hành khách)]       │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ 💵 ĐÃ THU 220.000đ & CHO LÊN XE (CTA - 72dp) ] │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-COD-003` (Server-side fare and one collection per ticket - review FND-A39): The fare is the COD amount stored on the ticket; the client cannot change it. `fare_amount_vnd`, when sent, must equal the stored amount (`400 FARE_MISMATCH`). Only a COD ticket can be collected (`400 NOT_COD_TICKET`), only once (`400 ALREADY_COLLECTED`), and the cash received must cover the fare (`400 INSUFFICIENT_AMOUNT`). `change_settlement_method` must be one of the three methods above (`400 INVALID_SETTLEMENT_METHOD`); `WALLET_CREDIT` needs the passenger phone (`400 WALLET_PHONE_REQUIRED`) and credits the passenger wallet; `REST_STOP_DEBT_RECEIPT` opens an `OUTSTANDING` debt whose code is unique per ticket (`DR-<ticket>-<thousands>K`, for example `DR-88219A02-280K`) and is listed in `DRI-017`. Collecting also boards the passenger through the same single boarding path as a scan.
- `BR-COD-001`: Submitting cash receipt transitions `Payment` to `SUCCESS` and queues transaction in SQLite for shift reconciliation at depot end (`DRI-017`).
- `BR-COD-002` (Xử lý thối tiền lẻ khi phụ xe thiếu tiền mặt - REV-04):
- `BR-COD-005` (Debt cap per trip - Phase C review FND-C04): The change owed as `REST_STOP_DEBT_RECEIPT` receipts may total at most 1.000.000 đ per trip, counting every receipt issued on the trip whether or not it was redeemed. A collection that would pass the cap gives `400 DEBT_LIMIT_EXCEEDED` (with `issued_vnd`, `limit_vnd`), the ticket stays uncollected and the driver hands the change back in cash or through `WALLET_CREDIT`. Change returned in cash or credited to the wallet is not a debt and is not capped.
- `BR-COD-006` (Redeeming a receipt - Phase C review FND-C04): A debt receipt starts `OUTSTANDING`. The cashier pays it out once with `POST /api/v1/ops/debt-receipts/{receiptCode}/redeem` (see `MGR-022`); the end-of-trip report (`DRI-017`) lists the codes of the trip.
  - Hỗ trợ 3 hình thức giải quyết tiền thừa:
    1. `CASH_RETURNED`: Đã thối trực tiếp tiền mặt đủ cho khách.
    2. `REST_STOP_DEBT_RECEIPT`: Phụ xe thiếu tiền lẻ; phát hành mã biên lai nợ tiền thừa (Debt Receipt). Hệ thống tự động gửi SMS cho khách mã nhận tiền kèm số tiền nợ. Khách xuất trình mã để nhận tiền tại quầy thu ngân trạm dừng nghỉ kế tiếp hoặc bến xe trả khách.
    3. `WALLET_CREDIT`: Cộng thẳng số tiền thừa vào số dư tài khoản/ví BusGo liên kết với SĐT hành khách.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/payments/cod-collect`
- **Request Body:**
```json
{
  "ticket_id": "tkt_88192a",
  "amount_collected_vnd": 500000,
  "fare_amount_vnd": 220000,
  "change_due_vnd": 280000,
  "change_settlement_method": "CASH_RETURNED",
  "collected_by_staff_id": "TX8821",
  "device_timestamp": "2026-08-27T14:32:00Z"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "ticket_id": "tkt_88192a",
    "boarding_status": "BOARDED",
    "payment_status": "SUCCESS",
    "change_settlement": {
      "method": "REST_STOP_DEBT_RECEIPT",
      "debt_receipt_code": "DR-88192A-280K",
      "amount_due_vnd": 280000,
      "payout_location": "Trạm dừng nghỉ Ninh Bình Km120"
    }
  }
}
```
- **TC-DRI-012-01:** Verifies collecting cash marks ticket `BOARDED` and increments driver shift cash balance.
- **TC-DRI-012-02:** Verifies selecting `REST_STOP_DEBT_RECEIPT` creates a pending debt record for station cashier settlement.


## Design review 2026-10-07: COD ticket boarding (D100)

- `BR-COD-006`: an unpaid COD ticket boards **only** through the COD collection (`DRI-012`, `POST .../payments/cod-collect`), which marks it `BOARDED` in the same step. Manual boarding, PIN and QR scan of that ticket answer `409 COD_PAYMENT_REQUIRED` with `{ticket_id, seat_code, cod_amount_vnd}`; a group QR boards the paid members and lists the others in `cod_pending_passengers`.
- UI: the manifest row of an unpaid COD ticket has one primary action **"Thu {giá} & cho lên xe"** (opens the `DRI-012` sheet), never a separate "Cho lên xe" button. A scan that returns `COD_PAYMENT_REQUIRED` opens the same sheet with the fare filled in.
- Test: `test/server/cod_boarding_gate.test.js` (`TC-DSG-01` to `04`).
