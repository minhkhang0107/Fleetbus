# PAX-024 — Passenger Vehicle Replacement & Reseating Notice

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen Notice & Action Resolver  
**Priority:** P1 (Important Operational Flow / Edge Case)  
**Route:** `/notice/vehicle-replacement/:incidentId`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-24`, `BR-REP-001`, `UC-PAS-REP-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Inform the passenger when their scheduled bus has been swapped by operations (e.g. breakdown, technical maintenance). Displays the new vehicle model, new license plate, and any seat code reassignments or upgrades, with options to accept the new seat or request a free change / 100% refund.
- **Actor:** Passenger with active ticket on swapped trip.
- **Entry Condition:** Tapped push notification or in-app emergency alert banner.
- **Outcome:** Passenger reviews new vehicle assignment; accepts seat mapping or initiates free seat reselection.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ ⚠️ THÔNG BÁO ĐỔI XE TỪ NHÀ XE                     │
├───────────────────────────────────────────────────┤
│                                                   │
│  Chuyến xe 14:00 (Hà Nội ➔ Thanh Hóa, 27/08)      │
│  đã được điều động xe thay thế để đảm bảo an toàn.│
│                                                   │
│ ┌─ VEHICLE COMPARISON ─────────────────────────┐  │
│ │ XE CŨ:   29B-123.45 (Giường Nằm 40 Chỗ)      │  │
│ │               ▼ ĐỔI SANG ▼                   │  │
│ │ XE MỚI:  29B-999.88 (Limousine 34 Phòng VIP) │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ SEAT REASSIGNMENT ──────────────────────────┐  │
│ │ Ghế cũ của bạn:      A04                     │  │
│ │ 🟢 Ghế mới tương đương: A02 (Tầng 1 - VIP)   │  │
│ │ (Xe mới tiện nghi cao cấp hơn · Không phụ thu)│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │       XÁC NHẬN CHỖ NGỒI MỚI (CTA)           │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ Chọn lại ghế khác trên xe mới ]                │
│  [ Hủy vé & Nhận hoàn tiền 100% ]                 │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- **API Endpoint:** `GET /api/v1/trips/{tripId}/replacement-info` & `POST /api/v1/trips/{tripId}/replacement/accept`
- `BR-REP-001`: If replacement vehicle has equal or higher tier, no surcharge is charged. If downgraded (e.g. VIP to Standard), automatic difference refund is credited to customer.
- **TC-PAX-024-01:** Verifies accepting updates ticket record with new vehicle plate and seat code.
