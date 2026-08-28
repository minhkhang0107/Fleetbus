# MGR-013 — Manager Segment Seat Inventory Matrix & Override Lock

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Full Screen Matrix Inspector  
**Priority:** P0 (Core Operational / Inventory)  
**Route:** `/ops/trip/:id/seat-inventory`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-13`, `BR-SEAT-001`, `UC-MGR-TRIP-004`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide an authoritative 2D Segment Occupancy Matrix for the trip. Dispatchers can inspect every seat's exact booking state across every sub-segment of the route (e.g. verifying that Seat A01 is Booked for Hanoi $\to$ Ninh Binh, but Available for Ninh Binh $\to$ Thanh Hoa), manually lock/block seats for technical issues, or execute VIP holds.
- **Actor:** Dispatcher / Inventory Controller.
- **Outcome:** Segment inventory audited; manual seat override locks committed.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Ma trận ghế theo chặng: Hà Nội ➔ Thanh Hóa (14:00, 27/08)               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🏷️ CHÚ THÍCH: [ 🟩 Trống ] [ 🟦 Đã đặt ] [ 🟨 Tạm giữ ] [ 🟥 Khóa kỹ thuật ]│
│                                                                             │
│ ┌─ SEGMENT OCCUPANCY MATRIX ──────────────────────────────────────────────┐ │
│ │ Mã ghế │ Chặng 1: HN ➔ Liêm Tuyền │ Chặng 2: Liêm Tuyền ➔ NB │ Chặng 3: NB ➔ TH│ │
│ ├────────┼──────────────────────────┼──────────────────────────┼──────────┤ │
│ │ A01    │ 🟦 ĐÃ ĐẶT (Nguyễn V. Nam)│ 🟦 ĐÃ ĐẶT (Nguyễn V. Nam)│ 🟩 TRỐNG │ │
│ │ A02    │ 🟦 ĐÃ ĐẶT (Trần V. Hùng) │ 🟩 TRỐNG                 │ 🟩 TRỐNG │ │
│ │ A03    │ 🟩 TRỐNG                 │ 🟩 TRỐNG                 │ 🟩 TRỐNG │ │
│ │ B01    │ 🟨 ĐANG GIỮ (05:14)      │ 🟨 ĐANG GIỮ (05:14)      │ 🟩 TRỐNG │ │
│ │ B02    │ 🟥 KHÓA KỸ THUẬT (Hỏng)  │ 🟥 KHÓA KỸ THUẬT         │ 🟥 KHÓA  │ │
│ └────────┴──────────────────────────┴──────────────────────────┴──────────┘ │
│                                                                             │
│ [ 🔒 Khóa ghế kỹ thuật ]  [ 🔓 Mở khóa ghế ]  [ 🎫 Đặt giữ chỗ nội bộ ]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-INVENTORY-001`: An authorized operator can manually toggle a seat's status to `BLOCKED` with a mandatory reason note, which immediately frees or locks the seat across all passenger search endpoints.
- **API Endpoint:** `GET /api/v1/ops/trips/{tripId}/seat-matrix` & `POST /api/v1/ops/trips/{tripId}/seats/override-lock`
- **TC-MGR-013-01:** Verifies manual lock instantly emits WebSocket `SEAT_BLOCKED` to passenger apps.
