# SH-005 — Shared Force & Recommended Version Upgrade

**App:** Shared (Passenger, Driver)  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen Blocking Barrier / Modal  
**Priority:** P0 (Operational / Security Compatibility)  
**Route:** `/shared/version-upgrade`  
**Version:** 1.0  
**Source Requirements:** `BR-SYS-001`, `UC-SH-SYS-002`

---

## 1. Purpose & User Story
- **Purpose:** Require or recommend users to update their mobile application from Apple App Store / Google Play Store when their installed app version is below the backend minimum supported version (`min_supported_version`).
- **Actor:** Passenger / Driver.
- **Outcome:** User redirected to official App Store / Play Store listing to download the latest release.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ 🚀 ]                        │
│             CẬP NHẬT PHIÊN BẢN MỚI                │
│                                                   │
│  Phiên bản BusGo bạn đang sử dụng (v2.9.0)        │
│  đã cũ và không còn được hỗ trợ.                  │
│                                                   │
│  Vui lòng nâng cấp lên phiên bản mới nhất         │
│  (v3.0.0) để trải nghiệm tính năng theo dõi GPS   │
│  và đặt chỗ tốt nhất.                             │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │       CẬP NHẬN NGAY TRÊN APP STORE (CTA)    │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ Để sau (Chỉ áp dụng với cập nhật tùy chọn) ]   │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules
- `BR-UPGRADE-001`: If `force_upgrade === true`, the barrier is completely non-dismissible and back navigation is disabled.
- **API Response Field:** Handled from `GET /api/v1/app/config`.
- **TC-SH-005-01:** Tapping CTA opens native iOS App Store / Android Google Play Store deep link.
