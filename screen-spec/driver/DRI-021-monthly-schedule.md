# DRI-021 — Driver Monthly Trip Schedule (Lịch chạy theo tháng)

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Tab Root / Shift Calendar  
**Priority:** P1  
**Route:** `/driver/schedule`  
**Version:** 1.0 (D155)  
**Source Requirements:** `F-DRI-21`, `D155`, `BR-DRI-021`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Drivers want to see, month by month, which trips they drive. Today the app only lists trips leaving within ~12 h (`DRI-002`). This screen gives drivers full monthly visibility into both trip-level assignments and recurring schedule defaults.
- **Actor:** Driver / Assistant Driver.
- **Entry Point:** New bottom navigation tab "Lịch" positioned between "Chuyến" (DRI-002) and "Đồng bộ" (DRI-015).
- **Outcome:** The driver can browse past and upcoming months within the allowed 3-month window, tap any calendar date to see scheduled trips for that day, and inspect trip status, vehicle plate, route name, booked passenger count, and collected cash handover.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────┐
│ Lịch chạy                                               │
├─────────────────────────────────────────────────────────┤
│                     ◄ Tháng 10/2026 ►                   │
│ Tổng cộng: 24 chuyến · 18 đã chạy · 5 sắp chạy · 1 đã hủy│
├─────────────────────────────────────────────────────────┤
│   T2    T3    T4    T5    T6    T7    CN                │
│               01    02    03    04    05                │
│               •     ••          •                       │
│   06    07    08    09    10    11    12                │
│   •     •     ••    •           ••    •                 │
│   13    14    15    16    17    18   [19]               │
│   •     ••    •     •           •    [••] (hôm nay)     │
│   20    21    22    23    24    25    26                │
│   •     •     •     •           •     •                 │
│   27    28    29    30    31                            │
│   •     •     •     •     •                             │
├─────────────────────────────────────────────────────────┤
│ Chuyến ngày 19/10/2026 (2 chuyến)                       │
│                                                         │
│ ┌─ TRIP CARD 1 ───────────────────────────────────────┐ │
│ │ 07:00 · Hà Nội — Thanh Hóa (Cao tốc)                │ │
│ │ Xe 29B-882.19                  [Sắp chạy]           │ │
│ │ 14 khách                                            │ │
│ │ [Lịch mặc định]                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ TRIP CARD 2 ───────────────────────────────────────┐ │
│ │ 14:00 · Thanh Hóa — Hà Nội                          │ │
│ │ Xe 29B-123.45                  [Đã chạy]            │ │
│ │ 28 khách · Đã nộp 440.000 đ                         │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ [Chuyến]         [Lịch]           [Đồng bộ]     [Hồ sơ] │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Component-by-Component Spec

| Component | Type | Required | Data Source | Interaction / States |
| :--- | :--- | :--- | :--- | :--- |
| `MonthHeader` | Header Controls | Yes | Current Month State | Previous/Next buttons to switch months (limited to $\pm 3$ months from current month). |
| `MonthSummaryBar` | Summary Label | Yes | Schedule API `summary` | Displays `total`, `completed`, `upcoming`, `cancelled` trips for the selected month. |
| `CalendarGrid` | 7-Col Grid | Yes | Schedule API `days` | Monday-first with Vietnamese labels `T2, T3, T4, T5, T6, T7, CN`. Highlights today with outline; displays dot or badge count for days with trips; tap selects date. |
| `SelectedDayTripList` | Trip List | Yes | Selected day's trips | Displays departure time, route name, vehicle plate, status pill, passenger count, cash handover. Read-only (no actions). |
| `StatusPill` | Badge | Yes | Trip `status` | "Sắp chạy" (SCHEDULED), "Đang chạy" (IN_TRANSIT), "Đã chạy" (COMPLETED), "Đã hủy" (CANCELLED). |
| `ScheduleDefaultNote` | Note Tag | Yes (when `source == 'SCHEDULE_DEFAULT'`) | Trip `source` | Displays "Lịch mặc định". |
| `EmptyState` | Full Width View | Conditional | `trips.length == 0` | Displays message "Tháng này bạn chưa có chuyến nào." |
| `ErrorRetryView` | Error Banner | Conditional | Network / API Error | Displays Vietnamese error message with "Thử lại" button. |

---

## 4. API Contract

### 4.1. Fetch Driver Monthly Schedule
- **Endpoint:** `GET /api/v1/driver/schedule?month=YYYY-MM`
- **Auth:** Bearer Token (`req.identity.sub` determines driver ID; `req.operatorId` determines company)
- **Query Parameters:**
  - `month` (optional): Format `YYYY-MM`. Defaults to current month in Vietnam time (UTC+7).
- **Validation & Error Responses:**
  - `400 INVALID_MONTH`: Malformed month format.
  - `400 MONTH_OUT_OF_RANGE`: Month outside the allowed range of 3 months before to 3 months after current month.
  - `401 UNAUTHORIZED`: Missing or invalid session token.
  - `403 FORBIDDEN` / `DRIVER_LOCKED` / `PIN_CHANGE_REQUIRED`: Access restrictions.

- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "month": "2026-10",
    "today": "2026-10-19",
    "days": [
      {
        "date": "2026-10-19",
        "trips": [
          {
            "trip_id": "trp_hn_th_01_20261019",
            "departure_time": "2026-10-19T07:00:00+07:00",
            "departure": "07:00",
            "route_name": "Hà Nội — Thanh Hóa (Cao tốc)",
            "vehicle_plate": "29B-882.19",
            "status": "SCHEDULED",
            "source": "ASSIGNED",
            "passengers": 14,
            "delay_minutes": 0,
            "cash_handed_in_vnd": null
          }
        ]
      }
    ],
    "summary": {
      "total": 1,
      "completed": 0,
      "upcoming": 1,
      "cancelled": 0
    }
  }
}
```

---

## 5. Business Rules

- `BR-DRI-021-01`: **Allowed Range:** Drivers may view schedules from 3 months prior up to 3 months following the current month (Vietnam time). Requests outside this window return `400 MONTH_OUT_OF_RANGE`.
- `BR-DRI-021-02`: **Tenant & Driver Isolation:** Only trips belonging to the driver's company (`req.operatorId`) and assigned to the driver (`req.identity.sub`) are returned. Trips of other drivers or other operators are never exposed.
- `BR-DRI-021-03`: **Precedence of Trip-Level Assignment:**
  - If a trip-level record exists in `managerService.trips` or `driverService.activeTrips` for a schedule run:
    - If assigned to this driver: returned with `source: 'ASSIGNED'` and its live/persisted status.
    - If assigned to another driver: this driver receives nothing for that day.
    - If cancelled: returned with `status: 'CANCELLED'`.
  - If no trip-level record exists: a `SCHEDULE_DEFAULT` entry is a promise about the future (D155). It is only generated for today and later days (`date >= today`) where this driver is the schedule's default driver (`managerService.scheduleAssignments`). Past days without a trip-level record are never shown as "SCHEDULED".
- `BR-DRI-021-03b`: **Schedule defaults are future-only:** `SCHEDULE_DEFAULT` entries are listed from today (Vietnam date) onwards. A past run that really ran has a trip-level record and shows as `ASSIGNED`; a past day without one is not listed.
- `BR-DRI-021-04`: **Status Mapping:** All internal statuses map to exactly four UI states:
  - `DISPATCHED`, `SCHEDULED`, `READY` $\rightarrow$ `SCHEDULED` ("Sắp chạy")
  - `IN_TRANSIT`, `IN_PROGRESS` $\rightarrow$ `IN_TRANSIT` ("Đang chạy")
  - `COMPLETED` $\rightarrow$ `COMPLETED` ("Đã chạy")
  - `CANCELLED` $\rightarrow$ `CANCELLED` ("Đã hủy")
- `BR-DRI-021-05`: **Cash Handover Visibility:** `cash_handed_in_vnd` is included only for `COMPLETED` trips where total cash handover is recorded; otherwise it is `null`.
- `BR-DRI-021-06`: **Read-only Screen:** This screen is informational only. Drivers do not perform operational actions (like pre-start inspection or departure) from this monthly calendar view.

---

## 6. Acceptance Criteria
- `TC-DRI-SCHED-01`: Trip-level assignment shows `source: 'ASSIGNED'` with the correct status (`SCHEDULED`, `COMPLETED` with cash handover).
- `TC-DRI-SCHED-02`: Schedule default yields one `SCHEDULE_DEFAULT` entry per run day of the month, respecting days of the week the schedule does not run.
- `TC-DRI-SCHED-03`: Trip-level reassignment of a schedule run to another driver removes that run from this driver's calendar.
- `TC-DRI-SCHED-04`: Another driver's trips never appear in the schedule.
- `TC-DRI-SCHED-05`: Month query parameter outside $[-3, +3]$ months returns `400 MONTH_OUT_OF_RANGE`; malformed month returns `400 INVALID_MONTH`; omitting month defaults to current month.
