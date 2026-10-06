# MGR-029 — Manager RBAC Roles & Permission Matrix

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Security Configuration  
**Priority:** P1 (Security & Authorization)  
**Route:** `/ops/roles-permissions`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-29`, `BR-AUTH-003`, `UC-MGR-AUTH-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Define and assign Role-Based Access Control (RBAC) permissions across staff roles (`ROLE_SUPER_ADMIN`, `ROLE_DISPATCHER`, `ROLE_COUNTER_STAFF`, `ROLE_FINANCE_ACCOUNTANT`, `ROLE_SAFETY_OFFICER`), scoping capabilities by specific depot branches or company-wide.
- **Actor:** Super Administrator / IT Security Lead.
- **Outcome:** Granular capabilities configured; unauthorized operations blocked.

---

## 2. RBAC Capability Matrix
- `TRIP_CREATE`, `TRIP_DISPATCH`, `VEHICLE_REPLACE`, `REFUND_APPROVE`, `AUDIT_VIEW`, `POS_SELL`, `SEAT_OVERRIDE_LOCK`.
- **API Endpoint:** `GET /api/v1/ops/rbac/roles` & `POST /api/v1/ops/rbac/roles`
- **TC-MGR-029-01:** Verifies removing `REFUND_APPROVE` immediately disables refund action buttons for that role.

---

## Role matrix enforced by the gateway (review FND-A01, OQ-022)

The role names in the spec (`ROLE_OPS_ADMIN`, `ROLE_FINANCE`) map to the roles of the staff directory as follows: `ROLE_OPS_ADMIN` = `FLEET_DIRECTOR`, `ROLE_FINANCE` = `FINANCIAL_CONTROLLER`. Every `/api/v1/ops/*` endpoint except login needs a staff token; the first matching rule below decides, and an endpoint with no rule is open to any staff role.

| Endpoint group | Roles allowed |
| :--- | :--- |
| `POST /ops/pos/*` (counter and hotline sales) | `FLEET_DIRECTOR`, `CASHIER` |
| `/ops/refunds/*`, `/ops/reports/*`, `/ops/payments`, `/ops/audit-logs` | `FLEET_DIRECTOR`, `FINANCIAL_CONTROLLER` |
| `/ops/bookings*` (search and detail) | `FLEET_DIRECTOR`, `CASHIER`, `FINANCIAL_CONTROLLER` |
| `POST /ops/trips/{id}/delay`, `replace-vehicle`, `swap-vehicle` | `FLEET_DIRECTOR`, `DISPATCHER` |
| Everything else under `/ops/*` (KPIs, radar, fleet, crew, dispatch) | any staff role |

- **Full phone numbers (OQ-007):** only `FLEET_DIRECTOR` sees a passenger's full phone number in booking results; every other role sees `098***233`.
- **Authentication switch:** The gateway verifies tokens when `FLEETBUS_AUTH=enforce`, which is the default in production. In development it is `off` until the Flutter apps send tokens (`OQ-022`). A passenger token only opens passenger endpoints, a driver token only driver endpoints, and a staff token only `ops` endpoints (`403 FORBIDDEN` otherwise).
