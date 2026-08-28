# MGR-021 — Manager Payment Transactions & Gateway Reconciliation

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Financial Ledger  
**Priority:** P0 (Financial / Compliance)  
**Route:** `/ops/payments`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-21`, `BR-PAY-002`, `UC-MGR-PAY-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide an immutable financial ledger of all payment transactions: inspect gateway callbacks (VNPAY, MoMo, VietQR, Bank Transfer, Driver COD), verify raw webhook payloads, detect payment status mismatches or double callbacks, and export bank reconciliation sheets.
- **Actor:** Finance Accountant / System Auditor.
- **Outcome:** Daily bank reconciliations completed with 0 mismatch.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/payments`
- **Query Params:** `status=SUCCESS|PENDING|FAILED&gateway=VNPAY&date=2026-08-27`
- **TC-MGR-021-01:** Verifies clicking a row opens raw JSON webhook payload inspector modal.
