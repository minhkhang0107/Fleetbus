# MGR-032 — Fixed Timetable (Lịch chạy cố định)

**App:** Manager Operations Portal
**Platform:** Web (Desktop, stacks on narrow screens)
**Route:** `/manager` → nav "Lịch chạy"
**Version:** 1.0
**Source Requirements:** product owner 2026-10-12 ("theo nhà xe thì chuyến được cố định"; "đặt trước tối đa 2 tuần, lịch mới có hiệu lực sau 2 tuần"), `D128`, `D129`

## 1. Purpose
A bus company runs fixed departures: each route leaves at set clock times on set weekdays. The office keeps
that timetable here; every day a departure runs has its own trip that passengers book (`<schedule>_<YYYYMMDD>`).

- **Actors:** `FLEET_DIRECTOR`, `DISPATCHER` of the company; `PLATFORM_ADMIN` after picking the company. Others: 403.

## 2. Layout
- **Rule line:** "Khách đặt trước tối đa 14 ngày, đến dd/mm. Lịch mới và mọi thay đổi có hiệu lực từ dd/mm".
- **Timetable (left):** grouped by route, by departure time. Each row: time, duration, bus type, weekday chips
  T2..CN, validity, fare, status (Đang chạy / Sắp áp dụng / Tạm ngừng / Đã kết thúc), the coming changes
  ("Từ dd/mm: 15:00 · mọi ngày · 180.000 đ", "(đã mở bán)" once their first day is on sale), **Sửa**,
  **Ngừng / Chạy lại**, **Hủy thay đổi** (while a change is not on sale yet).
- **Editor (right):** route (fixed when editing), departure `HH:mm`, duration, weekdays, fare, "Chạy đến",
  "Đang chạy"; "Áp dụng từ" for a new schedule or one not on sale yet, "Thay đổi có hiệu lực từ" for one on
  sale. Both start no earlier than the first day not on sale.

## 3. Rules
- `BR-SCHED-001`: passengers book from today to 14 days ahead (`BOOKING_WINDOW_DAYS`, D129).
- `BR-SCHED-002`: a new schedule, and any change of one on sale (time, duration, weekdays, fare, end date, stop or
  resume), starts on the first day not on sale (today + 15) or later. Every day already on sale keeps the
  timetable its tickets are sold under; nobody's ticket changes time, fare or day.
- `BR-SCHED-003`: a schedule keeps dated versions; a travel day takes the latest version in force on it. A later
  change replaces the not-yet-on-sale versions from its own day on. Changes not on sale yet can be cancelled.
- `BR-SCHED-004`: a schedule not on sale yet ("Sắp áp dụng") is changed outright; its start may move, never
  before the first day not on sale.
- `BR-SCHED-005`: a day runs when the version in force has it on, its weekday checked and the day inside the
  validity. A day without a departure is greyed in the passenger date picker (`GET /api/v1/trips/run-days`).
- `BR-SCHED-006`: a new departure copies stops, bus type and road of the route's schedule and has no bus until the
  office assigns one. Schedules are never deleted (history of trips).
- `BR-SCHED-007`: trips set up for days from the change on before this rule (30-day window) follow the change
  when unsold; sold ones are kept and reported (`kept_runs`).
- `BR-SCHED-008`: every create, change and cancel is in the audit log (MGR-028).
- `BR-SCHED-009` (Extra departure - D134): "Chuyến tăng cường" runs one route at one time on one day (`extra_date`, from today), and is on sale at once, inside the booking window: it adds seats and changes nothing sold. The form hides weekdays and validity when it is ticked. Listed with the pill "Tăng cường" and its day; on sale it cannot be edited (`409 EXTRA_RUN_ON_SALE`) and is cancelled on the dispatch board (MGR-014) if it will not run.

## 4. API (staff token)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/ops/schedules` | `today`, `change_from`, `schedules[]` (with `status`, `upcoming[]`), `routes[]` |
| POST | `/api/v1/ops/schedules` | extra departure: `route_id`, `departure`, `extra_date` (≥ today), optional `duration_minutes`, `base_fare_vnd`. Recurring: `route_id`, `departure`, `days_of_week` (1 = Monday .. 7), `valid_from` (≥ `change_from`, default it), `valid_to`, `duration_minutes`, `base_fare_vnd`, `active`; Idempotency-Key; 201 |
| PATCH | `/api/v1/ops/schedules/{id}` | the fields above but route and (when on sale) `valid_from`; `effective_from` ≥ `change_from`; answers `effective_from`, `kept_runs[]` |
| DELETE | `/api/v1/ops/schedules/{id}/changes` | cancels the changes not on sale yet; `404 NO_PENDING_CHANGE` when none |
| GET | `/api/v1/trips/run-days?origin=&destination=` | public: days of the booking window with a departure on the route |

Errors: `400 VALIDATION_ERROR` (incl. a start inside the days on sale), `403 FORBIDDEN`, `404 SCHEDULE_NOT_FOUND` / `ROUTE_NOT_FOUND`.

## 5. Tests
`TC-SCHED-01` (weekday, validity, on/off; version in force), `TC-SCHED-02` (14-day window; office list and roles;
new departure two weeks out; change of a schedule on sale keeps the days on sale; cancel; stop; validation),
`TC-SCHED-03` (trips set up before the rule follow a change unless sold), `TC-FR-11` (extra departure).
