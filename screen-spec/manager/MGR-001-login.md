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
- `BR-MGR-AUTH-001`: Staff accounts with `ROLE_OPS_ADMIN` or `ROLE_FINANCE` require mandatory TOTP 2FA token on every login.
- **API Endpoint:** `POST /api/v1/auth/staff/login`
- **TC-MGR-001-01:** Verifies staff login returns scoped JWT with permissions list.
