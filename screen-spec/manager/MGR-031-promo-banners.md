# MGR-031 — Promotion Banners of the Passenger App

**App:** Manager Operations Portal
**Platform:** Web (Desktop, stacks on narrow screens)
**Screen Type:** List + editor side by side
**Priority:** P2
**Route:** `/manager` → nav "Quảng cáo"
**Version:** 1.0
**Source Requirements:** request of the product owner 2026-10-12, `D124`, `D125`, `PAX-004` §5.1

---

## 1. Purpose & User Story
- **Purpose:** The bus company's director manages the slides of the passenger home slider (PAX-004 zone 2) and the HTML page behind each slide.
- **Actor:** `FLEET_DIRECTOR` of the company; `PLATFORM_ADMIN` after picking the company in the top bar. Other roles get 403 and see "Chỉ giám đốc nhà xe sửa được quảng cáo."
- **Outcome:** What is saved shows on the passenger app the next time its home tab loads; nothing left live hides the slider.

## 2. Layout
- **List (left):** colour/image swatch, title, short description, run window (`dd-mm hh:mm → …`, "Không hạn"), status pill, order, actions **Sửa**, **Tắt/Bật**, **Xóa**. Header shows "`n` đang chạy / `m` quảng cáo". Empty list: "Chưa có quảng cáo. App khách đang ẩn slider."
- **Editor (right):** title (≤ 80), short description (≤ 120), background colour, image URL (optional; the image replaces the drawn slide), order (default: after the last), start / end (Vietnam time, empty = now / no end), HTML body, "Bật ngay khi lưu" (create only).
- **Preview:** the slide as the app draws it, and the detail page in a sandboxed frame (no script runs).
- **Delete:** cannot be undone. The first click turns the button into "Xóa hẳn?" for 4 s; a second click deletes. No browser dialog (D99).

## 3. Status
| Status | Rule | Pill |
|---|---|---|
| `LIVE` | on, started, not ended | Đang chạy |
| `SCHEDULED` | on, `starts_at` in the future | Chưa bắt đầu |
| `ENDED` | on, `ends_at` passed | Đã kết thúc |
| `OFF` | switched off | Đang tắt |

Only `LIVE` banners reach the passenger app, ordered by `sort_order`.

## 4. API Contract (staff token, company from the token or `X-Operator-Code` for the platform)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/ops/promo-banners` | `data.banners[]`: every banner of the company with `content_html` and `status` |
| POST | `/api/v1/ops/promo-banners` | `Idempotency-Key`; `201` with the banner |
| PATCH | `/api/v1/ops/promo-banners/{id}` | fields left out are kept |
| POST | `/api/v1/ops/promo-banners/{id}/activate` · `/deactivate` | `Idempotency-Key` |
| DELETE | `/api/v1/ops/promo-banners/{id}` | `data.deleted = true` |

Errors: `400 VALIDATION_ERROR` (message in Vietnamese), `403 FORBIDDEN` (role), `404 BANNER_NOT_FOUND` (missing or another company's).

## 5. Business Rules
- `BR-PROMO-001`: a company only sees and edits its own banners.
- `BR-PROMO-002`: `content_html` ≤ 50 000 characters and may not contain `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `on…=` attributes or `javascript:` (refused, not stripped).
- `BR-PROMO-003`: colour `#RRGGBB`; image `http(s)` URL ≤ 500; order 0-999; end after start.
- `BR-PROMO-004`: every create, edit, on/off and delete is written to the audit log (MGR-028) with before and after.

## 6. Test Matrix
| Test ID | Condition | Expected |
|---|---|---|
| `TC-MGR-031` | Director lists, creates, edits, switches off, deletes | Status per banner; passenger list follows each step; audit has the 4 actions |
| `TC-MGR-031` | Dispatcher calls the API | 403 |
| `TC-MGR-031` | HTML with `onerror=` | 400 `VALIDATION_ERROR` |
| `TC-MGR-031` | Platform acting as XUYENVIET edits a SAOMAI banner | 404 |
