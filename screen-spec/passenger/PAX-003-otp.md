# PAX-003 — Passenger OTP Verification

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen  
**Priority:** P0 (Core Journey)  
**Route:** `/otp`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-03`, `BR-AUTH-002`, `UC-PAS-AUTH-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Verify passenger identity via a 6-digit one-time password (OTP) sent through SMS/Zalo, mint cryptographically signed JWT session tokens, and complete user login/registration.
- **Actor:** Passenger.
- **Entry Condition:** Redirected from `PAX-002-login.md` after successful OTP generation.
- **Outcome:** Valid OTP verified; JWT Access Token (1h) and Refresh Token (30d) securely stored; passenger routed to destination or home.

---

## 2. Business Context
- **Requirements Trace:** `BR-AUTH-002` (OTP validity window: 120s; Resend cooldown: 60s; Max failed attempts: 5 before lock).
- **Business Invariant:** Auto-registration occurs seamlessly on first verified login without extra profile barriers.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-002 Login]
Previous Screen: [PAX-002 Login]
Next Screen: 
  ├── [PAX-004 Home] (Default)
  └── [Previous Protected Route] (e.g. /checkout if login was prompted at checkout)
Entry Points: Successful submit from PAX-002.
Exit Points:
  ├── Tap Back / Edit Phone -> Return to PAX-002 with phone pre-filled
  ├── Auto-verify on 6th digit -> Route to destination
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Quay lại                                      │
├───────────────────────────────────────────────────┤
│                                                   │
│  Xác thực số điện thoại                           │
│  Mã OTP 6 chữ số đã được gửi đến                  │
│  0987 *** 321  [ Thay đổi ]                       │
│                                                   │
│  ┌───┐ ┌───┐ ┌───┐   ┌───┐ ┌───┐ ┌───┐            │
│  │ 4 │ │ 8 │ │ 2 │ - │ 9 │ │ 1 │ │ 0 │            │
│  └───┘ └───┘ └───┘   └───┘ └───┘ └───┘            │
│                                                   │
│  (i) Mã có hiệu lực trong: 01:54                  │
│                                                   │
│  Bạn chưa nhận được mã?                           │
│  [ Gửi lại mã sau (42s) ]                         │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │               Xác nhận (CTA)                │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ Safe Area Bottom                                  │
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **Title & Phone Notice:** Clear explanation with masked phone and inline "Thay đổi" button.
2. **6-Digit Pin Input:** Large distinct input boxes with active cursor highlight and auto-advance.
3. **Countdown & Resend:** Prominent timer ($14\text{px}$, Amber 600) with disabled resend button until countdown hits `00:00`.
4. **Primary CTA:** Full-width button, auto-submits on 6th digit entry.

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `BackButton` | IconButton | Yes | Navigation | Enabled | Pops back to PAX-002 |
| `PhoneLabel` | Typography | Yes | Route Params | Masked string | Tap "Thay đổi" pops to PAX-002 |
| `OtpPinBoxes` | 6x Custom Input | Yes | User Input | Empty / Focused / Filled / Error | Auto-advance, auto-paste from SMS |
| `ExpiryTimer` | Countdown | Yes | Server TTL (120s) | Running / Expired | Updates every 1000ms |
| `ResendButton` | TextButton | Yes | Cooldown (60s) | Disabled (with countdown) / Active | Tap triggers resend API |
| `VerifyCTA` | Button | Yes | Input State | Disabled / Enabled / Loading | Tap submits verification |

---

## 6. Form Specification & Auto-Fill

| Field | Type | Length | Format | Autofill Service |
| :--- | :--- | :--- | :--- | :--- |
| `otp_code` | Numeric Pin | 6 digits | `^[0-9]{6}$` | iOS `One-Time Code` / Android `SMS User Consent API` |

---

## 7. API Contract

### 7.1. Verify OTP
- **Endpoint:** `POST /api/v1/auth/passenger/otp/verify`
- **Auth:** Public
- **Headers:** `Content-Type: application/json`, `Idempotency-Key: uuid`
- **Request Body:**
```json
{
  "phone": "+84987654321",
  "request_id": "otp_req_7781a9",
  "otp": "482910",
  "device_id": "dev_9f8a2b3c4d",
  "fcm_token": "fcm_token_xyz"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "usr_9f8a2b3c4d",
      "phone": "+84987654321",
      "full_name": "Nguyễn Văn A",
      "is_new_user": false
    },
    "tokens": {
      "access_token": "eyJhbGciOi...",
      "refresh_token": "eyJhbGciOi...",
      "expires_in": 3600
    }
  }
}
```
- **Error Responses:**
  - `400 Bad Request`: `{"code": "INVALID_OTP", "message": "Mã OTP không chính xác. Bạn còn 3 lần thử."}`
  - `410 Gone`: `{"code": "OTP_EXPIRED", "message": "Mã OTP đã hết hạn. Vui lòng bấm gửi lại mã mới."}`
  - `423 Locked`: `{"code": "ACCOUNT_TEMPORARILY_LOCKED", "message": "Nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút."}`

---

## 8. Business Rules
- `BR-OTP-001`: Client automatically triggers API call as soon as the 6th digit is typed or pasted.
- `BR-OTP-002`: If SMS auto-read succeeds, the 6 boxes fill with animation and submit immediately.
- `BR-OTP-003`: On HTTP 400 (`INVALID_OTP`), shake the 6 pin boxes with haptic error feedback and clear inputs.

---

## 9. Exception Flows & Matrix

| Scenario | Trigger | UI Feedback | System Action | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Wrong OTP | Incorrect digits entered | Red box borders + Shake animation + *"Mã không đúng"* | Counter decrements | Re-type digits |
| OTP Expired | 120s timer reaches zero | Toast: *"Mã OTP đã hết hạn"* | Input disabled | Tap "Gửi lại mã" |
| Account Locked | 5 consecutive wrong tries | Blocking alert with 15-min countdown | Account lock flag | Wait 15 minutes |

---

## 10. Analytics & Telemetry
- `OTP_SCREEN_VIEWED`: `{ phone_prefix: "098" }`
- `OTP_VERIFIED_SUCCESS`: `{ is_new_user: false, duration_seconds: 14 }`
- `OTP_VERIFIED_FAILED`: `{ error_code: "INVALID_OTP", remaining_attempts: 3 }`
- `OTP_RESEND_CLICKED`: `{ resend_count: 1 }`

---

## 11. UI Copy & Localization
- **Title:** *"Xác thực số điện thoại"*
- **Subtitle:** *"Mã xác thực 6 chữ số đã được gửi đến số điện thoại"*
- **Edit CTA:** *"Thay đổi"*
- **Timer Prefix:** *"Mã có hiệu lực trong:"*
- **Resend Inactive:** *"Gửi lại mã sau ({seconds}s)"*
- **Resend Active:** *"Gửi lại mã OTP"*
- **Submit CTA:** *"Xác nhận"*

---

## 12. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Valid OTP entry
  Given the passenger is on PAX-003 with phone "0987654321"
  When the passenger inputs valid OTP "482910"
  Then the app calls POST /api/v1/auth/passenger/otp/verify
  And securely stores access_token and refresh_token
  And navigates to PAX-004 Home with a success toast.

Scenario: SMS autofill
  Given the passenger receives an SMS with "Ma xac thuc BusGo cua ban la 482910"
  When the OS autofill provider injects the code
  Then the pin boxes populate automatically and submit without requiring manual CTA tap.
```

### Test Matrix:
| Test ID | Type | Input | Expected Output |
| :--- | :--- | :--- | :--- |
| `TC-PAX-003-01` | Functional | Correct 6-digit code | Auto-submits, routes to home |
| `TC-PAX-003-02` | Error Handling| Incorrect code | Shake animation, displays remaining tries |
| `TC-PAX-003-03` | Lifecycle | Timer expires | Resend button becomes clickable |
