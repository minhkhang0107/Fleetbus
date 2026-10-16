# PAX-025 — Passenger Trip Delay & Disruption Alert

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen Notice / Emergency Banner  
**Priority:** P1 (Important Operational Flow / Edge Case)  
**Route:** `/notice/trip-delay/:tripId`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-25`, `BR-DELAY-001`, `UC-PAS-DELAY-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Notify passengers when a trip is experiencing severe operational delay ($>30\text{ minutes}$ due to highway congestion, severe weather, or mechanical issues), display recalculated departure/arrival ETAs, provide real-time bus location snapshot, and offer free trip reschedule or 100% refund without penalty.
- **Actor:** Passenger with active ticket.
- **Outcome:** Passenger is kept informed; chooses to wait with live tracking or cancel for immediate full refund.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ ⚠️ THÔNG BÁO CHUYẾN ĐI BỊ TRỄ                     │
├───────────────────────────────────────────────────┤
│                                                   │
│  Chuyến xe 14:00 (Hà Nội ➔ Thanh Hóa, 27/08)      │
│  đang bị chậm do: [ 🚗 Ùn tắc cao tốc Pháp Vân ]  │
│                                                   │
│ ┌─ UPDATED TIMELINE ───────────────────────────┐  │
│ │ Giờ xuất bến ban đầu:         14:00          │  │
│ │ 🔴 Giờ xuất bến dự kiến mới:  14:45 (+45p)   │  │
│ │ Dự kiến đến Thanh Hóa:        18:15          │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  Xe hiện đang cách Bến xe Giáp Bát 12.4 km.       │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │      📍 THEO DÕI VỊ TRÍ XE THỰC TẾ (CTA)    │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ 🔄 Đổi sang chuyến xe kế tiếp miễn phí ]       │
│  [ ❌ Hủy vé & Hoàn tiền 100% ngay lập tức ]      │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- **API Endpoint:** `GET /api/v1/trips/{tripId}/disruptions` & `POST /api/v1/trips/{tripId}/reschedule-free`
- `BR-DELAY-001`: If official delay exceeds 30 minutes, cancellation penalty is waived ($100\%$ refund guaranteed regardless of time before departure).
- `BR-DELAY-002` (Official delay - Phase C review FND-C03): The delay that counts is the one declared with `POST /ops/trips/{id}/delay` (`MGR-024`). `PAX-021` reads it when the passenger cancels (`tier: DELAY_WAIVER`). No automatic discount voucher is issued for a delay (`OQ-031`).
- **TC-PAX-025-01:** Verifies canceling a delayed trip bypasses the $<6\text{h}$ fee policy and grants 100% refund.
