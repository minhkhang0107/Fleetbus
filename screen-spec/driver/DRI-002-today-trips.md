# DRI-002 — Driver Today's Assigned Trips & Shift Hub

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Tab Root / Shift Dashboard  
**Priority:** P0 (Operational Blocking)  
**Route:** `/driver/today-trips`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-02`, `BR-DRI-002`, `UC-DRI-TRIP-001`  
**Assignment rule (review FND-A42):** The list contains only the trips assigned to the signed-in driver. A driver with no assignment receives an empty list, never other drivers' trips.  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Display all scheduled bus trips assigned to the driver for today's shift. Provides instant visibility of departure times, assigned vehicle plates, route names, passenger booking counts, trip readiness status, and 1-tap entry into trip preparation.
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** Logged in (`DRI-001`) or app reopened during active work shift.
- **Outcome:** Driver reviews assignments and taps a trip card to enter Pre-start Inspection (`DRI-003`).

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ Bác tài: Trần Văn Bình (TX-8821)     [📶 Live] [⚙️]│
├───────────────────────────────────────────────────┤
│  LỊCH CHẠY HÔM NAY · 27/08/2026                   │
│  Tổng số chuyến: 2 chuyến (1 Sắp chạy · 1 Chiều về)│
│                                                   │
│ ┌─ TRIP CARD 1 (CHUYẾN SẮP CHẠY) ──────────────┐  │
│ │ 🟢 SẴN SÀNG KHỞI HÀNH · Xuất bến: 14:00      │  │
│ │ Tuyến: Hà Nội ──────────────► Thanh Hóa      │  │
│ │                                              │  │
│ │ 🚌 Xe: 29B-123.45 (Limousine 34 VIP)         │  │
│ │ 👥 Khách: 28 / 34 Chỗ (Đã thanh toán: 24)    │  │
│ │ 📍 Xuất phát: Bến xe Giáp Bát, Phòng chờ 4   │  │
│ │                                              │  │
│ │ ┌──────────────────────────────────────────┐ │  │
│ │ │       CHUẨN BỊ XUẤT BẾN (CTA - 64dp)     │ │  │
│ │ └──────────────────────────────────────────┘ │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ TRIP CARD 2 (CHUYẾN KẾ TIẾP) ───────────────┐  │
│ │ ⚪ DỰ KIẾN · Xuất bến: 19:30                 │  │
│ │ Tuyến: Thanh Hóa ───────────► Hà Nội         │  │
│ │ 🚌 Xe: 29B-123.45 · Khách: 18 / 34 Chỗ       │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ [🟢 Chuyến hôm nay]  [📦 Đồng bộ (0)]  [👤 Cá nhân]│
└───────────────────────────────────────────────────┘
```

---

## 3. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DriverHeader` | Header | Yes | Auth Context | Normal | Displays staff ID and connection pill |
| `ShiftTripCard` | Large Card | Yes | Today Trips API | Scheduled / In-Transit | Tap opens `DRI-003-trip-detail-prestart.md` |
| `PrepareTripCTA` | DriverActionPill| Yes | Trip State | Brand Blue ($64\text{dp}$) | Tap opens `DRI-003` |
| `SyncBadge` | Bottom Tab Item | Yes | SQLite Outbox | Badge Count | Shows unsynced offline events |

---

## 4. API Contract

### 4.1. Fetch Driver Shift Trips
- **Endpoint:** `GET /api/v1/driver/trips/today`
- **Auth:** Bearer (Driver)
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "shift_date": "2026-08-27",
    "trips": [
      {
        "trip_id": "trp_991823",
        "route_name": "Hà Nội - Thanh Hóa",
        "planned_departure_time": "2026-08-27T14:00:00+07:00",
        "status": "DISPATCHED",
        "vehicle_plate": "29B-123.45",
        "vehicle_model": "Limousine 34 Phòng VIP",
        "booked_passengers_count": 28,
        "total_capacity": 34,
        "pickup_terminal": "Bến xe Giáp Bát"
      }
    ]
  }
}
```

---

## 5. UI Copy & Localization
- **Header:** *"Lịch chạy hôm nay"*
- **Status Ready:** *"SẴN SÀNG KHỞI HÀNH"*
- **Prepare CTA:** *"CHUẨN BỊ XUẤT BẾN"*
- **Empty State:** *"Hôm nay bạn chưa có lịch phân tài. Chúc bạn một ngày nghỉ vui vẻ!"*

---

## 6. Acceptance Criteria & Test Matrix
- **AC-001:** Given a driver assigned to trip `trp_991823`, the card renders with plate `29B-123.45` and passenger count `28/34`.
- **TC-DRI-002-01:** Tap "CHUẨN BỊ XUẤT BẾN" navigates directly to `DRI-003`.
