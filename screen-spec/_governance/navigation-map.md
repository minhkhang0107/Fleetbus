# BusGo Navigation & Routing Architecture

**Document Version:** 1.0  
**Scope:** Navigation trees, routing state transitions, deep links, and back-button behavior across Passenger, Driver, and Manager applications.

---

## 1. Passenger Navigation Architecture

### 1.1. User Journey Navigation Flow
```text
[PAX-001 Splash]
      │
      ├───────────────────────┬────────────────────────┐
      ▼                       ▼                        ▼
[PAX-002 Login]         [PAX-004 Home] (Guest)  [Deep Link Route]
      │                       │
      ▼                       │
[PAX-003 OTP]                 │
      │                       │
      └───────────┬───────────┘
                  ▼
         [PAX-004 Home Tab] ◄────────────────────────────────────────┐
                  │                                                  │
                  ├───────────────────────────────┐                  │
                  ▼                               ▼                  │
      [PAX-005 Location Picker]         [PAX-016 My Tickets Tab]     │
                  │                               │                  │
                  ▼                               ▼                  │
      [PAX-006 Search Results]          [PAX-017 Ticket QR]          │
                  │                               │                  │
                  ▼                               ├──────────────┐   │
      [PAX-007 Trip Detail]                       ▼              ▼   │
                  │                     [PAX-018 Tracking] [PAX-021] │
                  ▼                               │        (Cancel)  │
      [PAX-008 Pickup/Dropoff]                    ▼                  │
                  │                     [PAX-019 ETA Detail]         │
                  ▼                                                  │
      [PAX-009 Seat Map]                                             │
                  │                                                  │
                  ▼                                                  │
      [PAX-010 Seat Hold Confirmation]                               │
                  │                                                  │
                  ▼                                                  │
      [PAX-011 Passenger Info]                                       │
                  │                                                  │
                  ▼                                                  │
      [PAX-012 Checkout]                                             │
                  │                                                  │
                  ▼                                                  │
      [PAX-013 Payment Processing]                                   │
                  │                                                  │
                  ▼                                                  │
      [PAX-014 Payment Result]                                       │
                  │                                                  │
                  ▼                                                  │
      [PAX-015 Booking Success] ─────────────────────────────────────┘
```

### 1.2. Bottom Navigation Destinations (Passenger)
1. **Home (`/home`):** Quick Search, Active Ticket Card, Recent Routes, Promotional Banners (`PAX-004`).
2. **My Tickets (`/tickets`):** Upcoming, Completed, and Cancelled ticket tabs (`PAX-016`).
3. **Notifications (`/notifications`):** Push history, operational alerts (`PAX-020`).
4. **Profile (`/profile`):** Saved Passengers, Saved Stops, Settings, Logout (`PAX-022`).

### 1.3. Deep Linking Schemes (Passenger)
- `busgo://trip/{tripId}` -> Direct to `PAX-007-trip-detail.md`
- `busgo://ticket/{ticketId}` -> Direct to `PAX-017-ticket.md`
- `busgo://tracking/{tripId}` -> Direct to `PAX-018-tracking.md`
- `busgo://notice/replacement/{incidentId}` -> Direct to `PAX-024-vehicle-replacement-notice.md`

---

## 2. Driver Navigation Architecture

### 2.1. Driver Operating Modes
The Driver App enforces a **two-mode state machine** to minimize distractions:

```text
PRE-START MODE (Resting / In-Depot)
[DRI-001 Login] ──► [DRI-002 Today's Trips] ──► [DRI-003 Pre-start Detail] ──► [DRI-004 Checklist] ──► [DRI-005 Start Trip]
                                                                                                              │
                                                                                                              ▼
ACTIVE DRIVING MODE (Cockpit Lockout) ◄───────────────────────────────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────────────────┐
   │ [DRI-006 Active Cockpit]                                │
   │   ├── [DRI-007 Manifest] ──► [DRI-008 Stop Detail]      │
   │   │                               ├── [DRI-009 Scan QR] │
   │   │                               ├── [DRI-010 Manual]  │
   │   │                               ├── [DRI-011 No-Show] │
   │   │                               └── [DRI-012 COD]     │
   │   ├── [DRI-013 Turn Navigation]                         │
   │   ├── [DRI-014 GPS Health]                              │
   │   ├── [DRI-015 Offline Sync Center]                     │
   │   └── [DRI-019 Incident Report]                         │
   └─────────────────────────────┬───────────────────────────┘
                                 │ Finish Trip
                                 ▼
                     [DRI-017 End Trip Summary]
                                 │
                                 ▼
                     [DRI-002 Today's Trips]
```

---

## 3. Manager Portal Navigation Architecture

### 3.1. Desktop Left Navigation Rail (`/ops/*`)
- **Overview:**
  - `/ops/dashboard` -> `MGR-002-dashboard.md`
  - `/ops/radar` -> `MGR-003-live-radar.md` (Operations Control Room)
- **Fleet & Dispatch:**
  - `/ops/dispatch` -> `MGR-014-dispatch-board.md`
  - `/ops/trips` -> `MGR-010-trip-list.md`
  - `/ops/vehicles` -> `MGR-005-vehicle-list.md`
  - `/ops/drivers` -> `MGR-015-driver-list.md`
  - `/ops/routes` -> `MGR-008-route-list.md`
  - `/ops/seat-layouts` -> `MGR-007-seat-layout-builder.md`
- **Sales & Customer Support:**
  - `/ops/pos` -> `MGR-019-pos-hotline-search.md`
  - `/ops/bookings` -> `MGR-017-booking-search.md`
  - `/ops/payments` -> `MGR-021-payment-transactions.md`
  - `/ops/refunds` -> `MGR-022-refund-center.md`
- **Safety, Quality & Admin:**
  - `/ops/alerts` -> `MGR-025-operations-alerts.md`
  - `/ops/reports` -> `MGR-027-reports-dashboard.md`
  - `/ops/audit` -> `MGR-028-audit-logs.md`
  - `/ops/roles-permissions` -> `MGR-029-roles-permissions.md`
  - `/ops/settings` -> `MGR-030-settings.md`
