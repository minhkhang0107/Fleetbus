# MGR-005 — Fleet (Đội xe)

**App:** Manager Operations Portal (`/manager` → "Đội xe")  
**Platform:** Web (Desktop)  
**Priority:** P1 (Fleet Management)  
**Version:** 2.0 (D147, 2026-10-14)

---

## 1. Purpose
The company's buses with the seat layout each one carries (MGR-007). Adding a bus and changing its layout are MGR-006, on the same screen.

## 2. Screen
- Table: plate, model, seat layout (name and seats), status, and per row a layout picker with "Đổi sơ đồ" (FLEET_DIRECTOR, DISPATCHER).
- "Thêm xe" form above the table (MGR-006).

## 3. API
- `GET /api/v1/ops/vehicles` (any staff role): the company's buses, each with `layout_id`, `layout_name` and `total_seats` taken from its layout.

## 4. Business Rules
- `BR-FLEET-001`: a bus saved before seat layouts existed (no `layout_id`) runs on `CABIN_22`, the map its tickets were sold on, until the office changes it.

## 5. Test Matrix
| Test ID | Condition | Expected |
|---|---|---|
| `TC-MGR-005-01` | List after adding a bus with a company layout | the bus shows that layout's name and seat count |
