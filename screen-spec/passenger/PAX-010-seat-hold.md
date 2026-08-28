# PAX-010 — Passenger Seat Hold Confirmation & Expiry Handling

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Transitional Hold State / Expiry Modal  
**Priority:** P0 (Core Journey / Blocking)  
**Route:** `/trip/:tripId/seat-hold`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-10`, `BR-SEAT-002`, `UC-PAS-LOCK-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Secure a distributed 10-minute ($600\text{s}$) Redis lock for the passenger's selected seats across all sub-segments of the requested corridor. Manages the global synchronized countdown timer across subsequent checkout steps, and provides a blocking modal to release or recover if the hold expires before payment.
- **Actor:** Passenger.
- **Entry Condition:** Tapped "TIẾP TỤC" on `PAX-009-seat-map.md`.
- **Outcome:** Redis distributed lock acquired; hold token issued; user advances smoothly to `PAX-011-passenger-info.md` with active countdown banner.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-SEAT-002` (Redis Lua distributed lock with TTL 600s), `UC-PAS-LOCK-001`.
- **CRITICAL INVARIANT:** Lock key format: `lock:trip:{tripId}:seat:{seatCode}:seg:{segmentId}`.
- If lock acquisition fails (seat snatched by another user in the same millisecond window), the system returns HTTP 409 Conflict with the conflicting seat codes.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-009 Seat Map]
Previous Screen: [PAX-009 Seat Map]
Next Screen: [PAX-011 Passenger Info] ──► [PAX-012 Checkout]
Expired State Screen: Blocking Bottom Sheet -> Return to [PAX-009 Seat Map]
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

### 4.1. Active Hold Header Banner (Persistent across PAX-011 & PAX-012)
```text
┌───────────────────────────────────────────────────┐
│ ⏳ Giữ chỗ thành công! Hoàn tất thanh toán trong: │
│                       [ 09:58 ]                   │
│ (Ghế A02 · Bến Giáp Bát ➔ Bến Phía Bắc Thanh Hóa)  │
└───────────────────────────────────────────────────┘
```

### 4.2. Expired Hold Modal (Triggered on Timer = 00:00)
```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ ⏰ ]                        │
│             HẾT THỜI GIAN GIỮ CHỖ                 │
│                                                   │
│  Thời gian giữ ghế A02 (10 phút) đã kết thúc.     │
│  Ghế đã được mở lại để đảm bảo công bằng          │
│  cho các hành khách khác.                         │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │             CHỌN LẠI GHẾ (CTA)              │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│             [ Về trang chủ BusGo ]                │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HoldCountdownBanner` | Sticky Header | Yes | Server Timestamp | Running / Warning ($<2\text{m}$) | Displays remaining minutes:seconds |
| `LockAcquisitionLoader`| Full-Screen Shimmer| Yes | In-Flight API | Active ($<400\text{ms}$) | None |
| `ExpiredHoldModal` | Blocking Bottom Sheet| Conditional| Timer Expiry Event| Visible on `00:00` | Tap "Chọn lại ghế" pops to PAX-009 |
| `ReleaseHoldButton` | Text CTA | No | User Action | Enabled | Allows manual cancellation of hold |

---

## 6. API Contract

### 6.1. Acquire Distributed Seat Hold
- **Endpoint:** `POST /api/v1/trips/{tripId}/seats/hold`
- **Auth:** Optional Bearer (Guest session token supported)
- **Headers:** `Content-Type: application/json`, `Idempotency-Key: uuid`
- **Request Body:**
```json
{
  "pickup_stop_id": "stp_hn_gb",
  "dropoff_stop_id": "stp_th_pb",
  "seat_codes": ["A02"],
  "client_session_id": "sess_8f9a12c4"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "hold_token": "hld_99218ab4c",
    "trip_id": "trp_991823",
    "seat_codes": ["A02"],
    "locked_until": "2026-08-27T14:10:00.000Z",
    "ttl_seconds": 600,
    "total_fare_vnd": 220000
  }
}
```
- **Error `409 Conflict` (Seat already held):**
```json
{
  "status": "error",
  "code": "SEAT_LOCK_CONFLICT",
  "message": "Ghế A02 vừa có khách khác giữ chỗ trước bạn một tích tắc.",
  "conflicting_seats": ["A02"]
}
```

### 6.2. Explicitly Release Seat Hold
- **Endpoint:** `DELETE /api/v1/trips/{tripId}/seats/hold`
- **Headers:** `X-Hold-Token: hld_99218ab4c`
- **Response `200 OK`:** `{"status": "success", "message": "Đã giải phóng ghế giữ chỗ."}`

---

## 7. Business Rules
- `BR-HOLD-001`: Redis seat lock TTL is exactly $600\text{ seconds}$ ($10\text{ minutes}$).
- `BR-HOLD-002`: Countdown timer is calibrated against server `locked_until` UTC timestamp to prevent client device clock tampering.
- `BR-HOLD-003`: When the timer reaches $120\text{s}$ ($2\text{ minutes}$ remaining), the banner pulses amber with an alert sound.
- `BR-HOLD-004`: On timer expiration, the client MUST immediately invalidate `hold_token` and block checkout submission.

---

## 8. Exception Flows & Matrix

| Scenario | Trigger | UI Feedback | System Action | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Lock Conflict (409) | Simultaneous tap with another user | Pop-up: *"Ghế {code} vừa được người khác giữ"* | Returns to PAX-009, refreshes seat grid | Select another seat |
| Hold Timeout (00:00) | User idles $>10$ minutes in checkout | Full-screen Expired Modal | Purges hold session, releases Redis key | Tap "Chọn lại ghế" |
| App Closed / Killed | Passenger swipes app away | N/A | Redis TTL automatically expires in 600s | Clean background cleanup |

---

## 9. Analytics & Telemetry
- `SEAT_HOLD_ATTEMPTED`: `{ trip_id: "trp_991823", seat_codes: ["A02"] }`
- `SEAT_HOLD_ACQUIRED`: `{ hold_token: "hld_99218ab4c", duration_seconds: 600 }`
- `SEAT_HOLD_CONFLICT`: `{ conflicting_seats: ["A02"] }`
- `SEAT_HOLD_EXPIRED`: `{ hold_token: "hld_99218ab4c", step_reached: "checkout" }`

---

## 10. UI Copy & Localization
- **Hold Banner:** *"Giữ chỗ thành công! Hoàn tất trong: {mm:ss}"*
- **Warning Banner:** *"Sắp hết thời gian giữ chỗ: {mm:ss}"*
- **Expired Modal Title:** *"Hết thời gian giữ chỗ"*
- **Expired Modal Body:** *"Thời gian giữ chỗ 10 phút đã kết thúc. Ghế đã được mở lại để đảm bảo công bằng."*
- **Re-select CTA:** *"CHỌN LẠI GHẾ"*

---

## 11. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Successfully acquire seat hold
  Given the passenger selects seat A02 on PAX-009
  When the passenger taps "TIẾP TỤC"
  Then the app sends POST /api/v1/trips/{tripId}/seats/hold
  And receives hold_token with 600s TTL
  And navigates to PAX-011 Passenger Info displaying the 10:00 countdown banner.

Scenario: Hold expires on checkout screen
  Given the passenger is on PAX-012 Checkout with 5 seconds remaining
  When the countdown reaches 00:00
  Then the app displays the Expired Hold Modal
  And blocks payment submission
  And tapping "CHỌN LẠI GHẾ" navigates back to PAX-009 Seat Map.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-010-01` | Functional | Normal hold acquisition | Hold token saved, timer starts at 10:00 |
| `TC-PAX-010-02` | Concurrency | 409 Conflict response | Displays conflict dialog, returns to seat map |
| `TC-PAX-010-03` | Lifecycle | Timer reaches 00:00 | Displays blocking expired modal |
