# MGR-002 — Manager Operations Overview Dashboard

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Executive Dashboard  
**Priority:** P0 (Core Operational)  
**Route:** `/ops/dashboard`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-02`, `BR-OPS-001`, `UC-MGR-DASH-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide a unified high-density operational snapshot of daily fleet performance: total active trips, real-time load factors across corridors, on-time departure rate, gross ticket revenue, active operational alarms (SOS, delays, stale GPS), and shortcut widgets to Dispatch and Live Radar.
- **Actor:** Operations Director / Duty Manager.
- **Outcome:** Operational health assessed in $<5\text{ seconds}$; bottlenecks identified immediately.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚌 BusGo Ops  [🔍 Tìm PNR, Biển số, Chuyến... /]      [🚨 3 Cảnh báo] [👤 Admin]│
├──────────────────────┬──────────────────────────────────────────────────────┤
│ 📋 TỔNG QUAN         │ BẢNG ĐIỀU HÀNH HOẠT ĐỘNG · HÔM NAY 27/08/2026        │
│ • Dashboard (Active) │                                                      │
│ • Live Radar         │ ┌─ KPI METRIC TILES ───────────────────────────────┐ │
│                      │ │ 🚌 48 / 52        🟢 92.4%         💰 184.5M      │ │
│ 🚍 VẬN HÀNH & ĐIỀU ĐỘ │ │ XE ĐANG CHẠY      TỶ LỆ LẤP ĐẦY    DOANH THU HÔM NAY│
│ • Bảng điều độ       │ │                   (Load Factor)    (2.140 vé)     │ │
│ • Quản lý chuyến đi  │ ├──────────────────────────────────────────────────┤ │
│ • Đội xe & Bố trí ghế│ │ ⏱️ 96.8%          🚨 3             ⚡ 42.1 km/h    │ │
│ • Quản lý tài xế     │ │ ĐÚNG GIỜ XUẤT BẾN SỰ CỐ / CHẬM TRỄ TỐC ĐỘ TB ĐỘI XE│ │
│ • Quản lý tuyến đường│ └──────────────────────────────────────────────────┘ │
│                      │                                                      │
│ 🎫 KINH DOANH & VÉ   │ ┌─ ACTIVE OPERATIONS SPLIT ────────────────────────┐ │
│ • Bán vé tại quầy POS│ │ 🚨 CẢNH BÁO CẦN XỬ LÝ (3)   │ 📈 CÔNG SUẤT THEO TUYẾN│
│ • Tra cứu đặt vé     │ │ • 29B-123.45: Trễ +35p     │ • HN - Thanh Hóa: 94%│
│ • Quản lý hoàn tiền  │ │ • 29B-444.11: Mất GPS 4p   │ • HN - Ninh Bình: 88%│
│                      │ │ • 29B-888.22: SOS Kẹt xe   │ • HN - Hải Phòng: 91%│
│ ⚙️ HỆ THỐNG          │ └────────────────────────────┴──────────────────────┘ │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 3. API Contract & Business Rules
- **Endpoint:** `GET /api/v1/ops/dashboard/kpis` (Polling every $30\text{s}$ or WebSocket push).
- **KPI definitions (review FND-A49):** every figure is computed from the data, never fixed. `gross_revenue_vnd` is the sum of paid fares; `refunded_vnd` is the sum of refunds approved in `MGR-022`; `net_revenue_vnd = gross - refunded`. `overall_load_factor_pct` is booked seats over seats of all trips. `on_time_departure_rate_pct` is the share of trips whose delay is at most 15 minutes. `fleet_average_speed_kmh` is the mean speed of the vehicles that are `IN_TRANSIT` and moving (0 when none). `corridors` lists, per route that has trips, its load factor and its number of running trips.
- **TC-MGR-002-01:** Verifies metric cards calculate revenue, active trips, and load factors in real time.
