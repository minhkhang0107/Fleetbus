# DRI-003 — Driver Trip Detail Pre-start & Route Briefing

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Briefing  
**Priority:** P0 (Operational Blocking)  
**Route:** `/driver/trip/:id/prestart`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-03`, `BR-DRI-003`, `UC-DRI-TRIP-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Provide a complete pre-departure operational briefing for the driver: vehicle inspection status, full manifest passenger count, stop sequence along the corridor with planned arrival times, expected passenger boardings per stop, COD cash collection targets, and entry into the Vehicle Readiness Checklist (`DRI-004`).
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** Selected an upcoming trip from `DRI-002-today-trips.md`.
- **Outcome:** Driver reviews route constraints and taps "KIỂM TRA AN TOÀN XE" to advance to `DRI-004`.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Thông tin chuyến xuất bến                     │
├───────────────────────────────────────────────────┤
│ ┌─ TRIP OVERVIEW CARD ─────────────────────────┐  │
│ │ Tuyến: Hà Nội ──────────────► Thanh Hóa      │  │
│ │ Xuất bến: 14:00 (27/08) · Xe: 29B-123.45     │  │
│ │ 👥 28 Khách · 💵 Thu tiền COD: 4 vé (880.000đ)│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ 🚏 DANH SÁCH ĐIỂM DỪNG & KHÁCH ĐÓN               │
│ ┌─────────────────────────────────────────────┐   │
│ │ 🟢 Trạm 1 (Xuất phát): Bến xe Giáp Bát      │   │
│ │    14:00 · ⬆️ Đón 18 khách · ⬇️ 0 khách     │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ⚪ Trạm 2: Trạm thu phí Pháp Vân            │   │
│ │    14:30 · ⬆️ Đón 6 khách · ⬇️ 0 khách      │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ⚪ Trạm 3: Bến xe Ninh Bình                 │   │
│ │    16:10 · ⬆️ Đón 4 khách · ⬇️ Trả 8 khách  │   │
│ ├─────────────────────────────────────────────┤   │
│ │ 🔴 Trạm 4 (Điểm cuối): Bến xe Phía Bắc      │   │
│ │    17:30 · ⬆️ 0 khách · ⬇️ Trả 20 khách     │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ [ 📋 Xem danh sách hành khách chi tiết (Manifest) ]│
│                                                   │
├───────────────────────────────────────────────────┤
│ [ KIỂM TRA AN TOÀN XE ĐỂ BẮT ĐẦU (CTA - 64dp) ]   │
└───────────────────────────────────────────────────┘
```

---

## 3. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TripSummaryBanner`| Card | Yes | Trip Snapshot | Normal | Highlights plate, total passengers, COD |
| `StopSequenceList` | List of Stops | Yes | Route Snapshot | Chronological | Displays stop order, boarding/alighting counts |
| `ViewManifestCTA` | Outlined Button | Yes | Navigation | Enabled | Opens `DRI-007-manifest.md` |
| `SafetyChecklistCTA`| DriverActionPill| Yes | Flow State | Brand Blue ($64\text{dp}$) | Navigates to `DRI-004-readiness.md` |

---

## 4. API Contract

### 4.1. Get Pre-start Trip Briefing
- **Endpoint:** `GET /api/v1/driver/trips/{tripId}`
- **Auth:** Bearer (Driver)
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "route_name": "Hà Nội - Thanh Hóa",
    "departure_time": "2026-08-27T14:00:00+07:00",
    "vehicle": {
      "plate": "29B-123.45",
      "model": "Limousine 34 VIP"
    },
    "metrics": {
      "total_booked": 28,
      "total_boarded": 0,
      "cod_pending_count": 4,
      "cod_total_amount_vnd": 880000
    },
    "stops": [
      { "stop_id": "stp_hn_gb", "name": "Bến xe Giáp Bát", "time": "14:00", "board_count": 18, "alight_count": 0 },
      { "stop_id": "stp_hn_pv", "name": "Trạm Pháp Vân", "time": "14:30", "board_count": 6, "alight_count": 0 }
    ]
  }
}
```

---

## 5. UI Copy & Acceptance Criteria
- **CTA:** *"KIỂM TRA AN TOÀN XE ĐỂ BẮT ĐẦU"*
- **AC-001:** Given a dispatched trip, driver reviews stops and taps CTA to open `DRI-004-readiness.md`.
- **TC-DRI-003-01:** Verifies COD pending count and amount are calculated accurately.
