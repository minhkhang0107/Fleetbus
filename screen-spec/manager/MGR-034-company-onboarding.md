# MGR-034 — New Company and its First Account

**App:** Manager Operations Portal (`/manager` → "Nhà xe (nền tảng)", then the company's own login)  
**Platform:** Web (Desktop)  
**Priority:** P0  
**Version:** 1.0 (D150, 2026-10-15)  
**Roles:** PLATFORM_ADMIN creates the company; its FLEET_DIRECTOR takes over

---

## 1. Purpose
A new bus company can only start once someone of the company can log in. Creating the company therefore creates its director account; the director then adds the dispatchers' work (drivers, MGR-015) from the company's own login.

## 2. Flow
1. Platform admin fills "Nhà xe (nền tảng)": company data (code, name, bank...) plus **Email giám đốc** and **Tên giám đốc**.
2. The server creates the company and a `FLEET_DIRECTOR` account with a temporary password (12 characters, no look-alike characters), returned once and shown once in a box: "Tài khoản giám đốc <email>, mật khẩu tạm: **…** — gửi cho giám đốc, chỉ hiện một lần; đăng nhập lần đầu phải đổi mật khẩu."
3. The director logs in at `/manager` with the email and the temporary password; before anything else the page shows "Đổi mật khẩu" (current, new, repeat). Every other office call answers 403 `PASSWORD_CHANGE_REQUIRED` until then.
3b. Then "Cài xác thực 2 bước": the page shows the account's own secret (grouped by 4) with "Sao chép khóa" and an `otpauth://` link; the director adds it to an authenticator app and types a 6-digit code to confirm. Until then every other office call answers 403 `TOTP_ENROLLMENT_REQUIRED`. A new account logs in with the password alone only until it is enrolled; from then on every login needs a code from its own secret (the shared dev secret is refused).
4. The director adds drivers (MGR-015, MGR-016) and hands each one a temporary PIN; each driver sets their own PIN at the first app login (DRI-001 §10).
5. A director who forgot the password or lost the phone: the platform admin uses "Cấp lại mật khẩu giám đốc" on the company row; a new temporary password is shown once, and both the password change and the two-step setup are required again.

## 3. API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/platform/operators` | adds `director_email` (unique across staff), `director_name`; response = the company fields plus `director` and `temporary_password`; nothing is created if either part fails |
| POST | `/api/v1/platform/operators/{id}/director/reset-password` | PLATFORM_ADMIN; `{ temporary_password }` |
| POST | `/api/v1/ops/auth/change-password` | `current_password, new_password` (at least 10 characters, a letter and a digit, different from the current one); a wrong current password counts as a failed login |

| POST | `/api/v1/ops/auth/totp/setup` | not enrolled yet; `{ secret, otpauth_uri }` |
| POST | `/api/v1/ops/auth/totp/confirm` | `{ code }`; wrong code 400 `INVALID_TOTP` (counts as a failed login) |

Staff login returns `user.must_change_password` and `user.must_enroll_totp`.

## 4. Business Rules
- `BR-ONB-001`: temporary passwords and PINs are returned once and stored only as hashes; they never appear in logs or the audit trail.
- `BR-ONB-002`: audit `OPERATOR_CREATE`, `PASSWORD_CHANGE`, `TOTP_ENROLLED`, `DIRECTOR_PASSWORD_RESET`.
- `BR-ONB-003`: each account created this way has its own two-step secret, stored encrypted with the company data and returned only by the setup call.

## 5. Test Matrix
| Test ID | Condition | Expected |
|---|---|---|
| `TC-MGR-034-01` | Create company → director logs in → calls `/ops/drivers` | 403 `PASSWORD_CHANGE_REQUIRED` |
| `TC-MGR-034-02` | Change password (weak, then valid) | 400, then 200; old password refused |
| `TC-MGR-034-03` | Director adds a driver for the new company | 201 with a temporary PIN |
| `TC-MGR-034-04` | Duplicate director email | 409 `STAFF_EXISTS` |

Tests: `test/server/operator_onboarding.test.js`.
