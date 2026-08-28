# PAX-002 — Passenger Phone Login

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen  
**Priority:** P0 (Core Journey)  
**Route:** `/login`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-02`, `BR-AUTH-001`, `UC-PAS-AUTH-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Allow passengers to authenticate using their Vietnamese phone number via SMS OTP or WhatsApp fallback, enabling personalized booking histories, saved passenger contacts, loyalty rewards, and ticket tracking.
- **Actor:** Passenger (New or Returning).
- **Entry Condition:** Explicit tap on "Đăng nhập" from Home/Profile, session expiration interceptor (`SH-001`), or checkout login gate.
- **Outcome:** Valid phone number submitted; SMS OTP generated; user routed to `PAX-003-otp.md`.

---

## 2. Business Context
- **Requirements Trace:** `BR-AUTH-001` (E.164 phone normalization), `BR-AUTH-002` (Rate limiting: max 3 requests per 5 minutes per IP/Phone).
- **Business Invariant:** No account creation requires a password. Phone number + OTP is the sole primary identity provider for passengers.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-004 Home] or [PAX-012 Checkout]
Previous Screen: Calling screen or [PAX-001 Splash]
Next Screen: [PAX-003 OTP Verification]
Entry Points: Bottom Nav Profile, Checkout Login Prompt, Drawer Login CTA
Exit Points:
  ├── Tap Back / Close -> Return to previous screen (Guest mode)
  ├── Submit Phone -> Navigate to `/otp?phone=+84...`
Deep Link: `busgo://login?redirect=/checkout`
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [✕] (Close / Skip for now)                        │
├───────────────────────────────────────────────────┤
│                                                   │
│  Chào mừng đến với BusGo!                         │
│  Nhập số điện thoại để tiếp tục                   │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ 🇻🇳 +84 │  [ 0987 654 321                 ]  │  │
│  └─────────────────────────────────────────────┘  │
│  (i) Mã OTP 6 chữ số sẽ được gửi qua tin nhắn SMS │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │               Tiếp tục (CTA)                │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  Bằng việc tiếp tục, bạn đồng ý với               │
│  [Điều khoản dịch vụ] và [Chính sách bảo mật]     │
│                                                   │
├───────────────────────────────────────────────────┤
│ Safe Area Bottom                                  │
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **Primary Title:** Large bold typography ($24\text{px}$, Slate 900): *"Chào mừng đến với BusGo!"*.
2. **Interactive Input:** High-contrast Phone Field with pre-selected `+84` prefix flag and numeric keypad.
3. **Primary Action:** Full-width Brand Blue CTA Button ($48\text{dp}$ height, rounded $8\text{px}$).
4. **Legal Terms:** Muted $12\text{px}$ text with clickable underlined privacy links.

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CloseButton` | IconButton | Yes | Local | Enabled | Dismisses screen / returns guest |
| `PhoneInput` | InputField | Yes | User Input | Focused / Error / Valid | Numeric entry with auto-formatting |
| `CountryCodeSelector` | Dropdown | Yes | Local Config | Default `+84 (VN)` | Tap opens modal (VN, LA, KH) |
| `SubmitCTA` | Button | Yes | Form State | Disabled / Enabled / Loading | Tap submits OTP request |
| `TermsLinks` | RichText | Yes | Legal URIs | Normal | Tap opens webview modal |

---

## 6. Form Specification

| Field Name | Type | Required | Format / Regex | Max Length | Placeholder | Keyboard | Masking / Dependency |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `phone_number` | Phone | Yes | `^(0[3\|5\|7\|8\|9])[0-9]{8}$` | 10 chars | `0912 345 678` | `TextInputType.phone` | Space separated (`0912 345 678`) |

---

## 7. API Contract

### 7.1. Request OTP Endpoint
- **Endpoint:** `POST /api/v1/auth/passenger/otp/request`
- **Auth:** Public
- **Headers:** `Content-Type: application/json`, `Idempotency-Key: uuid`
- **Request Body:**
```json
{
  "phone": "+84987654321",
  "channel": "SMS",
  "device_id": "dev_9f8a2b3c4d"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "request_id": "otp_req_7781a9",
    "expires_in_seconds": 120,
    "resend_cooldown_seconds": 60,
    "channel": "SMS"
  }
}
```
- **Error Responses:**
  - `400 Bad Request`: `{"code": "INVALID_PHONE_NUMBER", "message": "Số điện thoại không hợp lệ."}`
  - `429 Too Many Requests`: `{"code": "RATE_LIMIT_EXCEEDED", "message": "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 5 phút."}`

---

## 8. Business Rules
- `BR-LOGIN-001`: Input phone must normalize leading `0` to international E.164 format `+84...` before API dispatch.
- `BR-LOGIN-002`: Submit button remains `DISABLED` until user enters exactly 10 valid Vietnamese digits.
- `BR-LOGIN-003`: Client prevents re-submitting while request is in-flight (sets loading spinner).

---

## 9. Exception Flows & Matrix

| Scenario | Trigger | UI Feedback | System Action | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Invalid Phone Format | Typing $<10$ digits or non-Vietnamese prefix | Inline red helper: *"Số điện thoại không đúng định dạng"* | Submit button disabled | User corrects digits |
| Rate Limit Hit | $>3$ OTP requests in 5 minutes | Toast banner with countdown timer | API returns HTTP 429 | Wait for cooldown timer |
| SMS Gateway Outage | API returns `SMS_GATEWAY_DOWN` | Bottom sheet offering WhatsApp / Zalo OTP | Offer alternate channel | Tap "Nhận mã qua Zalo" |

---

## 10. Security & Privacy
- **Privacy Masking:** Phone numbers displayed in confirmation screens are masked as `098***321`.
- **Zero Password Storage:** No credentials saved locally beyond short-lived auth session.

---

## 11. Analytics & Telemetry
- `LOGIN_SCREEN_VIEWED`: `{ source_screen: "checkout" | "profile" | "splash" }`
- `LOGIN_OTP_REQUESTED`: `{ phone_prefix: "098", carrier: "Viettel" }`
- `LOGIN_ERROR_OCCURRED`: `{ error_code: "RATE_LIMIT_EXCEEDED" }`

---

## 12. UI Copy & Localization
- **Title:** *"Chào mừng đến với BusGo"*
- **Subtitle:** *"Nhập số điện thoại để tra cứu vé và nhận ưu đãi"*
- **Placeholder:** *"0912 345 678"*
- **CTA:** *"Tiếp tục"*
- **Error Invalid:** *"Vui lòng nhập đúng 10 chữ số điện thoại hợp lệ."*
- **Terms Notice:** *"Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật của BusGo."*

---

## 13. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Successful OTP request
  Given the passenger enters a valid phone "0987654321"
  When the passenger taps "Tiếp tục"
  Then the app sends POST /api/v1/auth/passenger/otp/request
  And receives request_id with 200 OK
  And smoothly transitions to PAX-003 OTP Verification.

Scenario: Invalid phone number entry
  Given the passenger enters "012345"
  Then the "Tiếp tục" button remains disabled
  And inline validation highlights the field in neutral state until 10 digits are filled.
```

### Test Matrix:
| Test ID | Type | Input | Expected Output |
| :--- | :--- | :--- | :--- |
| `TC-PAX-002-01` | Validation | `0987654321` | Button enabled |
| `TC-PAX-002-02` | Validation | `0123456789` (Invalid prefix) | Inline error on blur |
| `TC-PAX-002-03` | Network | Rate limit 429 error | Displays cooldown alert |
