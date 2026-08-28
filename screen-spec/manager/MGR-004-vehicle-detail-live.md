# MGR-004 — Manager Vehicle Live Telemetry Inspector

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Drawer / Deep Inspector  
**Priority:** P0 (Core Operational)  
**Route:** `/ops/vehicle/:id/live`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-04`, `BR-TEL-001`, `UC-MGR-RADAR-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide deep telemetry inspection for a specific active bus: breadcrumb historical path, speed profile chart over time, GPS ping jitter, CAN-bus engine temperature/fuel telemetry, passenger occupancy, and direct action triggers (Call Driver, Declare Delay, Emergency Vehicle Replacement).
- **Actor:** Dispatcher / Fleet Safety Officer.
- **Outcome:** Telemetry anomalies diagnosed; corrective actions dispatched.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/vehicles/{id}/telemetry-trail`
- **WS Subscription:** `vehicle:{vehicleId}:telemetry`
- **TC-MGR-004-01:** Verifies breadcrumb trail renders past 60 minutes of GPS points with color-coded speed segments.
