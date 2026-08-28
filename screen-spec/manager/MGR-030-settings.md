# MGR-030 — Manager System Global Configuration & Settings

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen System Settings  
**Priority:** P2 (System Administration)  
**Route:** `/ops/settings`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-30`, `BR-SYS-001`, `UC-MGR-SYS-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Configure global system parameters: Redis Seat Lock TTL (default $600\text{s}$), Driver GPS telemetry sampling rate (default $3\text{s}$), Map provider API keys (Mapbox / Google Maps), Payment Gateway webhook secrets (VNPAY / MoMo), SMS Brandname credentials, and maintenance mode toggle.
- **Actor:** Super Administrator / Solution Architect.
- **Outcome:** Global engine parameters tuned and validated.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/settings` & `PUT /api/v1/ops/settings`
- **TC-MGR-030-01:** Verifies updating Redis Lock TTL immediately synchronizes with core backend cache engine.
