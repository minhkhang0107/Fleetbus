# MGR-029 — Manager RBAC Roles & Permission Matrix

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Security Configuration  
**Priority:** P1 (Security & Authorization)  
**Route:** `/ops/roles-permissions`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-29`, `BR-AUTH-003`, `UC-MGR-AUTH-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Define and assign Role-Based Access Control (RBAC) permissions across staff roles (`ROLE_SUPER_ADMIN`, `ROLE_DISPATCHER`, `ROLE_COUNTER_STAFF`, `ROLE_FINANCE_ACCOUNTANT`, `ROLE_SAFETY_OFFICER`), scoping capabilities by specific depot branches or company-wide.
- **Actor:** Super Administrator / IT Security Lead.
- **Outcome:** Granular capabilities configured; unauthorized operations blocked.

---

## 2. RBAC Capability Matrix
- `TRIP_CREATE`, `TRIP_DISPATCH`, `VEHICLE_REPLACE`, `REFUND_APPROVE`, `AUDIT_VIEW`, `POS_SELL`, `SEAT_OVERRIDE_LOCK`.
- **API Endpoint:** `GET /api/v1/ops/rbac/roles` & `POST /api/v1/ops/rbac/roles`
- **TC-MGR-029-01:** Verifies removing `REFUND_APPROVE` immediately disables refund action buttons for that role.
