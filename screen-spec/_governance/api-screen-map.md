# BusGo Screen-to-API Mapping Matrix

**Document Version:** 1.0  
**Scope:** Complete mapping of screens across Passenger, Driver, and Manager apps to backend REST & Realtime endpoints.

---

## 0. Gateway rules (review FND-A01, FND-A02, OQ-022)

- **Auth column:** `Public` needs no token. `Bearer` needs a signed token of the right kind (passenger, driver, staff) and, for staff, a role allowed by the matrix in `MGR-029`. A missing or invalid token gives `401 UNAUTHORIZED` / `INVALID_TOKEN` / `TOKEN_EXPIRED`; a token of the wrong kind or role gives `403 FORBIDDEN`.
- **Identity comes from the token,** not from the request: the passenger phone, the passenger user id and the driver id of a request are read from the token when authentication is enforced.
- **Ownership:** a ticket can be shown by its owner (the payer), by the named passenger and by a delegate, and can be delegated or cancelled only by its owner; an order can only be paid-checked by its payer; a driver only reaches the trips assigned to them.
- **Idempotency column:** `Yes` means the request must carry `Idempotency-Key` (`400 IDEMPOTENCY_KEY_REQUIRED` otherwise). The first response is stored for 24 hours and returned again, with `Idempotent-Replay: true`, to a retry with the same key and body; the same key with a different body gives `422 IDEMPOTENCY_KEY_REUSED`.
- **Switch:** enforcement is on by default in production (`FLEETBUS_AUTH=enforce`) and off in development until the apps send tokens.

---

## 1. Passenger App Screen API Mapping

| Screen ID | Screen Name | Endpoint | Method | Auth | Idempotency | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PAX-001** | Splash | `GET /api/v1/app/config` | `GET` | Public | No | Fetch remote flags, minimal version, payment channels |
| **PAX-002** | Login | `POST /api/v1/auth/passenger/otp/request` | `POST` | Public | Yes (`Idempotency-Key`) | Request SMS OTP for phone authentication |
| **PAX-003** | OTP Verification | `POST /api/v1/auth/passenger/otp/verify` | `POST` | Public | Yes (`Idempotency-Key`) | Exchange OTP for JWT Access + Refresh Token |
| **PAX-004** | Home | `GET /api/v1/passenger/home-feed` | `GET` | Bearer/Public | No | Active ticket banner, popular corridors, announcements |
| **PAX-005** | Location Picker | `GET /api/v1/routes/stops/search` | `GET` | Public | No | Search bus stops / provinces / pickup points |
| **PAX-006** | Search Results | `GET /api/v1/trips/search` | `GET` | Public | No | Query trips by origin, destination, date, vehicle type |
| **PAX-007** | Trip Detail | `GET /api/v1/trips/{tripId}` | `GET` | Public | No | Retrieve trip metadata, stop timeline, policies, vehicle info |
| **PAX-008** | Pickup/Dropoff | `GET /api/v1/trips/{tripId}/stops` | `GET` | Public | No | Query selectable pickup & dropoff points for segment |
| **PAX-009** | Seat Map | `GET /api/v1/trips/{tripId}/seat-map` | `GET` | Public | No | Query 2D seat matrix and segment occupancy; `pickup_stop_id`, `dropoff_stop_id` select the segment (`BR-SEAT-001`) |
| **PAX-010** | Seat Hold | `POST /api/v1/trips/{tripId}/seats/hold` | `POST` | Bearer | Yes (`Idempotency-Key`) | Acquire 600s seat lock for a segment (`pickupStopId`, `dropoffStopId`, default whole route, `BR-STOP-003`) |
| **PAX-010** | Seat Release | `DELETE /api/v1/trips/{tripId}/seats/hold` | `DELETE` | Bearer | Yes | Explicitly release temporary hold before expiry |
| **PAX-011** | Passenger Info | `GET /api/v1/passenger/saved-travelers` | `GET` | Bearer | No | Fetch saved traveler profiles for fast form autofill |
| **PAX-012** | Checkout | `POST /api/v1/bookings/create` | `POST` | Bearer | Yes (`Idempotency-Key`) | Create formal Booking record in `PENDING_PAYMENT` state. Requires `trip_id`, `hold_id`, `seat_codes`; the server prices the order (OQ-020) |
| **PAX-013** | Payment Processing| `POST /api/v1/payments/initiate` | `POST` | Bearer | Yes (`Idempotency-Key`) | Generate Gateway URL (VNPAY/MoMo) or Dynamic VietQR |
| **PAX-013** | Payment Polling | `POST /api/v1/passenger/payments/{orderId}/verify-status` | `POST` | Bearer | No | Active resume polling & manual confirmation trigger ("Tôi đã chuyển tiền") |
| **PAX-014** | Payment Result | `GET /api/v1/payments/{paymentId}/status` | `GET` | Bearer | No | Poll payment authoritative state from PostgreSQL |
| **PAX-015** | Booking Success| `GET /api/v1/bookings/{bookingId}` | `GET` | Bearer | No | Fetch confirmed PNR details and ticket summaries |
| **PAX-016** | My Tickets | `GET /api/v1/passenger/tickets` | `GET` | Bearer | No | Query `tab=UPCOMING\|HISTORY\|CANCELLED` (`BR-MYTICKETS-004`) |
| **PAX-017** | Ticket QR | `GET /api/v1/tickets/{ticketId}` | `GET` | Bearer | No | Ticket with its static versioned `boarding_qr` (`boarding_qr: null` once boarded or absent, D104) |
| **PAX-017** | Reissue QR | `POST /api/v1/passenger/tickets/{ticketId}/qr/reissue` | `POST` | Bearer (owner) | Yes (`Idempotency-Key`) | New QR version; revokes the old QR and PIN; `409 BOARDING_STARTED` after departure (D104) |
| **PAX-017** | Group Boarding QR| `GET /api/v1/passenger/orders/{orderId}/group-qr` | `GET` | Bearer | No | Fetch aggregate Group Boarding QR for multi-seat bookings (REV-01) |
| **PAX-017** | Ticket Delegation | `POST /api/v1/passenger/tickets/{ticketId}/delegate` | `POST` | Bearer | Yes | Delegate ticket to companion with SMS share link & 6-digit offline PIN |
| **PAX-018** | Live Tracking | `GET /api/v1/trips/{tripId}/tracking` | `GET` | Bearer/Public | No | Fetch tracking snapshot (stale GPS warning & rest-stop status); WS `trip:{tripId}` |
| **PAX-019** | ETA Detail | `GET /api/v1/trips/{tripId}/eta` | `GET` | Bearer/Public | No | Fetch per-stop map-matched ETA predictions |
| **PAX-020** | Notifications | `GET /api/v1/passenger/notifications` | `GET` | Bearer | No | Paginated operational and marketing push notifications |
| **PAX-021** | Cancel / Refund | `POST /api/v1/bookings/{bookingId}/cancel` | `POST` | Bearer | Yes (`Idempotency-Key`) | Request booking cancellation and policy refund calculation |
| **PAX-021** | Cancel Ticket | `POST /api/v1/passenger/tickets/{ticketId}/cancel` | `POST` | Bearer | Yes (`Idempotency-Key`) | Cancel one ticket and open a `REFUND_REQUESTED` request; the price and departure come from the stored ticket (OQ-019) |
| **PAX-022** | Profile | `GET /api/v1/passenger/profile` | `GET` | Bearer | No | User profile details, loyalty points, preferences |
| **PAX-023** | Saved Contacts | `POST /api/v1/passenger/saved-travelers` | `POST` | Bearer | Yes | Create / update saved travelers |
| **PAX-024** | Replacement Notice| `GET /api/v1/trips/{tripId}/replacement-info` | `GET` | Bearer | No | Query updated vehicle specs and seat reassignment details |
| **PAX-025** | Trip Delay Notice| `GET /api/v1/trips/{tripId}/disruptions` | `GET` | Bearer | No | Query delay cause, updated departure ETA, alternatives |

---

## 2. Driver App Screen API & Telemetry Mapping

| Screen ID | Screen Name | Protocol / Endpoint | Method | Auth | Idempotency | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DRI-001** | Driver Login | `POST /api/v1/auth/driver/login` | `POST` | Public | Yes | Driver Staff credentials authentication & device binding |
| **DRI-002** | Today's Trips | `GET /api/v1/driver/trips/today` | `GET` | Bearer (Driver) | No | Query assigned trips, vehicles, and schedules for shift |
| **DRI-003** | Pre-start Detail | `GET /api/v1/driver/trips/{tripId}` | `GET` | Bearer (Driver) | No | Query route snapshot, passenger manifest summary, stops |
| **DRI-004** | Readiness Checklist | `POST /api/v1/driver/trips/{tripId}/readiness` | `POST` | Bearer (Driver) | Yes | Submit vehicle inspection & safety verification checklist |
| **DRI-005** | Start Trip | `POST /api/v1/driver/trips/{tripId}/start` | `POST` | Bearer (Driver) | Yes (`Idempotency-Key`) | Transition trip to `IN_TRANSIT`; activate GPS service |
| **DRI-006** | Active Cockpit | `MQTT: busgo/telemetry/{vehicleId}` | `PUB` | MQTT Token | Sequence | Publish high-frequency (3-5s) telemetry stream |
| **DRI-007** | Manifest | `GET /api/v1/driver/trips/{tripId}/manifest` | `GET` | Bearer (Driver) | No | Retrieve authoritative passenger list grouped by stops |
| **DRI-007** | Onboard Hail Passenger | `POST /api/v1/driver/trips/{tripId}/onboard-hail` | `POST` | Bearer (Driver) | Yes (`Idempotency-Key`) | Add on-the-road hail passenger to vacant seat & collect cash |
| **DRI-008** | Stop Detail | `POST /api/v1/driver/trips/{tripId}/stops/{stopId}/arrive` | `POST` | Bearer (Driver) | Yes | Confirm vehicle arrival at stop geofence |
| **DRI-009** | QR Scanner | Offline check against the manifest | N/A | None (manifest `boarding_check`) | Yes | Version and signature digest per ticket from `GET /driver/trips/{tripId}/manifest`; no secret on the tablet (D104) |
| **DRI-009** | Boarding Event | `POST /api/v1/driver/trips/{tripId}/boarding` | `POST` | Bearer (Driver) | Yes (`Idempotency-Key`) | Submit boarded ticket status (single or group QR) |
| **DRI-010** | Manual Boarding | `POST /api/v1/driver/trips/{tripId}/boarding/manual` | `POST` | Bearer (Driver) | Yes | Board passenger by PNR, phone lookup, or 6-digit offline PIN |
| **DRI-011** | Mark No-Show | `POST /api/v1/driver/trips/{tripId}/tickets/{ticketId}/no-show` | `POST` | Bearer (Driver) | Yes | Mark absent passenger after grace period expiry |
| **DRI-012** | COD Collection | `POST /api/v1/driver/trips/{tripId}/payments/cod-collect` | `POST` | Bearer (Driver) | Yes (`Idempotency-Key`) | Confirm cash received with change due settlement (Debt / Wallet) |
| **DRI-013** | Navigation | `GET /api/v1/routes/{routeId}/geometry` | `GET` | Bearer (Driver) | No | Fetch detailed road polyline for turn-by-turn guidance |
| **DRI-014** | GPS Health | `Local Android Sensor / Battery Status` | N/A | System | No | Monitor foreground service health & GPS accuracy. The server also answers `GET /api/v1/driver/system/gps-health` (Bearer, Driver) with the buffered offline count; the other fields are simulated until the device reports them |
| **DRI-015** | Sync Center | `POST /api/v1/driver/telemetry/batch-replay` | `POST` | Bearer (Driver) | Yes | Flush SQLite buffered offline telemetry & boarding events |
| **DRI-016** | Diagnostics | `GET /api/v1/driver/system/diagnostics-ping` | `GET` | Bearer (Driver) | No | Measure round-trip ping to API gateway and MQTT broker |
| **DRI-017** | End Trip | `POST /api/v1/driver/trips/{tripId}/end` | `POST` | Bearer (Driver) | Yes (`Idempotency-Key`) | Reconcile manifest, COD cash & hail fares, stop GPS |
| **DRI-018** | Driver Profile | `GET /api/v1/driver/profile` | `GET` | Bearer (Driver) | No | Fetch driver license status, shift metrics, ratings |
| **DRI-019** | Incident Report | `POST /api/v1/driver/trips/{tripId}/incidents` | `POST` | Bearer (Driver) | Yes | Submit emergency SOS, breakdown, or severe delay report |

---

## 3. Manager Portal Screen API Mapping

| Screen ID | Screen Name | Endpoint | Method | Auth | Idempotency | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MGR-001** | Staff Login | `POST /api/v1/auth/staff/login` | `POST` | Public | Yes | Staff email/password (+ `totp` for `FLEET_DIRECTOR`, `FINANCIAL_CONTROLLER`, `BR-MGR-AUTH-001`) token exchange |
| **MGR-002** | Dashboard | `GET /api/v1/ops/dashboard/kpis` | `GET` | Bearer (Staff) | No | Live operational KPIs (active trips, revenue, load factor) |
| **MGR-003** | Live Radar | `GET /api/v1/ops/fleet/live-positions` | `GET` | Bearer (Staff) | No | Query latest vehicle coordinates; WS room `ops:fleet` |
| **MGR-004** | Vehicle Live Detail| `GET /api/v1/ops/vehicles/{id}/telemetry-trail` | `GET` | Bearer (Staff) | No | Historical breadcrumbs, speed chart, CAN bus status |
| **MGR-005** | Vehicle List | `GET /api/v1/ops/vehicles` | `GET` | Bearer (Staff) | No | Paginated fleet inventory with filter by model/status |
| **MGR-006** | Vehicle Create/Edit| `POST / PUT /api/v1/ops/vehicles` | `POST/PUT` | Bearer (Staff) | Yes | Upsert vehicle, register plate, bind seat layout |
| **MGR-007** | Layout Builder | `POST / PUT /api/v1/ops/seat-layouts` | `POST/PUT` | Bearer (Staff) | Yes | Define 2D seat coordinates, decks, and seat codes |
| **MGR-008** | Route List | `GET /api/v1/ops/routes` | `GET` | Bearer (Staff) | No | Directory of corridors, intermediate stops, distance |
| **MGR-009** | Route Builder | `POST / PUT /api/v1/ops/routes` | `POST/PUT` | Bearer (Staff) | Yes | Define ordered stops, geofence polygons, segment matrix |
| **MGR-010** | Trip List | `GET /api/v1/ops/trips` | `GET` | Bearer (Staff) | No | Paginated trip schedules with status and date filters |
| **MGR-011** | Trip Create | `POST /api/v1/ops/trips` | `POST` | Bearer (Staff) | Yes (`Idempotency-Key`) | Schedule new trip; freeze snapshot of route & layout |
| **MGR-012** | Trip Detail | `GET /api/v1/ops/trips/{tripId}/master` | `GET` | Bearer (Staff) | No | Complete trip ledger: driver, vehicle, revenue, manifest |
| **MGR-013** | Seat Matrix | `GET /api/v1/ops/trips/{tripId}/seat-matrix` | `GET` | Bearer (Staff) | No | Seat-by-seat state (`AVAILABLE`, `HELD`, `HOTLINE_HOLD`, `BOOKED`, `BLOCKED`); the whole trip is one segment (`OQ-028`) |
| **MGR-013** | Seat Block | `POST /api/v1/ops/trips/{tripId}/seats/override-lock` | `POST` | Bearer (`FLEET_DIRECTOR`, `DISPATCHER`) | Yes (`Idempotency-Key`) | Block seats with a reason or open them (`BR-INVENTORY-003`) |
| **MGR-014** | Dispatch Board | `GET /api/v1/ops/dispatch/matrix` | `GET` | Bearer (Staff) | No | Daily timeline view of vehicles, drivers, and scheduled trips |
| **MGR-015** | Driver List | `GET /api/v1/ops/drivers` | `GET` | Bearer (Staff) | No | Driver roster, license expiry status, assignment history |
| **MGR-016** | Driver Detail | `GET /api/v1/ops/drivers/{driverId}/performance` | `GET` | Bearer (Staff) | No | Safety score, GPS uptime %, customer ratings, shift logs |
| **MGR-017** | Booking Search | `GET /api/v1/ops/bookings` | `GET` | Bearer (Staff) | No | Advanced search by PNR, customer phone, date range |
| **MGR-018** | Booking Detail | `GET /api/v1/ops/bookings/{bookingId}` | `GET` | Bearer (Staff) | No | Detailed booking financial record, tickets, audit trail |
| **MGR-019** | POS Search | `GET /api/v1/ops/pos/trips` | `GET` | Bearer (Staff) | No | Optimized fast counter query for available segments |
| **MGR-020** | POS Checkout | `POST /api/v1/ops/pos/orders` | `POST` | Bearer (Staff) | Yes (`Idempotency-Key`) | Direct POS counter ticket issuance with cash/card/bank |
| **MGR-020** | Hotline Seat Hold| `POST /api/v1/ops/pos/hotline-hold` | `POST` | Bearer (Staff) | Yes (`Idempotency-Key`) | Reserve seat via telephone with configurable hold TTL (REV-06) |
| **MGR-021** | Payments | `GET /api/v1/ops/payments` | `GET` | Bearer (Staff) | No | Payment reconciliation log, gateway references, webhook audits |
| **MGR-022** | Refund Center | `POST /api/v1/ops/refunds/{refundId}/process` | `POST` | Bearer (Staff) | Yes (`Idempotency-Key`) | Approve refund and trigger payment gateway refund API |
| **MGR-022** | Debt Receipt | `POST /api/v1/ops/debt-receipts/{receiptCode}/redeem` | `POST` | Bearer (`FLEET_DIRECTOR`, `CASHIER`, `FINANCIAL_CONTROLLER`) | Yes (`Idempotency-Key`) | Pay out a change debt receipt once (`BR-REFUND-003`) |
| **MGR-023** | Replace Vehicle| `POST /api/v1/ops/trips/{tripId}/replace-vehicle`| `POST` | Bearer (Staff) | Yes (`Idempotency-Key`) | Execute emergency bus replacement, seat remap & broadcast |
| **MGR-024** | Delay Mgmt | `POST /api/v1/ops/trips/{tripId}/delay` | `POST` | Bearer (Staff) | Yes | Declare operational delay, update ETA, push to passengers |
| **MGR-025** | Alerts Feed | `GET /api/v1/ops/alerts` | `GET` | Bearer (Staff) | No | Realtime incident feed (stale GPS, off-route, SOS) |
| **MGR-026** | Notifications | `POST /api/v1/ops/notifications/broadcast` | `POST` | Bearer (Staff) | Yes | Broadcast SMS / Push to trip or route passengers |
| **MGR-027** | Reports | `GET /api/v1/ops/reports/yield` | `GET` | Bearer (Staff) | No | Yield management, seat load factor, revenue per corridor |
| **MGR-028** | Audit Logs | `GET /api/v1/ops/audit-logs` | `GET` | Bearer (Staff) | No | Immutable system audit log with actor, IP, before/after diff |
| **MGR-029** | Roles & RBAC | `POST / PUT /api/v1/ops/rbac/roles` | `POST/PUT` | Bearer (Admin) | Yes | Manage staff roles, resource permissions, depot scoping |
| **MGR-030** | System Settings| `POST / PUT /api/v1/ops/settings` | `POST/PUT` | Bearer (Admin) | Yes | Configure lock TTLs, GPS sampling rates, gateway keys |

---

## 4. Integration Endpoints (not tied to a screen)

| Reference | Endpoint | Method | Auth | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| PAX-014 | `POST /api/v1/webhooks/vietqr/ipn` | `POST` | HMAC `X-Signature` | Bank transfer notification. Signature, exact PNR match and exact amount are enforced (OQ-018) |
| Ops | `GET /health` | `GET` | Public | Liveness and service status |
| Ops | `GET /api/v1/openapi.json` | `GET` | Public | Machine-readable API description |

---

## 5. Implementation Status of the Listed Endpoints (Phase A review)

Rows not named here are implemented at the path shown in sections 1 to 3. The catalog of what the server really serves is `source/server/core/apiCatalog.js` (also published as `/api/v1/openapi.json`) and a test checks that every entry is served.

**Decided as merged or narrowed (review FND-A08):**

| Screen | Spec endpoint | Decision |
| :--- | :--- | :--- |
| `PAX-013` | `POST /payments/initiate` | Merged into `POST /bookings/create`: creating the booking also creates its payment order (VietQR) and returns it under `payment`. A separate initiate call would only add a state in which a booking has no way to pay. |
| `PAX-021` | `POST /bookings/{id}/cancel` | Cancellation is per ticket (`POST /passenger/tickets/{id}/cancel`), see `PAX-021`. A booking-level call is deferred. |
| `DRI-006` | MQTT `busgo/telemetry/{vehicleId}` | Telemetry uses REST (`POST /driver/trips/{id}/telemetry`) until a broker exists (`OQ-002`). |

**Deferred (no data model or screen behind them in this phase):**

| Screen | Endpoint | Reason |
| :--- | :--- | :--- |
| `PAX-011`, `PAX-023` | `GET`, `POST /passenger/saved-travelers` | No traveler store. |
| `PAX-019` | `GET /trips/{id}/eta` | Needs stop coordinates; today only the ETA to the pickup point exists, inside `tracking`. |
| `DRI-013` | `GET /routes/{id}/geometry` | No route geometry data. |
| `MGR-004` | `GET /ops/vehicles/{id}/telemetry-trail` | No telemetry history store. |
| `MGR-006`, `MGR-007`, `MGR-009`, `MGR-011` | `POST`, `PUT` on vehicles, seat layouts, routes, trips | Admin CRUD screens; data is seeded. |
| `MGR-016` | `GET /ops/drivers/{id}/performance` | No performance data. |
| `MGR-019` | `GET /ops/pos/trips` | The counter uses the trip list. |
| `MGR-021` | `GET /ops/payments` | No payment ledger view. |
| `MGR-026` | `POST /ops/notifications/broadcast` | No outbound channel. |
| `MGR-029`, `MGR-030` | `POST`, `PUT` on roles and settings | Roles are fixed (see `MGR-029`); settings are configuration. |

**Aliases the server still answers for the apps (remove in Phase B once the Flutter clients use the paths above):** `/passenger/config`, `/passenger/auth/*`, `/passenger/stations`, `/passenger/trips`, `/passenger/trips/{id}/seat-map`, `/passenger/trips/{id}/hold-seats`, `/passenger/trips/{id}/radar`, `/passenger/bookings/create`, `/passenger/checkout/create-order`, `/passenger/tickets/{id}/qr`, `/stations`, `/trips`, `/driver/auth/login`, `.../board-qr`, `.../collect-cod`, `.../incident`, `/ops/auth/login`, `/ops/radar`, `/ops/fleet`, `/ops/fleet/vehicles`, `/ops/crew`, `/ops/crew/drivers`, `/ops/dispatch/board`, `/ops/pos/bookings`, `/ops/trips/{id}`, `/ops/trips/{id}/seat-inventory`, `/ops/trips/{id}/swap-vehicle`, `/ops/reports/executive`.

---

## 6. Client Contract (Phase B review)

The three Flutter API services (`passenger_api_service.dart`, `driver_api_service.dart`, `manager_api_service.dart`) must follow these rules; `test/mobile/api_client_contract.test.js` checks them.

- Use only the canonical paths of sections 1 to 3. Aliases (section 5) are kept for old callers and are not used by the services.
- Keep the session token from login (`verifyOtp`, `login`) and send `Authorization: Bearer <token>` on every later request. Send no identity: no `userId`, no `phone` for the wallet, no `x-driver-id`.
- Send an `Idempotency-Key` on every mutation the Idempotency column marks `Yes` (the public auth endpoints are exempt: the OTP cooldown, the attempt limit and the lockout already make them safe to repeat). Create one key per logical action and reuse it when retrying that action.
- Send no price: the server prices orders, COD and hail fares. Send the `holdId` when creating a booking.
- Every endpoint of a client's kind has a method in that client.

**Flutter screens are not connected yet (`OQ-029`).** The services exist and follow the contract, but no screen calls them, so no app can yet book, board or dispatch anything against the server.

