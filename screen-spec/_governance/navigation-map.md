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

### 1.2b. Where the Bottom Navigation Shows (design review 2026-10-07, D96)
- **Shown** only on the four tab roots: `PAX-004`, `PAX-016`, `PAX-020`, `PAX-022`.
- **Hidden** on `PAX-001` splash, `PAX-002`/`PAX-003` login, and the whole booking funnel `PAX-005` to `PAX-015`: the funnel has one sticky bottom action (price + next step) and a back arrow. A tab bar under a payment screen lets the passenger leave a running hold by accident and puts two bottom bars on screen.
- **Hold banner:** from `PAX-010` to `PAX-013` the amber countdown banner sits under the app bar on every step (`PAX-010` 4.1), not only on checkout.
- **Funnel order:** `PAX-006` results, `PAX-007` trip detail, `PAX-008` pickup and dropoff (the segment decides which seats are free, `BR-SEAT-001`, so it comes before the seat map), `PAX-009` seats, then `PAX-011` passenger info and `PAX-012` checkout. `PAX-011` and `PAX-012` may be one scrolling screen with two sections; the hold starts when the passenger taps "Giữ ghế" on `PAX-009`.
- **Login at the hold (D106):** searching, trip detail, stops and the seat map work without an account. Holding seats needs one (`POST .../seats/hold` is Bearer): tapping "Giữ ghế" without a session opens the phone and OTP sheet over the seat map and keeps the selection; the hold starts after the OTP.
- **No passenger count in the search (D109):** the number of seats picked on `PAX-009` is the passenger count; the search form asks only route and date.
- **After payment:** `PAX-014` result, then `PAX-015` success, which clears the funnel stack (`BR-SUCCESS-001`) and offers "Xem vé" (`PAX-017`) and "Về trang chủ".

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
   (design review 2026-10-07, D98: the DRI-004 start button stays disabled until all six
    checks are ticked; DRI-005 is a confirmation sheet showing passengers and departure time)
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

---

## 6. Routes of Screens Not Drawn Above (Phase D review)

The trees above omit these screens. Routes, entry and exit points are those of `screen-catalog.md`, which is the authority.

| Screen | Name | Route | Entry points | Exit points |
| :--- | :--- | :--- | :--- | :--- |
| `PAX-023` | Saved Stops & Frequent Travelers | `/profile/saved-contacts` | Profile, Passenger Info Form | `/profile`, `/checkout/passenger-info` |
| `PAX-025` | Trip Delay & Disruption Alert | `/notice/trip-delay/:tripId` | Push Notification, Tracking Banner | `/tracking/:tripId`, `/booking/:bookingId/cancel` |
| `DRI-016` | Telemetry & MQTT Diagnostics | `/driver/diagnostics` | Settings, GPS Health Modal | `/driver/sync-center`, `/driver/today-trips` |
| `DRI-018` | Shift History & Device Profile | `/driver/profile` | Bottom Nav, Drawer | `/driver/login`, `/driver/today-trips` |
| `MGR-001` | Staff Login & MFA | `/ops/login` | Browser Access | `/ops/dashboard`, `/ops/radar` |
| `MGR-004` | Vehicle Live Telemetry Inspector | `/ops/vehicle/:id/live` | Live Radar, Vehicle Directory | `/ops/radar`, `/ops/vehicle/:id/edit` |
| `MGR-006` | Vehicle Create & Edit | `/ops/vehicles/new`, `/:id/edit` | Vehicle Directory | `/ops/vehicles`, `/ops/seat-layouts` |
| `MGR-009` | Route & Geofence Stop Builder | `/ops/routes/builder` | Route Directory | `/ops/routes`, `/ops/trips/new` |
| `MGR-011` | Trip Dispatch & Schedule Generator | `/ops/trips/new` | Trip Directory, Dispatch Board | `/ops/trips`, `/ops/trip/:id` |
| `MGR-012` | Trip Master Operational Detail | `/ops/trip/:id` | Trip List, Radar, Dispatch Board | `/ops/trip/:id/seat-inventory`, `/ops/trip/:id/replace-vehicle` |
| `MGR-013` | Segment Seat Inventory Matrix | `/ops/trip/:id/seat-inventory` | Trip Detail, POS Screen | `/ops/trip/:id`, `/ops/booking/:id` |
| `MGR-016` | Driver Performance & Safety Detail | `/ops/driver/:id` | Driver Directory, Trip Detail | `/ops/drivers`, `/ops/audit` |
| `MGR-018` | Booking Master Detail & Ledger | `/ops/booking/:id` | Booking Search, Trip Manifest | `/ops/refund/new?bookingId=:id`, `/ops/payments` |
| `MGR-020` | POS Fast Seat Selection & Checkout | `/ops/pos/checkout` | POS Search | `/ops/booking/:id`, `/ops/pos` |
| `MGR-023` | Vehicle Replacement Wizard | `/ops/trip/:id/replace-vehicle` | Trip Detail Actions, Incident Alert | `/ops/trip/:id`, `/ops/radar` |
| `MGR-024` | Trip Delay & Operational Broadcast | `/ops/trip/:id/delay-management` | Trip Detail Actions, Incident Alert | `/ops/trip/:id`, `/ops/notifications` |
| `MGR-026` | Notification Campaign Engine | `/ops/notifications` | Sidebar Nav | `/ops/dashboard` |
| `SH-001` | Session Expired & Re-authentication | `/shared/session-expired` | HTTP 401 Interceptor | App Login, Previous Screen on Refresh |
| `SH-002` | Permission Denied (403 Forbidden) | `/shared/permission-denied` | HTTP 403 Interceptor, Route Guard | Previous Screen, App Home |
| `SH-003` | Network Offline & Server Error | `/shared/network-error` | Connectivity Loss, HTTP 5xx | Auto-retry, Manual Refresh |
| `SH-004` | System Maintenance Notice | `/shared/maintenance` | HTTP 503 / Feature Flag Barrier | App Exit, Polling for Service Resumption |
| `SH-005` | Force App Version Upgrade | `/shared/version-upgrade` | App Config Handshake Barrier | App Store / Play Store URL |
