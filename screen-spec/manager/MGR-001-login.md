# MGR-001 — Manager Staff Authentication & Multi-Factor Access

**App:** Manager Operations Portal  
**Platform:** Web (React / Next.js Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Full Screen Auth  
**Priority:** P0 (Operational Blocking)  
**Route:** `/ops/login`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-01`, `BR-AUTH-003`, `UC-MGR-AUTH-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Securely authenticate operations controllers, dispatchers, counter staff, and executives with corporate email, password, and mandatory TOTP 2FA (Google Authenticator) or SSO. Enforces depot scoping and role-based access control (RBAC).
- **Actor:** Operations Controller / Dispatcher / Admin.
- **Outcome:** Authenticated session established; JWT with scoped RBAC permissions stored; routed to `MGR-002-dashboard.md` or `MGR-003-live-radar.md`.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚌 BusGo Operations Control Center                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                   ┌───────────────────────────────────────┐                 │
│                   │  ĐĂNG NHẬP HỆ THỐNG ĐIỀU HÀNH         │                 │
│                   │  Dành riêng cho Cán bộ & Nhân viên    │                 │
│                   │                                       │                 │
│                   │  Email doanh nghiệp                   │                 │
│                   │  [ admin@busgo.vn                   ] │                 │
│                   │                                       │                 │
│                   │  Mật khẩu                             │                 │
│                   │  [ ••••••••••••••••••               ] │                 │
│                   │                                       │                 │
│                   │  Mã xác thực 2 bước (TOTP - 6 số)     │                 │
│                   │  [ 4 8 2 9 1 0                      ] │                 │
│                   │                                       │                 │
│                   │  Chi nhánh / Bến quản lý              │                 │
│                   │  [ 🏢 Tất cả chi nhánh (Tổng công ty)▼] │                 │
│                   │                                       │                 │
│                   │  ┌─────────────────────────────────┐  │                 │
│                   │  │      ĐĂNG NHẬP HỆ THỐNG (CTA)   │  │                 │
│                   │  └─────────────────────────────────┘  │                 │
│                   └───────────────────────────────────────┘                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ © 2026 BusGo JSC · Phiên bản Điều hành v3.0.0 · TLS 1.3 / ISO 27001         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-MGR-AUTH-002` (Lockout and secrets - review FND-A51): Five wrong passwords lock the account for 15 minutes (`429 ACCOUNT_LOCKED`, with `retry_after_seconds`); a correct login clears the counter. Passwords are stored as salted hashes and compared in constant time. The session token is signed, carries the role and expires after 8 hours. A wrong TOTP code counts like a wrong password.
- `BR-MGR-AUTH-001` (TOTP 2FA - Phase E review, `OQ-027`): Staff accounts with `ROLE_OPS_ADMIN` (`FLEET_DIRECTOR`) or `ROLE_FINANCE` (`FINANCIAL_CONTROLLER`) require a TOTP code on every login: RFC 6238, HMAC-SHA1, 30 s step, 6 digits, accepting one step of drift either side. The login body carries `totp`. The code is asked only after the password is right: password right and no code gives `401 TOTP_REQUIRED`, a wrong or malformed code `401 INVALID_TOTP` (counted towards the lockout of `BR-MGR-AUTH-002`), a code already used `401 INVALID_TOTP` ("đã được dùng"). The other roles sign in with the password alone. Secrets: production reads `FLEETBUS_TOTP_SECRET_<USER_ID>` (base32, for example `FLEETBUS_TOTP_SECRET_MGR_01`); with none set the account is refused with `401 TOTP_NOT_CONFIGURED`; outside production a fixed dev secret serves the demo account. There is no enrollment screen: the secret is provisioned by the administrator (`core/totp.js` builds the `otpauth://` URI).
- **API Endpoint:** `POST /api/v1/auth/staff/login`
- **TC-MGR-001-01:** Verifies staff login returns scoped JWT with permissions list.
