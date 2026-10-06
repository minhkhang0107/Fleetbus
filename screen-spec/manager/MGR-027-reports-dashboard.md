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
- **Period and figures (review FND-A49):** `from` and `to` are inclusive dates (`YYYY-MM-DD`) applied to the booking issue date; without them the report covers everything. The summary reports `total_revenue_vnd` (gross), `refunded_vnd`, `net_revenue_vnd`, `total_tickets_sold` (seats), the channel shares `pos_share_pct`, `app_share_pct` and `hail_share_pct` (shares of gross revenue, adding up to 100), and the punctuality figures computed as in `MGR-002`. A figure with no data behind it (for example days without incidents) is not reported.
- **TC-MGR-027-01:** Verifies export report downloads structured XLSX sheet with matching summary totals.
