# MGR-024 — Manager Trip Delay Declaration & Passenger Broadcast

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Modal / Dispatch Tool  
**Priority:** P1 (Operations / Passenger Reassurance)  
**Route:** `/ops/trip/:id/delay-management`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-24`, `BR-DELAY-001`, `UC-MGR-DELAY-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Formally declare trip delays resulting from severe traffic congestion, weather, or depot queues. Sets the official revised departure/arrival times, automatically recalculates ETA across all downstream stops, and triggers push/SMS broadcasts (`PAX-025`) to passengers.
- **Actor:** Dispatcher / Customer Service Lead.
- **Outcome:** Operational delay declared; downstream ETAs updated; passenger notifications dispatched.

---

## 2. API Contract & Data Schema
- **Endpoint:** `POST /api/v1/ops/trips/{tripId}/delay`
- **Request Body:**
```json
{
  "delay_minutes": 30,
  "reason_category": "TRAFFIC_JAM",
  "public_announcement": "Do tắc đường tại nút giao Pháp Vân, chuyến xe dự kiến khởi hành lúc 14:30.",
  "send_sms": true
}
```
- **TC-MGR-024-01:** Verifies declaring delay recalculates stop progression ETAs and updates `PAX-018` and `PAX-025`.
