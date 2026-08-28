# MGR-028 — Manager Immutable System Audit Logs

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Full Screen Audit Directory  
**Priority:** P1 (Security & Governance Compliance)  
**Route:** `/ops/audit`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-28`, `BR-AUD-001`, `UC-MGR-AUD-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide an immutable, tamper-evident audit trail of all sensitive managerial actions (Manual seat locks, fare overrides, refund approvals, vehicle replacements, dispatch reassignments, driver license overrides) with full before/after JSON diffs, actor staff ID, client IP address, and cryptographic HMAC timestamp signature.
- **Actor:** Compliance Auditor / Lead Security Officer.
- **Outcome:** Full operational accountability and governance compliance.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/audit-logs`
- **Query Params:** `action_type=VEHICLE_REPLACEMENT|REFUND_APPROVED&staff_id=TX8821&date=2026-08-27`
- **TC-MGR-028-01:** Verifies inspecting an audit record displays before-and-after state diff viewer with highlighted changes.
