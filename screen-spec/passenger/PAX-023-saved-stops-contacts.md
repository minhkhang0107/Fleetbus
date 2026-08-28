# PAX-023 — Passenger Saved Stops & Frequent Contacts

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen List & Editor  
**Priority:** P2 (Supporting)  
**Route:** `/profile/saved-contacts`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-23`, `UC-PAS-SAVED-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Manage saved favorite stops (Home, Office, University) and frequent co-travelers (Spouse, Children, Elderly Parents) to enable 1-tap checkout autofill across future bookings.
- **Actor:** Authenticated Passenger.
- **Outcome:** Saved profiles stored in PostgreSQL user account; automatically surfaced during checkout (`PAX-011`).

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/passenger/saved-travelers` & `POST /api/v1/passenger/saved-travelers`
- **Payload Schema:**
```json
{
  "travelers": [
    { "id": "trv_01", "full_name": "Trần Thị Hoa", "phone": "0912345678", "relationship": "SPOUSE" },
    { "id": "trv_02", "full_name": "Nguyễn Văn Bảo", "phone": "0987112233", "relationship": "PARENT" }
  ]
}
```
- **TC-PAX-023-01:** Create a new traveler and verify it appears in PAX-011 autofill modal.
