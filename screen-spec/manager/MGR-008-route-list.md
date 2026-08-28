# MGR-008 — Manager Route & Corridor Directory

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Data Table  
**Priority:** P1 (Route Management)  
**Route:** `/ops/routes`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-08`, `BR-ROUTE-001`, `UC-MGR-ROUTE-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Manage transportation routes and express corridors: view total route distance, standard duration, number of intermediate stops, active scheduled trips, and create new routes via `MGR-009`.
- **Actor:** Route Operations Planner.
- **Outcome:** Route network maintained; corridors available for trip scheduling.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/routes`
- **Query Params:** `status=ACTIVE|INACTIVE&search=Hanoi&page=1&limit=20`
- **TC-MGR-008-01:** Verifies routes table displays origin, destination, distance, stop count, and status badge.
