# MGR-012 — Manager Trip Master Operational Detail

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Full Screen Command Center  
**Priority:** P0 (Core Operational)  
**Route:** `/ops/trip/:id`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-12`, `BR-TRIP-001`, `UC-MGR-TRIP-003`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Serve as the master control hub for an individual bus trip: monitor real-time departure/arrival timeline, view vehicle telematics and current GPS position, review passenger manifest and boarding progress, inspect gross revenue and COD cash collected, lock/unlock seats, declare trip delays (`MGR-024`), or launch the Emergency Vehicle Replacement Wizard (`MGR-023`).
- **Actor:** Dispatcher / Operations Controller / Accountant.
- **Outcome:** Complete trip lifecycle managed from dispatch to financial reconciliation.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Chi tiết chuyến: Hà Nội ➔ Thanh Hóa (14:00, 27/08)    [🟢 ĐANG DI CHUYỂN]│
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─ TRIP KPI CARDS ────────────────────────────────────────────────────────┐ │
│ │ 👥 KHÁCH: 28 / 34 Chỗ     🟢 LÊN XE: 24 Khách    💰 DOANH THU: 6.160.000đ │ │
│ │ 🚌 XE: 29B-123.45 (Limo)  👤 TÀI XẾ: Trần V. Bình💵 THU COD: 880.000đ     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ TAB NAVIGATION ────────────────────────────────────────────────────────┐ │
│ │ [ 🔘 LỘ TRÌNH & GPS ] │ [ 💺 SƠ ĐỒ GHẾ (MGR-013) ] │ [ 📋 MANIFEST (28) ] │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ LIVE TIMELINE & MAP OVERVIEW ──────────────────────────────────────────┐ │
│ │ 🟢 14:00 · Bến xe Giáp Bát (Đã xuất bến: 14:05 · Đón 18 khách)          │ │
│ │ 🟢 14:30 · Trạm Pháp Vân (Đã qua: 14:32 · Đón 6 khách)                  │ │
│ │ 🟡 16:10 · Bến xe Ninh Bình (Dự kiến: 16:15 · Đón 4 · Trả 8)             │ │
│ │ 🔴 17:30 · Bến xe Phía Bắc Thanh Hóa (Dự kiến: 17:40)                   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ [ 🗺️ Xem trên Live Radar ]  [ 🛠️ Đổi xe khẩn cấp (MGR-023) ]  [ ⚠️ Khai báo trễ ]│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- **Endpoint:** `GET /api/v1/ops/trips/{tripId}/master`
- **WS Subscription:** `trip:{tripId}`
- **TC-MGR-012-01:** Verifies tab switcher toggles between Live Map, Seat Inventory (`MGR-013`), and Passenger Manifest.
