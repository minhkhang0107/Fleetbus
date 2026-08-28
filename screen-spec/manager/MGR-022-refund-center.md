# MGR-022 — Manager Refund Processing Center

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Queue & Action Deck  
**Priority:** P0 (Financial / Customer Support)  
**Route:** `/ops/refunds`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-22`, `BR-REFUND-001`, `UC-MGR-REF-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Manage customer cancellation refund requests, overbooking compensation approvals, and late payment recovery refunds: inspect policy calculations, approve or adjust refund amounts, trigger automated Payment Gateway refund API calls, and monitor bank transfer receipts.
- **Actor:** Customer Service Lead / Finance Manager.
- **Outcome:** Refunds audited, approved, and dispatched through payment gateways.

---

## 2. API Contract & Business Rules
- `BR-REFUND-002`: Approving a refund calls the payment gateway refund endpoint with an `Idempotency-Key` and records the operator's staff ID in the audit log.
- **API Endpoint:** `POST /api/v1/ops/refunds/{refundId}/process`
- **TC-MGR-022-01:** Verifies approved refund transitions state to `REFUNDED` and updates booking financial balance.
