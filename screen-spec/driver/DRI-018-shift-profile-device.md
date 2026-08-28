# DRI-018 — Driver Shift History, Profile & Device Management

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Tab  
**Priority:** P2 (Supporting)  
**Route:** `/driver/profile`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-18`, `UC-DRI-PROF-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Allow drivers to view monthly shift statistics (Completed trips, on-time departure %, total distance driven, customer safety ratings), check commercial driver license expiry countdown, test connected vehicle hardware (OBD-II, thermal printer), and log out of the shift.
- **Actor:** Driver.
- **Outcome:** Shift performance reviewed; device settings maintained.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/driver/profile`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "staff_id": "TX8821",
    "name": "Trần Văn Bình",
    "phone": "0912345678",
    "license_class": "FC",
    "license_valid_until": "2028-12-31",
    "monthly_metrics": {
      "total_trips": 42,
      "on_time_rate_pct": 97.6,
      "safety_score": 98.2,
      "rating": 4.9
    }
  }
}
```
- **TC-DRI-018-01:** Verifies shift statistics calculate monthly trip totals accurately.
