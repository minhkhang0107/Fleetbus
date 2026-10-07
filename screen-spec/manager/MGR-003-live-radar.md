# MGR-003 — Manager Live Fleet Operations Radar

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Operations Control Room (Dual-Pane)  
**Priority:** P0 (Mission-Critical / Realtime)  
**Route:** `/ops/radar`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-03`, `BR-RADAR-001`, `UC-MGR-RADAR-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Serve as the 24/7 Operations Control Room cockpit. Provides dispatchers and duty managers with a high-resolution, interactive live fleet radar map displaying real-time positions, headings, speeds, delay alerts, and telemetry statuses of all buses in transit, coupled with a real-time operational control deck.
- **Actor:** Dispatcher / Operations Controller.
- **Outcome:** Total fleet situational awareness; instantaneous detection and intervention for delays, breakdowns, or off-route incidents.

---

## 2. Desktop Responsive Layout ($\ge 1440\text{px}$)
- **Left / Center Panel (60% Width):** High-resolution Mapbox GL JS fleet radar with clustered markers, route polylines, traffic layers, and geofence boundaries.
- **Right Panel (40% Width):** Dense Operational Deck with filter tabs (`Tất cả (48)`, `Đang chạy (42)`, `Chậm trễ (3)`, `Mất GPS (2)`, `SOS (1)`), search by plate/driver, and quick action cards.

---

## 3. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚌 BusGo Radar  [ Tuyến: Tất cả ▼ ] [ Đội xe: Tất cả ▼ ] [🔴 1 SOS] [👤 Admin]│
├────────────────────────────────────────┬────────────────────────────────────┤
│                                        │ 📋 DANH SÁCH ĐIỀU HÀNH THỜI GIAN THỰC│
│                                        │ [ 🔘 TẤT CẢ (48) ] [ 🚨 SỰ CỐ (3) ] │
│                                        │ ┌────────────────────────────────┐ │
│        [ HIGH-RESOLUTION MAP ]         │ │ 🔍 [ Tìm biển số, tài xế...  ] │ │
│                                        │ └────────────────────────────────┘ │
│        🚌 29B-123.45 (62 km/h)         │                                    │
│        └──► Hà Nội ➔ Thanh Hóa         │ ┌─ VEHICLE RADAR CARD 1 (Delayed)─┐│
│                                        │ │ 🔴 29B-123.45 · TRỄ +35 PHÚT    ││
│        🚌 29B-444.11 (⚠️ Mất GPS)      │ │ Tuyến: Hà Nội ➔ Thanh Hóa       ││
│                                        │ │ Bác tài: Trần Văn Bình (091**45)││
│        🚌 29B-888.22 (🟢 Đúng giờ)     │ │ Tốc độ: 62 km/h · Khách: 28/34  ││
│                                        │ │ Vị trí: Km42 Cao tốc Cầu Giẽ    ││
│                                        │ │ [ 🔍 Xem chi tiết ] [ 🛠️ Đổi xe ]││
│  [ Layers: 🟢 Giao thông | 🚏 Bến xe ] │ └─────────────────────────────────┘│
│  [ 🎯 Canh toàn bộ đội xe ]            │ ┌─ VEHICLE RADAR CARD 2 (Normal) ──┐│
│                                        │ │ 🟢 29B-888.22 · ĐÚNG GIỜ        ││
│                                        │ │ Tuyến: Hà Nội ➔ Ninh Bình       ││
│                                        │ │ Tốc độ: 78 km/h · Khách: 32/34  ││
│                                        │ └─────────────────────────────────┘│
└────────────────────────────────────────┴────────────────────────────────────┘
```

---

## 4. Realtime Architecture & API Contract

- **WebSocket Room:** `ops:fleet`
- **Subscribed Events:** `FLEET_TELEMETRY_BATCH`, `TRIP_DELAY_ALERT`, `VEHICLE_SOS_ALERT`
- **Initial Snapshot API:** `GET /api/v1/ops/fleet/live-positions`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "active_vehicles_count": 48,
    "vehicles": [
      {
        "vehicle_id": "veh_29b_12345",
        "plate": "29B-123.45",
        "trip_id": "trp_991823",
        "route_name": "Hà Nội - Thanh Hóa",
        "driver_name": "Trần Văn Bình",
        "lat": 20.9812,
        "lng": 105.8430,
        "speed_kmh": 62.4,
        "heading": 185,
        "telemetry_status": "LIVE",
        "delay_minutes": 35,
        "passenger_count": 28,
        "capacity": 34
      }
    ]
  }
}
```

---

- `BR-RADAR-001` (GPS health follows the last ping - Phase C review FND-C07): The position of a vehicle on the radar is the last ping of the vehicle that runs the trip (found through the trip, so a replacement vehicle takes over after `MGR-023`). `gps_health` is `LIVE` up to 60 s after the last ping, `STALE` after 60 s and `OFFLINE` after 180 s, the same thresholds as `PAX-018` (`BR-TRACK-002`). A vehicle that never pinged keeps its registered health. A stopped bus is still in transit: the vehicle status follows the trip (`DRI-005`, `DRI-017`), not the speed.

## 5. Acceptance Criteria & Test Matrix
- **AC-001:** Clicking any bus marker on the map highlights its corresponding card in the right operational deck and centers the map camera.
- **TC-MGR-003-01:** Verifies map renders 100+ moving vehicle markers simultaneously at $60\text{fps}$ without UI jank.
