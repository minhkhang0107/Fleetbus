# SH-002 — Shared Permission Denied (403 Forbidden)

**App:** Shared (Manager, Driver)  
**Platform:** Web / Flutter  
**Screen Type:** Full Screen State  
**Priority:** P0 (Security & Authorization)  
**Route:** `/shared/permission-denied`  
**Version:** 1.0  
**Source Requirements:** `BR-AUTH-003`, `UC-SH-AUTH-002`

---

## 1. Purpose & User Story
- **Purpose:** Inform staff when attempting to access a route or execute a sensitive action (e.g. approving a refund $>5,000,000\text{ VND}$, overriding a seat block, or modifying vehicle layouts) for which their role lacks authorization, and provide a 1-click privilege escalation request.
- **Actor:** Manager / Staff.
- **Outcome:** Unauthorized action blocked; request logged in audit trail.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ 🚫 ]                        │
│             TRUY CẬP BỊ TỪ CHỐI (403)             │
│                                                   │
│  Tài khoản của bạn không có quyền thực hiện       │
│  thao tác này hoặc truy cập trang quản trị này.   │
│                                                   │
│  Quyền yêu cầu: [ PERM_REFUND_APPROVE_HIGH ]      │
│  Vai trò hiện tại: [ NHÂN VIÊN BÁN VÉ QUẦY ]      │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │       YÊU CẦU CẤP QUYỀN TỪ QUẢN TRỊ VIÊN    │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ Quay lại trang trước ]                         │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules
- `BR-PERM-001`: Access denial event is logged in `MGR-028-audit-logs.md` with actor ID, requested resource, and client IP.
- **TC-SH-002-01:** Verifies 403 response cleanly displays permission name and prevents navigation loop.
