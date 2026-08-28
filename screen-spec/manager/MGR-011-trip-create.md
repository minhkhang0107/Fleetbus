# MGR-011 — Manager Trip Generator & Dispatch Assignment

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Form & Scheduling Flow  
**Priority:** P0 (Core Operational)  
**Route:** `/ops/trips/new`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-11`, `BR-TRIP-001`, `UC-MGR-TRIP-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Schedule and dispatch new bus trips: select Route Corridor, specify planned departure date/time, assign physical Vehicle and Lead Driver/Assistant Driver, configure pricing rules, and **freeze an immutable JSON snapshot** of the route stops and seat layout to protect historical data integrity.
- **Actor:** Dispatcher / Schedule Planner.
- **Outcome:** Trip created in `SCHEDULED` status; route and seat layout snapshots frozen; seat inventory initialized in PostgreSQL.

---

## 2. Business Context & Invariants
- **SNAPSHOT INVARIANT:** Upon trip creation, the system captures full JSON copies of `route_stops_snapshot` and `seat_layout_snapshot`. Future edits to the master route or vehicle layout template will NEVER alter this trip's configuration.
- **DISPATCH CONFLICT CHECK:** A vehicle or driver cannot be assigned to overlapping trips if the buffer time between scheduled arrival of Trip A and scheduled departure of Trip B is $< 60\text{ minutes}$.

---

## 3. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Lập lịch & Tạo chuyến xe mới (Trip Generator)          [💾 Tạo chuyến đi]│
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 📋 THÔNG TIN CHUYẾN ĐI               │ 🚌 GÁN PHƯƠNG TIỆN & TÀI XẾ          │
│                                      │                                      │
│ Tuyến đường vận hành *               │ Chọn xe thực hiện *                  │
│ [ 🛣️ Hà Nội - Ninh Bình - Thanh Hóa▼]│ [ 🚌 29B-123.45 (Limo 34 VIP)      ▼]│
│                                      │ (Đã chọn sơ đồ: Limousine 34 Phòng)  │
│ Ngày khởi hành *                     │                                      │
│ [ 📅 27/08/2026                    ] │ Bác tài chính (Lái xe 1) *           │
│                                      │ [ 👤 TX-8821 · Trần Văn Bình       ▼]│
│ Giờ xuất bến tại điểm đầu *          │                                      │
│ [ ⏰ 14:00                         ] │ Phụ xe / Bác tài 2 (Tùy chọn)        │
│                                      │ [ 👤 TX-9912 · Lê Văn Cường        ▼]│
│ Giờ đến dự kiến tại điểm cuối        │                                      │
│ [ 17:30 (Thời gian chạy: 3h 30m)   ] │ 💰 BẢNG GIÁ THEO CHẶNG (Mặc định)    │
│                                      │ • Giáp Bát ➔ Thanh Hóa: 220.000 đ    │
│ Tần suất lặp lại                     │ • Giáp Bát ➔ Liêm Tuyền: 100.000 đ   │
│ [ 🔘 Chỉ hôm nay ]  [ ⚪ Hàng ngày ] │ • Liêm Tuyền ➔ Thanh Hóa: 140.000 đ  │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 4. API Contract

### 4.1. Create Trip Schedule
- **Endpoint:** `POST /api/v1/ops/trips`
- **Auth:** Bearer (Staff)
- **Headers:** `Idempotency-Key: uuid`
- **Request Body:**
```json
{
  "route_id": "rt_hn_th_01",
  "vehicle_id": "veh_29b_12345",
  "primary_driver_id": "drv_8821a",
  "assistant_driver_id": "drv_9912b",
  "departure_time": "2026-08-27T14:00:00+07:00",
  "allow_online_booking": true
}
```
- **Response `201 Created`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "status": "SCHEDULED",
    "total_seats_created": 34
  }
}
```

---

## 5. Acceptance Criteria & Test Matrix
- **AC-001:** System validates vehicle and driver availability before creating trip; returns 409 Conflict if conflict exists.
- **TC-MGR-011-01:** Verifies trip initialization generates all segment seat records in `trip_seat_inventory`.
