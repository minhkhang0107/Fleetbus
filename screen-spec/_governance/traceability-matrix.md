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
| **BR-QR-002** | `UC-DRI-SCAN-002` | `DRI-009` | `DualQREngine` | `Dynamic TOTP +-2 window / Group QR` | `PASSENGER_BOARDED` | `GROUP_QR_SCANNED` | `TC-DRI-009-02` |
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

