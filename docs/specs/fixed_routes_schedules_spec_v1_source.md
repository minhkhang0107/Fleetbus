# BusGo — Business Rules & Functional Specification
## Fixed Routes, Daily Schedules & Flexible Pickup/Drop-off

**Version:** 1.0  
**Scope:** Passenger App, Driver App, Manager Portal  
**Purpose:** Define business rules and expected system behavior for fixed-route bus booking with multiple intermediate stops, multiple daily departures, and optional home pickup/drop-off.

> Source text as received from the product owner on 2026-10-12, kept verbatim. The version applied to BusGo, with
> its adjustments and implementation status, is `docs/specs/fixed_routes_schedules_spec.md`.

---

# 1. Business Overview

BusGo supports bus operators running predefined routes with fixed departure schedules.

Passengers can:
- Search for trips by route, travel date, and departure/arrival points.
- Select a suitable scheduled departure.
- Choose predefined pickup/drop-off points or request home pickup/drop-off where supported.
- View the applicable fare and additional service fees.
- Book seats, pay, and receive tickets.
- Track their assigned trip when tracking is available.

Drivers can:
- View assigned trips and their stop sequences.
- View confirmed passenger pickup/drop-off information.
- Manage boarding and passenger status.
- Follow operational updates during the trip.

Managers can:
- Configure routes, stops, departure schedules, and service policies.
- Manage trip availability.
- Review home pickup/drop-off requests.
- Coordinate drivers, vehicles, and operational changes.

## 1.1 Core Principles

1. Routes are predefined and managed by the bus operator.
2. Trips follow configured departure schedules.
3. Passengers can only select valid travel segments served by the selected trip.
4. Home pickup/drop-off is an optional service, not an automatic entitlement.
5. A booking confirmation must accurately reflect the confirmed trip, passenger journey, fare, and service conditions.
6. Operational changes must be communicated to affected passengers.
7. Passenger, driver, and manager actions must follow their respective permissions.

---

# 2. Route Rules

## 2.1 Fixed Route Definition

A route consists of:
- An origin.
- A destination.
- An ordered sequence of intermediate stops.
- A set of permitted pickup and drop-off points.
- A service policy defining the supported passenger services.

Example:

Nga Son → Bim Son → Ninh Binh → Phu Ly → Hanoi

The operator determines which stops are available for pickup, drop-off, or both.

## 2.2 Valid Travel Segments

Passengers may book travel between any two stops that satisfy all of the following:
- Both stops are served by the selected trip.
- The pickup stop occurs before the drop-off stop in the direction of travel.
- Pickup and drop-off are permitted at the selected stops.
- The selected trip supports the requested journey.
- Seats and booking capacity are available for the entire journey segment.

Examples:
- Nga Son → Hanoi: allowed if supported by the trip.
- Ninh Binh → Hanoi: allowed if supported by the trip.
- Nga Son → Phu Ly: allowed if supported by the trip.
- Hanoi → Nga Son: not automatically allowed by the outbound route; a valid return-direction service must exist.

A passenger must not select a drop-off point that occurs before the pickup point along the selected trip.

## 2.3 Route Availability

- Only active routes are available for new searches.
- Temporarily suspended routes must not accept new bookings.
- Routes with no operating trips on the selected date must display an appropriate message.
- The operator may enable or disable individual stops according to operational requirements.
- Disabling a stop must not silently invalidate an already confirmed booking. Affected bookings must follow the applicable change-management policy.

## 2.4 Route Changes

When a route or stop sequence changes:
- Passengers must not be shown misleading pickup/drop-off information.
- Existing confirmed bookings must retain their agreed travel details unless a change is explicitly applied.
- If a change affects a confirmed booking, the operator must communicate the impact and available resolution.
- Any additional fare, refund, or rebooking must follow the published booking policy.

---

# 3. Schedule and Trip Rules

## 3.1 Fixed Daily Departure Times

Each route may have multiple fixed departure times per day.

Example:
- 06:00
- 08:00
- 10:00
- 14:00
- 18:00

The operator determines which departure times are offered and when bookings open or close.

The schedule may differ by route, direction, date, or operating conditions.

## 3.2 Trip Definition

A trip represents one actual departure on a specific date.

A trip is available for booking only when:
- The operator has made the trip available for sale.
- The trip is not cancelled or suspended.
- The requested journey segment is supported.
- Booking remains open.
- Sufficient capacity is available.
- Any required operational conditions are satisfied.

A configured departure time alone does not guarantee that a trip is operating or bookable.

## 3.3 Trip Search

Passengers select:
1. Origin.
2. Destination.
3. Travel date.

The system displays trips matching the selected journey and date.

Each result should show:
- Departure time.
- Estimated arrival time, when available.
- Origin and destination.
- Fare.
- Available-seat information, when supported.
- Relevant pickup/drop-off conditions.
- Trip status and any important restrictions.

Trips should normally be ordered by departure time.

## 3.4 Schedule Exceptions

Operators may:
- Cancel a departure.
- Temporarily suspend a departure.
- Add an extra departure.
- Adjust a departure time.
- Change the assigned vehicle or driver.
- Stop selling tickets before departure.

Passengers with affected confirmed bookings must be notified according to the operational policy.

## 3.5 Departure and Arrival Times

- Departure time is the planned departure time, not a guarantee that the vehicle will depart at precisely that minute.
- Arrival time is an estimate unless explicitly stated otherwise.
- Traffic, weather, intermediate stops, and home pickup services may affect actual travel time.
- Any significant delay should be communicated when the system or operator has reliable information.

---

# 4. Pickup and Drop-off Rules

## 4.1 Supported Pickup Types

The operator may support one or both of the following options.

### A. Predefined Stop

Passengers choose from the pickup and drop-off points configured by the operator.

Rules:
- Only valid stops for the selected trip may be displayed.
- The stop must support the requested action: pickup or drop-off.
- The selected journey must follow the correct stop order.
- The passenger must receive the exact stop name and address in the booking confirmation.

### B. Home Pickup or Drop-off

Passengers may request a custom address if the operator offers the service.

Rules:
- The passenger must provide a usable address or map location.
- The address must be within the operator's supported service area.
- The service must be available for the selected trip and journey.
- The operator may impose distance, timing, accessibility, or vehicle restrictions.
- An address submission does not itself confirm that the vehicle will serve that address.
- Any additional fee and confirmation requirement must be disclosed before the passenger commits to the booking.

## 4.2 Home Service Eligibility

A home pickup/drop-off request may be:
- Confirmed automatically when all configured conditions are met.
- Subject to operator review.
- Rejected when the address or requested service cannot be supported.

Possible reasons for rejection include:
- Address outside the service area.
- Inaccessible road or unsuitable vehicle access.
- Insufficient time before departure.
- Conflict with the trip's operating schedule.
- Service unavailable for the selected route or departure.
- Other operator-defined restrictions.

The passenger must receive a clear explanation and an alternative where possible, such as choosing a predefined stop.

## 4.3 Pickup/Drop-off Confirmation

For requests requiring manual approval:
- The request remains pending until the operator confirms or rejects it.
- The passenger must be informed of the pending status.
- The service must not be represented as confirmed while approval is outstanding.
- The operator must review the address, feasibility, applicable fee, and operational impact.
- Once confirmed, the passenger must receive the agreed address, fee, and pickup/drop-off instructions.

If the service cannot be confirmed, the passenger must be allowed to choose an available alternative or cancel according to the applicable policy.

## 4.4 Additional Fees

- Home pickup/drop-off fees must follow the operator's configured pricing rules.
- The passenger must see the fee before final confirmation.
- The total payable amount must include all applicable disclosed charges.
- The operator must not introduce an undisclosed surcharge after confirmation, except where the passenger explicitly requests a change and accepts the revised price.
- If an address change affects the fee, the revised amount must be disclosed and accepted before the change takes effect.

## 4.5 Pickup Time and Meeting Instructions

For predefined stops:
- Show the stop's name, address, and planned pickup time where available.
- Provide meeting instructions when necessary.

For home pickup:
- Show the confirmed address and pickup arrangement.
- Provide an estimated pickup time or pickup window when available.
- Explain any passenger requirements, such as being ready before the scheduled pickup.
- Do not imply an exact arrival time when only an estimate is available.

## 4.6 Passenger Changes to Pickup/Drop-off

Passengers may request a change before the applicable booking cutoff, subject to operator policy.

A change is permitted only if:
- The new point is supported.
- The route and travel segment remain valid.
- The service is operationally feasible.
- Any additional fee is accepted.
- Required approval is obtained.

The previous confirmed arrangement remains effective until the change is accepted and confirmed.

---

# 5. Seat Availability and Booking Rules

## 5.1 Seat Selection

- Passengers may select seats only from the available seats for their chosen trip segment.
- Seat availability must account for other confirmed bookings and active seat holds.
- A seat occupied on an overlapping segment cannot be sold to another passenger.
- A seat may be reused on a non-overlapping segment when permitted by the operator's seating and boarding policy.
- A passenger cannot confirm a seat that has become unavailable during the booking process.

## 5.2 Temporary Seat Holds

- Seat holds are temporary and expire according to the configured booking policy.
- The passenger must be informed when the hold expires, where appropriate.
- Expired holds release the seats for other passengers.
- Repeated submission must not create duplicate bookings or duplicate seat reservations.

## 5.3 Booking Confirmation

Before confirming a booking, the passenger must be shown:
- Route and selected travel segment.
- Travel date and departure time.
- Pickup and drop-off arrangements.
- Selected seats and passenger details.
- Fare and all applicable additional fees.
- Total payable amount.
- Relevant cancellation, change, and home-service conditions.

A booking must not be represented as fully confirmed when a required condition remains unresolved.

## 5.4 Booking and Payment Status

Booking status and payment status must be communicated separately where applicable.

For example, a booking awaiting payment must not be described as paid.

Payment confirmation, booking confirmation, and ticket issuance must follow the existing booking policy and payment workflow.

## 5.5 Cancellation and Refund

- Cancellation eligibility depends on the operator's published policy and the booking's current status.
- The passenger must be shown any applicable cancellation fee and refund conditions.
- Cancellation of a booking must not automatically be treated as a successful refund.
- Refund processing must be communicated separately when necessary.
- If the operator cancels a trip, affected passengers must receive the applicable rebooking or refund options.

---

# 6. Passenger App Functional Rules

## 6.1 Home Screen

The home screen should prioritize:
1. Origin and destination.
2. Travel date.
3. Search action.
4. Popular or recent routes.
5. Optional promotions.

The interface should distinguish route selection from trip selection.

Passengers should not be required to enter a custom address before seeing the available trips.

## 6.2 Route Selection

- Show supported active routes or valid origin/destination combinations.
- Filter destination choices when an origin is selected.
- Allow route reversal only when a valid reverse-direction service exists.
- Clearly indicate when no valid route is available.

## 6.3 Date Selection

- Allow selection of today, tomorrow, and other permitted travel dates.
- Prevent selection of past dates.
- Respect the operator's booking window and service calendar.
- If no trip operates on a selected date, suggest another available date when possible.

## 6.4 Search Results

Each trip card should clearly present departure time, journey, fare, and available booking information.

The passenger must be able to compare different departures without losing the selected route and date.

If no trips are available:
- Explain that no trips match the current selection.
- Allow the passenger to change the date or route.
- Do not show cancelled or unavailable trips as bookable.

## 6.5 Booking Details

The passenger must be able to review the complete journey before payment.

For home pickup/drop-off:
- Clearly distinguish requested, pending, confirmed, and rejected services.
- Show the applicable fee and approval requirements.
- Prevent ambiguous wording that suggests a pending request has already been approved.

## 6.6 Tickets and Notifications

The passenger should be able to:
- View confirmed booking details.
- Access the issued ticket or QR code when eligible.
- Review pickup/drop-off instructions.
- Receive relevant notifications about payment, trip changes, pickup approval, delays, cancellation, and refund status.
- View the latest confirmed arrangement rather than an outdated request.

---

# 7. Driver App Functional Rules

## 7.1 Assigned Trips

Drivers may view only trips assigned to them.

Trip information should include:
- Route and scheduled departure.
- Ordered stops.
- Vehicle information.
- Passenger manifest.
- Confirmed pickup/drop-off arrangements.
- Relevant operational notices.

## 7.2 Passenger Manifest

The manifest should organize passengers by pickup point or operational stop.

For each passenger, show only the information required for the driver's duties:
- Passenger identification details needed for boarding.
- Seat or ticket information.
- Pickup and drop-off.
- Booking/boarding status.
- Relevant payment or collection status.

## 7.3 Home Pickup

- Only confirmed home pickup requests should be treated as scheduled operational stops.
- The driver must be able to distinguish a fixed stop from a custom address.
- Confirmed changes must be communicated to the assigned driver.
- A driver must not independently promise an unapproved address or fee change.
- If the pickup is no longer feasible, the driver must notify the appropriate operations role.

## 7.4 Boarding and No-show

- Boarding must be validated against the correct trip and ticket.
- A passenger already marked as boarded must not be boarded a second time.
- Manual boarding must follow the operator's permission and audit policy.
- No-show handling must follow the configured timing and contact rules.
- Driver actions must not silently change payment or refund status.

## 7.5 Trip Status

Drivers must follow the permitted trip lifecycle and report operational changes through the available workflow.

A driver must not mark a trip completed before the applicable completion conditions are satisfied.

---

# 8. Manager Portal Functional Rules

## 8.1 Route Management

Authorized managers can:
- Create and maintain routes.
- Add, remove, disable, and reorder stops.
- Define permitted pickup/drop-off points.
- Configure route-specific services and restrictions.
- Review changes affecting active trips or confirmed bookings.

## 8.2 Schedule Management

Authorized managers can:
- Configure multiple departure times per day.
- Set operating dates and days of the week.
- Pause or resume a schedule.
- Add exceptional departures.
- Cancel or adjust specific departures.
- Review the trips affected by a schedule change.

The interface should clearly distinguish a recurring schedule from a specific trip on a particular date.

## 8.3 Home-Service Policy

Managers can configure:
- Whether home pickup is offered.
- Whether home drop-off is offered.
- Supported service areas.
- Eligibility restrictions.
- Additional fees.
- Automatic confirmation or manual review.
- Booking cutoff and cancellation conditions.

## 8.4 Request Review

Managers reviewing a custom address must be able to:
- Review the requested address and trip.
- Check service eligibility.
- Review applicable fees and operational feasibility.
- Confirm or reject the request.
- Provide a reason when rejecting.
- Ensure the passenger receives the decision.

## 8.5 Operational Changes

Changes to trips, vehicles, schedules, or pickup arrangements must be handled according to operational policy.

Managers should be able to identify affected passengers and ensure the appropriate notifications and follow-up actions occur.

---

# 9. Error and Exceptional Scenarios

The system must provide clear outcomes for the following situations.

### No valid route
Explain that the selected journey is unsupported and allow the passenger to change the selection.

### No trips on the selected date
Explain that no departures are available and suggest another date if possible.

### Trip becomes full
Prevent confirmation of unavailable seats and allow the passenger to select another trip or seat.

### Home address is outside the service area
Explain the restriction and offer a predefined stop if available.

### Home pickup requires approval
Show a pending status and explain that confirmation is required.

### Home pickup is rejected
Show the reason and allow an eligible alternative or cancellation under the applicable policy.

### Trip is cancelled
Notify affected passengers and provide the applicable rebooking or refund options.

### Departure time changes
Communicate the revised time and any relevant impact on pickup arrangements.

### Pickup point changes
Show the updated confirmed point and notify the passenger and assigned driver.

### Payment succeeds but booking confirmation is delayed
Avoid charging the passenger again automatically. Show an appropriate processing status and reconcile the final booking/payment outcome.

### Network failure
Explain whether the action was completed, remains pending, or needs retry. Avoid duplicate bookings and ambiguous payment outcomes.

---

# 10. Acceptance Criteria

## A. Routes

- Passengers can search only valid, active routes.
- A route supports multiple ordered intermediate stops.
- Valid origin/destination pairs can be selected on a trip.
- Invalid travel direction or stop order is rejected.
- Route changes do not silently invalidate confirmed bookings.

## B. Schedules

- Each route can offer multiple fixed departure times per day.
- Search results reflect the actual operating date and trip status.
- Cancelled or unavailable trips cannot be booked.
- Schedule exceptions are reflected in passenger-facing results.
- Time changes are communicated to affected passengers.

## C. Home Pickup and Drop-off

- Operators can enable or disable home pickup and home drop-off independently.
- Only eligible addresses can proceed.
- Manual approval is enforced when required.
- Fees and conditions are disclosed before confirmation.
- Pending requests are never represented as confirmed services.
- Confirmed pickup changes are reflected in passenger and driver information.
- Unsupported addresses receive a clear explanation and an appropriate alternative.

## D. Booking and Seats

- Booking details show the selected trip, journey segment, seats, pickup/drop-off, and total price.
- Seat availability respects overlapping travel segments.
- Unavailable seats cannot be confirmed.
- Duplicate submissions do not create duplicate bookings or charges.
- Booking, payment, cancellation, and refund statuses are presented accurately.

## E. Passenger Experience

- Passengers can search by route, date, and journey segment.
- Search results can be compared by departure time and fare.
- Passengers can choose a fixed stop or request an eligible custom address.
- The complete booking details and applicable fees are visible before confirmation.
- Relevant trip and pickup updates are communicated.

## F. Driver and Manager Operations

- Drivers can access only assigned trips.
- Driver manifests contain the latest confirmed pickup/drop-off information.
- Managers can manage routes, schedules, and home-service requests according to permissions.
- Operational changes identify affected bookings and trigger the appropriate handling.
- Boarding and no-show actions follow the configured operating rules.

## G. Security and Reliability

- Users cannot access another passenger's private booking information without authorization.
- Drivers cannot access unauthorized trips or passenger data.
- Managers can only perform permitted actions.
- Failed or retried actions do not cause duplicate bookings, charges, or boarding events.
- Passenger-facing status remains consistent with the latest confirmed operational state.

---

# 11. Out of Scope

This specification defines business rules and expected product behavior only.

It does not prescribe:
- Database tables or relationships.
- Backend architecture.
- API endpoints or payloads.
- Programming languages, frameworks, or code structure.
- Infrastructure, caching, queues, or deployment design.
- Specific map providers or geocoding implementations.

Implementation decisions must follow the existing project's architecture and technical specifications.
