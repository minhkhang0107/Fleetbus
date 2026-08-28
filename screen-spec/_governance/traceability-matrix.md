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
| **BR-TICK-001** | `UC-PAS-TICK-001` | `PAX-015` | `PNRSummaryCard` | `GET /bookings/{id}` | `TICKET_ISSUED` | `BOOKING_SUCCESS_VIEWED`| `TC-PAX-015-01` |
| **BR-TICK-002** | `UC-PAS-TICK-002` | `PAX-017` | `QRCodeView` | `GET /tickets/{id}` | N/A | `TICKET_QR_VIEWED` | `TC-PAX-017-01` |
| **BR-GPS-001** | `UC-PAS-TRACK-001`| `PAX-018` | `LiveMapTracking` | `GET /trips/{id}/tracking` | `TRACKING_UPDATE`| `LIVE_TRACKING_VIEWED` | `TC-PAX-018-01` |
| **BR-ETA-001** | `UC-PAS-ETA-001` | `PAX-019` | `ETABadge` | `GET /trips/{id}/eta` | `ETA_UPDATED` | `ETA_DETAIL_VIEWED` | `TC-PAX-019-01` |
| **BR-CANCEL-001**| `UC-PAS-CAN-001` | `PAX-021` | `RefundPolicyBox` | `POST /bookings/{id}/cancel` | `REFUND_REQUESTED`| `BOOKING_CANCEL_REQUESTED`| `TC-PAX-021-01` |
| **BR-DRI-001** | `UC-DRI-AUTH-001` | `DRI-001` | `DriverLoginForm` | `POST /auth/driver/login` | N/A | `DRIVER_LOGIN_SUBMITTED`| `TC-DRI-001-01` |
| **BR-DRI-002** | `UC-DRI-TRIP-001` | `DRI-002` | `ShiftTripCard` | `GET /driver/trips/today` | N/A | `DRIVER_SHIFT_STARTED` | `TC-DRI-002-01` |
| **BR-DRI-003** | `UC-DRI-TRIP-002` | `DRI-004` | `ReadinessList` | `POST /driver/trips/{id}/readiness`| N/A | `READINESS_SUBMITTED` | `TC-DRI-004-01` |
| **BR-DRI-004** | `UC-DRI-TRIP-003` | `DRI-005` | `DriverActionPill`| `POST /driver/trips/{id}/start` | `TRIP_STARTED` | `TRIP_STARTED` | `TC-DRI-005-01` |
| **BR-TEL-001** | `UC-DRI-TEL-001` | `DRI-006` | `CockpitTelemetry`| `MQTT busgo/telemetry/{id}` | `TELEMETRY_RECORD`| `TELEMETRY_INGESTED` | `TC-DRI-006-01` |
| **BR-MAN-001** | `UC-DRI-MAN-001` | `DRI-007` | `ManifestTable` | `GET /driver/trips/{id}/manifest`| `MANIFEST_UPDATED`| `MANIFEST_VIEWED` | `TC-DRI-007-01` |
| **BR-SCAN-001** | `UC-DRI-SCAN-001` | `DRI-009` | `QRScannerView` | `Local Cryptographic Verification`| `PASSENGER_BOARDED`| `TICKET_SCANNED_OFFLINE`| `TC-DRI-009-01` |
| **BR-COD-001** | `UC-DRI-COD-001` | `DRI-012` | `CODReceiptCard` | `POST /driver/trips/{id}/payments/cod`| `COD_COLLECTED`| `COD_COLLECTED` | `TC-DRI-012-01` |
| **BR-SYNC-001** | `UC-DRI-SYNC-001` | `DRI-015` | `OutboxQueueList` | `POST /driver/telemetry/batch-replay`| N/A | `BOARDING_SYNC_FLUSHED`| `TC-DRI-015-01` |
| **BR-DRI-005** | `UC-DRI-TRIP-004` | `DRI-017` | `EndTripReport` | `POST /driver/trips/{id}/end` | `TRIP_COMPLETED` | `TRIP_ENDED` | `TC-DRI-017-01` |
| **BR-OPS-001** | `UC-MGR-DASH-001` | `MGR-002` | `OperationsKPI` | `GET /ops/dashboard/kpis` | N/A | `OPS_DASHBOARD_VIEWED` | `TC-MGR-002-01` |
| **BR-RADAR-001** | `UC-MGR-RADAR-001`| `MGR-003` | `FleetMapDeck` | `GET /ops/fleet/live-positions` | `TRACKING_UPDATE`| `RADAR_VIEWED` | `TC-MGR-003-01` |
| **BR-FLEET-001** | `UC-MGR-FLEET-001`| `MGR-007` | `LayoutGridEditor`| `POST /ops/seat-layouts` | N/A | `LAYOUT_SAVED` | `TC-MGR-007-01` |
| **BR-DISP-001** | `UC-MGR-DISP-001` | `MGR-014` | `GanttDispatch` | `GET /ops/dispatch/matrix` | `TRIP_DISPATCHED`| `DISPATCH_ASSIGNED` | `TC-MGR-014-01` |
| **BR-POS-001** | `UC-MGR-POS-001` | `MGR-020` | `POSSeatMatrix` | `POST /ops/pos/orders` | `TICKET_ISSUED` | `POS_ORDER_COMPLETED` | `TC-MGR-020-01` |
| **BR-REP-001** | `UC-MGR-REP-001` | `MGR-023` | `RemapSeatWizard` | `POST /ops/trips/{id}/replace-vehicle`| `VEHICLE_REPLACED`| `VEHICLE_REPLACEMENT_DONE`| `TC-MGR-023-01` |
| **BR-REF-001** | `UC-MGR-REF-001` | `MGR-022` | `RefundApproval` | `POST /ops/refunds/{id}/process` | `PAYMENT_REFUNDED`| `REFUND_APPROVED` | `TC-MGR-022-01` |
| **BR-AUD-001** | `UC-MGR-AUD-001` | `MGR-028` | `AuditTimeline` | `GET /ops/audit-logs` | N/A | `AUDIT_SEARCHED` | `TC-MGR-028-01` |
