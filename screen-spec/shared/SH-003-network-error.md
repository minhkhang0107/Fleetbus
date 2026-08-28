# SH-003 — Shared Network Offline & Gateway Error

**App:** Shared (Passenger, Driver, Manager)  
**Platform:** Cross-Platform (Flutter / Web)  
**Screen Type:** Full Screen State / Bottom Sheet  
**Priority:** P0 (Resilience)  
**Route:** `/shared/network-error`  
**Version:** 1.0  
**Source Requirements:** `BR-CONN-001`, `UC-SH-NET-001`

---

## 1. Purpose & User Story
- **Purpose:** Handle complete loss of internet connectivity (cellular dead zone, airplane mode) or HTTP 502/503/504 Gateway errors. Informs the user clearly without exposing technical error jargon, provides auto-retry with exponential backoff, and maintains access to cached offline tickets (`PAX-017`) and offline driver manifests (`DRI-007`).
- **Actor:** Passenger / Driver / Staff.
- **Outcome:** Network resilience maintained; auto-reconnects when signal is restored.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ 📡❌ ]                      │
│             MẤT KẾT NỐI MẠNG INTERNET             │
│                                                   │
│  Không thể kết nối đến máy chủ BusGo.             │
│  Vui lòng kiểm tra lại kết nối Wifi hoặc 4G/5G.   │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │             THỬ LẠI KẾT NỐI (CTA)           │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ 🎫 Xem vé đã lưu ngoại tuyến (Offline) ]       │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules
- `BR-NET-001`: Client listens to native connectivity stream (`connectivity_plus` / `navigator.onLine`). When network is restored, automatically dismisses error screen and retries pending request.
- **TC-SH-003-01:** Verifies airplane mode renders `SH-003` with 1-tap shortcut to cached offline tickets.
