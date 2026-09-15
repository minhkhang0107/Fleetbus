# Governance Conflict Resolution & Open Questions Log

This document records architectural, functional, and user experience differences identified across:
1. `bus_booking_tracking_system_spec_v3_enhanced.md` (Master Source of Truth)
2. `busgo_passenger_ui_functional_spec_v2.md`
3. `busgo_driver_ui_functional_spec_v2.md`
4. `busgo_manager_ui_functional_spec_v2.md`

According to the project governance hierarchy:
```text
MASTER SPEC (v3.0)
    ↓
DOMAIN / BUSINESS RULE
    ↓
APP-SPECIFIC SPEC (v2.0)
    ↓
SCREEN-SPEC
```

---

## 1. Governance Decision Matrix

| Item ID | Domain | Conflict Description | Source A (Master v3) | Source B (App Spec v2) | Impact | Recommended Resolution | Status | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **OQ-001** | Seat Inventory | Hold Duration in Redis Lock vs UI Countdown | Redis seat lock TTL is default **10 minutes (600s)** (`LOCK_TTL_SECONDS = 600`) | Some passenger wireframes reference **5 minutes (300s)** | User sees expired hold while checkout is still valid or vice versa | **Align to 10 minutes (600s)** with a client countdown timer synced to server `locked_until` timestamp. | RESOLVED | Non-blocking |
| **OQ-002** | Telemetry | Ingestion Transport for Driver App | Driver Telemetry Ingestion primary is **MQTT** (`busgo/telemetry/{vehicleId}`) with HTTP fallback | Driver UI spec v2 references REST `/api/v1/driver/trips/{id}/telemetry` | Data rate and battery consumption on mobile | **Master Spec wins:** Driver native background service publishes via **MQTT QoS 1**; REST batch endpoint is used for offline buffer replay only. | RESOLVED | Non-blocking |
| **OQ-003** | COD Collection | Payment status progression for Cash on Delivery | COD booking creates Payment in `PENDING` state; driver confirms cash receipt transitioning Payment to `SUCCESS` and Booking to `CONFIRMED` | Some passenger flow diagrams show COD auto-confirmed upon booking | Revenue risk if passenger cancels without paying | **Master Spec wins:** COD Booking remains `CONFIRMED_UNPAID` (or `RESERVED_COD`) until Driver collects cash on boarding and executes `DRI-012-cod.md` -> status transitions to `PAID`. | RESOLVED | Non-blocking |
| **OQ-004** | QR Boarding | Offline Ticket Validation Mechanism | Master Spec specifies HMAC-SHA256 signed QR payload containing `ticket_id`, `trip_id`, `seat_code`, `segment_hash`, `issued_at`, and `signature`. Driver app verifies offline with daily rotating public key / secret. | Driver UI spec briefly mentions REST scan | Driver boarding in zero-connectivity mountain areas | **Master Spec wins:** Driver app (`DRI-009`) performs local signature verification and queues `BOARDED` event into local SQLite buffer (`DRI-015`) for later sync. | RESOLVED | Non-blocking |
| **OQ-005** | Vehicle Replacement | Seat Remapping Resolution Policy | Auto-remap same seat codes; if capacity decreases or seat layout differs, system creates remapping suggestions; Manager must review conflicts; affected passengers receive push notifications. | Manager spec implies manual seat-by-seat reassignment | Operator operational overhead during bus breakdown | **Hybrid Resolution:** Wizard (`MGR-023`) provides algorithmic 1-click auto-mapping with manual drag-and-drop overrides for conflicts, followed by auto-broadcast to `PAX-024`. | RESOLVED | Non-blocking |
| **OQ-006** | Realtime Invalidation | Client Realtime Reconnect Snapshot | On WebSocket / MQTT reconnect, client must query authoritative REST snapshot (`GET /trips/{id}/tracking`) before applying incremental messages. | Passenger UI v2 relies on continuous event stream | Stale positions or dropped trip completion events | **Master Spec wins:** Reconnection protocol enforces `REST Snapshot -> Seq Check -> Apply Replay Buffer`. | RESOLVED | Non-blocking |
| **OQ-007** | Privacy | Driver Passenger List Phone Visibility | Master spec mandates PII masking: Driver app sees masked phone (e.g. `098***1234`) and calls via VoIP / virtual call proxy. | Driver UI v2 wireframe showed raw phone numbers | Passenger data leak risk and regulatory non-compliance | **Master Spec wins:** Masked phone display (`098***1234`) + in-app call bridge button. Raw phone is restricted to Manager RBAC (`ROLE_OPS_ADMIN`). | RESOLVED | Non-blocking |
| **OQ-008** | Booking State | Late Payment Webhook Race Condition | Webhook arrives after Redis lock expired and seat re-allocated to another passenger. | Not fully specified in Passenger UI v2 | Double booking or unfulfilled paid booking | **Master Spec Rule wins:** Mark payment `UNMATCHED_OVERDUE`, trigger auto-refund or rebook workflow (`MGR-021` / `MGR-022`), show `PAX-014` Late Payment Recovery screen. | RESOLVED | Non-blocking |
| **OQ-009** | Ticket Presentation | Multi-Ticket Carousel & Group Boarding | Single ticket per screen vs Group booking of up to 5 seats (`BR-SEAT-003`) | Driver had to scan 5 separate tickets in night depots | Boarding delays and poor group travel UX | **Resolution:** `PAX-017` introduces a swipeable ticket carousel and an aggregate "Group QR" containing all seats under the PNR for 1-scan boarding. | RESOLVED | Non-blocking |
| **OQ-010** | Ticket Sharing | Rotating QR Incompatible with Screenshot Sharing | 30s rotating HMAC QR invalidates static screenshots shared via Zalo/SMS to elderly relatives | Family members buying tickets on behalf of others | Passengers stranded at depot when screenshot expires | **Resolution:** `PAX-017` adds "Ủy quyền / Chia sẻ vé": generates a secure share link or 6-digit SMS verification code for passengers without smartphone apps. | RESOLVED | Non-blocking |
| **OQ-011** | Payment Settlement | App-Switching Background Suspension on Banking Apps | Passenger switches to mobile banking app to scan VietQR; WebSocket disconnects on iOS/Android suspension | App stuck on "Đang chờ thanh toán..." when returning | High user drop-off and support tickets | **Resolution:** `PAX-013` implements active 3s fallback polling on app resume + manual "Tôi đã chuyển khoản xong" trigger. | RESOLVED | Non-blocking |
| **OQ-012** | QR Security | Rotating TOTP vs Offline Static Signature in Driver Scanner | `cryptoEngine.js` uses 30s rotating HMAC while `DRI-009` spec referenced static daily JSON | Clock drift on offline driver phone rejects valid tickets (`QR_EXPIRED`) | False boarding rejections at remote stops | **Resolution:** `cryptoEngine.js` expands window tolerance to $\pm 2$ windows (60s drift) and accepts offline daily signature format fallback. | RESOLVED | Non-blocking |
| **OQ-013** | Cash Collection | COD Change Due Shortage at Boarding | Driver lacks small change (e.g. 500k cash for 220k ticket) during quick boarding | Single "Đã thu tiền" button blocks boarding line | Departure delays at intermediate pickup points | **Resolution:** `DRI-012` adds "Nợ tiền thừa — Trả tại trạm dừng nghỉ" and "Nạp tiền thừa vào ví/điểm thưởng của khách". | RESOLVED | Non-blocking |
| **OQ-014** | Operational Sales | On-the-road Hail Passengers (Bắt xe dọc đường) | System only allowed manifest pre-booked boarding | Unrecorded cash sales, driver leakage, double booking | Revenue loss and seat inventory discrepancy | **Resolution:** `DRI-006` / `DRI-007` adds "Đón khách vãng lai": driver selects open seat, records cash, locks inventory on server. | RESOLVED | Non-blocking |
| **OQ-015** | Reservation | Hotline/POS Seat Hold Duration | 10-minute online hold TTL is too short for passengers calling hotline promising to arrive 30m prior | Seat released while caller is commuting to station | Customer dissatisfaction and lost offline sales | **Resolution:** `MGR-020` enables configurable "Giữ chỗ Hotline đến trước giờ xuất bến X phút" (default 30 min before departure). | RESOLVED | Non-blocking |
| **OQ-016** | Telemetry Tracking | Stale GPS Detection & Rest-Stop Status | Continuous movement assumed on map vs vehicle traversing tunnel / cellular dead zones or paused at rest stop | Passengers panic assuming bus is broken down or radar app crashed | Influx of panic calls to hotline / driver | **Resolution:** `PAX-018` & `PAX-019` detect telemetry age $> 60\text{s}$ to display amber warning ("Tín hiệu GPS gián đoạn qua hầm/sóng yếu") and display rest-stop status with estimated rest duration (`BR-TRACK-004`). | RESOLVED | Non-blocking |

---

## 2. Invariant Rules Across All Screen Specs

1. **PostgreSQL Authoritative Rule:** No client screen may assume an action is persisted until the server returns an HTTP 2xx or authoritative WebSocket confirmation.
2. **Segment-Based Seat Integrity:** A seat availability is evaluated strictly for the requested segment $[S_{pickup}, S_{dropoff}]$, never as a static boolean `is_available` for the whole vehicle.
3. **Driver Safety Rule:** Driver screens in active trip mode (`DRI-006` through `DRI-013`) must have large touch targets ($\ge 64\text{dp}$), zero complex text entry, high contrast, and zero distracting animations.
4. **Idempotency Rule:** Every state-mutating request (Seat Hold, Booking Create, Payment Initiate, QR Boarding, Refund Request, COD Receipt) MUST include an `Idempotency-Key` header generated by the client.
