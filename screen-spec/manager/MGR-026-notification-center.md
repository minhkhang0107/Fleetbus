# MGR-026 — Manager Notification Campaign & Broadcast Engine

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Messaging Center  
**Priority:** P2 (Marketing & Communications)  
**Route:** `/ops/notifications`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-26`, `UC-MGR-NOTIF-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Create, schedule, and broadcast multi-channel communications (FCM Push Notifications, SMS Brandname, Zalo ZNS) targeted by route corridor, passenger booking status, loyalty tier, or driver fleet.
- **Actor:** Marketing Manager / Customer Communications Lead.
- **Outcome:** Targeted campaigns dispatched and delivery rates monitored.

---

## 2. API Contract & Data Schema
- **Endpoint:** `POST /api/v1/ops/notifications/broadcast`
- **TC-MGR-026-01:** Verifies sending an SMS broadcast estimates campaign cost before execution.
