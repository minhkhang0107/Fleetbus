# MGR-036 — Company Profile and Contact Info

**App:** Manager Operations Portal (`/manager` → "Thông tin nhà xe"; platform admin → "Nhà xe (nền tảng)" → "Sửa")  
**Platform:** Web (Desktop)  
**Priority:** P1  
**Version:** 1.0 (D161, 2026-10-27)  
**Roles:** every office role reads; FLEET_DIRECTOR edits contact info; PLATFORM_ADMIN edits everything except the code

---

## 1. Purpose
Everything a passenger or driver sees about a bus company (name, hotline, support email, office address, payee account) comes from the server, per company. No app carries a company's phone number or account: one build serves every company, and a change made on the web reaches the apps on their next load.

## 2. Who changes what
| Field | Director (`PATCH /ops/company`) | Platform admin (`PATCH /platform/operators/{id}`) |
|---|---|---|
| Tổng đài (`hotline`) | yes | yes |
| Email chăm sóc khách hàng (`support_email`) | yes | yes |
| Địa chỉ văn phòng (`address`) | yes | yes |
| Tên, tên ngắn | no | yes |
| Tài khoản nhận tiền (`bank`) | no (money: a stolen director login must not redirect payments) | yes |
| Mã nhà xe (`code`) | no | no (it is in tokens, links and transfer memos) |

Rules: hotline 8-15 characters of digits, spaces, `.` and `+`, at least 8 digits; email standard format; address at most 200 characters; empty = not shown. Every change is in "Nhật ký thao tác" (`OPERATOR_CONTACT_UPDATE` / `OPERATOR_UPDATE`, before and after).

## 3. Where the apps show it
- Passenger: profile tab (hotline tappable to dial, email, address); live radar "Gọi tổng đài <hotline>" (hidden when empty); ticket QR "hoặc gọi <hotline>" (left out when empty).
- Driver: login footer "Quên PIN? Gọi điều độ <hotline>" once the company is known, otherwise "Gọi điều độ nhà xe của bạn"; shell header.
- VietQR: the payee is always the order's company; with no payee the server refuses to build a QR instead of falling back to any account.

## 4. API
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/ops/company` | any office role; `{ operator: { operator_id, code, name, short_name, hotline, support_email, address, primary_color, bank, memo_prefix }, editable: ['hotline','support_email','address'] }` |
| PATCH | `/api/v1/ops/company` | FLEET_DIRECTOR (others 403); only `hotline`, `support_email`, `address` are read, other keys ignored |
| GET | `/api/v1/platform/operators` | each company also carries `director_email` |
| PATCH | `/api/v1/platform/operators/{id}` | also takes `support_email`, `address` |
| GET | `/api/v1/app/config` | public profile now includes `support_email`, `address` |

## 5. Tests
`test/server/operator_contact.test.js`, `TC-CORE-05B` (no fallback payee), `test/mobile/manager_web.test.js`.
