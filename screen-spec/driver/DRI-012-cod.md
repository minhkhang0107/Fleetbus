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
│ └──────────────────────────────────────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ 💵 ĐÃ THU 220.000đ & CHO LÊN XE (CTA - 72dp) ] │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-COD-001`: Submitting cash receipt transitions `Payment` to `SUCCESS` and queues transaction in SQLite for shift reconciliation at depot end (`DRI-017`).
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/payments/cod-collect`
- **Request Body:**
```json
{
  "ticket_id": "tkt_88192a",
  "amount_collected_vnd": 220000,
  "collected_by_staff_id": "TX8821",
  "device_timestamp": "2026-08-27T14:32:00Z"
}
```
- **TC-DRI-012-01:** Verifies collecting cash marks ticket `BOARDED` and increments driver shift cash balance.
