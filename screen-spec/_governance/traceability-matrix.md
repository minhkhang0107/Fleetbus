# BusGo End-to-End Traceability Matrix

**Document Version:** 1.0  
**Scope:** Complete cross-functional traceability from Business Requirements to Screens, Components, APIs, Realtime Events, and Test Verifications.

---

## 1. Traceability Pipeline Architecture

```text
Business Requirement (BR)
      ↓
Functional Requirement (FR) / Use Case (UC)
      ↓
Screen Specification (PAX / DRI / MGR / SH)
      ↓
Shared UI Component
      ↓
Backend REST API / MQTT Endpoint
      ↓
Domain Realtime Event
      ↓
Client Analytics Event
      ↓
Acceptance Criteria & Test Matrix
```

---

## 2. Master Traceability Matrix

| BR / FR ID | Use Case | Screen ID | Primary Component | Backend API / Protocol | Realtime Event | Analytics Event | Test ID |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BR-AUTH-001** | `UC-PAS-AUTH-001` | `PAX-002` | `PhoneLoginForm` | `POST /auth/passenger/otp/request` | N/A | `LOGIN_OTP_REQUESTED` | `TC-PAX-002-01` |
| **BR-AUTH-002** | `UC-PAS-AUTH-002` | `PAX-003` | `OTPInput` | `POST /auth/passenger/otp/verify` | N/A | `LOGIN_SUCCESS` | `TC-PAX-003-01` |
| **BR-DISC-001** | `UC-PAS-SEARCH-001`| `PAX-004` | `SearchCard` | `GET /routes/stops/search` | N/A | `HOME_VIEWED` | `TC-PAX-004-01` |
| **BR-DISC-002** | `UC-PAS-SEARCH-002`| `PAX-006` | `TripResultList` | `GET /trips/search` | N/A | `SEARCH_RESULTS_VIEWED` | `TC-PAX-006-01` |
| **BR-SEAT-001** | `UC-PAS-SEAT-001` | `PAX-009` | `SeatMap` | `GET /trips/{id}/seat-map` | `SEAT_HELD` | `SEAT_SELECTED` | `TC-PAX-009-01` |
| **BR-SEAT-002** | `UC-PAS-LOCK-001` | `PAX-010` | `CountdownTimer` | `POST /trips/{id}/seats/hold` | `SEAT_HELD` | `SEAT_HOLD_ACQUIRED` | `TC-PAX-010-01` |
| **BR-BOOK-001** | `UC-PAS-BOOK-001` | `PAX-012` | `FareSummary` | `POST /bookings/create` | `BOOKING_PENDING` | `CHECKOUT_VIEWED` | `TC-PAX-012-01` |
| **BR-PAY-001** | `UC-PAS-PAY-001` | `PAX-013` | `PaymentSelector` | `POST /payments/initiate` | `PAYMENT_PENDING`| `PAYMENT_INITIATED` | `TC-PAX-013-01` |
| **BR-PAY-002** | `UC-PAS-PAY-002` | `PAX-014` | `PaymentResultCard`| `GET /payments/{id}/status` | `PAYMENT_SUCCESS`| `PAYMENT_COMPLETED` | `TC-PAX-014-01` |
| **BR-PAY-003** | `UC-PAS-PAY-003` | `PAX-014` | `ActivePollingFallback` | `POST /api/v1/passenger/payments/{id}/verify-status` | `PAYMENT_SUCCESS` | `PAYMENT_MANUALLY_VERIFIED` | `TC-PAX-014-03` |
| **BR-TICK-001** | `UC-PAS-TICK-001` | `PAX-015` | `PNRSummaryCard` | `GET /bookings/{id}` | `TICKET_ISSUED` | `BOOKING_SUCCESS_VIEWED`| `TC-PAX-015-01` |
| **BR-TICK-002** | `UC-PAS-TICK-002` | `PAX-017` | `QRCodeView` | `GET /tickets/{id}` | N/A | `TICKET_QR_VIEWED` | `TC-PAX-017-01` |
| **BR-GRP-001** | `UC-PAS-TICK-003` | `PAX-017` / `PAX-016` | `GroupQRCodeView` | `GET /api/v1/passenger/orders/{id}/group-qr` | N/A | `GROUP_QR_VIEWED` | `TC-PAX-017-04` |
| **BR-DEL-001** | `UC-PAS-TICK-004` | `PAX-017` / `DRI-010` | `TicketShareModal` / `PINBoarding` | `POST /api/v1/passenger/tickets/{id}/delegate` | `TICKET_DELEGATED` | `TICKET_SHARED` | `TC-PAX-017-05` |
| **BR-GPS-001** | `UC-PAS-TRACK-001`| `PAX-018` | `LiveMapTracking` | `GET /trips/{id}/tracking` | `TRACKING_UPDATE`| `LIVE_TRACKING_VIEWED` | `TC-PAX-018-01` |
| **BR-TRACK-004**| `UC-PAS-TRACK-002`| `PAX-018` | `StaleWarningBanner` / `RestStopHUD` | `GET /trips/{id}/tracking` | `TRACKING_STALE` | `STALE_GPS_DISPLAYED` | `TC-PAX-018-03` |
| **BR-ETA-001** | `UC-PAS-ETA-001` | `PAX-019` | `ETABadge` | `GET /trips/{id}/eta` | `ETA_UPDATED` | `ETA_DETAIL_VIEWED` | `TC-PAX-019-01` |
| **BR-CANCEL-001**| `UC-PAS-CAN-001` | `PAX-021` | `RefundPolicyBox` | `POST /bookings/{id}/cancel` | `REFUND_REQUESTED`| `BOOKING_CANCEL_REQUESTED`| `TC-PAX-021-01` |
| **BR-DRI-001** | `UC-DRI-AUTH-001` | `DRI-001` | `DriverLoginForm` | `POST /auth/driver/login` | N/A | `DRIVER_LOGIN_SUBMITTED`| `TC-DRI-001-01` |
| **BR-DRI-002** | `UC-DRI-TRIP-001` | `DRI-002` | `ShiftTripCard` | `GET /driver/trips/today` | N/A | `DRIVER_SHIFT_STARTED` | `TC-DRI-002-01` |
| **BR-DRI-003** | `UC-DRI-TRIP-002` | `DRI-004` | `ReadinessList` | `POST /driver/trips/{id}/readiness`| N/A | `READINESS_SUBMITTED` | `TC-DRI-004-01` |
| **BR-DRI-004** | `UC-DRI-TRIP-003` | `DRI-005` | `DriverActionPill`| `POST /driver/trips/{id}/start` | `TRIP_STARTED` | `TRIP_STARTED` | `TC-DRI-005-01` |
| **BR-TEL-001** | `UC-DRI-TEL-001` | `DRI-006` | `CockpitTelemetry`| `MQTT busgo/telemetry/{id}` | `TELEMETRY_RECORD`| `TELEMETRY_INGESTED` | `TC-DRI-006-01` |
| **BR-MAN-001** | `UC-DRI-MAN-001` | `DRI-007` | `ManifestTable` | `GET /driver/trips/{id}/manifest`| `MANIFEST_UPDATED`| `MANIFEST_VIEWED` | `TC-DRI-007-01` |
| **BR-HAIL-001** | `UC-DRI-HAIL-001` | `DRI-007` | `HailPassengerModal`| `POST /api/v1/driver/trips/{id}/onboard-hail` | `PASSENGER_BOARDED` | `HAIL_PASSENGER_ONBOARDED` | `TC-DRI-007-02` |
| **BR-SCAN-001** | `UC-DRI-SCAN-001` | `DRI-009` | `QRScannerView` | `Local Cryptographic Verification`| `PASSENGER_BOARDED`| `TICKET_SCANNED_OFFLINE`| `TC-DRI-009-01` |
| **BR-QR-002** | `UC-DRI-SCAN-002` | `DRI-009` | `DualQREngine` | `Static versioned QR / Group QR (D104)` | `PASSENGER_BOARDED` | `GROUP_QR_SCANNED` | `TC-DRI-009-02` |
| **BR-MAN-002** | `UC-DRI-MAN-002` | `DRI-010` | `OfflinePINBoardingForm` | `POST /api/v1/driver/trips/{id}/boarding/manual` | `PASSENGER_BOARDED` | `PIN_BOARDED` | `TC-DRI-010-02` |
| **BR-COD-001** | `UC-DRI-COD-001` | `DRI-012` | `CODReceiptCard` | `POST /api/v1/driver/trips/{id}/payments/cod`| `COD_COLLECTED`| `COD_COLLECTED` | `TC-DRI-012-01` |
| **BR-COD-002** | `UC-DRI-COD-002` | `DRI-012` | `ChangeSettlementModal` | `POST /api/v1/driver/trips/{id}/payments/cod-collect` | `COD_DEBT_ISSUED` | `COD_CHANGE_SETTLED` | `TC-DRI-012-02` |
| **BR-SYNC-001** | `UC-DRI-SYNC-001` | `DRI-015` | `OutboxQueueList` | `POST /driver/telemetry/batch-replay`| N/A | `BOARDING_SYNC_FLUSHED`| `TC-DRI-015-01` |
| **BR-DRI-005** | `UC-DRI-TRIP-004` | `DRI-017` | `EndTripReport` | `POST /driver/trips/{id}/end` | `TRIP_COMPLETED` | `TRIP_ENDED` | `TC-DRI-017-01` |
| **BR-OPS-001** | `UC-MGR-DASH-001` | `MGR-002` | `OperationsKPI` | `GET /ops/dashboard/kpis` | N/A | `OPS_DASHBOARD_VIEWED` | `TC-MGR-002-01` |
| **BR-RADAR-001** | `UC-MGR-RADAR-001`| `MGR-003` | `FleetMapDeck` | `GET /ops/fleet/live-positions` | `TRACKING_UPDATE`| `RADAR_VIEWED` | `TC-MGR-003-01` |
| **BR-FLEET-001** | `UC-MGR-FLEET-001`| `MGR-007` | `LayoutGridEditor`| `POST /ops/seat-layouts` | N/A | `LAYOUT_SAVED` | `TC-MGR-007-01` |
| **BR-DISP-001** | `UC-MGR-DISP-001` | `MGR-014` | `GanttDispatch` | `GET /ops/dispatch/matrix` | `TRIP_DISPATCHED`| `DISPATCH_ASSIGNED` | `TC-MGR-014-01` |
| **BR-POS-001** | `UC-MGR-POS-001` | `MGR-020` | `POSSeatMatrix` | `POST /ops/pos/orders` | `TICKET_ISSUED` | `POS_ORDER_COMPLETED` | `TC-MGR-020-01` |
| **BR-POS-003** | `UC-MGR-POS-002` | `MGR-020` | `HotlineHoldModal` | `POST /api/v1/ops/pos/hotline-hold` | `SEAT_HELD_HOTLINE` | `HOTLINE_HOLD_CREATED` | `TC-MGR-020-02` |
| **BR-REP-001** | `UC-MGR-REP-001` | `MGR-023` | `RemapSeatWizard` | `POST /ops/trips/{id}/replace-vehicle`| `VEHICLE_REPLACED`| `VEHICLE_REPLACEMENT_DONE`| `TC-MGR-023-01` |
| **BR-REF-001** | `UC-MGR-REF-001` | `MGR-022` | `RefundApproval` | `POST /ops/refunds/{id}/process` | `PAYMENT_REFUNDED`| `REFUND_APPROVED` | `TC-MGR-022-01` |
| **BR-AUD-001** | `UC-MGR-AUD-001` | `MGR-028` | `AuditTimeline` | `GET /ops/audit-logs` | N/A | `AUDIT_SEARCHED` | `TC-MGR-028-01` |

---

## 3. Server Verification Matrix (Phase A review)

Each rule below is enforced by the server and proved by an automated test (`npm test`, files `test/server/spec_conformance_*.test.js` unless stated). Test names are `TC-SPEC-<finding>`; the findings are listed in `docs/review/phase-A-findings.md`.

| Rule | Screen | Endpoint | Code | Automated test |
| :--- | :--- | :--- | :--- | :--- |
| Server prices the order; client prices ignored (`BR-CHECKOUT-003`, `BR-PAY-006`) | `PAX-012` | `POST /bookings/create` | `routes/passengerRoutes.js`, `modules/checkout.js` | `TC-SPEC-A13` |
| Booking needs a live hold of the same user; hold becomes a payment lock (`BR-PAY-006`) | `PAX-010`, `PAX-012` | `POST /bookings/create` | `modules/seatMap.js` (`validateHold`, `extendHold`) | `TC-SPEC-A16`, `A16b` |
| One active hold per user and trip, no extension by repeating | `PAX-010` | `POST /trips/{id}/seats/hold` | `modules/seatMap.js` | `TC-SPEC-A31`, `A31b` |
| "Tôi đã chuyển tiền" never settles by itself (`BR-PAY-004`) | `PAX-013` | `POST /passenger/payments/{id}/verify-status` | `modules/payment.js` | `TC-SPEC-A15`, `TC-PAY-05`, `TC-SRV-06` |
| Webhook: signature, exact PNR, exact amount, late money (`OQ-018`, `OQ-008`) | `PAX-014` | `POST /webhooks/vietqr/ipn` | `routes/webhookRoutes.js`, `modules/payment.js` | `TC-SPEC-A14`, `A14b` |
| Wallet by exact phone, ownership of tickets (`BR-MYTICKETS-003`) | `PAX-016`, `PAX-017` | `GET /passenger/tickets`, `GET /tickets/{id}` | `modules/payment.js`, `routes/passengerRoutes.js` | `TC-SPEC-A29`, `A30` |
| Refund tiers and one-way cancel (`OQ-019`) | `PAX-021` | `POST /passenger/tickets/{id}/cancel` | `core/formatters.js`, `modules/payment.js` | `TC-SPEC-A18`, `A18b`, `TC-CORE-07` |
| Refund approved exactly once (`OQ-019`) | `MGR-022` | `POST /ops/refunds/{id}/process` | `modules/managerService.js` | `TC-SPEC-A48`, `TC-MGR-07` |
| QR signature verified, ticket matched in its trip (`OQ-021`) | `DRI-009` | `POST /driver/trips/{id}/boarding` | `core/cryptoEngine.js`, `modules/driverService.js` | `TC-SPEC-A24`, `A36`, `A37`, `TC-CORE-04` |
| Driver sees only masked phones (`OQ-007`) | `DRI-007` | `GET /driver/trips/{id}/manifest` | `modules/driverService.js` | `TC-SPEC-A38` |
| Driver sees only assigned trips | `DRI-002` | `GET /driver/trips/today` | `modules/driverService.js`, `routes/driverRoutes.js` | `TC-SPEC-A42`, `A01c` |
| Trip lifecycle and telemetry rules (`OQ-023`) | `DRI-004`, `DRI-005`, `DRI-006` | `.../readiness`, `.../start`, `.../telemetry` | `modules/driverService.js` | `TC-SPEC-A41a`, `A41b` |
| COD once, server fare, change methods (`OQ-024`) | `DRI-012` | `POST .../payments/cod-collect` | `modules/driverService.js` | `TC-SPEC-A39` |
| Hail passenger: server fare, free seat (`OQ-024`, `OQ-026`) | `DRI-007` | `POST .../onboard-hail` | `modules/driverService.js` | `TC-SPEC-A40` |
| No-show grace period and state (`OQ-028`) | `DRI-011` | `POST .../tickets/{id}/no-show` | `modules/driverService.js` | `TC-SPEC-A43` |
| Ordered, duplicate-safe replay | `DRI-015` | `POST /driver/telemetry/batch-replay` | `modules/driverService.js` | `TC-SPEC-A44` |
| End of trip computed by the server, once | `DRI-017` | `POST .../end` | `modules/driverService.js` | `TC-SPEC-A41c` |
| Driver profile of the caller | `DRI-018` | `GET /driver/profile` | `modules/driverService.js` | `TC-SPEC-A09` |
| One inventory for counter, hotline, hail (`OQ-026`) | `MGR-020`, `DRI-007` | `POST /ops/pos/orders`, `POST /ops/pos/hotline-hold` | `modules/managerService.js`, `modules/seatMap.js` | `TC-SPEC-A45`, `A45b`, `A46`, `A46b`, `A46c`, `A40` |
| Vehicle replacement preconditions (`OQ-025`) | `MGR-023` | `POST /ops/trips/{id}/replace-vehicle` | `modules/managerService.js` | `TC-SPEC-A47` |
| Dashboard and report figures computed from data | `MGR-002`, `MGR-027` | `GET /ops/dashboard/kpis`, `GET /ops/reports/yield` | `modules/managerService.js` | `TC-SPEC-A49`, `A49b` |
| Alerts and audit log are separate; audit has actor, IP, before and after | `MGR-025`, `MGR-028` | `GET /ops/alerts`, `GET /ops/audit-logs` | `routes/managerRoutes.js`, `modules/managerService.js` | `TC-SPEC-A05a`, `A05b` |
| Booking found by PNR only | `MGR-018` | `GET /ops/bookings/{pnr}` | `routes/managerRoutes.js` | `TC-SPEC-A11` |
| Trip tracking reports no signal instead of an invented bus (`REV-07`) | `PAX-018` | `GET /trips/{id}/tracking` | `modules/tracking.js` | `TC-SPEC-A32` |
| Event bridge never falls back to another trip; cancel frees the seat count | cross-app | event bridge | `core/fleetBusEventBridge.js` | `TC-SPEC-A50`, `A50b` |
| Bearer token per endpoint kind, role matrix, ownership (`OQ-022`) | all | all non-public | `core/gateway.js`, `core/tokens.js` | `TC-SPEC-A01a`, `A01b`, `A01d`, `A30` |
| Idempotency-Key on mutations | all | POSTs marked `Yes` | `core/gateway.js`, `apiServer.js` | `TC-SPEC-A02` |
| Login lockout, hashed credentials, 403 for expired license | `MGR-001`, `DRI-001` | login endpoints | `core/passwords.js`, services | `TC-SPEC-A51`, `A51b` |
| OTP login works over HTTP | `PAX-002`, `PAX-003` | OTP endpoints | `routes/passengerRoutes.js` | `TC-SPEC-A35` |
| Unknown paths answer 404; OpenAPI lists the real API | all | all | `core/apiCatalog.js`, routes | `TC-SPEC-A04`, `A07`, `A07b`, `A10` |

---

## 4. Cross-App Flow Verification Matrix (Phase C review)

Each flow is played over HTTP with real logins in `test/flows/flow_conformance.test.js`. Test names are `TC-FLOW-C<nn>`; the findings (`FND-C<nn>`) are in `docs/review/phase-C-findings.md`.

| Flow step | Screens | Rule | Code | Automated test |
| :--- | :--- | :--- | :--- | :--- |
| Dispatcher sees held, hotline-held, sold and blocked seats; a repeated bank notice changes nothing | `PAX-010`, `PAX-013`, `MGR-013` | `BR-INVENTORY-002` | `modules/seatMap.js` (`getSeatMatrix`), `modules/managerService.js` | `TC-FLOW-C01`, `C02` |
| Block and open seats for a technical reason | `MGR-013`, `PAX-009` | `BR-INVENTORY-003` | `modules/seatMap.js` (`setSeatBlock`), `routes/managerRoutes.js` | `TC-FLOW-C03` |
| Boarded ticket stays under "Sắp đi" until the trip ends; used tickets open without a QR | `DRI-009`, `PAX-016`, `PAX-017` | `BR-MYTICKETS-004`, `BR-TICKET-007` | `modules/payment.js`, `core/fleetBusEventBridge.js` | `TC-FLOW-C04` |
| No-show reaches the passenger and the manager | `DRI-011`, `PAX-016`, `MGR-012` | `BR-NOSHOW-003` | `core/fleetBusEventBridge.js` | `TC-FLOW-C05` |
| Debt receipts capped per trip, redeemed once by the cashier | `DRI-012`, `MGR-022` | `BR-COD-005`, `BR-COD-006`, `BR-REFUND-003` | `modules/driverService.js`, `routes/managerRoutes.js` | `TC-FLOW-C06`, `C07` |
| A hailed seat is sold in every channel | `DRI-007`, `MGR-013`, `MGR-017` | `OQ-014` | `modules/driverService.js`, `core/fleetBusEventBridge.js` | `TC-FLOW-C08` |
| Hotline hold: limit per phone and release at expiry | `MGR-020`, `MGR-013`, `PAX-009` | `BR-POS-006` | `modules/managerService.js` | `TC-FLOW-C09` |
| A ping reaches the passenger and the manager radar; stale and offline | `DRI-006`, `PAX-018`, `MGR-003` | `BR-TRACK-005`, `BR-RADAR-001` | `core/fleetBusEventBridge.js`, `modules/tracking.js`, `modules/managerService.js` | `TC-FLOW-C10`, `C11` |
| Vehicle replacement moves the trip to the new driver; ineligible driver refused | `MGR-023`, `PAX-024`, `DRI-002` | `BR-REPLACE-003` | `modules/managerService.js`, `modules/driverService.js` | `TC-FLOW-C12`, `C13` |
| Delay over 30 minutes frees the cancellation | `MGR-024`, `PAX-025`, `PAX-021` | `BR-DELAY-002`, `BR-CANCEL-001` | `modules/payment.js` | `TC-FLOW-C14`, `C15` |
| Starting a trip puts the manager trip and vehicle in transit | `DRI-005`, `MGR-014` | `BR-START-002` | `core/fleetBusEventBridge.js` | `TC-FLOW-C16` |
| Seats are sold, held and released by segment; routes, holds, hotline, counter, hail | `PAX-008`, `PAX-009`, `PAX-010`, `MGR-020`, `DRI-007` | `BR-SEAT-001`, `BR-STOP-003`, `BR-POS-007`, `BR-HAIL-003` | `modules/seatMap.js`, `core/fleetBusEventBridge.js`, `modules/managerService.js`, `modules/driverService.js` | `TC-SEG-01` to `TC-SEG-05`, `TC-SEG-07` |
| A no-show frees the seat from the stop the bus has reached | `DRI-011`, `DRI-008` | `BR-NOSHOW-003` | `core/fleetBusEventBridge.js`, `modules/seatMap.js` | `TC-SEG-06` |
| Staff second factor (TOTP) | `MGR-001` | `BR-MGR-AUTH-001` | `core/totp.js`, `modules/managerService.js` | `TC-TOTP-01` to `TC-TOTP-06` |
| Rest-stop status from the pings | `PAX-018` | `BR-TRACK-004`, `BR-TRACK-005` | `core/restStops.js`, `modules/tracking.js` | `TC-REST-01`, `TC-REST-02` |

---

## 5. Screens Added to the Master Matrix (Phase D review)

Section 2 traced 48 of the 79 screens. These 31 had no row. The last column lists the automated tests whose title names the screen; "none: spec only" means no test exercises it, which is expected for screens whose endpoint is deferred or that are local, and is **not** a claim that it works. Screens with a server endpoint are also covered in sections 3 and 4; the Flutter screens themselves have no automated evidence (`OQ-029`).

| Screen | Name | Endpoint | Business rules | Automated tests |
| :--- | :--- | :--- | :--- | :--- |
| `PAX-001` | Splash / App Initialization | `GET /api/v1/app/config` (served) | `BR-AUTH-001`, `BR-SPLASH-001`, `BR-SPLASH-002` | none: spec only |
| `PAX-005` | Location / Stop Picker | `GET /api/v1/routes/stops/search` (served) | `BR-DISC-001`, `BR-LOC-001`, `BR-LOC-002` | none: spec only |
| `PAX-007` | Trip Detail | `GET /api/v1/trips/{tripId}` (served) | `BR-DISC-002`, `BR-TRIP-001`, `BR-TRIP-002` | `TC-SEARCH-05` |
| `PAX-008` | Pickup & Dropoff Selection | `GET /api/v1/trips/{tripId}/stops` (served) | `BR-DISC-002`, `BR-SEAT-001`, `BR-STOP-001` | `TC-SPEC-A07` |
| `PAX-011` | Passenger Information | `GET /api/v1/passenger/saved-travelers` (deferred, `api-screen-map` section 5) | `BR-BOOK-001`, `BR-INFO-001`, `BR-INFO-002` | `TC-CHECKOUT-01` |
| `PAX-020` | Notification Center | `GET /api/v1/passenger/notifications` (served) | `BR-NOTIF-001` | `TC-TRACK-02` |
| `PAX-022` | User Profile & Settings | `GET /api/v1/passenger/profile` (served) | `BR-AUTH-001`, `BR-PROF-001` | `TC-SPEC-A07` |
| `PAX-023` | Saved Stops & Frequent Travelers | `POST /api/v1/passenger/saved-travelers` (deferred, `api-screen-map` section 5) | - | none: spec only |
| `DRI-008` | Stop Detail & Boarding Summary | `POST /api/v1/driver/trips/{tripId}/stops/{stopId}/arrive` (served) | `BR-DRI-004` | `TC-SPEC-A07` |
| `DRI-013` | Turn-by-Turn Route Navigation | `GET /api/v1/routes/{routeId}/geometry` (deferred, `api-screen-map` section 5) | `BR-NAV-001`, `BR-TEL-001` | none: spec only |
| `DRI-014` | GPS & Battery Health Monitor | `Local Android Sensor / Battery Status` (local) | `BR-TEL-001` | none: spec only |
| `DRI-016` | Telemetry & MQTT Diagnostics | `GET /api/v1/driver/system/diagnostics-ping` (served) | - | none: spec only |
| `DRI-019` | Incident & Delay Quick Report | `POST /api/v1/driver/trips/{tripId}/incidents` (served) | `BR-DELAY-001`, `BR-INCIDENT-001` | `TC-DRV-06` |
| `MGR-004` | Vehicle Live Telemetry Inspector | `GET /api/v1/ops/vehicles/{id}/telemetry-trail` (deferred, `api-screen-map` section 5) | `BR-TEL-001` | `TC-MGR-03` |
| `MGR-005` | Vehicle Fleet Directory | `GET /api/v1/ops/vehicles` (served) | `BR-FLEET-001` | `TC-MGR-08` |
| `MGR-006` | Vehicle Create & Edit | `POST / PUT /api/v1/ops/vehicles` (deferred, `api-screen-map` section 5) | `BR-FLEET-001`, `BR-VEH-001` | none: spec only |
| `MGR-008` | Route & Corridor Directory | `GET /api/v1/ops/routes` (served) | `BR-ROUTE-001` | none: spec only |
| `MGR-009` | Route & Geofence Stop Builder | `POST / PUT /api/v1/ops/routes` (deferred, `api-screen-map` section 5) | `BR-GEO-001`, `BR-GEO-002`, `BR-ROUTE-001` | none: spec only |
| `MGR-010` | Trip Schedule Directory | `GET /api/v1/ops/trips` (served) | `BR-TRIP-001` | none: spec only |
| `MGR-011` | Trip Dispatch & Schedule Generator | `POST /api/v1/ops/trips` (deferred, `api-screen-map` section 5) | `BR-TRIP-001` | none: spec only |
| `MGR-015` | Driver Roster Directory | `GET /api/v1/ops/drivers` (served) | `BR-DRI-001` | none: spec only |
| `MGR-016` | Driver Performance & Safety Detail | `GET /api/v1/ops/drivers/{driverId}/performance` (deferred, `api-screen-map` section 5) | - | none: spec only |
| `MGR-019` | POS Counter & Hotline Search | `GET /api/v1/ops/pos/trips` (deferred, `api-screen-map` section 5) | `BR-POS-001` | `TC-MGR-05` |
| `MGR-021` | Payment Transactions & Webhooks | `GET /api/v1/ops/payments` (deferred, `api-screen-map` section 5) | `BR-PAY-002` | `TC-MGR-07` |
| `MGR-026` | Notification Campaign Engine | `POST /api/v1/ops/notifications/broadcast` (deferred, `api-screen-map` section 5) | - | `TC-MGR-09` |
| `MGR-029` | RBAC Roles & Permissions Matrix | `POST / PUT /api/v1/ops/rbac/roles` (deferred, `api-screen-map` section 5) | `BR-AUTH-003` | `TC-MGR-01`, `TC-SPEC-A01` |
| `MGR-030` | System Global Configuration | `POST / PUT /api/v1/ops/settings` (deferred, `api-screen-map` section 5) | `BR-SYS-001` | none: spec only |
| `SH-002` | Permission Denied (403 Forbidden) | none (local screen) | `BR-AUTH-003`, `BR-PERM-001` | none: spec only |
| `SH-003` | Network Offline & Server Error | none (local screen) | `BR-CONN-001`, `BR-NET-001` | none: spec only |
| `SH-004` | System Maintenance Notice | none (local screen) | `BR-MAINT-001`, `BR-SYS-001` | none: spec only |
| `SH-005` | Force App Version Upgrade | none (local screen) | `BR-SYS-001`, `BR-UPGRADE-001` | none: spec only |

---

## 6. Business Rules Not Named in Sections 2 to 5 (Phase D review)

Every rule of the master matrix exists in a screen file and every spec test id it cites exists (checked by script). The reverse was not true: these rules are written in a screen file but no row cites them. They are listed so none is orphaned. "by screen tests only" means no automated test names the rule; the screen's own test cases (`TC-<screen>-nn`) are the only trace, and for Flutter screens they have not been run (`OQ-029`).

| Rule | Screen | Summary | Named in an automated test |
| :--- | :--- | :--- | :--- |
| `BR-READINESS-001` | `DRI-004` | All 6 checklist items must be checked and valid odometer reading entered before the Continue CTA unlocks. | by screen tests only |
| `BR-START-001` | `DRI-005` | Starting a trip requires Android Foreground Service notification with permission `ACCESS_FINE_LOCATION` and `A | by screen tests only |
| `BR-COCKPIT-003` | `DRI-006` | The server accepts a telemetry ping only for a trip in `IN_TRANSIT` (`400 TRIP_NOT_ACTIVE`) and only with a la | by screen tests only |
| `BR-COCKPIT-001` | `DRI-006` | If cellular network is lost, the native Android service automatically diverts MQTT payloads into a local SQLit | by screen tests only |
| `BR-COCKPIT-002` | `DRI-006` | When network returns, `DRI-015-offline-sync-center.md` flushes buffered telemetry in batched HTTP chunks (`POS | by screen tests only |
| `BR-HAIL-002` | `DRI-007` | ** The hail fare is the trip fare set by the server; `fare_amount_vnd` sent by the client is ignored. The trip | by screen tests only |
| `BR-MANUAL-001` | `DRI-010` | Manual Override Audit | by screen tests only |
| `BR-MANUAL-002` | `DRI-010` | Brute-force Prevention | by screen tests only |
| `BR-NOSHOW-002` | `DRI-011` | The grace period is 10 minutes after the scheduled departure (`400 NO_SHOW_TOO_EARLY` before it). `passenger_r | by screen tests only |
| `BR-NOSHOW-001` | `DRI-011` | Driver cannot mark No-Show prior to scheduled departure time $+10\text{ minutes}$ unless passenger explicitly  | by screen tests only |
| `BR-COD-003` | `DRI-012` | The fare is the COD amount stored on the ticket; the client cannot change it. `fare_amount_vnd`, when sent, mu | by screen tests only |
| `BR-SYNC-002` | `DRI-015` | `POST /driver/telemetry/batch-replay` applies the pings oldest first (a ping without `timestamp` keeps its pla | by screen tests only |
| `BR-END-004` | `DRI-017` | All totals in the end report are computed by the server from the manifest, the COD collections, the hail fares | by screen tests only |
| `BR-END-001` | `DRI-017` | If local SQLite queue (`DRI-015`) contains unsynced events, the app displays warning: *"Đang có 2 sự kiện chưa | by screen tests only |
| `BR-END-002` | `DRI-017` | Ending a trip immediately halts the Android Foreground GPS tracking notification and frees native location pro | by screen tests only |
| `BR-END-003` | `DRI-017` | Total cash to handover is computed as: | by screen tests only |
| `BR-INVENTORY-001` | `MGR-013` | An authorized operator can manually toggle a seat's status to `BLOCKED` with a mandatory reason note, which im | yes |
| `BR-POS-002` | `MGR-020` | Counter ticket issuance directly issues tickets with status `CONFIRMED` and payment status `SUCCESS` in a sing | by screen tests only |
| `BR-POS-004` | `MGR-020` | Counter and hotline sales use the same seat inventory as the passenger app. A sale needs at least one seat (`4 | by screen tests only |
| `BR-POS-005` | `MGR-020` | A hotline hold locks its seats in the shared inventory until `hold_until`, so neither the app nor another coun | by screen tests only |
| `BR-REFUND-002` | `MGR-022` | Approving a refund calls the payment gateway refund endpoint with an `Idempotency-Key` and records the operato | by screen tests only |
| `BR-REPLACE-002` | `MGR-023` | The replacement must be an existing vehicle of the fleet (`404 VEHICLE_NOT_FOUND`) with status `STANDBY` (`409 | by screen tests only |
| `BR-REPLACE-001` | `MGR-023` | If the replacement bus has lower capacity than total booked passengers (e.g. 40-seat replaced by 34-seat), the | by screen tests only |
| `BR-SPLASH-003` | `PAX-001` | Any pending deep link payload must be sanitized and validated before triggering navigation. | by screen tests only |
| `BR-LOGIN-001` | `PAX-002` | Input phone must normalize leading `0` to international E.164 format `+84...` before API dispatch. | by screen tests only |
| `BR-LOGIN-002` | `PAX-002` | Submit button remains `DISABLED` until user enters exactly 10 valid Vietnamese digits. | by screen tests only |
| `BR-LOGIN-003` | `PAX-002` | Client prevents re-submitting while request is in-flight (sets loading spinner). | by screen tests only |
| `BR-OTP-001` | `PAX-003` | Client automatically triggers API call as soon as the 6th digit is typed or pasted. | by screen tests only |
| `BR-OTP-002` | `PAX-003` | If SMS auto-read succeeds, the 6 boxes fill with animation and submit immediately. | by screen tests only |
| `BR-OTP-003` | `PAX-003` | On HTTP 400 (`INVALID_OTP`), shake the 6 pin boxes with haptic error feedback and clear inputs. | by screen tests only |
| `BR-HOME-001` | `PAX-004` | If Origin and Destination are identical, the "Tìm chuyến xe" CTA is disabled with helper text *"Điểm đi và điể | by screen tests only |
| `BR-HOME-002` | `PAX-004` | Search date defaults to current local date (`Asia/Ho_Chi_Minh`), never allowing past dates. | by screen tests only |
| `BR-HOME-003` | `PAX-004` | Active Ticket card updates ETA every 60 seconds via lightweight polling if screen is active. | by screen tests only |
| `BR-SEARCH-001` | `PAX-006` | Only trips with `trip_status IN ('SCHEDULED', 'DISPATCHED')` and `available_seats_count > 0` are eligible for  | by screen tests only |
| `BR-SEARCH-002` | `PAX-006` | Trips departing within $< 15\text{ minutes}$ from now are locked from new online booking and marked *"Đóng đặt | by screen tests only |
| `BR-SEARCH-003` | `PAX-006` | Pull-to-refresh invalidates client cache and queries fresh availability from PostgreSQL. | by screen tests only |
| `BR-STOP-002` | `PAX-008` | Any stop surcharge (e.g. transfer van $+30,000\text{ VND}$) is dynamically added to the segment base fare and  | by screen tests only |
| `BR-SEAT-004` | `PAX-009` | If the network disconnects, the WebSocket connection pill shows `RECONNECTING`. Selections are frozen until re | by screen tests only |
| `BR-SEAT-003` | `PAX-009` | Maximum 5 seats can be selected per transaction; a 6th seat shows a toast | by screen tests only |
| `BR-HOLD-001` | `PAX-010` | Redis seat lock TTL is exactly $600\text{ seconds}$ ($10\text{ minutes}$). | by screen tests only |
| `BR-HOLD-002` | `PAX-010` | Countdown timer is calibrated against server `locked_until` UTC timestamp to prevent client device clock tampe | by screen tests only |
| `BR-HOLD-003` | `PAX-010` | When the timer reaches $120\text{s}$ ($2\text{ minutes}$ remaining), the banner pulses amber with an alert sou | by screen tests only |
| `BR-HOLD-004` | `PAX-010` | On timer expiration, the client MUST immediately invalidate `hold_token` and block checkout submission. | by screen tests only |
| `BR-INFO-003` | `PAX-011` | If booking for multiple seats, individual names can be provided for identity verification on boarding. | by screen tests only |
| `BR-CHECKOUT-001` | `PAX-012` | If payment method is `COD` (Cash on Delivery), maximum booking value is capped at $1,000,000\text{ VND}$ (max  | by screen tests only |
| `BR-CHECKOUT-002` | `PAX-012` | Applying a valid voucher code dynamically re-computes `total_amount_vnd` and displays the discount line in eme | by screen tests only |
| `BR-PAY-005` | `PAX-013` | Tapping "Hủy thanh toán" displays confirmation dialog: *"Bạn có chắc chắn muốn hủy giao dịch thanh toán này?"* | by screen tests only |
| `BR-RESULT-001` | `PAX-014` | If payment status is `SUCCESS`, automatically advance to `PAX-015-booking-success.md` within $1.5\text{ second | by screen tests only |
| `BR-RESULT-002` | `PAX-014` | If user taps "Nhận hoàn tiền 100%", client triggers `POST /api/v1/payments/{id}/refund-request` and displays c | by screen tests only |
| `BR-SUCCESS-001` | `PAX-015` | Navigating back from `PAX-015` MUST clear the entire booking flow stack from memory so pressing back cannot re | by screen tests only |
| `BR-SUCCESS-002` | `PAX-015` | System triggers automatic SMS / Zalo Notification confirmation with PNR and web link within $5\text{ seconds}$ | by screen tests only |
| `BR-MYTICKETS-001` | `PAX-016` | Tickets with `trip_status IN ('SCHEDULED', 'DISPATCHED', 'IN_TRANSIT')` and `ticket_status IN ('ISSUED', 'BOAR | yes |
| `BR-MYTICKETS-002` | `PAX-016` | Pull-to-refresh queries latest status and checks if vehicle replacement or delay announcements have occurred. | by screen tests only |
| `BR-TICKET-001` | `PAX-017` | Screen automatically boosts display brightness to 100% when viewed and restores user brightness upon exit. | by screen tests only |
| `BR-TICKET-002` | `PAX-017` | If driver scans the ticket and marks `BOARDED`, the screen status pill instantly changes to `🟢 ĐÃ LÊN XE` via  | by screen tests only |
| `BR-TICKET-003` | `PAX-017` | Offline mode guarantees QR is rendered from SQLite cache even without internet connectivity. | by screen tests only |
| `BR-TICKET-004` | `PAX-017` | For bookings with $\ge 2$ seats under the same PNR, the screen displays a horizontal pill switcher. Swiping to | by screen tests only |
| `BR-TICKET-005` | `PAX-017` | User can tap "Chia sẻ vé" to enter a recipient's phone number. The system sends an SMS with a secure authentic | by screen tests only |
| `BR-TICKET-006` | `PAX-017` | Superseded by D104: the QR has no time window | `cryptoEngine.js` `generateBoardingQR`, `verifyBoardingQR` | `TC-CORE-04`, `TC-QR-01`, `TC-QR-02` |
| `BR-TICKET-008` | `PAX-017` | Reissue revokes the old QR and PIN; frozen after departure | `payment.js` `reissueBoardingQR`, `passengerRoutes.js` | `TC-QR-03`, `TC-QR-04`, `TC-PAY-04` |
| `BR-TICKET-005` | `PAX-017` | Share link is an opaque token, PIN only in the SMS | `payment.js` `delegateTicket` | `TC-QR-05`, `TC-PAY-07`, `TC-SRV-06` |
| `DRI-009` offline | `DRI-009` | Manifest `boarding_check` lets the tablet check scans without a secret | `driverService.js` `_boardingCheck` | `TC-QR-07` |
| `BR-NOSHOW-004` | `DRI-011` | Grace period at the passenger's own stop | `driverService.js` `markNoShow` | `TC-NOSHOW-01`, `TC-NOSHOW-02`, `TC-SPEC-A43` |
| `BR-END-005` | `DRI-017` | Trip ends at the last stop or with a written reason | `driverService.js` `endTrip` | `TC-END-01`, `TC-END-02` |
| `BR-TRACK-001` | `PAX-018` | If WebSocket drops, client immediately falls back to REST polling (`GET /trips/{id}/tracking`) every $10\text{ | by screen tests only |
| `BR-TRACK-002` | `PAX-018` | If no GPS position has been received for $>60\text{s}$, ConnectionBadge changes to `STALE` (Amber: *"Dữ liệu x | yes |
| `BR-TRACK-003` | `PAX-018` | When vehicle enters within $1.0\text{km}$ ($<5\text{ minutes}$ ETA) of passenger's pickup geofence, trigger lo | by screen tests only |
| `BR-CANCEL-002` | `PAX-021` | Submitting cancellation immediately frees up the seat in Redis and PostgreSQL and broadcasts `SEAT_RELEASED` t | by screen tests only |
| `BR-SESSION-001` | `SH-001` | On HTTP 401, the HTTP client interceptor attempts 1 silent refresh call (`POST /auth/refresh`). If refresh fai | by screen tests only |

Five rule ids are cited as source requirements in a screen header but have no rule text anywhere: `BR-SCAN-002` (`DRI-009`, `DRI-010`; duplicate scan is in fact defined by the `ALREADY BOARDED` state of `DRI-009` and checked by the server), `BR-REFUND-001` (`MGR-022`, `PAX-021`; the refund is approved once, see `BR-REFUND-002` and `OQ-019`), `BR-ALERT-001` (`MGR-025`), `BR-REPORT-001` (`MGR-027`) and `BR-TICK-003` (`PAX-017`; the QR window is `BR-TICKET-006`). They are source labels of the original requirement list, not rules to build; no row in this matrix depends on them.

