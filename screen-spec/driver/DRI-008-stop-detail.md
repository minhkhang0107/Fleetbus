# DRI-008 — Driver Stop Detail & Arrival Confirmation

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen / Stop Deck  
**Priority:** P0 (Core Operational)  
**Route:** `/driver/trip/:id/stop/:stopId`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-08`, `BR-DRI-004`, `UC-DRI-STOP-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Manage vehicle arrival, passenger boarding/alighting reconciliation, and departure confirmation at an individual bus station or roadside pickup point along the route.
- **Actor:** Driver.
- **Outcome:** Stop arrival recorded; boarded/alighted passengers confirmed; departure confirmed advancing trip to next stop.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Chi tiết trạm dừng (Trạm 2/4)                 │
├───────────────────────────────────────────────────┤
│                                                   │
│ 🚏 TRẠM THU PHÍ PHÁP VÂN                          │
│ Đầu cao tốc Pháp Vân - Cầu Giẽ                    │
│ Giờ dự kiến đến: 14:30 (Thực tế: 14:32 · Đúng giờ)│
│                                                   │
│ ┌─ STOP RECONCILIATION SUMMARY ────────────────┐  │
│ │ ⬆️ KHÁCH ĐÓN: 6 khách (Đã lên: 4 · Chưa lên: 2)│  │
│ │ ⬇️ KHÁCH TRẢ: 0 khách                          │  │
│ │ 💵 THU TIỀN COD: 1 khách (220.000 đ)           │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │      📷 BẬT QUÉT QR ĐÓN KHÁCH (CTA - 72dp)  │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ [ 📋 Danh sách 6 khách trạm này ]                 │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ 🚀 XÁC NHẬN RỜI TRẠM ĐI TIẾP (CTA - 64dp) ]     │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-STOP-CONFIRM-001`: Tapping "Xác nhận rời trạm" checks if there are un-boarded passengers. If yes, displays confirmation dialog: *"Còn 2 khách chưa lên xe. Bạn có muốn đánh dấu vắng mặt (No-show) không?"*.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/stops/{stopId}/depart`
- **TC-DRI-008-01:** Submitting departure advances the Next Stop pointer in `DRI-006` to the subsequent stop.
