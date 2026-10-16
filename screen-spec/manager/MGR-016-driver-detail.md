# MGR-016 — Add / Edit a Driver

**App:** Manager Operations Portal (`/manager` → "Tài xế")  
**Platform:** Web (Desktop)  
**Priority:** P0  
**Version:** 2.0 (D150, 2026-10-15; the safety scorecard of v1.0 is deferred)  
**Roles:** FLEET_DIRECTOR, DISPATCHER

---

## 1. Purpose
Add a driver and hand over the first access to the app; correct a driver's details later.

## 2. Form
| Field | Rule |
|---|---|
| Họ tên | 2-60 characters, a letter, no digits or special characters (D149) |
| Số điện thoại | Vietnamese mobile, stored as `0xxxxxxxxx` (D149); unique in the company |
| Mã nhân viên | optional, 3-12 of `A-Z0-9`, uppercase; empty → generated `TX` + 4 digits; unique in the company; cannot change after creation |
| Hạng bằng | `B2`, `C`, `D`, `E`, `FC` |
| Hạn bằng | a date after today |

## 3. Temporary PIN hand-over
After "Thêm" (or "Cấp lại PIN"), the screen shows once, in a box (never a toast, never stored by the page):
"Mã PIN tạm của <tên> (<mã NV>): **123456** — đưa cho tài xế, mã chỉ hiện một lần. Tài xế đăng nhập app BusGo Driver bằng mã nhà xe <CODE>, mã NV và mã này, rồi đặt mã mới."
The server keeps only a hash; nobody can read the PIN again.

## 4. API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/ops/drivers` | `Idempotency-Key`; body `full_name, phone, staff_id?, license_class, license_expiry`; `201 { driver, temporary_pin }` |
| PATCH | `/api/v1/ops/drivers/{driverId}` | any of `full_name, phone, license_class, license_expiry, status` |

Errors: `400 VALIDATION_ERROR` (Vietnamese message), `403 FORBIDDEN`, `404 DRIVER_NOT_FOUND`, `409 DRIVER_EXISTS` (phone or staff id already in the company).

## 5. Test Matrix
| Test ID | Condition | Expected |
|---|---|---|
| `TC-MGR-016-01` | Add without staff id | `TXnnnn` generated, temporary PIN returned, `must_change_pin` true |
| `TC-MGR-016-02` | Same phone twice | 409 `DRIVER_EXISTS` |
| `TC-MGR-016-03` | Name "A1", phone "0123456789", class "X", expiry yesterday | 400 each |
