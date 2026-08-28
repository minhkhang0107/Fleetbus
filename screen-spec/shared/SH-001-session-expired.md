# SH-001 — Shared Session Expired & Re-authentication

**App:** Shared (Passenger, Driver, Manager)  
**Platform:** Cross-Platform (Flutter / Web)  
**Screen Type:** Modal / Barrier Screen  
**Priority:** P0 (Security & Session Integrity)  
**Route:** `/shared/session-expired`  
**Version:** 1.0  
**Source Requirements:** `BR-AUTH-001`, `BR-AUTH-003`, `UC-SH-AUTH-001`

---

## 1. Purpose & User Story
- **Purpose:** Intercept HTTP 401 Unauthorized errors when the JWT Access Token has expired and automatic Refresh Token exchange fails. Prevents corrupted client requests, preserves the user's current task state in memory, and prompts fast re-authentication without losing contextual data.
- **Actor:** Passenger / Driver / Staff.
- **Outcome:** Re-authentication completed; original in-flight request seamlessly resumed.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ 🔒 ]                        │
│               PHIÊN ĐĂNG NHẬP HẾT HẠN             │
│                                                   │
│  Để bảo mật thông tin tài khoản và chuyến đi,     │
│  vui lòng đăng nhập lại để tiếp tục.              │
│                                                   │
│  Tài khoản: [ 0987 *** 321 ]                      │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │             ĐĂNG NHẬP LẠI (CTA)             │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ Quay về trang chủ ]                            │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & Interceptor Workflow
- `BR-SESSION-001`: On HTTP 401, the HTTP client interceptor attempts 1 silent refresh call (`POST /auth/refresh`). If refresh fails, it captures the current route + draft form state and routes to `SH-001`.
- **TC-SH-001-01:** Verifies successful re-login restores the user directly to their previous screen (e.g. `PAX-012` Checkout).
