# Cross-Screen State Consistency Architecture

**Document Version:** 1.0  
**Scope:** Multi-screen state synchronizations, state machines, and distributed lifecycle invariants across Passenger, Driver, and Manager interfaces.

---

## 1. Booking & Seat Hold Lifecycle

```text
[PAX-009 Seat Map] (User Selects Seat)
         │
         ▼ Redis Lua Script Lock (TTL: 600s)
[PAX-010 Seat Hold Screen] ── State: HELD ──► Broadcast WS: SEAT_HELD {tripId, seatCode, segment}
         │
         ▼ User Completes Checkout
[PAX-012 Checkout] ── State: PENDING_PAYMENT
         │
         ├───────────────────────────────────┬───────────────────────────────────┐
         ▼ Payment Gateway Success           ▼ Gateway Failure / Timeout         ▼ 600s Timer Expired
[PAX-015 Booking Success]           [PAX-014 Payment Failed]            [PAX-010 Expired Modal]
  State: CONFIRMED                    State: PAYMENT_FAILED               State: HOLD_EXPIRED
  DB: INSERT booking, ticket          Redis Lock Released                 Redis Key Auto-Purged
  Broadcast WS: SEAT_BOOKED           User can Retry                      Redirect to PAX-009

---
*Hotline / Call-Center Seat Hold State Progression (MGR-020, REV-06):*
[MGR-020 POS / Hotline] ── State: HELD_HOTLINE (hold_until = T - 30m or custom minutes)
         │
         ├───────────────────────────────────┬───────────────────────────────────┐
         ▼ Customer Pays at Counter / Boards ▼ Hold Expires (Now > hold_until)   ▼ Clerk Cancels
[MGR-020 POS Checkout] ── CONFIRMED/BOARDED  [Scheduler Worker] ── RELEASED       [MGR-020] ── CANCELLED
  Payment: SUCCESS (Cash/POS)                 Seat returns to VACANT inventory     Seat returns to VACANT
```

### 1.1. Cross-Screen Invariant:
- If a hold expires while the user is typing in `PAX-011` or reviewing `PAX-012`, the UI triggers a blocking bottom sheet informing the user: *"Thời gian giữ chỗ đã hết hạn. Vui lòng chọn lại ghế."* and navigates back to `PAX-009`.

---

## 2. Payment & Settlement State Machine

```text
       ┌───────────────┐
       │    CREATED    │ (PAX-012 / MGR-020)
       └───────┬───────┘
               │ Initiate Gateway / Direct Pay
               ▼
       ┌───────────────┐
       │   INITIATED   │ (Redirect to VNPAY/MoMo or Show Dynamic QR)
       └───────┬───────┘
               │ Webhook Callback / Polling (3s fallback + "Tôi đã chuyển tiền" trigger - REV-02)
       ┌───────┴───────────────────────┬───────────────────────────────┐
       ▼                               ▼                               ▼
┌───────────────┐              ┌───────────────┐              ┌────────────────┐
│    SUCCESS    │              │    FAILED     │              │    EXPIRED     │
│(PAX-015/MGR-18)              │(PAX-014/MGR-21)              │(PAX-014/MGR-21)│
└──────┬────────┘              └───────────────┘              └────────────────┘
       │ Cancel / Overbooking Disruption
       ▼
┌────────────────────────┐
│    REFUND_REQUESTED    │ (PAX-021 / MGR-022)
└──────────┬─────────────┘
       │ Manager Approves & Gateway Processes
       ▼
┌────────────────────────┐
│        REFUNDED        │ (PAX-021 / MGR-022)
└────────────────────────┘
```

---

## 3. Ticket Boarding & Manifest State Machine

```text
[PAX-017 Individual Ticket QR] ── State: ISSUED
         │
         ├─► [Group Boarding QR (REV-01)] ── 1-scan check-in for all N seats in PNR
         ├─► [Delegated SMS + 6-digit PIN (REV-01)] ── Driver checks in via DRI-010 PIN lookup
         │
         ▼ Driver Scans QR in DRI-009 (static versioned QR checked against the manifest - D104)
[DRI-009 Scan QR / DRI-010 Manual PIN] ── State: BOARDED (Local SQLite Outbox in DRI-015)
         │
         ├─────────────────────────────────────────┐
         ▼ Network Available                       ▼ Zero Connectivity
[Backend API] ── Postgres UPDATE ticket = BOARDED   [DRI-015 Sync Center] Queued
         │                                         Replays on connection restore
         ▼ WS Broadcast
[PAX-017 Ticket] -> Badge changes to "ĐÃ LÊN XE"
[MGR-012 Manifest] -> Realtime Boarding Counter increments (+1)

---
*Onboard Hail Passenger State Flow (DRI-006 / DRI-007, REV-05):*
[DRI-007 Manifest] ── Tap "THÊM KHÁCH DỌC ĐƯỜNG" ──► Select Vacant Seat
         │
         ▼ Driver collects Cash Fare (with optional Debt Receipt change settlement in DRI-012)
[New Ticket Created] ── Immediate State: BOARDED ── Payment: SUCCESS ── Trip Counter: (+1)
```

---

## 4. Trip Lifecycle Across Manager, Driver, and Passenger

| Trip State | Trigger Screen / Event | Passenger App UI (`PAX-*`) | Driver App UI (`DRI-*`) | Manager Portal UI (`MGR-*`) |
| :--- | :--- | :--- | :--- | :--- |
| `SCHEDULED` | Created via `MGR-011` | Viewable in `PAX-006` Search | Viewable in `DRI-002` Today's List | Displayed in `MGR-010` & `MGR-014` |
| `DISPATCHED` | Dispatched via `MGR-014` | Available for seat booking | Enabled for Pre-start `DRI-003` | Status Pill: "Đã phân tài" |
| `IN_TRANSIT` | Driver executes `DRI-005` | Active Tracking Banner `PAX-018` | Locked to Cockpit `DRI-006` | Live Pin on `MGR-003` Live Radar |
| `DELAYED` | Detected by ETA / `MGR-024` | Alert Banner in `PAX-018` (+X min) | Delay warning badge in `DRI-006` | Highlighted in `MGR-025` Alerts |
| `ARRIVED` | Last Stop passed `DRI-008` | "Đã tới bến cuối" in `PAX-018` | Triggers `DRI-017` End Trip CTA | Final leg on `MGR-003` Radar |
| `COMPLETED` | Driver submits `DRI-017` | Ticket marked "HOÀN THÀNH" | Returns to `DRI-002` Schedule | Archived in `MGR-010` History |
| `CANCELLED` | Manager cancels `MGR-012` | Push Alert -> Full Refund `PAX-021`| Trip removed with cancellation notice| Red status badge in `MGR-010` |

---

## 5. Emergency Vehicle Replacement State Transition

```text
[MGR-023 Vehicle Replacement Wizard]
  1. Select broken vehicle -> Select replacement vehicle from available fleet.
  2. Auto-remap seat inventory (1-to-1 code match or algorithmic reallocation).
  3. Detect seat conflicts (e.g. 40-seat bus replaced by 34-seat VIP limousine).
  4. Manager resolves conflicts (seat swaps / priority upgrades / refund offers).
  5. Commit Replacement Transaction.
         │
         ├────────────────────────────────────────┬────────────────────────────────────────┐
         ▼ WS Broadcast: VEHICLE_REPLACED         ▼ WS Broadcast: TRIP_UPDATED             ▼ Push Notification to Passengers
[PAX-024 Replacement Notice]             [DRI-003 / DRI-006 Driver Cockpit]       "Xe của bạn đã được đổi sang biển số mới"
  Displays new license plate & seat.       Displays new vehicle specs & manifest.   Direct link to updated PAX-017 Ticket.
```
