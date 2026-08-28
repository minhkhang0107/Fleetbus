# MGR-016 — Manager Driver Safety & Telemetry Scorecard

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Profile & Analytics Deck  
**Priority:** P2 (Supporting)  
**Route:** `/ops/driver/:id`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-16`, `UC-MGR-DRI-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Inspect individual driver safety behavior: speed violations, harsh braking, telemetry background service uptime %, customer ratings, shift history, and incident logs.
- **Actor:** Safety Officer.
- **Outcome:** Driver safety evaluated; performance incentives calculated.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/drivers/{driverId}/performance`
- **TC-MGR-016-01:** Verifies safety scorecard charts over-speeding events over 30-day window.
