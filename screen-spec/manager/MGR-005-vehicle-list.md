# MGR-005 — Manager Vehicle Fleet Directory

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Data Table  
**Priority:** P1 (Fleet Management)  
**Route:** `/ops/vehicles`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-05`, `BR-FLEET-001`, `UC-MGR-FLEET-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Manage the company's entire physical vehicle fleet: search and filter by license plate, vehicle model, seat capacity, maintenance status, bound seat layout template, depot assignment, and insurance/inspection expiry dates.
- **Actor:** Fleet Operations Manager.
- **Outcome:** Fleet inventory organized; new vehicles added via `MGR-006`.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/vehicles`
- **Query Params:** `status=ACTIVE|MAINTENANCE|INACTIVE&model=LIMOUSINE_34&page=1&limit=20`
- **TC-MGR-005-01:** Verifies filtering by maintenance status isolates vehicles flagged for workshop service.
