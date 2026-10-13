# DRI-020 — Home Pickup Run (Đón khách tận nhà)

**App:** Driver
**Platform:** Android / iOS
**Screen Type:** List with map and inline actions
**Priority:** P1
**Route:** Readiness (DRI-004) → panel "Đón tận nhà" → **Đi đón khách tận nhà**
**Version:** 1.0
**Source Requirements:** `docs/specs/pickup_dropoff_spec.md` A4, `docs/specs/fixed_routes_schedules_spec_v1_source.md` §9 (estimated pickup time), `D143`

---

## 1. Purpose & User Story
- **Purpose:** home pickups are collected before departure (window 75–30 minutes before). While the driver is on this run the app sends the bus position, so each passenger waiting at home sees the bus coming and is told when it is close and at the door.
- **Actor:** the trip's driver.
- **Outcome:** each home passenger is on board, or reported unreachable (A9); the driver goes back to the readiness checks and departs.

## 2. Layout
- **Readiness panel** (only when the trip has confirmed home pickups): "Đón tận nhà · `waiting`/`total` khách chờ", the window, then **Đi đón khách tận nhà** (before) or **Mở danh sách đón tận nhà** (after).
- **Header:** "Đón khách tận nhà", `n` khách · khung `from–to` · xuất bến `HH:MM`; counter on board/total.
- **Live line:** "Đang gửi vị trí: `n` khách đang thấy xe tới…"; "Đã đón hết khách tận nhà. Về bến để xuất bến." once none waits.
- **Map:** the route map with the home pins.
- **Rows:** the manifest row (DRI-007): **Cho lên xe** (or COD), "Không vào được địa chỉ" (A9). No-show is marked at the departure stop.
- **Footer:** "Về màn kiểm tra xe" / "Về bến · kiểm tra xe".

## 3. API Contract
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/driver/trips/{tripId}/home-run` | `Idempotency-Key`. Starts the run once (a second call changes nothing); `409 NO_HOME_PICKUPS` without a confirmed, reachable home pickup waiting; `409 TRIP_NOT_ACTIVE` once the trip ended. Reply: the trip with `home_run_started_at`. |
| POST | `/api/v1/driver/trips/{tripId}/telemetry` | accepted before departure once the run started (`TRIP_NOT_ACTIVE` otherwise) |

## 4. Business Rules
- `BR-HOMERUN-001`: starting the run tells each waiting home passenger once ("Tài xế đã lên đường đón bạn").
- `BR-HOMERUN-002`: from a live position, the ETA to the address is the straight line × 1.3 at the bus speed (at least 20 km/h). Within the company threshold (default 10 min) the passenger is told once "Xe sắp tới đón bạn"; within 300 m, once "Xe đã tới gần chỗ đón".
- `BR-HOMERUN-003`: a home request pending, refused or reported unreachable is not on the run; its passenger is told at the stop as any other.
- `BR-HOMERUN-004`: until the GPS plugin is wired, the app drives the bus to the next address on its own (250 m a ping).

## 5. Acceptance Criteria
- `TC-HOME-TRACK-01` to `05` (server), driver test "setting off for the home pickups…", passenger tests D143.
