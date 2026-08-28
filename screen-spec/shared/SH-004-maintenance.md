# SH-004 — Shared System Scheduled Maintenance

**App:** Shared (Passenger, Driver, Manager)  
**Platform:** Cross-Platform (Flutter / Web)  
**Screen Type:** Full Screen Blocking Barrier  
**Priority:** P1 (System Maintenance)  
**Route:** `/shared/maintenance`  
**Version:** 1.0  
**Source Requirements:** `BR-SYS-001`, `UC-SH-SYS-001`

---

## 1. Purpose & User Story
- **Purpose:** Inform users during planned system maintenance windows (e.g. database migration, cloud infrastructure upgrade). Displays estimated completion time, emergency support hotline, and automatically refreshes when service resumes.
- **Actor:** Passenger / Driver / Staff.
- **Outcome:** Clean user expectation setting during downtime; prevents data corruption.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ 🛠️ ]                        │
│          HỆ THỐNG ĐANG BẢO TRÌ ĐỊNH KỲ            │
│                                                   │
│  BusGo đang nâng cấp hạ tầng để phục vụ bạn       │
│  tốt hơn. Dự kiến hoàn tất lúc:                   │
│                                                   │
│              [ 04:00 · 28/08/2026 ]               │
│                                                   │
│  Mọi thắc mắc khẩn cấp xin vui lòng liên hệ       │
│  Tổng đài CSKH: [ 1900 6868 ] (24/7)              │
│                                                   │
│  [ 🔄 Kiểm tra trạng thái hệ thống ]              │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules
- `BR-MAINT-001`: Client checks `GET /api/v1/app/config` every $30\text{ seconds}$ in background. When `maintenance.is_active === false`, the app automatically reloads into normal operation.
- **TC-SH-004-01:** Verifies maintenance barrier blocks all booking operations.
