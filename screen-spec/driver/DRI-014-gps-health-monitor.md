# DRI-014 — Driver GPS & Sensor Health Monitor

**App:** Driver  
**Platform:** Android (Native Service) / iOS  
**Screen Type:** Modal / Diagnostic Sheet  
**Priority:** P0 (Core Operational / Telemetry Integrity)  
**Route:** `/driver/trip/:id/gps-health`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-14`, `BR-TEL-001`, `UC-DRI-TEL-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Monitor hardware sensor health (GPS accuracy, satellite lock count, mock location detection, Android battery saver optimization whitelist, foreground service lifecycle, MQTT publish buffer size) to guarantee 99.9% reliable telemetry transmission to the backend ETA engine.
- **Actor:** Driver / Lead Technician.
- **Outcome:** Driver identifies sensor issues (e.g. GPS disabled, battery saver throttling app in background) and fixes them in 1 tap.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [✕] Tình trạng cảm biến & Định vị GPS            │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ SENSOR STATUS CARDS ────────────────────────┐  │
│ │ 🟢 TÍN HIỆU GPS VỆ TINH:      TỐT (Khóa 14 vệ tinh)
│ │ • Độ chính xác:               4.2 mét           │
│ │ • Tọa độ hiện tại:            20.9812, 105.8430 │
│ ├─────────────────────────────────────────────┤   │
│ │ 🟢 DỊCH VỤ CHẠY NỀN:          ĐANG CHẠY (Foreground)
│ │ • Tối ưu pin Android:         ĐÃ LOẠI TRỪ (Tốt) │
│ ├─────────────────────────────────────────────┤   │
│ │ 🟢 KẾT NỐI MQTT TELEMETRY:    ONLINE (RTT: 42ms)│
│ │ • Gói tin đã gửi:             1.420 gói         │
│ │ • Hàng đợi chờ gửi (SQLite): 0 gói             │
│ ├─────────────────────────────────────────────┤   │
│ │ 🟢 NGUỒN ĐIỆN THIẾT BỊ:       ĐANG SẠC (92%)    │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ 🛡️ KIỂM TRA BẢO MẬT:                              │
│ • Mock Location (Vị trí giả lập): 🟢 KHÔNG PHÁT HIỆN│
│                                                   │
├───────────────────────────────────────────────────┤
│ [ 🔄 KIỂM TRA LẠI CẢM BIẾN ]   [ ĐÓNG ]           │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & Battery Whitelisting
- `BR-GPS-HEALTH-001`: If Android system places the app into Battery Saver mode, display blocking warning: *"Ứng dụng cần được tắt tối ưu hóa pin để đảm bảo không bị ngắt định vị khi tắt màn hình."* with direct shortcut to Android Settings.
- **TC-DRI-014-01:** Verifies mock GPS provider detection flags telemetry as invalid.
