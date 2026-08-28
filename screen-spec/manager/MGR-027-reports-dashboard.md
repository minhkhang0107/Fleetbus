# MGR-027 — Manager Operational Yield & Analytics Reports

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Analytics & Export  
**Priority:** P1 (Business Intelligence / Finance)  
**Route:** `/ops/reports`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-27`, `BR-REPORT-001`, `UC-MGR-REP-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Analyze financial yield and route efficiency: Seat Load Factor % by corridor, Revenue per Available Seat-Kilometer (RASK), on-time departure trends, COD cash collection audit summaries, and export compliant Excel/CSV reports for accounting.
- **Actor:** CFO / Operations Director / Business Analyst.
- **Outcome:** Yield optimized; financial reports exported.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/reports/yield?from=2026-08-01&to=2026-08-27`
- **TC-MGR-027-01:** Verifies export report downloads structured XLSX sheet with matching summary totals.
