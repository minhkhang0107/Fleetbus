# MGR-015 — Drivers (Tài xế)

**App:** Manager Operations Portal (`/manager` → "Tài xế")  
**Platform:** Web (Desktop)  
**Priority:** P0 (a company cannot run without its drivers)  
**Version:** 2.0 (D150, 2026-10-15)  
**Roles:** FLEET_DIRECTOR, DISPATCHER (others: 403, menu item hidden)

---

## 1. Purpose
The company's drivers, the only way to give a driver access to the BusGo Driver app. One record per driver serves both the dispatcher (assigning trips, MGR-017) and the app login (DRI-001); they share one `driver_id`.

## 2. Screen
- Table: staff id, name, phone, license class, license expiry ("Hết hạn" in red when past), status: "Đang làm", "Đã khóa", "Chờ đổi PIN" (temporary PIN not changed yet).
- Actions per row: "Sửa" (MGR-016), "Khóa" / "Mở khóa" (second click "Khóa hẳn?"), "Cấp lại PIN" (second click).
- "Thêm tài xế" opens the form (MGR-016).

## 3. API
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/ops/drivers` | `driver_id, staff_id, full_name, phone, license_class, license_expiry, status (ACTIVE/LOCKED), must_change_pin, license_expired`; never a PIN or its hash |
| PATCH | `/api/v1/ops/drivers/{driverId}` | `status: LOCKED/ACTIVE` locks or unlocks |
| POST | `/api/v1/ops/drivers/{driverId}/reset-pin` | `Idempotency-Key`; returns `{ temporary_pin }` once |

## 4. Business Rules
- `BR-DRV-001`: a company sees and changes only its own drivers (another company's id → 404 `DRIVER_NOT_FOUND`).
- `BR-DRV-002`: a locked driver cannot log in (403 `DRIVER_LOCKED`), is cut off on the next request, and is listed but not selectable when assigning a trip ("Tài xế đã bị khóa").
- `BR-DRV-003`: a driver whose license is past its expiry stays listed, cannot log in (`LICENSE_EXPIRED`) and cannot be assigned.
- `BR-DRV-004`: "Cấp lại PIN" gives a new temporary PIN, clears the login lockout and makes the driver change it at the next login. Used when a driver forgot the PIN (the app's "Quên mã PIN? Gọi điều độ").
- `BR-DRV-005`: create, edit, lock, unlock and PIN reset are written to the audit log (`DRIVER_CREATE`, `DRIVER_UPDATE`, `DRIVER_LOCK`, `DRIVER_UNLOCK`, `DRIVER_PIN_RESET`) without any PIN.

## 5. Test Matrix
| Test ID | Condition | Expected |
|---|---|---|
| `TC-MGR-015-01` | Dispatcher lists drivers | own company only, no `pin` field |
| `TC-MGR-015-02` | Cashier calls the API | 403 |
| `TC-MGR-015-03` | Lock a driver | login 403 `DRIVER_LOCKED`; not available in assign options; unlock restores both |
| `TC-MGR-015-04` | Reset PIN | old PIN refused, temporary PIN accepted once, change required |

Tests: `test/server/driver_accounts.test.js`.
