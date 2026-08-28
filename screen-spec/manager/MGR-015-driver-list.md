# MGR-015 — Manager Driver Roster Directory

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Data Table  
**Priority:** P1 (Driver Management)  
**Route:** `/ops/drivers`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-15`, `BR-DRI-001`, `UC-MGR-DRI-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Manage the company's full roster of professional drivers and assistants: monitor driving license classes (D, E, FC), health inspection expiration dates, shift assignments, and safety scores.
- **Actor:** Fleet HR / Safety Manager.
- **Outcome:** Driver compliance verified; new drivers onboarded.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/drivers`
- **Query Params:** `status=ACTIVE|ON_LEAVE|SUSPENDED&search=TX8821`
- **TC-MGR-015-01:** Verifies drivers with license expiring in $<30\text{ days}$ display amber warning tag.
