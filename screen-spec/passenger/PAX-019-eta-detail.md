# PAX-019 — Passenger ETA & Stop Progression Detail

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Draggable Bottom Sheet / Full Screen View  
**Priority:** P1 (Important Operational Flow)  
**Route:** `/tracking/:tripId/eta-detail`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-19`, `BR-ETA-001`, `UC-PAS-ETA-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Provide a granular, stop-by-stop breakdown of the bus's progression along the entire route corridor. Displays planned arrival vs. actual/predicted arrival time per stop, current traffic conditions, passed stops, current active segment, and remaining distance.
- **Actor:** Passenger.
- **Entry Condition:** Swiped up or tapped the ETA bottom sheet on `PAX-018-live-tracking.md`.
- **Outcome:** Passenger understands complete journey progression and accurately tracks stop transitions.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│                     [ ─── ] (Drag Handle)         │
│  Lộ trình & Dự kiến thời gian đến                 │
├───────────────────────────────────────────────────┤
│  Xe: 29B-123.45 · Tốc độ hiện tại: 62 km/h        │
│  Tình trạng giao thông: 🟢 Thông thoáng           │
│                                                   │
│ ┌─ STOP PROGRESSION TIMELINE ──────────────────┐  │
│ │                                              │  │
│ │  ✅ 14:00 (Thực tế: 14:05)                   │  │
│ │  ┃  Bến xe Giáp Bát (Hà Nội) - Đã xuất bến   │  │
│ │  ┃                                           │  │
│ │  🟢 15:15 (~14 phút nữa · 8.2 km)           │  │
│ │  ┃  Trạm dừng Liêm Tuyền (Điểm đón của bạn)  │  │
│ │  ┃  [ 📍 Vị trí xe đang ở gần đây ]          │  │
│ │  ┃                                           │  │
│ │  ☕ 16:00 (Dự kiến nghỉ 20 phút)             │  │
│ │  ┃  Trạm dừng nghỉ Cao tốc Km120             │  │
│ │  ┃                                           │  │
│ │  ⚪ 16:45 (Dự kiến 16:50)                    │  │
│ │  ┃  Bến xe Ninh Bình                         │  │
│ │  ┃                                           │  │
│ │  🔴 17:30 (Dự kiến 17:40 · Trễ +10p)         │  │
│ │     Bến xe Phía Bắc (Thanh Hóa) - Điểm cuối  │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ [ 🔔 Nhắc tôi khi xe cách điểm đón 2 km ] (Bật)   │
└───────────────────────────────────────────────────┘
```

---

## 3. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DragHandle` | Widget | Yes | UI Gesture | Interactive | Pull down dismisses to map |
| `StopTimeline` | Custom Stepper | Yes | ETA API / WS | Passed / Current / Upcoming | Highlights user's pickup and dropoff |
| `RestStopMilestone`| Timeline Item | Conditional | Segment Metadata | `is_rest_stop === true` | Shows coffee icon & rest minutes |
| `TrafficPill` | Semantic Pill | Yes | Mapbox Traffic | Smooth / Moderate / Heavy | Displays traffic status |
| `ProximityAlarmToggle`| Switch | Yes | Local Setting | Enabled (Default ON) | Toggles 2km geofence push notification |

---

## 4. API Contract

### 4.1. Get Granular Route ETA
- **Endpoint:** `GET /api/v1/trips/{tripId}/eta`
- **Auth:** Public / Bearer
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "traffic_condition": "SMOOTH",
    "total_delay_minutes": 5,
    "stops": [
      {
        "stop_id": "stp_hn_gb",
        "name": "Bến xe Giáp Bát",
        "planned_time": "14:00",
        "actual_time": "14:05",
        "status": "PASSED"
      },
      {
        "stop_id": "stp_lt",
        "name": "Trạm dừng Liêm Tuyền",
        "planned_time": "15:15",
        "predicted_time": "15:19",
        "eta_minutes": 14,
        "distance_meters": 8200,
        "status": "NEXT_STOP",
        "is_user_pickup": true
      },
      {
        "stop_id": "stp_rs_km120",
        "name": "Trạm dừng nghỉ Cao tốc Km120",
        "is_rest_stop": true,
        "rest_duration_minutes": 20,
        "planned_time": "16:00",
        "predicted_time": "16:00",
        "status": "UPCOMING"
      },
      {
        "stop_id": "stp_nb_bx",
        "name": "Bến xe Ninh Bình",
        "planned_time": "16:45",
        "predicted_time": "16:50",
        "status": "UPCOMING"
      },
      {
        "stop_id": "stp_th_pb",
        "name": "Bến xe Phía Bắc",
        "planned_time": "17:30",
        "predicted_time": "17:40",
        "status": "UPCOMING",
        "is_user_dropoff": true
      }
    ]
  }
}
```

---

## 5. UI Copy & Localization
- **Title:** *"Lộ trình & Dự kiến thời gian"*
- **Passed Label:** *"Đã qua"*
- **Next Stop Label:** *"Trạm kế tiếp"*
- **Rest Stop Label:** *"Trạm dừng nghỉ (Dự kiến: {duration} phút)"*
- **Proximity Alert:** *"Thông báo khi xe cách điểm đón 2 km"*

---

## 6. Acceptance Criteria & Test Matrix
- **AC-001:** Given the bus passes Stop 1, the timeline updates Stop 1 icon to a green checkmark and recalculates ETA for subsequent stops.
- **AC-002:** Rest stops are displayed with coffee icon and planned pause duration (`BR-TRACK-004`).
- **TC-PAX-019-01:** Swipe down drawer smoothly animates back to `PAX-018-live-tracking.md`.
- **TC-PAX-019-02:** Timeline displays rest stop milestone with estimated duration.
