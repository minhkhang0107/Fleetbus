# BusGo Analytics & Telemetry Event Schema

**Document Version:** 1.0  
**Scope:** Client-side tracking events, conversion funnels, performance metrics, and privacy compliance rules across Passenger, Driver, and Manager applications.

---

## 1. Privacy & Data Protection Compliance Rules

1. **PII Masking Invariant:** Never log raw phone numbers, national ID numbers, payment card numbers, CVVs, or OTP codes in client analytics payloads.
2. **Identifier Hashing:** User identifiers in analytics must use anonymized UUIDs (`user_id: "usr_9f8a2b..."`) or SHA-256 hashed phone tokens.
3. **Location Privacy:** Background location telemetry in Driver App is restricted to operational vehicle coordinates; Passenger location queries (`PAX-005`) are rounded to 3 decimal places (approx. 100m) for analytics.

---

## 2. Passenger App Conversion Funnel & Analytics Events

```text
[SEARCH_INITIATED] ──► [SEARCH_RESULTS_VIEWED] ──► [TRIP_DETAIL_VIEWED] ──► [SEAT_SELECTED]
                                                                                  │
[BOOKING_COMPLETED] ◄── [PAYMENT_SUCCESS] ◄── [PAYMENT_INITIATED] ◄── [CHECKOUT_VIEWED] ◄┘
```

| Event Name | Screen ID | Trigger Condition | Event Payload Schema |
| :--- | :--- | :--- | :--- |
| `SPLASH_VIEWED` | `PAX-001` | App initialization finishes | `{ app_version, platform, os_version, network_type }` |
| `LOGIN_OTP_REQUESTED` | `PAX-002` | User taps "Gửi mã OTP" | `{ phone_hash, carrier }` |
| `LOGIN_SUCCESS` | `PAX-003` | OTP verification completes | `{ auth_method: "OTP", is_new_user: boolean }` |
| `HOME_VIEWED` | `PAX-004` | Home screen renders | `{ has_active_ticket: boolean, active_trip_id?: string }` |
| `SEARCH_RESULTS_VIEWED`| `PAX-006` | Search results API returns | `{ origin_stop_id, dest_stop_id, departure_date, result_count }` |
| `TRIP_DETAIL_VIEWED` | `PAX-007` | User enters trip detail | `{ trip_id, route_id, vehicle_type, base_fare }` |
| `SEAT_SELECTED` | `PAX-009` | User selects seat cell | `{ trip_id, seat_code, deck, segment_id, price }` |
| `SEAT_HOLD_ACQUIRED` | `PAX-010` | Redis lock granted | `{ trip_id, seat_codes: string[], hold_duration_seconds: 600 }` |
| `CHECKOUT_VIEWED` | `PAX-012` | Checkout screen loads | `{ booking_id, seat_count, total_fare, voucher_code?: string }` |
| `PAYMENT_INITIATED` | `PAX-013` | User selects payment method | `{ payment_method: "VNPAY"|"MOMO"|"VIETQR"|"COD", amount }` |
| `PAYMENT_COMPLETED` | `PAX-014` | Gateway callback success | `{ payment_id, transaction_ref, duration_ms }` |
| `BOOKING_SUCCESS_VIEWED`| `PAX-015` | Confirmation screen renders | `{ booking_id, pnr, total_amount, seats_count }` |
| `TICKET_QR_VIEWED` | `PAX-017` | Boarding pass rendered | `{ ticket_id, trip_id, seat_code, is_offline: boolean }` |
| `LIVE_TRACKING_VIEWED` | `PAX-018` | Map tracking opened | `{ trip_id, vehicle_id, initial_eta_minutes }` |
| `TRACKING_RECONNECTING`| `PAX-018` | WebSocket dropped | `{ trip_id, retry_attempt, disconnect_reason }` |
| `BOOKING_CANCEL_REQUESTED`| `PAX-021`| User submits cancel request | `{ booking_id, reason_category, calculated_refund_amount }` |

---

## 3. Driver App Operational Telemetry & Safety Events

| Event Name | Screen ID | Trigger Condition | Event Payload Schema |
| :--- | :--- | :--- | :--- |
| `DRIVER_SHIFT_STARTED` | `DRI-002` | Driver logs in and opens shift | `{ driver_id, vehicle_id, scheduled_trips_count }` |
| `READINESS_CHECKLIST_SUBMITTED`| `DRI-004`| Driver verifies bus readiness | `{ trip_id, odometer, fuel_level, tire_status, pass_all: true }` |
| `TRIP_STARTED` | `DRI-005` | Start trip action confirmed | `{ trip_id, route_id, departure_time_actual, start_lat, start_lng }` |
| `TELEMETRY_INGESTED` | `DRI-006` | Background GPS pub (sample 1/min) | `{ trip_id, speed_kmh, heading, accuracy_meters, battery_pct }` |
| `TICKET_SCANNED_OFFLINE`| `DRI-009`| QR scanned & verified locally | `{ ticket_id, seat_code, scan_duration_ms, signature_valid: true }` |
| `BOARDING_SYNC_FLUSHED`| `DRI-015`| SQLite outbox synced to backend | `{ trip_id, synced_boarding_events_count, queue_latency_seconds }` |
| `COD_COLLECTED` | `DRI-012` | Driver confirms cash receipt | `{ ticket_id, amount_collected, receipt_no }` |
| `NO_SHOW_MARKED` | `DRI-011` | Passenger marked no-show | `{ ticket_id, stop_id, grace_period_waited_seconds, reason }` |
| `TRIP_ENDED` | `DRI-017` | Trip finished & manifest signed | `{ trip_id, final_odometer, boarded_count, no_show_count }` |

---

## 4. Manager Portal Operations Events

| Event Name | Screen ID | Trigger Condition | Event Payload Schema |
| :--- | :--- | :--- | :--- |
| `OPS_DASHBOARD_VIEWED` | `MGR-002` | Overview dashboard loaded | `{ active_trips_count, delayed_trips_count, system_load_pct }` |
| `RADAR_VEHICLE_INSPECTED`| `MGR-003` | Dispatcher clicks map vehicle | `{ vehicle_id, trip_id, current_speed, delay_status }` |
| `VEHICLE_REPLACEMENT_EXECUTED`| `MGR-023`| Replacement transaction committed | `{ trip_id, old_vehicle_id, new_vehicle_id, remapped_seats_count }` |
| `TRIP_DELAY_BROADCASTED`| `MGR-024`| Delay notice sent to passengers | `{ trip_id, delay_minutes, affected_passengers_count }` |
| `REFUND_APPROVED` | `MGR-022` | Manager approves refund | `{ refund_id, booking_id, refund_amount, gateway_ref }` |
