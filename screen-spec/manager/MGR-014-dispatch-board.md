# MGR-014 — Manager Daily Fleet Dispatch Board & Resource Matrix

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Interactive Gantt Timeline / Dispatch Deck  
**Priority:** P0 (Core Operational)  
**Route:** `/ops/dispatch`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-14`, `BR-DISP-001`, `UC-MGR-DISP-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide a 24-hour visual Gantt timeline of all vehicles and drivers across the company. Dispatchers can review vehicle turnaround times, drag-and-drop assign vehicles/drivers to scheduled trips, detect resource clashes, and execute fast 1-click dispatch sign-offs.
- **Actor:** Chief Dispatcher / Fleet Planner.
- **Outcome:** Daily fleet operations scheduled without driver over-hours or vehicle clashes.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/dispatch/matrix?date=2026-08-27`
- **TC-MGR-014-01:** Verifies dragging a vehicle to an overlapping trip highlights collision in red.


---

## Sale and cancellation of one day's departure (D131, D132)

The trip detail of the web dispatch board has a block **"Bán vé và hủy chuyến"** for a departure that has not left:

- Pill "Đang bán trực tuyến" / "Đang ngừng bán trực tuyến" (+ reason) and the button **Ngừng bán trực tuyến** / **Mở bán lại** → `POST /api/v1/ops/trips/{tripId}/sales {open, reason?}`. A closed departure is not in the passenger search and refuses holds and orders with `409 SALES_CLOSED`; tickets sold stay valid; counter and hotline still sell. The board row shows "Ngừng bán".
- Reason field and **Hủy chuyến** → `POST /api/v1/ops/trips/{tripId}/cancel {reason}` (reason ≥ 5 characters). The first click turns the button into "Bấm lần nữa: hủy và hoàn tiền `n` vé"; the second cancels (no browser dialog). Effects: every live ticket cancelled with a 100% refund request (`OPERATOR_CANCEL`), each passenger notified once with the amount and an invitation to book another departure, pending payment orders closed (late money is refunded), seat holds and hotline holds released, a red alert on the overview, status "Đã hủy". The driver cannot run the checklist or start it (`TRIP_CANCELLED`) and the driver app skips it. Errors: `409 TRIP_ALREADY_CANCELLED`, `409 TRIP_ALREADY_STARTED`.
- A cancelled departure shows "Đã hủy chuyến: <reason>. Vé đã bán được hoàn 100%, chờ duyệt hoàn tiền." and no hotline hold form.
- Roles: `FLEET_DIRECTOR`, `DISPATCHER`. Both actions are in the audit log (`TRIP_SALES_CLOSE`, `TRIP_SALES_OPEN`, `TRIP_CANCEL`).
- A whole route is suspended in "Cấu hình đón trả" → per route "Tạm ngừng bán" (`sales_suspended`, D132): not searchable, no day in the date picker, holds refused with `ROUTE_SUSPENDED`; tickets sold stay valid.
- Tests: `TC-FR-05` (close / reopen), `TC-FR-06` (cancel), `TC-FR-07` (cannot cancel a departed trip), `TC-FR-08` (route suspension).
