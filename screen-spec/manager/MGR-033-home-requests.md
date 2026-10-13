# MGR-033 — Home Pickup / Drop-off Review (Duyệt đón / trả tận nhà)

**App:** Manager Operations Portal
**Platform:** Web (Desktop, stacks on narrow screens)
**Screen Type:** Filtered list with inline actions
**Priority:** P1
**Route:** `/manager` → nav "Duyệt đón tận nhà" (badge = requests waiting)
**Version:** 1.0
**Source Requirements:** `docs/specs/fixed_routes_schedules_spec.md` §3.1 (source §4.2, §4.3, §8.3, §8.4), `D130`

---

## 1. Purpose & User Story
- **Purpose:** An address inside a service area set to "Nhà xe duyệt" (`confirmation = MANUAL`) is sold as a request. The office checks the lane, the vehicle and the timing, then confirms or refuses it.
- **Actors:** `FLEET_DIRECTOR`, `DISPATCHER` of the company; `PLATFORM_ADMIN` after picking the company. Others: 403, "Chỉ giám đốc và điều độ duyệt được."
- **Outcome:** the passenger gets the answer as a notification; a confirmed address enters the driver's list at once.

## 2. Layout
- **Intro line:** what pending means for the passenger and the driver, what a refusal does, and that an unreviewed request is refused when the bus leaves.
- **Filter:** Chờ duyệt (default) · Đã xác nhận · Đã từ chối · Khách đã hủy · Tất cả; count "`n` yêu cầu". Refreshed every 5 s, except while a reason is being typed.
- **Row:** departure time and date, route; passenger, PNR, phone, seats; side pill (Đón / Trả), address, note, area, pickup window, "xem bản đồ" (OpenStreetMap at the pin); fee; status pill, "Quá hạn duyệt" when the review deadline passed, refusal reason.
- **Actions (pending only):** **Xác nhận**; reason field + **Từ chối** (reason of at least 5 characters, shown to the passenger).
- **Empty:** "Không có yêu cầu."

## 3. Status
| Status | Meaning | Pill |
|---|---|---|
| `PENDING_REVIEW` | sold, waiting for the office; the bus serves the ticket's stop | Chờ duyệt |
| `CONFIRMED` | the bus serves the address | Đã xác nhận |
| `REJECTED` | refused by the office, or by the system when the bus left before a review | Đã từ chối |
| `WITHDRAWN` | the passenger took the request back | Khách đã hủy |

## 4. API Contract (staff token)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/ops/home-requests?status=` | `PENDING_REVIEW` (default), `CONFIRMED`, `REJECTED`, `WITHDRAWN`, `ALL`; sorted by departure. Row: `request_id`, `order_id`, `pnr`, `side`, `trip_id`, `departure_time`, `seat_codes`, `passenger_name`, `passenger_phone`, `address`, `note`, `lat`, `lng`, `area_name`, `fee_vnd`, `window_from`, `window_to`, `status`, `review_deadline`, `reviewed_at`, `reviewed_by`, `reject_reason` |
| POST | `/api/v1/ops/home-requests/{orderId}/{PICKUP\|DROPOFF}/confirm` | `Idempotency-Key` |
| POST | `/api/v1/ops/home-requests/{orderId}/{PICKUP\|DROPOFF}/reject` | `Idempotency-Key`; body `{reason}`; reply has `refund_id` |

Errors: `400 VALIDATION_ERROR` (side, short reason), `403`, `404 HOME_REQUEST_NOT_FOUND` (missing, unpaid or another company's), `409 HOME_REQUEST_ALREADY_REVIEWED`, `409 TICKET_NOT_ACTIVE`, `409 TRIP_DEPARTED`.

## 5. Business Rules
- `BR-HOME-001`: a request is per order and side: one address and one fee for every seat of the order.
- `BR-HOME-002`: while pending, the driver's list has no address for the ticket and the passenger boards at the anchor stop (first stop for a pickup, last stop for a drop-off).
- `BR-HOME-003`: confirming puts the address and window in the driver's list and tells the passenger the address, the window and to be ready before it.
- `BR-HOME-004`: refusing needs a reason; the fee is refunded through a refund request (`HOME_SERVICE_REFUSED`, approved by finance like any refund), each ticket's price drops by its share, and the passenger may cancel the ticket for a full refund of the rest before departure.
- `BR-HOME-005`: when the bus departs, every pending request of the trip is refused by `system` with "Nhà xe chưa xác nhận kịp trước giờ xuất bến".
- `BR-HOME-006`: the review deadline shown is the opening of the pickup window (drop-off: the departure).
- `BR-HOME-007`: every confirm and refuse is in the audit log (MGR-028).

## 6. Acceptance Criteria
- `TC-FR-01`: a MANUAL area address is sold pending, absent from the driver's list, confirmed by the dispatcher, then present; a cashier gets 403; a second answer is refused.
- `TC-FR-03`: a refusal without reason is refused; with a reason the fee is refunded once and a later cancellation refunds the rest in full.
- `TC-FR-04`: passenger withdrawal; automatic refusal at departure.
