# MGR-025 — Manager Realtime Operations Alerts & Incident Feed

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Full Screen Incident Feed  
**Priority:** P0 (Mission-Critical / Safety)  
**Route:** `/ops/alerts`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-25`, `BR-ALERT-001`, `UC-MGR-ALERT-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide a real-time event feed of operational anomalies across the entire fleet: Stale GPS / Loss of Telemetry ($>60\text{s}$), Off-route deviations ($>500\text{m}$), Driver SOS alerts, severe trip delays, speeding violations ($>100\text{km/h}$ on expressway), and long unauthorized stops.
- **Actor:** Safety Officer / 24/7 Operations Controller.
- **Outcome:** Incidents acknowledged, assigned to dispatchers, and resolved with action history.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/alerts`
- **WS Subscription:** `ops:alerts`
- **TC-MGR-025-01:** Verifies high-priority SOS events trigger an audible alarm chime and sticky red banner in the portal top app bar.
