# DRI-016 — Driver Telemetry & MQTT Diagnostics

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Diagnostics  
**Priority:** P2 (Supporting)  
**Route:** `/driver/diagnostics`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-16`, `UC-DRI-TEL-003`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Provide operational engineering diagnostics for driver devices: test MQTT round-trip ping, verify Core API gateway latency, inspect background service wake-lock status, view raw telemetry JSON logs, and send debug logs to DevOps.
- **Actor:** Driver / Fleet IT Support.
- **Outcome:** Technical connectivity issues diagnosed and resolved without physical depot intervention.

---

## 2. API Contract & Diagnostic Tools
- **Ping Test:** Measures latency to `https://api.busgo.vn/health` and `mqtt.busgo.vn:8883`.
- **TC-DRI-016-01:** Verifies export logs button bundles recent SQLite telemetry logs into encrypted ZIP for support upload.
