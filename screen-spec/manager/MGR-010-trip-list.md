# MGR-010 — Manager Trip Schedule Directory

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Data Table  
**Priority:** P0 (Core Operational)  
**Route:** `/ops/trips`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-10`, `BR-TRIP-001`, `UC-MGR-TRIP-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Search, filter, and monitor all scheduled, active, delayed, completed, and cancelled bus trips across corridors, dates, and vehicle assignments. Allows quick status inspection, ticket sales occupancy check, and direct navigation to Trip Detail (`MGR-012`) or Trip Creator (`MGR-011`).
- **Actor:** Dispatcher / Duty Manager.
- **Outcome:** Trip schedules managed and audited.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/trips`
- **Query Params:** `date=2026-08-27&status=ALL|IN_TRANSIT|DELAYED&route_id=rt_hn_th&page=1&limit=25`
- **TC-MGR-010-01:** Verifies filtering by date and corridor displays matching trip schedules with live seat occupancy.
