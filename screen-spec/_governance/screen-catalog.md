# BusGo Master Screen Catalog

**Document Version:** 1.0  
**Status:** Approved Baseline  
**Total Screens:** 79 Screens (25 Passenger, 19 Driver, 30 Manager, 5 Shared)

---

## 1. Passenger Mobile Application (`PAX-xxx`)

| ID | App | Screen Name | Route | Entry Points | Exit Points | Priority | Status | Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PAX-001** | Passenger | Splash / App Initialization | `/splash` | App Launch | `/home`, `/login` | P0 | Draft | Source-backed |
| **PAX-002** | Passenger | Phone Login | `/login` | Splash, Profile, Session Expired | `/otp`, Guest `/home` | P0 | Draft | Source-backed |
| **PAX-003** | Passenger | OTP Verification | `/otp` | Login `/login` | `/home`, Return to `/login` | P0 | Draft | Source-backed |
| **PAX-004** | Passenger | Home / Trip Discovery | `/home` | Bottom Nav, Login, Splash | `/search`, `/search-results`, `/ticket/:id`, `/tracking/:tripId` | P0 | Draft | Source-backed |
| **PAX-005** | Passenger | Location / Stop Picker | `/search/location-picker` | Home Search Card, Search Results Filter | `/home`, `/search-results` | P0 | Draft | Source-backed |
| **PAX-006** | Passenger | Search Results | `/search-results` | Home Search, Date Switcher | `/trip/:tripId`, `/home` | P0 | Draft | Source-backed |
| **PAX-007** | Passenger | Trip Detail | `/trip/:tripId` | Search Results, Deep Link | `/trip/:tripId/pickup-dropoff`, `/search-results` | P0 | Draft | Source-backed |
| **PAX-008** | Passenger | Pickup & Dropoff Selection | `/trip/:tripId/pickup-dropoff` | Trip Detail | `/trip/:tripId/seat-map`, `/trip/:tripId` | P0 | Draft | Source-backed |
| **PAX-009** | Passenger | Interactive Seat Map | `/trip/:tripId/seat-map` | Pickup & Dropoff Selection | `/checkout`, `/trip/:tripId/pickup-dropoff` | P0 | Draft | Source-backed |
| **PAX-010** | Passenger | Seat Hold Confirmation | `/trip/:tripId/seat-hold` | Seat Map CTA | `/passenger-info`, `/trip/:tripId/seat-map` | P0 | Draft | Derived |
| **PAX-011** | Passenger | Passenger Information | `/checkout/passenger-info` | Seat Hold, Checkout | `/checkout`, `/trip/:tripId/seat-map` | P0 | Draft | Source-backed |
| **PAX-012** | Passenger | Checkout & Fare Breakdown | `/checkout` | Passenger Info | `/payment/:bookingId`, `/home` | P0 | Draft | Source-backed |
| **PAX-013** | Passenger | Payment Processing & Gateway | `/payment/:paymentId` | Checkout | `/payment/result`, `/checkout` | P0 | Draft | Source-backed |
| **PAX-014** | Passenger | Payment Result & Late Recovery | `/payment/result` | Payment Gateway, Webhook Trigger | `/booking-success/:bookingId`, `/checkout`, `/tickets` | P0 | Draft | Derived |
| **PAX-015** | Passenger | Booking Success & PNR | `/booking-success/:bookingId` | Payment Result | `/ticket/:ticketId`, `/home` | P0 | Draft | Source-backed |
| **PAX-016** | Passenger | My Tickets Directory | `/tickets` | Bottom Nav, Home | `/ticket/:ticketId`, `/home` | P0 | Draft | Source-backed |
| **PAX-017** | Passenger | Ticket Detail & QR Pass | `/ticket/:ticketId` | My Tickets, Booking Success, Push | `/tracking/:tripId`, `/booking/:bookingId/cancel`, `/tickets` | P0 | Draft | Source-backed |
| **PAX-018** | Passenger | Live Bus Tracking | `/tracking/:tripId` | Ticket Detail, Home Banner, Push | `/tracking/:tripId/eta-detail`, `/ticket/:ticketId` | P0 | Draft | Source-backed |
| **PAX-019** | Passenger | ETA & Stop Progression Detail | `/tracking/:tripId/eta-detail` | Live Bus Tracking | `/tracking/:tripId` | P1 | Draft | Source-backed |
| **PAX-020** | Passenger | Notification Center | `/notifications` | Home Header, Bottom Nav | `/ticket/:ticketId`, `/tracking/:tripId`, `/home` | P1 | Draft | Source-backed |
| **PAX-021** | Passenger | Booking Detail & Cancel / Refund | `/booking/:bookingId/cancel` | Ticket Detail, Booking History | `/tickets`, `/refund/:refundId/status` | P1 | Draft | Source-backed |
| **PAX-022** | Passenger | User Profile & Settings | `/profile` | Bottom Nav | `/profile/saved-places`, `/login`, `/home` | P2 | Draft | Source-backed |
| **PAX-023** | Passenger | Saved Stops & Frequent Travelers | `/profile/saved-contacts` | Profile, Passenger Info Form | `/profile`, `/checkout/passenger-info` | P2 | Draft | Source-backed |
| **PAX-024** | Passenger | Vehicle Replacement Notice | `/notice/vehicle-replacement/:incidentId` | Push Notification, In-App Banner | `/ticket/:ticketId`, `/seat-reselection` | P1 | Draft | Derived |
| **PAX-025** | Passenger | Trip Delay & Disruption Alert | `/notice/trip-delay/:tripId` | Push Notification, Tracking Banner | `/tracking/:tripId`, `/booking/:bookingId/cancel` | P1 | Draft | Derived |

---

## 2. Driver Mobile Application (`DRI-xxx`)

| ID | App | Screen Name | Route | Entry Points | Exit Points | Priority | Status | Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DRI-001** | Driver | Internal Staff Login | `/driver/login` | App Launch | `/driver/today-trips` | P0 | Draft | Source-backed |
| **DRI-002** | Driver | Today's Assigned Trips | `/driver/today-trips` | Login, App Open | `/driver/trip/:id/prestart`, `/driver/profile` | P0 | Draft | Source-backed |
| **DRI-003** | Driver | Trip Detail Pre-start | `/driver/trip/:id/prestart` | Today's Trips | `/driver/trip/:id/readiness`, `/driver/today-trips` | P0 | Draft | Source-backed |
| **DRI-004** | Driver | Readiness Checklist | `/driver/trip/:id/readiness` | Trip Detail Pre-start | `/driver/trip/:id/start-confirm`, `/driver/trip/:id/prestart` | P0 | Draft | Derived |
| **DRI-005** | Driver | Start Trip Confirmation | `/driver/trip/:id/start-confirm` | Readiness Checklist | `/driver/trip/:id/active`, `/driver/trip/:id/prestart` | P0 | Draft | Source-backed |
| **DRI-006** | Driver | Active Trip Dashboard | `/driver/trip/:id/active` | Start Trip, App Resume | `/driver/trip/:id/manifest`, `/driver/trip/:id/scan`, `/driver/trip/:id/end` | P0 | Draft | Source-backed |
| **DRI-007** | Driver | Passenger Manifest & Segment Filter | `/driver/trip/:id/manifest` | Active Trip Cockpit, Bottom Bar | `/driver/trip/:id/stop/:stopId`, `/driver/trip/:id/passenger/:ticketId` | P0 | Draft | Source-backed |
| **DRI-008** | Driver | Stop Detail & Boarding Summary | `/driver/trip/:id/stop/:stopId` | Manifest, Cockpit Next Stop Card | `/driver/trip/:id/scan`, `/driver/trip/:id/manifest` | P0 | Draft | Source-backed |
| **DRI-009** | Driver | Offline QR Boarding Scanner | `/driver/trip/:id/scan` | Active Dashboard, Stop Detail | `/driver/trip/:id/active`, `/driver/trip/:id/cod` | P0 | Draft | Source-backed |
| **DRI-010** | Driver | Manual Boarding Search | `/driver/trip/:id/manual-boarding` | Scan Screen Option, Manifest Action | `/driver/trip/:id/manifest`, `/driver/trip/:id/scan` | P1 | Draft | Source-backed |
| **DRI-011** | Driver | Mark No-Show Confirmation | `/driver/trip/:id/no-show/:ticketId` | Stop Manifest Passenger Item | `/driver/trip/:id/manifest` | P1 | Draft | Source-backed |
| **DRI-012** | Driver | COD Cash Collection & Handover | `/driver/trip/:id/cod/:ticketId` | Scan QR (COD Ticket), Manifest COD Item | `/driver/trip/:id/active`, `/driver/trip/:id/manifest` | P0 | Draft | Source-backed |
| **DRI-013** | Driver | Turn-by-Turn Route Navigation | `/driver/trip/:id/navigation` | Active Trip Cockpit Map | `/driver/trip/:id/active` | P1 | Draft | Source-backed |
| **DRI-014** | Driver | GPS & Battery Health Monitor | `/driver/trip/:id/gps-health` | Active Cockpit Status Pill, Drawer | `/driver/trip/:id/active`, `/driver/diagnostics` | P0 | Draft | Source-backed |
| **DRI-015** | Driver | Offline Sync & Outbox Center | `/driver/sync-center` | Persistent Connectivity Badge, Drawer | `/driver/trip/:id/active`, `/driver/today-trips` | P0 | Draft | Source-backed |
| **DRI-016** | Driver | Telemetry & MQTT Diagnostics | `/driver/diagnostics` | Settings, GPS Health Modal | `/driver/sync-center`, `/driver/today-trips` | P2 | Draft | Source-backed |
| **DRI-017** | Driver | End Trip & Manifest Reconciliation | `/driver/trip/:id/end` | Active Trip Header Finish CTA | `/driver/today-trips` | P0 | Draft | Source-backed |
| **DRI-018** | Driver | Shift History & Device Profile | `/driver/profile` | Bottom Nav, Drawer | `/driver/login`, `/driver/today-trips` | P2 | Draft | Source-backed |
| **DRI-019** | Driver | Incident & Delay Quick Report | `/driver/trip/:id/incident` | Active Trip Cockpit SOS / Warning Button | `/driver/trip/:id/active` | P1 | Draft | Derived |

---

## 3. Manager Operations Portal (`MGR-xxx`)

| ID | App | Screen Name | Route | Entry Points | Exit Points | Priority | Status | Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MGR-001** | Manager | Staff Login & MFA | `/ops/login` | Browser Access | `/ops/dashboard`, `/ops/radar` | P0 | Draft | Source-backed |
| **MGR-002** | Manager | Operations Overview Dashboard | `/ops/dashboard` | Main Navigation | `/ops/radar`, `/ops/trips`, `/ops/alerts` | P0 | Draft | Source-backed |
| **MGR-003** | Manager | Live Fleet Operations Radar | `/ops/radar` | Main Navigation, Dashboard Widget | `/ops/vehicle/:id/live`, `/ops/trip/:id` | P0 | Draft | Source-backed |
| **MGR-004** | Manager | Vehicle Live Telemetry Inspector | `/ops/vehicle/:id/live` | Live Radar, Vehicle Directory | `/ops/radar`, `/ops/vehicle/:id/edit` | P0 | Draft | Source-backed |
| **MGR-005** | Manager | Vehicle Fleet Directory | `/ops/vehicles` | Sidebar Nav | `/ops/vehicle/create`, `/ops/vehicle/:id` | P1 | Draft | Source-backed |
| **MGR-006** | Manager | Vehicle Create & Edit | `/ops/vehicles/new`, `/:id/edit` | Vehicle Directory | `/ops/vehicles`, `/ops/seat-layouts` | P1 | Draft | Source-backed |
| **MGR-007** | Manager | Visual Seat Layout Builder | `/ops/seat-layouts/builder` | Vehicle Edit, Layout Directory | `/ops/vehicles`, `/ops/seat-layouts` | P1 | Draft | Source-backed |
| **MGR-008** | Manager | Route & Corridor Directory | `/ops/routes` | Sidebar Nav | `/ops/route/create`, `/ops/route/:id` | P1 | Draft | Source-backed |
| **MGR-009** | Manager | Route & Geofence Stop Builder | `/ops/routes/builder` | Route Directory | `/ops/routes`, `/ops/trips/new` | P1 | Draft | Source-backed |
| **MGR-010** | Manager | Trip Schedule Directory | `/ops/trips` | Sidebar Nav | `/ops/trip/new`, `/ops/trip/:id` | P0 | Draft | Source-backed |
| **MGR-011** | Manager | Trip Dispatch & Schedule Generator | `/ops/trips/new` | Trip Directory, Dispatch Board | `/ops/trips`, `/ops/trip/:id` | P0 | Draft | Source-backed |
| **MGR-012** | Manager | Trip Master Operational Detail | `/ops/trip/:id` | Trip List, Radar, Dispatch Board | `/ops/trip/:id/seat-inventory`, `/ops/trip/:id/replace-vehicle` | P0 | Draft | Source-backed |
| **MGR-013** | Manager | Segment Seat Inventory Matrix | `/ops/trip/:id/seat-inventory` | Trip Detail, POS Screen | `/ops/trip/:id`, `/ops/booking/:id` | P0 | Draft | Source-backed |
| **MGR-014** | Manager | Daily Fleet Dispatch Board | `/ops/dispatch` | Sidebar Nav | `/ops/trip/new`, `/ops/radar` | P0 | Draft | Source-backed |
| **MGR-015** | Manager | Driver Roster Directory | `/ops/drivers` | Sidebar Nav | `/ops/driver/create`, `/ops/driver/:id` | P1 | Draft | Source-backed |
| **MGR-016** | Manager | Driver Performance & Safety Detail | `/ops/driver/:id` | Driver Directory, Trip Detail | `/ops/drivers`, `/ops/audit` | P2 | Draft | Source-backed |
| **MGR-017** | Manager | Global Booking & PNR Search | `/ops/bookings` | Sidebar Nav | `/ops/booking/:id`, `/ops/pos` | P0 | Draft | Source-backed |
| **MGR-018** | Manager | Booking Master Detail & Ledger | `/ops/booking/:id` | Booking Search, Trip Manifest | `/ops/refund/new?bookingId=:id`, `/ops/payments` | P0 | Draft | Source-backed |
| **MGR-019** | Manager | POS Counter & Hotline Search | `/ops/pos` | Sidebar Nav, Quick CTA | `/ops/pos/checkout`, `/ops/bookings` | P0 | Draft | Source-backed |
| **MGR-020** | Manager | POS Fast Seat Selection & Checkout | `/ops/pos/checkout` | POS Search | `/ops/booking/:id`, `/ops/pos` | P0 | Draft | Source-backed |
| **MGR-021** | Manager | Payment Transactions & Webhooks | `/ops/payments` | Sidebar Nav | `/ops/booking/:id`, `/ops/refunds` | P0 | Draft | Source-backed |
| **MGR-022** | Manager | Refund Processing Center | `/ops/refunds` | Sidebar Nav, Booking Detail | `/ops/booking/:id`, `/ops/payments` | P0 | Draft | Source-backed |
| **MGR-023** | Manager | Vehicle Replacement Wizard | `/ops/trip/:id/replace-vehicle` | Trip Detail Actions, Incident Alert | `/ops/trip/:id`, `/ops/radar` | P0 | Draft | Source-backed |
| **MGR-024** | Manager | Trip Delay & Operational Broadcast | `/ops/trip/:id/delay-management` | Trip Detail Actions, Incident Alert | `/ops/trip/:id`, `/ops/notifications` | P1 | Draft | Source-backed |
| **MGR-025** | Manager | Realtime Operations Alerts Feed | `/ops/alerts` | Header Bell, Sidebar Nav | `/ops/trip/:id`, `/ops/vehicle/:id/live` | P0 | Draft | Source-backed |
| **MGR-026** | Manager | Notification Campaign Engine | `/ops/notifications` | Sidebar Nav | `/ops/dashboard` | P2 | Draft | Source-backed |
| **MGR-027** | Manager | Operational & Yield Reports | `/ops/reports` | Sidebar Nav | `/ops/reports/:reportType` | P1 | Draft | Source-backed |
| **MGR-028** | Manager | Immutable Audit Logs Directory | `/ops/audit` | Sidebar Nav | `/ops/audit/:logId` | P1 | Draft | Source-backed |
| **MGR-029** | Manager | RBAC Roles & Permissions Matrix | `/ops/roles-permissions` | Settings Submenu | `/ops/settings` | P1 | Draft | Source-backed |
| **MGR-030** | Manager | System Global Configuration | `/ops/settings` | Sidebar Nav | `/ops/dashboard` | P2 | Draft | Source-backed |

---

## 4. Shared System State Screens (`SH-xxx`)

| ID | App | Screen Name | Route | Entry Points | Exit Points | Priority | Status | Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SH-001** | Shared | Session Expired & Re-authentication | `/shared/session-expired` | HTTP 401 Interceptor | App Login, Previous Screen on Refresh | P0 | Draft | Derived |
| **SH-002** | Shared | Permission Denied (403 Forbidden) | `/shared/permission-denied` | HTTP 403 Interceptor, Route Guard | Previous Screen, App Home | P0 | Draft | Derived |
| **SH-003** | Shared | Network Offline & Server Error | `/shared/network-error` | Connectivity Loss, HTTP 5xx | Auto-retry, Manual Refresh | P0 | Draft | Derived |
| **SH-004** | Shared | System Maintenance Notice | `/shared/maintenance` | HTTP 503 / Feature Flag Barrier | App Exit, Polling for Service Resumption | P1 | Draft | Derived |
| **SH-005** | Shared | Force App Version Upgrade | `/shared/version-upgrade` | App Config Handshake Barrier | App Store / Play Store URL | P0 | Draft | Derived |
