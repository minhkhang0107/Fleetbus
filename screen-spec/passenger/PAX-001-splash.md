# PAX-001 — Splash & App Initialization

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen / Launch Flow  
**Priority:** P0 (Blocking)  
**Route:** `/splash`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-01`, `BR-SYS-001`, `UC-PAS-INIT-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Initialize client runtime, establish secure device context, verify application version compatibility against backend force-upgrade policy, load cached user credentials/tokens, and route user seamlessly to Home or Login.
- **Actor:** Passenger (Guest or Authenticated User).
- **Entry Condition:** App launched from OS home screen, app icon tap, or cold restart via push notification deep link.
- **Outcome:** System health validated; session evaluated; user directed to `/home` (if valid token or guest mode enabled) or `/login`.

---

## 2. Business Context
- **Requirements Trace:** `BR-SYS-001` (Client Version Control), `BR-AUTH-001` (Token Validation), `UC-PAS-INIT-001`.
- **Business Invariant:** No user may bypass a `FORCE_UPGRADE` directive from the backend. App must prevent API calls if local version $< \text{min\_supported\_version}$.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: OS Launcher
Previous Screen: None (Cold Start)
Next Screen: 
  ├── [PAX-004 Home] (Token valid OR Guest allowed)
  ├── [PAX-002 Login] (Token missing/expired and Guest prohibited)
  └── [SH-005 Force Upgrade] (Version deprecated)
Deep Link Handling: Store pending deep link URI in memory -> Execute route transition after initialization.
Back Button Behavior: Exits application (OS level).
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ Status Bar (Light/Dark adaptive)                  │
├───────────────────────────────────────────────────┤
│                                                   │
│                                                   │
│                     [ BusGo ]                     │
│               (Brand Logo Animation)              │
│                                                   │
│         Hệ thống đặt xe & theo dõi liên tỉnh      │
│                                                   │
│                                                   │
│                    [   ● ● ●   ]                  │
│               (Smooth Loading Indicator)          │
│                                                   │
├───────────────────────────────────────────────────┤
│ v3.0.0 (Build 412) · Đang khởi tạo kết nối...     │
│ Safe Area Bottom                                  │
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **Primary Focus:** Animated BusGo Vector Logo centered vertically with subtle scale-up easing ($300\text{ms}$).
2. **Secondary:** Reassuring brand tagline: *"Hệ thống đặt xe & theo dõi liên tỉnh"*.
3. **Tertiary:** Micro-loading pulse and subtle build version footer ($12\text{px}$, Slate 400).

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `BrandLogo` | Vector SVG | Yes | Static Asset | Animated ($1.0 \to 1.05$ scale) | None |
| `AppTagline` | Typography | Yes | Local String | Visible | None |
| `InitSpinner` | Loading Indicator | Yes | Client UI State | Active / Fading | None |
| `VersionFooter` | Typography | Yes | Package Info | Static (`v3.0.0`) | None |
| `NetworkRetryBanner` | Modal / Toast | Conditional | Network State | Hidden / Visible on timeout | Tap "Thử lại" |

---

## 6. Screen Data Contract

- **Server Authoritative Data:**
  - `min_supported_version: string` (e.g. `"3.0.0"`)
  - `current_latest_version: string` (e.g. `"3.1.2"`)
  - `force_upgrade: boolean`
  - `store_url: string`
  - `maintenance_mode: boolean`
- **Client Temporary State:**
  - `init_stage: 'CHECKING_STORAGE' | 'FETCHING_CONFIG' | 'VALIDATING_AUTH' | 'ROUTING'`
  - `stored_token: string | null`
  - `network_timeout_timer: Timer`

---

## 7. API Contract

### 7.1. App Remote Config & Version Handshake
- **Endpoint:** `GET /api/v1/app/config`
- **Auth:** Public
- **Headers:** `X-App-Platform: ios|android`, `X-App-Version: 3.0.0`, `X-Device-Id: dev_uuid`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "min_supported_version": "3.0.0",
    "latest_version": "3.0.4",
    "force_upgrade": false,
    "store_url": "https://play.google.com/store/apps/details?id=vn.busgo.passenger",
    "maintenance": {
      "is_active": false,
      "message": ""
    },
    "features": {
      "guest_checkout": true,
      "vnpay_enabled": true,
      "momo_enabled": true,
      "vietqr_enabled": true
    }
  }
}
```

---

## 8. State Model & State Machine

```text
[COLD_START]
     │
     ▼
[READ_SECURE_STORAGE] ──(No Token)──► [FETCH_CONFIG] ──► [NAVIGATE_HOME_OR_LOGIN]
     │
 (Has Token)
     │
     ▼
[VALIDATE_TOKEN_REFRESH]
     ├─ (Token Valid) ──► [FETCH_CONFIG] ──► [NAVIGATE_HOME]
     └─ (Token Expired/Invalid) ──► [CLEAR_STORAGE] ──► [NAVIGATE_LOGIN]
```

---

## 9. Loading, Error & Offline States
- **Loading:** BusGo logo pulses once; initialization target latency $< 800\text{ms}$.
- **Network Offline:** If `GET /api/v1/app/config` times out ($> 5\text{s}$), check cached config. If valid cached session exists, enter offline mode with banner; otherwise display `SH-003-network-error.md`.
- **Maintenance Active:** If `maintenance.is_active === true`, navigate directly to `SH-004-maintenance.md`.

---

## 10. Business Rules
- `BR-SPLASH-001`: If local version $< \text{min\_supported\_version}$, client must block all UI and push `SH-005-version-upgrade.md`.
- `BR-SPLASH-002`: Splash initialization must complete within $2.5\text{s}$ under $4\text{G}$ network conditions.
- `BR-SPLASH-003`: Any pending deep link payload must be sanitized and validated before triggering navigation.

---

## 11. Security, Privacy & RBAC
- **Storage Security:** JWT tokens read strictly from `FlutterSecureStorage` (iOS Keychain / Android EncryptedSharedPreferences).
- **No PII Logged:** Device telemetry only records anonymous device ID and OS version.

---

## 12. Analytics & Telemetry
- `SPLASH_VIEWED`: `{ platform: "android", os_version: "14", app_version: "3.0.0" }`
- `APP_INITIALIZATION_COMPLETED`: `{ duration_ms: 640, is_authenticated: true }`
- `APP_INITIALIZATION_FAILED`: `{ error_code: "NETWORK_TIMEOUT", attempt: 1 }`

---

## 13. UI Copy & Localization
- **Tagline:** *"Hệ thống đặt xe & theo dõi liên tỉnh"*
- **Footer Status:** *"Đang kiểm tra kết nối..."*
- **Offline Error Toast:** *"Không có kết nối mạng. Đang thử kết nối lại..."*
- **Retry CTA:** *"Thử lại"*

---

## 14. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Cold launch with valid stored token
  Given the passenger has a valid JWT stored in Keychain
  When the passenger opens BusGo
  Then the app verifies version compatibility with /api/v1/app/config
  And silently validates the authentication token
  And navigates to PAX-004 Home within 1.5 seconds.

Scenario: Cold launch requiring force upgrade
  Given the app version is 2.9.0
  And the backend returns min_supported_version = 3.0.0 with force_upgrade = true
  When the app initializes
  Then it immediately blocks navigation and displays SH-005 Version Upgrade.
```

### Test Matrix:
| Test Case | Type | Input / Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-001-01` | Functional | Fresh install (No tokens) | Routes to `/home` (Guest mode) |
| `TC-PAX-001-02` | Security | Corrupted token in storage | Storage cleared, routes to `/login` |
| `TC-PAX-001-03` | Network | Airplane mode on launch | Displays network retry bottom sheet |
| `TC-PAX-001-04` | Performance | Launch on mid-tier Android | Splash duration $\le 1200\text{ms}$ |
