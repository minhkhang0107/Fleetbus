# SPEC: Intercity Passenger Transport Platform (source, as received)

> Original text received from the product owner on 2026-10-10. Kept verbatim as the source of
> truth for traceability. The reviewed and adapted version that the codebase implements is
> `docs/specs/pickup_dropoff_spec.md`.

Version: 1.0
Status: Draft — Pending technical design
Product type: Passenger mobile app + Driver mobile app + Admin web dashboard
Primary use case: Intercity passenger transport, home pickup, fixed-stop pickup and real-time vehicle tracking.

## 1. Product Objectives

Build a multi-operator passenger transportation platform that enables:
- Passengers to find trips, book seats, select pickup/drop-off points and track vehicles.
- Drivers to manage assigned trips, view pickup points, see waiting passengers and update trip progress.
- Admins to configure transport operators, routes, stops, schedules, vehicles, drivers, bookings and operational monitoring.
- Transport operators to configure their own supported pickup/drop-off modes without hardcoding business rules.
- All clients to consume shared backend data with role-based and operator-level access control.
- Map screens to remain responsive under weak network conditions and on low-end devices.

## 2. User Roles and Permissions

### 2.1 Passenger
A passenger can:
- Register, sign in and manage their profile.
- Search available routes and scheduled trips.
- View departure time, destination, fare, available seats and supported pickup modes.
- Select a home pickup address or a predefined fixed stop.
- Select an allowed drop-off point.
- Create, view and cancel bookings according to operator policies.
- View booking confirmation and assigned trip information.
- Track the assigned vehicle while the trip is active.
- View estimated arrival time (ETA), last location update and trip status.
- Receive relevant booking and pickup notifications.
- View trip history.

Passengers must not be able to view another passenger's personal information, home address or phone number.

### 2.2 Driver
A driver can:
- Sign in and view assigned trips.
- View the trip itinerary, passenger manifest and pickup/drop-off lists.
- View passenger counts grouped by pickup point.
- View pickup locations on a map.
- Start a trip, arrive at a stop, confirm passenger boarding and complete drop-offs.
- Report no-show passengers, inaccessible pickup locations, delays and other incidents.
- Share GPS location while an authorized trip is active.
- View the last successfully synchronized trip data when temporarily offline.
- End a trip and submit a trip summary.

Drivers may only access trips assigned to them, except for explicitly authorized dispatcher or supervisor roles.

### 2.3 Admin
The platform must support two administrative scopes.

Platform Admin
- Manage transport operators and their accounts.
- Manage global settings, system policies and operator activation.
- Monitor system health and operational exceptions.
- Manage platform-wide permissions and audit logs.

Operator Admin / Dispatcher
- Manage the operator's profile, fleet and drivers.
- Configure routes, stops, service areas, schedules and fares.
- Configure allowed pickup and drop-off modes.
- Create and manage scheduled trips.
- Assign vehicles and drivers.
- Manage seat capacity, bookings and cancellations.
- Monitor live vehicles and passenger pickup status.
- Reassign a vehicle or driver when authorized.
- Review trip history, incidents and operational reports.

All operator-owned records must be scoped to the authenticated operator. Platform Admin access must be explicitly authorized and audited.

## 3. Transport Service Configuration

### 3.1 Pickup Modes
The system must support configurable pickup modes.

HOME_PICKUP
- Passenger supplies an address and map location.
- Operator defines the allowed service area.
- Operator can configure minimum lead time, service hours and additional fees.
- Backend validates that the requested location is serviceable.
- The booking stores the confirmed pickup coordinates and address snapshot.

FIXED_STOP
- Passenger chooses a predefined stop associated with the route or trip.
- Stop order and planned arrival time are defined by the operator.
- Booking is rejected if the stop is inactive or not served by the selected trip.

The architecture must allow additional pickup modes to be added later.

### 3.2 Drop-off Modes
Initial modes:
- FIXED_LOCATION: bus station, school, office or another predefined destination.
- HOME_DROPOFF: optional, enabled only for operators that support it.

Pickup and drop-off modes are independent. The operator may allow a combination only when the service configuration explicitly permits it.

### 3.3 Service Area
- Support polygon-based service areas or an equivalent geographic boundary.
- Validate pickup coordinates on the backend.
- Support operator-defined restrictions and applicable fees.
- Return a clear error when the location is outside the service area.
- Allow authorized admins to create, update and deactivate service areas.
- Do not treat straight-line distance as proof that a vehicle can access an address.

### 3.4 Route and Trip
A Route represents a reusable route definition. A Trip represents one scheduled operational run on a specific date and time.

A Trip must reference: Route; Operator; Assigned vehicle; Assigned driver; Scheduled departure and destination; Ordered stops and planned arrival times; Seat capacity and booking cutoff rules; Current operational status.

Changing a reusable route must not silently alter an already-booked trip. Trips must retain a versioned or snapshotted itinerary, with explicit handling for authorized changes.

## 4. Booking and Seat Management

### 4.1 Booking Flow
1. Passenger searches for a route or destination.
2. Passenger selects a scheduled trip.
3. System displays fare, available capacity and supported pickup/drop-off options.
4. Passenger selects the pickup and drop-off points.
5. Backend validates capacity, service area, stop availability and booking rules.
6. System creates a booking with a unique identifier.
7. Booking confirmation is returned to the passenger.
8. The booking becomes part of the assigned driver's manifest.

### 4.2 Booking Status
Initial booking statuses: PENDING (if confirmation or payment is required), CONFIRMED, CANCELLED, COMPLETED, NO_SHOW.

Use explicit, validated state transitions. A cancellation must not release capacity twice or alter a completed trip. If payment is introduced, define payment status separately from booking status.

### 4.3 Seat Capacity
- A booking must not exceed available capacity.
- Capacity checks and reservation updates must be atomic to prevent concurrent overbooking.
- Seat allocation must account for passengers boarding and leaving at different stops when the operator permits seat reuse.
- If seat selection is not required for the MVP, track passenger capacity first and defer individual seat assignment.

## 5. Driver Operations

### 5.1 Trip Lifecycle
Recommended trip states: SCHEDULED, BOARDING, IN_PROGRESS, COMPLETED, CANCELLED.
Separate stop-level statuses: UPCOMING, APPROACHING, ARRIVED, COMPLETED, SKIPPED.
The backend must validate every state transition.

### 5.2 Pickup List
Each stop must display: stop name or pickup address; planned arrival time; current ETA when available; number of confirmed passengers; number boarded; number cancelled or otherwise excluded from pickup; pickup status and relevant operational alerts.
Drivers must be able to open a stop to view only the passenger details required for the pickup.

### 5.3 Boarding
- Driver marks arrival at the stop.
- Driver confirms each passenger or updates the boarded count according to the operator's chosen workflow.
- The backend prevents duplicate boarding events.
- A passenger who does not show up can be marked NO_SHOW after the configured policy permits it.
- All actions include actor ID, timestamp and trip ID.
- Manual corrections must be audited.

### 5.4 Route Changes
The system must distinguish planned routes from actual vehicle movement.
- GPS deviation can trigger a warning.
- A dispatcher can approve a route change.
- Route changes must not silently invalidate existing bookings.
- Affected passengers should receive notifications when their pickup or drop-off arrangements change.

## 6. Real-Time Vehicle Tracking

### 6.1 GPS Updates
The driver client sends location updates only when authorized and operationally necessary. Each update should include: trip ID and vehicle ID; latitude and longitude; timestamp; accuracy; speed and heading when available; sequence number or another mechanism for rejecting stale updates. The backend must validate authorization and data freshness.

### 6.2 Tracking Visibility
- Passengers can track only the trip associated with their booking.
- Drivers can see their assigned trip.
- Operator Admins can monitor trips belonging to their operator.
- Platform-wide access requires explicit permission.
- Tracking must stop when the trip ends, is cancelled or otherwise becomes inactive under policy.

### 6.3 ETA
ETA should use routing estimates when available, adjusted for upcoming stops and expected dwell time. The API should return: estimated arrival time; ETA calculation timestamp; last vehicle location timestamp; data freshness or confidence state. If GPS data becomes stale, the client must show a tracking warning rather than presenting an outdated ETA as current.

### 6.4 Reconnection
- Buffer a bounded number of GPS events locally while offline.
- Upload buffered events in order after reconnection.
- Do not replay stale positions as if they were current.
- Use sequence numbers or timestamps to prevent older events overwriting newer positions.
- Notify the UI when live tracking is unavailable.

## 7. Map Performance Requirements

### 7.1 Passenger Map
Default layers: current vehicle; selected pickup point; relevant route; destination when useful. Do not load unrelated passengers, vehicles or operator-wide stop inventories.

### 7.2 Driver Map
Default layers: current vehicle location; active route; remaining pickup and drop-off stops; passenger count grouped by stop. Provide a synchronized list view as an alternative to the map.

### 7.3 Admin Map
Show vehicles relevant to the selected operator and time range; use clustering when many markers are visible; load trip details on selection; filter by trip status, vehicle and route; avoid rendering every passenger marker by default.

### 7.4 Performance Techniques
Request only the geographic and trip data needed by the current screen; use marker clustering and viewport-based loading where appropriate; update only changed vehicle positions and trip states; avoid recalculating the full route for every GPS update; debounce address searches and throttle routing requests; cache eligible route and stop data with explicit expiry and invalidation rules; follow map-provider licensing and tile caching restrictions; use lightweight marker assets and limit animation; provide loading, error, offline and stale-data states; avoid full-screen re-rendering when only GPS coordinates change.

## 8. Notifications
Initial notification events: booking confirmed or cancelled; driver assigned or changed; vehicle approaching the pickup point; vehicle arrived at the pickup point; pickup time significantly delayed; pickup or drop-off point changed; trip cancelled or completed.

Notifications must be idempotent, avoid duplicate delivery where possible and respect user notification preferences. A configurable proximity threshold may trigger an approaching notification. The trigger must consider ETA freshness, not distance alone.

## 9. Core Data Model
Recommended entities: User; Role / Permission; Operator; Vehicle; DriverProfile; PassengerProfile; Route; RouteVersion; Stop; ServiceArea; ScheduledTrip; TripStop; Booking; BookingPassenger (if one booking can contain multiple passengers); BoardingEvent; VehicleLocation; Notification; Incident; AuditLog.

Key relationships: Operator owns routes, vehicles and operator-scoped users. Route has ordered stops and versioned configuration. ScheduledTrip references a route version and has its own dated itinerary. ScheduledTrip references one assigned vehicle and driver, subject to operational reassignment. Booking references a trip, passenger/contact information and confirmed pickup/drop-off snapshots. TripStop represents a stop instance within a specific trip. BoardingEvent records actual boarding and drop-off events. VehicleLocation belongs to an authorized vehicle/trip tracking session.

Use unique IDs, foreign keys, appropriate indexes and timestamps. Define deletion and retention policies before storing location history or personal addresses.

## 10. API and Real-Time Communication
The exact API style should follow the existing project architecture. Required API capabilities: authentication and profile management; operator and fleet management; route, stop, service-area and schedule configuration; trip search and availability; booking creation, retrieval and cancellation; driver manifest and stop-level passenger counts; trip state transitions and boarding events; vehicle location ingestion and authorized location queries; ETA calculation or routing-provider integration; notification delivery and operational incident reporting.

REST or equivalent request/response APIs can handle configuration and bookings. WebSocket, server-sent events or an equivalent real-time channel can distribute location and trip-state changes. The system must support reconnecting clients, authorization on subscriptions and fallback polling with backoff when real-time connectivity is unavailable.

## 11. Security and Privacy
Authenticate all protected endpoints. Enforce role-based and operator-level access on the backend. Validate ownership for every trip, booking, vehicle and location request. Do not rely on client-side role checks alone. Protect personal addresses, phone numbers and passenger manifests. Collect location only for the authorized operational purpose. Apply TLS and appropriate storage protection. Record administrative changes and sensitive operational actions. Apply rate limits to authentication, booking and location endpoints. Define retention and deletion rules for GPS history and personal data. Prevent passengers from discovering another passenger's home pickup location.

## 12. Admin Configuration
Operator Admin must be able to configure: supported pickup and drop-off modes; service areas and pickup restrictions; fixed stops and stop order; route schedules and trip calendars; fare rules and additional pickup fees; passenger capacity and booking cutoffs; cancellation and no-show policies; ETA notification thresholds; GPS update policy where supported; driver and vehicle assignments. Configuration changes must be validated, audited and applied predictably to existing trips.

## 13. MVP Scope
Include in MVP: authentication and role permissions; operator, driver and vehicle management; route and fixed-stop configuration; home pickup service-area configuration; trip schedules and basic seat capacity; booking and cancellation; driver trip manifest and pickup counts; GPS tracking for active trips; passenger map with vehicle position and basic ETA; driver map with active stops; basic notifications; admin operational dashboard; map loading, stale GPS and offline fallback states.

Defer until later: online payments and refunds; dynamic pricing and promotions; automatic route optimization across many home pickups; advanced traffic prediction and historical ETA machine learning; seat selection and seat reuse across multiple segments; customer ratings and loyalty programs; complex multi-leg trips and ticket reselling; advanced fleet analytics.

## 14. Acceptance Criteria
1. An operator can enable HOME_PICKUP, FIXED_STOP or both independently.
2. A passenger cannot book a pickup outside the configured service area.
3. A passenger cannot book a stop not served by the selected trip.
4. Concurrent bookings cannot exceed available capacity.
5. A confirmed booking appears in the correct driver's manifest.
6. The driver sees passenger counts grouped by pickup stop.
7. A passenger can view the assigned vehicle only for an authorized booking.
8. A new GPS update is reflected in the relevant clients without requiring a full screen refresh.
9. Stale GPS data is clearly distinguished from live tracking.
10. Duplicate boarding events and invalid trip-state transitions are rejected.
11. Offline clients recover without overwriting newer data with stale events.
12. Admin changes are restricted to the appropriate operator scope.
13. Map layers can be enabled or disabled independently.
14. Map screens remain usable through a list fallback when map data cannot load.
15. Sensitive passenger details are not exposed to unauthorized users.
16. All critical booking, assignment and trip-state transitions are auditable.

## 15. Implementation Workflow
Before coding: inspect the existing repository, framework, architecture and coding conventions; identify authentication, database, API, navigation and state-management implementations already present; map existing functionality to this specification; identify missing functionality, schema changes and migration risks; propose a phased implementation plan with dependencies and tests; confirm the map provider, real-time communication strategy and location permissions; implement incrementally, preserving existing behavior; run existing tests and add tests for the new business rules; document environment configuration, external service credentials and deployment requirements.

Do not recreate the project, replace its framework or introduce duplicate infrastructure unless an explicit technical justification is approved.

## 16. Definition of Done
A feature is complete only when: its UI, backend validation and persistence work together; authorization and operator isolation are tested; loading, empty, error, offline and stale-data states are handled; unit and integration tests cover critical business rules; relevant regression tests pass; database migrations and rollback considerations are documented; logging and operational errors are actionable; the implementation is documented and reviewed against the acceptance criteria.
