# MGR-014 — Manager Daily Fleet Dispatch Board & Resource Matrix

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Interactive Gantt Timeline / Dispatch Deck  
**Priority:** P0 (Core Operational)  
**Route:** `/ops/dispatch`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-14`, `BR-DISP-001`, `UC-MGR-DISP-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide a 24-hour visual Gantt timeline of all vehicles and drivers across the company. Dispatchers can review vehicle turnaround times, drag-and-drop assign vehicles/drivers to scheduled trips, detect resource clashes, and execute fast 1-click dispatch sign-offs.
- **Actor:** Chief Dispatcher / Fleet Planner.
- **Outcome:** Daily fleet operations scheduled without driver over-hours or vehicle clashes.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/dispatch/matrix?date=2026-08-27`
- **TC-MGR-014-01:** Verifies dragging a vehicle to an overlapping trip highlights collision in red.
