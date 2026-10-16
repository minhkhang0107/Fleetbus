# MGR-006 — Add a Bus, Change its Seat Layout

**App:** Manager Operations Portal (`/manager` → "Đội xe")  
**Platform:** Web (Desktop)  
**Priority:** P1 (Fleet Management)  
**Version:** 2.0 (D147, 2026-10-14)  
**Roles:** FLEET_DIRECTOR, DISPATCHER (others get 403)

---

## 1. Purpose
Register a bus with its plate, model and seat layout (MGR-007), and change a bus's layout or model later.

## 2. API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/ops/vehicles` | `Idempotency-Key`; body `plate_number`, `model`, `layout_id`; `201` with the bus (status `STANDBY`) |
| PATCH | `/api/v1/ops/vehicles/{vehicleId}` | body `layout_id` and/or `model` |

Errors: `400 VALIDATION_ERROR` (empty plate, unknown or another company's layout), `403 FORBIDDEN`, `404 VEHICLE_NOT_FOUND`, `409 VEHICLE_EXISTS` (plate already in the company, case ignored), `409 LAYOUT_MISSING_SOLD_SEATS` (message lists the missing seat codes).

## 3. Business Rules
- `BR-VEH-001`: a plate is unique within the company.
- `BR-VEH-002`: a new layout must contain every seat sold or held on the bus's unfinished trips; then those trips are redrawn on it with their tickets kept, and their seat count follows the layout.
- `BR-VEH-003`: assigning a bus to a trip (MGR-017) applies the same check (`LAYOUT_MISSING_SOLD_SEATS`); the trip's seat map is rebuilt on the new bus's layout.
- `BR-VEH-004`: adding and changing a bus are written to the audit log (`VEHICLE_CREATE`, `VEHICLE_UPDATE`).

## 4. Test Matrix
| Test ID | Condition | Expected |
|---|---|---|
| `TC-MGR-006-01` | Add a bus with a plate already used (other case) | 409 `VEHICLE_EXISTS` |
| `TC-MGR-006-02` | Change a bus's layout | `total_seats` follows the layout |
| `TC-MGR-006-03` | Change to a layout without a booked seat | 409 `LAYOUT_MISSING_SOLD_SEATS` |
| `TC-MGR-006-04` | Assign a 45-seat bus to an unsold trip | passengers see the bus model, 45 seats, a 1-deck 5-column map |
