# DRI-013 — Driver Turn-by-Turn Navigation & Corridor Guidance

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Navigation Map  
**Priority:** P1 (Important Operational)  
**Route:** `/driver/trip/:id/navigation`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-13`, `BR-TEL-001`, `UC-DRI-NAV-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Provide high-contrast turn-by-turn vector map navigation locked to the authorized interprovincial route corridor, displaying upcoming maneuvers, intermediate stop markers, speed limit warnings, and route deviation alerts.
- **Actor:** Driver.
- **Outcome:** Driver navigates strictly along authorized corridor; prevents accidental off-route deviations.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ ┌─ MANEUVER BANNER (Dark Slate / High Contrast)─┐ │
│ │ ⬆️ 450m nữa: Tiếp tục thẳng vào Cao tốc       │ │
│ │    Pháp Vân - Cầu Giẽ (Tốc độ tối đa: 100km/h) │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│                 [ NAVIGATION MAP ]                │
│                                                   │
│                     ▲ (Bus Position)              │
│                     │  62 km/h                    │
│                     │                             │
│                  ═══════ (Planned Corridor Polyline)
│                                                   │
│ ┌─ FLOATING SPEED & NEXT STOP BAR ─────────────┐  │
│ │ 62 km/h · Giới hạn: 80 km/h · Còn 8.2 km đến: │  │
│ │ 🚏 Bến xe Ninh Bình (Dự kiến: 16:10)          │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ ✕ Thoát về Bảng điều khiển ]  [ 🔊 Bật âm thanh ]│
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & Technical Integration
- `BR-NAV-001`: If the vehicle deviates $>500\text{m}$ from the authorized corridor polyline for $>2\text{ minutes}$, trigger audio alert and emit `ROUTE_DEVIATION` warning event to `MGR-025-operations-alerts.md`.
- **TC-DRI-013-01:** Verifies navigation runs offline using pre-cached vector tiles.
