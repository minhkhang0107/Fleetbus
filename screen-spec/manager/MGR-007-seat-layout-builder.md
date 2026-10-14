# MGR-007 — Seat Layouts (Sơ đồ ghế)

**App:** Manager Operations Portal (`/manager` → "Sơ đồ ghế")  
**Platform:** Web (Desktop)  
**Priority:** P1 (Fleet)  
**Version:** 2.0 (D147, 2026-10-14)  
**Roles:** FLEET_DIRECTOR, DISPATCHER (others get 403)

---

## 1. Purpose
A bus has the seats of the model the company bought. Each vehicle (MGR-005, MGR-006) carries one seat layout; every trip that bus runs is sold on that layout. This screen lists the layouts the company can give a bus and lets it draw its own.

## 2. Layouts

### Built-in (shared by every company, cannot be edited or deleted)
| `layout_id` | Name | Decks | Columns | Seats | Codes |
|---|---|---|---|---|---|
| `CABIN_22` | Limousine 22 phòng (2 tầng) | 2 | 3 | 22 | A01–A11, B01–B11 (the map used before D147) |
| `CABIN_34` | Limousine 34 phòng (2 tầng, 3 dãy) | 2 | 5 | 34 | deck 1 A01–A17, deck 2 B01–B17 |
| `SLEEPER_34` | Giường nằm 34 chỗ (2 tầng, 3 dãy) | 2 | 5 | 34 | same grid as `CABIN_34`, type `SLEEPER` |
| `SEAT_45` | Ghế ngồi 45 chỗ (1 tầng) | 1 | 5 | 45 | S01–S45, 2+2 with aisle in column 3, back row of 5 |

### Company layouts
Drawn on this screen, id `custom_<8 hex>`, visible only to the company that made them, saved in the company's database (collection `custom_seat_layouts`).

### Shape
```json
{
  "layout_id": "custom_5c229f2d",
  "name": "Limousine 9 chỗ VIP",
  "vehicle_type": "SINGLE_DECK_SEATER",
  "total_decks": 1,
  "columns": 3,
  "total_seats": 7,
  "builtin": false,
  "used_by": ["29B-777.77"],
  "seats": [{ "seat_code": "A01", "deck": 1, "row": 1, "column": 1, "type": "VIP_CABIN" }]
}
```
A column with no seat on a deck is drawn as the aisle.

## 3. Screen
- **List:** every layout with decks, seats, "Có sẵn" on built-ins and the plates using it. Actions: "Nhân bản" (copy into the editor), and on company layouts "Sửa" and "Xóa" (second click "Xóa hẳn?" confirms; no browser dialogs).
- **Preview:** each deck drawn from the front ("Đầu xe"), coloured by seat type (Phòng VIP, Giường nằm, Ghế ngồi).
- **Editor:** name, vehicle type, decks (1–3), rows (1–20), columns (1–8), aisle columns (e.g. `2`), default seat type, code prefix per deck. "Tạo lưới" fills the grid; clicking a cell switches a seat on or off; codes renumber in order (`A01`, `A02` …). The seat count updates as cells change. "Lưu sơ đồ" saves; errors show under the grid.

## 4. API
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/ops/seat-layouts` | built-ins then the company's, each with `used_by` (plates) |
| POST | `/api/v1/ops/seat-layouts` | `Idempotency-Key`; `201` with the layout |
| PATCH | `/api/v1/ops/seat-layouts/{layoutId}` | fields left out are kept; buses using it and their unfinished trips are redrawn |
| DELETE | `/api/v1/ops/seat-layouts/{layoutId}` | `data.deleted = true` |

Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 LAYOUT_NOT_FOUND` (missing or another company's), `409 LAYOUT_BUILTIN`, `409 LAYOUT_IN_USE` (edit: a bus using it has a trip with sold or held seats; delete: a bus still uses it, `details.plates`).

## 5. Business Rules
- `BR-LAYOUT-001`: name 1–80 characters; 1–3 decks; 1–8 columns; 1–80 seats; rows 1–30; every deck has at least one seat.
- `BR-LAYOUT-002`: seat code 1–4 of `A-Z0-9`, unique in the layout; one seat per cell; type `VIP_CABIN`, `SLEEPER` or `SEAT`.
- `BR-LAYOUT-003`: a layout cannot change while tickets are sold or held on it, and cannot be deleted while a bus uses it: passengers never lose a seat they paid for.
- `BR-LAYOUT-004`: create, edit and delete are written to the audit log (MGR-028) with before and after (`SEAT_LAYOUT_CREATE`, `SEAT_LAYOUT_UPDATE`, `SEAT_LAYOUT_DELETE`).

## 6. Test Matrix
| Test ID | Condition | Expected |
|---|---|---|
| `TC-MGR-007-01` | List | 4 built-ins with 22, 34, 34, 45 seats |
| `TC-MGR-007-02` | Cashier calls any layout endpoint | 403 |
| `TC-MGR-007-03` | Create with a duplicate seat code | 400 `VALIDATION_ERROR` |
| `TC-MGR-007-04` | PATCH `CABIN_22` | 409 `LAYOUT_BUILTIN` |
| `TC-MGR-007-05` | Delete a layout a bus uses / an unused one | 409 `LAYOUT_IN_USE` / 200 |
| `TC-MGR-007-06` | Edit a layout whose bus has a trip with booked seats | 409 `LAYOUT_IN_USE` |

Tests: `test/server/seat_layouts.test.js`, `test/server/seat_layout_api.test.js`.
