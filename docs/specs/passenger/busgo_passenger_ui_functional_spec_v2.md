# BusGo — UI & Functional Specification
## Passenger App

**Version:** 2.0 — Taste-enhanced
**Basis:** BusGo SRS & System Architecture v2.0 + UI/Functional Specification v1.0
**Purpose:** Implementation-ready UI/functional specification dedicated to the Passenger product team.

> This document is intentionally self-contained: it includes the app-specific screens first, followed by the shared UI/component, API, realtime, state, security, analytics, testing, implementation and Definition of Done sections relevant to the product.


# TASTE-SKILL VISUAL DESIGN ADDENDUM

> Design direction is derived from the current Taste Skill guidance and adapted for a real multi-step transportation product. Taste Skill explicitly targets frontend visual quality and its mobile skill emphasizes app-native hierarchy, safe areas, readable type, coherent multi-screen consistency, controlled palettes, and avoiding generic card-heavy UI. Because this product is a transactional/operational system rather than a landing page, these principles are used as design constraints rather than copied literally.

## 1. Design Read

**BusGo is a trust-first transportation product with three distinct audiences.** The visual language must be recognizable as one brand while intentionally changing density and interaction emphasis by surface:

- **Passenger:** premium consumer, calm, reassuring, fast decisions.
- **Driver:** operational, glanceable, high-contrast, low cognitive load, safe while moving.
- **Manager:** enterprise operations cockpit, information-dense but not visually noisy.

The design should avoid generic “AI dashboard” styling, purple/blue startup gradients, excessive glassmorphism, excessive pills, nested cards, decorative charts with no operational meaning, and inconsistent screen-to-screen visual systems.

## 2. Design Dials

| Product | DESIGN_VARIANCE | MOTION_INTENSITY | VISUAL_DENSITY | Primary mode |
|---|---:|---:|---:|---|
| Passenger | 7 | 5 | 3 | Cross-platform premium consumer |
| Driver | 4 | 3 | 6 | Android-native operational |
| Manager | 4 | 3 | 8 | Enterprise operations |

These values are product-level defaults. Individual screens may override them when safety, accessibility, or task urgency requires.

## 3. Brand Character

BusGo should feel:

- dependable rather than flashy;
- modern rather than futuristic;
- spatial rather than card-stacked;
- human rather than corporate-generic;
- operationally precise where money, seats, GPS and status are involved.

Use **one dominant brand accent** plus neutral surfaces. Status colors are reserved strictly for semantic states such as success, warning, error and live telemetry.

## 4. Typography

Recommended hierarchy:

- Display: expressive modern sans, used sparingly for passenger discovery moments.
- Navigation / headings: strong sans with compact tracking.
- Body: highly readable sans.
- Numeric telemetry: tabular or monospaced numerals when comparing values such as ETA, speed, distance or trip ID.
- Do not use more than two font families.
- Avoid decorative serif treatment; product screens should remain operational and readable.
- Minimum body size should remain comfortable at normal phone viewing distance. Manager tables may use a smaller data size, but never below the accessibility baseline defined by the product team.

Suggested family: **Geist + Geist Mono** for web; for Flutter use the same visual characteristics with a legally deployable sans/mono pairing available to the application.

## 5. Color Tokens

Define semantic tokens instead of screen-specific colors:

```text
brand.primary
brand.primaryContainer
surface.base
surface.elevated
surface.subtle
text.primary
text.secondary
text.tertiary
border.subtle
status.success
status.warning
status.error
status.info
live.vehicle
seat.available
seat.selected
seat.held
seat.booked
seat.blocked
```

Rules:

- No gradient as a substitute for hierarchy.
- No colored card background for every component.
- Status colors must never be the only visual distinction; pair with icon/text where practical.
- Seat colors must remain distinguishable under color-vision deficiencies.
- Dark mode, when implemented, must use dedicated surface tokens rather than simply inverting the light theme.

## 6. Spacing & Layout

Use a 4pt base grid with an 8pt rhythm for primary spacing:

```text
4 / 8 / 12 / 16 / 24 / 32 / 48
```

Use larger spacing for section transitions and smaller spacing only for tightly related metadata.

Avoid arbitrary per-screen margins. All apps must expose shared spacing tokens.

Passenger and Driver mobile content should respect safe areas. Manager uses a fixed navigation rail/sidebar plus fluid content with a maximum readable content width per page.

## 7. Surface Language

Prefer direct surfaces over nested cards.

Good:

```text
page
 ├── section
 ├── section
 └── bottom/action bar
```

Avoid:

```text
page
 └── card
      └── card
           └── card
                └── tiny metadata pills
```

Cards are reserved for meaningful grouping: trip summary, ticket, vehicle, alert, payment summary or a clearly bounded operational unit.

## 8. Navigation

Passenger:

- Bottom navigation with 4–5 primary destinations.
- Search should be the strongest action, not necessarily a tab.
- Ticket/tracking must be reachable within one or two taps from Home.

Driver:

- Home/Today, Active Trip, Manifest, More.
- Active Trip becomes the dominant destination after trip start.
- Do not hide safety-critical status inside a menu.

Manager:

- Left sidebar/rail for major domains.
- Persistent contextual filters at page level.
- Deep entities use breadcrumbs and side panels rather than opening many browser tabs.

## 9. Motion

Motion communicates state; it does not decorate the interface.

Use:

- seat state transition when a hold is acquired/released;
- subtle marker interpolation between GPS points;
- panel/sheet transitions;
- skeleton-to-content transitions;
- toast/banner appearance.

Do not use:

- perpetual animations for attention;
- exaggerated page transitions;
- animated numbers when they have no operational meaning;
- moving controls that can interfere with a driver reading while driving.

All motion must honor reduced-motion preferences.

## 10. Mobile Screen Composition Rules

Every Passenger/Driver screen must explicitly define:

1. safe-area behavior;
2. top app bar/title region;
3. primary content focus;
4. primary CTA;
5. secondary action hierarchy;
6. bottom action behavior;
7. loading/empty/error states;
8. keyboard behavior where forms exist;
9. accessibility semantics;
10. portrait/landscape decision where relevant.

The first viewport must communicate the purpose of the screen immediately.

## 11. Maps & Tracking Visual Rules

Map is content, not decoration.

Passenger tracking:

- vehicle marker is the primary visual object;
- pickup point is always visible;
- route is visually subordinate to current vehicle position;
- stale tracking must be obvious;
- ETA is presented as the main numeric result outside the map.

Manager radar:

- fleet markers must remain legible at operational zoom levels;
- alerts must be grouped by severity;
- selecting a vehicle opens contextual details without losing map context;
- the map must not be covered by giant modal dialogs for routine inspection.

## 12. Seat Map Visual Rules

Seat map is a functional visualization, not a decorative floor plan.

Every seat has:

- stable code;
- state;
- selected/held relationship;
- optional price modifier;
- accessibility metadata where applicable.

The legend must be persistent or one interaction away.

Segment awareness must be reflected in copy:

> “Ghế A01 — Trống từ Phủ Lý → Thanh Hóa”

rather than simply “Available”.

When a seat becomes unavailable in realtime, animate only the affected seat and preserve the user's current viewport.

## 13. Forms

Forms should be short, grouped semantically and validated inline.

Rules:

- Never use placeholder text as the only field label.
- Show formatting examples only when useful.
- Keep destructive actions visually distinct and confirm only when the action is genuinely consequential.
- Prefer bottom sheets on mobile for secondary selection and full-screen flow for payment/identity forms.

## 14. Tables and Dense Operations UI

Manager tables should use strong column hierarchy rather than colored cells everywhere.

Recommended:

- 1 primary column;
- 2–4 supporting columns;
- right-aligned numeric values;
- sticky table header;
- row hover/selection state;
- inline status with icon + label;
- bulk actions above the table;
- column visibility control only where the dataset genuinely requires it.

Do not turn every row into a collection of pills.

## 15. Empty / Loading / Error / Offline States

Every screen spec must define four baseline states:

```text
Loading
Success
Empty
Error
```

Driver-specific screens add:

```text
Offline
GPS degraded
Permission missing
Syncing
Sync failed
```

Passenger tracking adds:

```text
Live
Stale
Trip not started
Trip completed
```

Manager operations adds:

```text
Live
Partial data
Telemetry stale
Provider unavailable
Permission denied
```

## 16. Anti-Slop Acceptance Rules

A screen is not approved when:

- all sections are the same card shape;
- every action is a pill button;
- every status is a colored badge;
- a map is used only as a decorative background;
- content is centered by default despite a task-oriented information hierarchy;
- typography has no meaningful scale contrast;
- there are multiple competing primary CTAs;
- animations call attention to themselves rather than to state changes;
- the UI looks like a generic SaaS template after the product copy is removed.

A screen is approved when its hierarchy can still be understood in grayscale, the primary task is obvious, repeated UI patterns are consistent, and the layout feels specific to transportation operations.

## 17. Screen-Level Design Brief Template

Every screen in the product documents should use this expanded template:

```text
SCREEN ID
Purpose
Entry points
Exit points
Primary user goal
Primary CTA
Secondary actions
Navigation context
Design Read
Design Dials override (if any)
Layout composition
Component inventory
Typography hierarchy
Spacing hierarchy
Color/semantic state usage
Motion
Loading state
Empty state
Error state
Offline/degraded state
Accessibility
Analytics events
API dependencies
Realtime dependencies
Acceptance criteria
```

## 18. Cross-App Visual Consistency

The three products share:

- brand accent logic;
- semantic status colors;
- typography principles;
- spacing tokens;
- icon family philosophy;
- corner-radius language;
- elevation/shadow restraint;
- illustration/photo treatment;
- wording conventions.

They intentionally differ in density, navigation and action prominence because their contexts differ.

## 19. Image / Reference Board Guidance

When design reference images are produced, use the Taste Skill mobile image direction for Passenger/Driver concepts: app-native safe areas, readable copy, coherent multi-screen system, restrained palette, clean device framing and logical flow. Generate separate screens rather than cropping a dense collage when typography or component detail needs review.

For Manager, produce raw desktop frames or full-width browser compositions rather than mobile mockups. The manager product should read as an operations workstation.

## 20. Implementation Mapping

The visual system must be encoded as reusable tokens/components, not repeated per screen.

Flutter:

```text
BusGoTheme
BusGoSpacing
BusGoColors
BusGoTypography
BusGoRadii
BusGoElevation
BusGoIconography
BusGoMotion
```

React/Next.js Manager:

```text
Design tokens
  ↓
Primitive components
  ↓
Operational components
  ↓
Domain components
  ↓
Screens
```

The design system should make it difficult for a feature team to accidentally invent a new button, card, badge, radius or shadow language.

## 21. Reference

Taste Skill is used as visual-design input. Its current repository describes the project as an anti-slop frontend framework and provides distinct skills for frontend taste, mobile image generation and other directions. The current mobile guidance emphasizes app-native hierarchy, safe-area awareness, readable typography, controlled palettes, multi-screen consistency and logical flows. 

Reference: https://github.com/Leonxlnx/taste-skill

---


## Taste Profile — Passenger

**Design Read:** Cross-platform premium consumer transport app: calm, spatial, trustworthy, quick to scan.

**Screen bias:** airy layouts, large route/ETA hierarchy, minimal chrome, one strong CTA per step. Avoid dashboard-like density.

**Preferred composition:** route + trip identity first, actionable seat/payment controls second, secondary metadata progressively disclosed.

# PART A — PASSENGER APP

# 3. Passenger App — Information Architecture

## Bottom Navigation

```text
Home
Search / Trips
Tickets
Notifications
Profile
```

Có thể hiển thị Search như primary tab hoặc action lớn ở Home.

## Global flows

```text
Launch
  ↓
Auth / Session restore
  ↓
Home
  ├── Search Trip
  ├── Upcoming Ticket
  ├── Live Tracking
  └── Profile
```

---

# 4. PAS-01 Splash / App Initialization

## Mục đích

Khởi tạo app, restore session, load remote configuration và xác định route khởi đầu.

## UI

- App logo.
- Version.
- Loading indicator nếu initialization > threshold.

## Logic

1. Kiểm tra access token.
2. Kiểm tra refresh token hợp lệ.
3. Refresh token nếu cần.
4. Load minimal configuration.
5. Kiểm tra pending local booking/payment state.
6. Navigate:
   - Authenticated → Home.
   - Not authenticated → Login.

## Error

Nếu config unavailable:

- Nếu có cached config và product cho phép → vào app degraded mode.
- Nếu không → retry/friendly error.

---

# 5. PAS-02 Login

## UI

- Phone number input.
- Country code.
- Continue button.
- Terms/privacy links.

## Validation

- Phone bắt buộc.
- Format phone hợp lệ.
- Disable Continue khi invalid.

## Action

`POST /auth/otp/request`

Response thành công → OTP screen.

## Error states

- Invalid number.
- Too many OTP requests.
- Network unavailable.
- Service unavailable.

Nếu rate limit → hiển thị thời gian có thể request lại.

---

# 6. PAS-03 OTP Verification

## UI

- 6-digit OTP input.
- Countdown resend.
- Resend button.
- Change phone.

## Behavior

- Auto focus.
- Paste OTP nếu OS cho phép.
- Auto-submit khi đủ digits.

`POST /auth/otp/verify`

Success:

- Store access token securely.
- Store refresh token securely.
- Load profile.
- Navigate Home.

Failure:

- Wrong OTP.
- OTP expired.
- Too many attempts.

---

# 7. PAS-04 Home

## Mục đích

Điểm vào chính để bắt đầu search hoặc tiếp tục trip đang hoạt động.

## Layout

### Header

- Greeting / passenger name.
- Notification icon.

### Search card

Fields:

- From.
- To.
- Date.
- Number of passengers.

CTA: `Tìm chuyến`.

### Upcoming trip card

Nếu có booking upcoming:

- PNR.
- Trip date/time.
- Pickup.
- Dropoff.
- Seat.
- Vehicle.
- Countdown.
- `Theo dõi xe` khi tracking available.

### Recent actions

- My tickets.
- My bookings.
- Saved pickup/dropoff.

## Empty state

Không có booking upcoming → CTA `Tìm chuyến`.

---

# 8. PAS-05 Location / Stop Picker

## Mục đích

Chọn origin/destination là city, station hoặc route stop.

## UI

- Search input.
- Recent locations.
- Popular locations.
- Matching stops.
- Map optional.

## Rules

Passenger có thể chọn sub-route.

Ví dụ:

```text
Hanoi → Phu Ly → Ninh Binh → Thanh Hoa → Vinh
```

Có thể chọn:

```text
Phu Ly → Thanh Hoa
```

## Validation

- Origin != Destination.
- Origin order < Destination order nếu cùng route.
- Chỉ hiển thị stops pickup/dropoff enabled.

---

# 9. PAS-06 Search Results

## Mục đích

Hiển thị trips match với segment yêu cầu.

## Filter

- Departure date.
- Departure time range.
- Vehicle type.
- Price range.
- Available seats.
- Pickup stop.
- Dropoff stop.

## Trip card

Mỗi card hiển thị:

- Origin / destination.
- Departure time.
- Estimated arrival.
- Vehicle type.
- Segment fare.
- Available seat count cho segment đang tìm.
- Pickup/dropoff.
- Badge: `Còn nhiều`, `Sắp hết`, `Hết chỗ`.

## Sort

- Sớm nhất.
- Giá thấp nhất.
- Thời gian đi ngắn nhất.

## Loading

Skeleton cards.

## Empty

`Không tìm thấy chuyến phù hợp` + CTA sửa bộ lọc.

## Important

Availability phải là availability của **requested segment**, không phải toàn trip.

---

# 10. PAS-07 Trip Detail

## Layout

### Header

- Back.
- Trip code.
- Share optional.

### Route timeline

```text
Origin
  │
Stop 1
  │
Stop 2
  │
Destination
```

Highlight pickup/dropoff đã chọn.

### Trip information

- Departure.
- ETA arrival.
- Vehicle type.
- Amenities nếu configured.
- Segment duration.
- Segment fare.

### Seat CTA

`Chọn ghế`.

## Rules

Không hiển thị seat availability nếu chưa có pickup/dropoff hợp lệ.

Nếu trip đổi status:

- `CANCELLED` → disable booking, show cancellation.
- `DELAYED` → show updated timing.
- `VEHICLE_REPLACEMENT_PENDING` → hide uncertain vehicle seat data hoặc show controlled status.

---

# 11. PAS-08 Seat Map

## Mục đích

Màn hình quan trọng nhất của Passenger App.

## Header

- Trip.
- Pickup → Dropoff.
- Remaining hold timer nếu đang giữ.

## Seat legend

```text
Available
My hold
Held by other
Booked
Blocked
Maintenance
```

Không dùng màu đơn độc; mỗi state có label/icon/tooltip.

## Seat rendering

Seat layout được lấy từ `SeatLayoutVersion` snapshot của trip.

Hỗ trợ:

- Nhiều tầng.
- Cabin.
- Ghế đôi.
- Limousine.
- Stair.
- Door.
- Driver area.
- Blocked area.

## Segment dependency

API:

`GET /trips/{trip_id}/seat-map?pickup_stop_id=...&dropoff_stop_id=...`

Server trả state theo requested segment.

## Seat tap

Tap AVAILABLE:

- Select locally.
- Call seat hold when user confirms or product strategy requires immediate hold.

Tap LOCKED_BY_OTHER:

- Không cho select.
- Tooltip `Đang có người giữ`.

Tap BOOKED:

- `Đã được đặt cho chặng trùng với lựa chọn của bạn.`

Tap BLOCKED/MAINTENANCE:

- Không tương tác.

## Multi-seat

- Hiển thị selected count.
- Total provisional amount.
- `Tiếp tục`.

Multi-seat hold phải atomic: nếu một seat fail thì toàn bộ request fail.

## Realtime

Event:

- `SEAT_HOLD_CREATED`
- `SEAT_HOLD_EXPIRED`
- `SEAT_HOLD_CANCELLED`
- `SEAT_BOOKED`
- `SEAT_RELEASED`

Client phải xử lý event version/order.

## Conflict

Nếu người khác vừa giữ seat:

- Animate/refresh state.
- Nếu user đang tap seat vừa đổi state → show `Ghế vừa được người khác chọn`.

---

# 12. PAS-09 Seat Hold Confirmation

## UI

- Selected seats.
- Segment.
- Passenger list.
- Hold expiration.
- Total price.
- CTA `Tiếp tục thanh toán`.

## Timer

10 phút theo business hold.

Timer hiển thị:

```text
09:58
```

Timer frontend chỉ là UX; server `hold_expires_at` là authoritative.

## Expired

Nếu hold expired:

- Disable payment.
- Show modal.
- Refresh seat map.

---

# 13. PAS-10 Passenger Information

## Trường

Mỗi booking item:

- Passenger name.
- Passenger phone.

Optional:

- Saved contact.

## Rules

- Một user có thể đặt cho nhiều người.
- Mỗi seat tương ứng một booking item.
- Validate số lượng passenger = số lượng seats theo policy.

## Actions

- Save contact.
- Continue.

---

# 14. PAS-11 Checkout

## Sections

### Trip summary

- Trip.
- Pickup/dropoff.
- Date/time.
- Vehicle.

### Passenger summary

### Seats

### Price breakdown

```text
Segment fare
+ surcharge
+ booking fee
- promotion
----------------
Total
```

Giá đã snapshot phải được server trả và không tự tính lại bằng client.

### Payment method

- VietQR/Napas247.
- MoMo.
- ZaloPay.
- Card/ATM gateway.
- COD nếu trip/method cho phép.

## CTA

`Thanh toán`

## Idempotency

Mỗi create-payment request phải có client-generated idempotency key; retry cùng key không tạo duplicate payment.

---

# 15. PAS-12 Payment Processing

## Online payment

States UI:

```text
Preparing payment
↓
Waiting provider
↓
Processing
↓
Success / Failed / Expired
```

## Important behavior

Nếu frontend timeout:

**Không hiển thị `Thanh toán thất bại` nếu backend chưa xác định payment failed.**

Thay vào đó:

`Đang kiểm tra trạng thái thanh toán...`

Có CTA `Kiểm tra lại`.

## Success

- Booking PAID.
- Ticket ISSUED.
- Navigate ticket success.

## Failure

- Show provider-safe message.
- Keep booking only if business hold still valid.
- Allow retry payment if allowed.

---

# 16. PAS-13 Booking Success

## UI

- Success icon.
- PNR.
- Ticket code.
- Trip summary.
- Seats.
- Payment status.

CTA:

- `Xem vé`.
- `Theo dõi chuyến` khi eligible.
- `Về trang chủ`.

## Share

Cho phép share ticket information nhưng không expose secret QR signing material.

---

# 17. PAS-14 My Tickets

## Tabs

- Upcoming.
- Active.
- Completed.
- Cancelled.

## Ticket card

- PNR.
- Date.
- Route.
- Seat.
- Pickup/dropoff.
- Ticket status.
- Tracking availability.

Tap → Ticket detail.

---

# 18. PAS-15 Ticket Detail / QR

## UI

### QR

- Large QR.
- Brightness helper.
- QR status.

### Ticket information

- Ticket code.
- PNR.
- Passenger.
- Phone masked where appropriate.
- Vehicle plate.
- Pickup.
- Dropoff.
- Seat.
- Scheduled time.
- Current trip status.

### Boarding state

```text
WAITING
APPROACHING
BOARDED
NO_SHOW
COMPLETED
```

Không expose HMAC secret hoặc internal QR fields.

---

# 19. PAS-16 Live Tracking

## Eligibility

Chỉ cho phép tracking nếu:

- User có ticket hợp lệ cho trip.
- Trip đang SCHEDULED/ACTIVE theo product policy.

## Layout

### Map

- Vehicle marker.
- Vehicle bearing.
- Route polyline.
- Pickup marker.
- Relevant stops.

### Bottom sheet

- Vehicle plate.
- Speed.
- Distance to pickup.
- ETA.
- Last updated.
- Connection state.

## Realtime states

`LIVE`

```text
Cập nhật 3 sec-ish
```

`STALE`

```text
Không có fresh telemetry vượt threshold
```

`OFFLINE`

```text
Không có realtime channel
```

## Reconnect

1. WebSocket reconnect.
2. GET tracking snapshot.
3. Apply snapshot.
4. Resume events.

## Local marker animation

Được phép animate giữa các points để UX mượt, nhưng không được coi animation là actual GPS data.

---

# 20. PAS-17 ETA Detail

Có thể mở từ tracking bottom sheet.

## Hiển thị

- ETA pickup.
- Estimated arrival time.
- Remaining distance.
- Confidence indicator.
- Last calculation time.

## Confidence

Ví dụ:

```text
Cao
Trung bình
Thấp
```

Không nhất thiết expose numeric `0.91` cho passenger.

## ETA changed

Nếu ETA thay đổi lớn theo policy:

- Show non-blocking banner.
- Trigger notification nếu cần.

---

# 21. PAS-18 Notifications

## Categories

- Booking.
- Payment.
- Ticket.
- Tracking.
- Delay.
- Cancellation.
- Vehicle replacement.
- Refund.

## List item

- Title.
- Short body.
- Timestamp.
- Read/unread.

## Tap behavior

Deep link đến resource tương ứng.

---

# 22. PAS-19 Booking Detail / Cancel

## Booking detail

- Booking status.
- Ticket list.
- Payment.
- Trip.
- Price breakdown.
- Cancellation eligibility.

## Cancel

Hiển thị:

- Chính sách hoàn tiền.
- Estimated refund.
- Cancellation fee.
- Refund method.

Confirmation required.

## State

```text
CANCEL_REQUESTED
↓
REFUNDING
↓
REFUNDED
```

UI không tự xác nhận refunded chỉ vì request cancel thành công.

---

# 23. PAS-20 Profile

## Sections

- Name.
- Phone.
- Email.
- Saved stops.
- Passenger contacts.
- Notification settings.
- Privacy.
- Logout.

---

# 24. PAS-21 Saved Stops / People

## Saved stops

- Name.
- Address/coordinates.
- Common pickup/dropoff.

## People traveling on behalf

- Name.
- Phone.
- Optional note.

Không lưu secret/payment credential trong profile contacts.

---

# 25. Passenger App — Failure Matrix

| Scenario | UI | Action |
|---|---|---|
| API offline | Offline banner | Retry |
| WebSocket down | Reconnecting | REST snapshot/polling |
| Seat conflict | Inline/modal | Refresh seat |
| Hold expired | Modal | Reopen seat map |
| Payment timeout | Pending check | Query payment |
| Trip cancelled | Blocking status | View alternatives/refund |
| Vehicle replacement | Notice | Recheck ticket/seat mapping |
| Stale GPS | Stale badge | Continue polling / retry |

---


# SHARED PRODUCT CONTRACTS

# PART D — COMMON COMPONENT SPEC

# 78. Seat Component

## Props concept

```text
seatCode
seatType
deck
state
segmentAvailability
lockedUntil
accessible
```

## Visual states

```text
AVAILABLE
LOCKED_BY_ME
LOCKED_BY_OTHER
BOOKED
BLOCKED
MAINTENANCE
```

## Accessibility label

Ví dụ:

`Ghế A01, tầng 1, còn trống cho chặng Phủ Lý đến Thanh Hóa.`

---

# 79. Trip Status Component

```text
DRAFT
SCHEDULED
DELAYED
ACTIVE
COMPLETED
CANCELLED
VEHICLE_REPLACEMENT_PENDING
```

Mỗi status có:

- Label.
- Icon.
- Semantic tone.
- Tooltip/description.

---

# 80. Payment Status Component

```text
CREATED
INITIATED
PENDING
SUCCESS
FAILED
EXPIRED
REFUND_REQUESTED
REFUNDING
REFUNDED
REFUND_FAILED
```

Không được map đơn giản mọi trạng thái non-success thành FAILED.

---

# 81. Realtime Connection Component

```text
LIVE
RECONNECTING
STALE
OFFLINE
```

## Passenger example

```text
● Trực tiếp
Cập nhật 4 giây trước
```

## Manager example

```text
GPS STALE
Last telemetry: 42s ago
```

---

# 82. Error Handling Standards

## User-facing error

Phải có:

- What happened.
- What user can do next.
- Retry/action.

Ví dụ:

`Ghế A01 vừa được đặt bởi người khác. Vui lòng chọn ghế khác.`

Không hiển thị stack trace hoặc database error.

---

# 83. Empty State Standards

Mỗi list có:

- Icon.
- Explanation.
- Primary CTA nếu có.

Ví dụ:

`Bạn chưa có vé sắp tới.`
`Tìm chuyến`.

---

# 84. Permission Denied Screen

Áp dụng cho Manager và Driver.

UI:

- 403 illustration/icon.
- Message.
- Back.

Không reveal resource existence nếu policy yêu cầu chống enumeration.

---

# PART E — SCREEN ↔ API CONTRACT MAP

# 85. Passenger APIs

```http
POST /auth/otp/request
POST /auth/otp/verify
POST /auth/token/refresh

GET  /trips/search
GET  /trips/{trip_id}
GET  /trips/{trip_id}/seat-map?pickup_stop_id=&dropoff_stop_id=

POST /trips/{trip_id}/seat-holds
DELETE /seat-holds/{hold_id}

POST /bookings
GET  /bookings/{booking_id}
POST /bookings/{booking_id}/cancel

POST /payments
GET  /payments/{payment_id}

GET  /tickets/{ticket_id}
GET  /trips/{trip_id}/tracking
```

---

# 86. Driver APIs

```http
GET  /driver/trips
GET  /driver/trips/{trip_id}/manifest
POST /driver/trips/{trip_id}/start
POST /driver/trips/{trip_id}/stop
POST /driver/tickets/{ticket_id}/board
POST /driver/tickets/{ticket_id}/no-show
POST /driver/telemetry/batch
```

---

# 87. Manager APIs

```http
POST /admin/vehicles
POST /admin/vehicles/{id}/seat-layout-versions
POST /admin/routes
POST /admin/routes/{id}/stops
POST /admin/trips
POST /admin/trips/{id}/dispatch
POST /admin/trips/{id}/replace-vehicle
GET  /admin/operations/radar
POST /admin/bookings/{id}/refund
GET  /admin/audit-logs
```

UI không được tự suy diễn state nếu API trả state authoritative khác với local state.

---

# PART F — REALTIME EVENT UI CONTRACT

# 88. Seat Events

```text
SEAT_HOLD_CREATED
SEAT_HOLD_EXPIRED
SEAT_HOLD_CANCELLED
SEAT_BOOKED
SEAT_RELEASED
```

## Required fields

- `event_id`
- `event_type`
- `trip_id`
- `seat_id`
- `segment`
- `occurred_at`
- `version/sequence`

## Client rules

- Ignore duplicate event IDs.
- Ignore stale versions.
- Reconcile from snapshot if gap detected.

---

# 89. Tracking Event

```json
{
  "event": "TRACKING_UPDATE",
  "event_id": "evt-123",
  "trip_id": "trip-123",
  "vehicle": {
    "lat": 21.028511,
    "lng": 105.854444,
    "bearing": 142.5,
    "speed": 58.2
  },
  "pickup": {
    "stop_id": "stop-123",
    "distance_remaining_meters": 8500,
    "estimated_seconds_remaining": 720
  },
  "last_updated": 1787558418000
}
```

## Client handling

- Out-of-order → ignore stale incremental event.
- Missing event → use snapshot/reconciliation path.
- Reconnect → snapshot first.

---

# PART G — DATA & STATE DISPLAY RULES

# 90. Seat State vs Booking State

UI không được trộn:

```text
Seat state
```

với:

```text
Booking state
```

Ví dụ booking PAID nhưng ticket seat chỉ occupied ở segment tương ứng.

---

# 91. Payment State vs Booking State

Ví dụ:

```text
Booking = PAYMENT_PENDING
Payment = PENDING
```

không hiển thị booking `FAILED`.

---

# 92. Tracking Freshness

Freshness được tính từ server-side timestamp, không phải thời điểm UI render.

Ví dụ:

```text
LIVE: < threshold
STALE: >= threshold
```

Ngưỡng configurable theo product.

---

# 93. Historical Snapshot Rule

Passenger ticket và Manager trip detail phải ưu tiên snapshot:

- Vehicle metadata tại thời điểm ticket issuance.
- Seat code/layout version.
- Pickup/dropoff names.
- Price.
- Route stop snapshot.

Không load lại mutable master data để thay thế historical information.

---

# PART H — ACCESS CONTROL BY SCREEN

# 94. Passenger

Passenger chỉ có quyền:

- Read public trip search.
- Read own booking/ticket.
- Mutate own seat hold/booking/payment flow.
- Subscribe realtime cho authorized trip.

Không được:

- Đọc booking của user khác.
- Subscribe fleet room.
- Thao tác driver/admin API.

---

# 95. Driver

Driver chỉ có quyền:

- Read assigned trips.
- Read manifest assigned trips.
- Board/no-show tickets thuộc assigned trip.
- Start/stop assigned trip.
- Publish telemetry từ registered device/trip.

Không được:

- Đọc fleet toàn hệ thống.
- Đổi giá.
- Refund.
- Dispatch.

---

# 96. Manager

Authorization theo role và operational scope.

UI chỉ hiển thị actions user có thể thực thi, nhưng backend luôn enforce.

---

# PART I — UX FLOWS

# 97. Passenger — Complete Booking Flow

```text
Home
 ↓
Search
 ↓
Search Results
 ↓
Trip Detail
 ↓
Select Pickup/Dropoff
 ↓
Seat Map
 ↓
Hold
 ↓
Passenger Info
 ↓
Checkout
 ↓
Payment
 ↓
Booking Success
 ↓
Ticket
```

Exception branches:

```text
Seat conflict → Seat Map
Hold expired → Seat Map
Payment pending → Payment status
Payment failed → Checkout
Trip cancelled → Rebooking/Refund
Vehicle replaced → Replacement resolution
```

---

# 98. Passenger — Tracking Flow

```text
Tickets
 ↓
Ticket Detail
 ↓
Track Vehicle
 ↓
Realtime Map
 ↓
ETA
```

Exception:

```text
WSS down
 ↓
REST snapshot/polling
```

---

# 99. Driver — Trip Flow

```text
Today's Trips
 ↓
Trip Detail
 ↓
Readiness Check
 ↓
Start Trip
 ↓
Active Trip Dashboard
 ├── Manifest
 ├── Stop
 ├── Scan QR
 ├── No-show
 ├── COD
 ├── Navigation
 └── GPS Health
 ↓
End Trip
```

---

# 100. Manager — Operational Flow

```text
Dashboard
 ↓
Live Radar
 ↓
Trip Detail
 ├── Manifest
 ├── Tracking
 ├── Seat Map
 ├── Payments
 └── Operations Log
```

Exception:

```text
Alert
 ↓
Trip/Vehicle
 ↓
Action
 ├── Contact driver
 ├── Delay
 ├── Replace vehicle
 ├── Rebook
 └── Refund
```

---

# PART J — ACCEPTANCE CRITERIA

# 101. Passenger Acceptance Criteria

## Search

- [ ] Có thể tìm sub-route.
- [ ] Availability hiển thị theo segment.
- [ ] Filter không làm mất requested segment.

## Seat

- [ ] Không hiển thị seat AVAILABLE sai khi có overlapping booking.
- [ ] Multi-seat hold atomic.
- [ ] Hold hết hạn được phản ánh realtime/refresh.
- [ ] Client không tự quyết định authoritative state.

## Payment

- [ ] Callback lặp không tạo duplicate ticket.
- [ ] Frontend timeout không biến payment thành failed giả.
- [ ] Refund state hiển thị đúng lifecycle.

## Ticket

- [ ] QR scan lần 2 không tạo boarding mới.
- [ ] Historical vehicle/seat data không bị thay đổi theo master data mới.

## Tracking

- [ ] Reconnect lấy snapshot trước incremental events.
- [ ] Stale telemetry có UI rõ ràng.
- [ ] ETA gắn đúng pickup stop của passenger.

---

# 102. Driver Acceptance Criteria

- [ ] Driver chỉ thấy assigned trips.
- [ ] Start Trip kích hoạt tracking service.
- [ ] Tracking không phụ thuộc Flutter widget lifecycle.
- [ ] Offline queue hoạt động.
- [ ] Sequence không bị duplicate.
- [ ] QR replay bị reject.
- [ ] No-show có audit event.
- [ ] End Trip không dừng telemetry trước khi server state được xác nhận theo policy.

---

# 103. Manager Acceptance Criteria

- [ ] Dispatch detect vehicle/driver conflicts.
- [ ] Published trip giữ snapshot độc lập với route/vehicle template.
- [ ] Seat map inspect được theo segment.
- [ ] Vehicle replacement có seat mapping.
- [ ] Affected passengers được xác định.
- [ ] Refund/financial actions bị giới hạn theo role.
- [ ] Live radar hiển thị stale state.
- [ ] Audit log ghi sensitive actions.

---

# PART K — UI STATE TEST MATRIX

# 104. Seat Map Test Cases

| Case | Expected |
|---|---|
| Seat available | Selectable |
| Seat held by other | Disabled |
| Seat held by me | Selected + timer |
| Seat booked overlapping segment | Disabled |
| Seat booked non-overlapping segment | Selectable |
| Seat blocked | Disabled |
| Realtime hold arrives | Seat changes immediately |
| Event out-of-order | Ignore stale event |
| Reconnect | Snapshot reconciliation |
| Hold expires | Release UI |

---

# 105. Payment Test Cases

| Case | Expected |
|---|---|
| First payment callback | Mark success once |
| Duplicate callback | No duplicate effects |
| Wrong signature | Reject |
| Frontend timeout | Pending/check status |
| Provider success after timeout | Booking becomes PAID |
| Provider failed | Payment FAILED |
| Refund requested | Show refunding lifecycle |

---

# 106. Driver GPS Test Cases

| Case | Expected |
|---|---|
| GPS disabled | Warning/block per policy |
| Network lost | Queue locally |
| Network restored | Batch replay |
| Duplicate sequence | Ignore duplicate effect |
| Sequence gap | Mark gap, continue |
| Low accuracy | Quality warning |
| App UI closed | Tracking continues |
| Process restarted | Recover tracking |
| Device clock bad | Flag anomaly |

---

# 107. Manager Dispatch Test Cases

| Case | Expected |
|---|---|
| Same vehicle overlapping | Reject |
| Same driver overlapping | Reject |
| Inactive vehicle | Reject |
| Inactive driver | Reject |
| Valid dispatch | Allow |
| Replacement vehicle incompatible | Manual resolution |
| Seat mapping impossible | Require operator decision |

---

# PART L — RESPONSIVE & DEVICE GUIDELINES

# 108. Passenger Mobile Breakpoints

Mobile-first; portrait primary.

Landscape may be supported for map only where beneficial.

## Safe areas

Respect notch/home indicator.

## Keyboard

Checkout and passenger forms must keep CTA visible above keyboard where possible.

---

# 109. Driver Mobile Guidelines

Primary target:

- Large controls.
- Minimal text input.
- High contrast.
- Limited modal depth.
- One primary action per screen.

During active trip:

- No dense tables.
- Manifest should be highly scannable.
- Boarding buttons large.

---

# 110. Manager Desktop Breakpoints

Recommended:

```text
>= 1440px  Full dashboard
1280–1439  Standard desktop
1024–1279  Compact desktop/tablet
< 1024     Restricted/mobile admin or unsupported depending product policy
```

Live Radar benefits from wide viewport and should prioritize map + operational list.

---

# PART M — COMPONENTS / DESIGN SYSTEM

# 111. Required Shared Components

```text
AppHeader
BottomNavigation
SideNavigation
SearchField
DatePicker
StopPicker
TripCard
SeatMap
SeatCell
RouteTimeline
StatusBadge
ConnectionBadge
ETABadge
VehicleMarker
PassengerCard
TicketCard
QRCodeView
PaymentMethodCard
CountdownTimer
AlertBanner
BottomSheet
ConfirmationModal
DataTable
FilterBar
Drawer
AuditTimeline
```

---

# 112. Seat Map Component Rules

Seat cell must support:

- loading.
- selected.
- disabled.
- live update.
- long press tooltip.
- accessibility.

Layout should never be reconstructed from arbitrary client assumptions; use backend-provided layout snapshot.

---

# 113. Route Timeline Component

Must support:

- Completed stops.
- Current stop.
- Upcoming stops.
- Pickup highlight.
- Dropoff highlight.
- Delay indicator.

---

# 114. Map Component

Common capabilities:

- User/vehicle markers.
- Bearing rotation.
- Polyline.
- Stop pins.
- Camera fit.
- Re-center.
- Marker animation.

Manager version additionally:

- Cluster.
- Filtered fleet.
- Alert overlays.

---

# PART N — ANALYTICS / EVENT TRACKING

# 115. Passenger Analytics

Suggested product events:

```text
SEARCH_STARTED
TRIP_SELECTED
SEAT_MAP_VIEWED
SEAT_SELECTED
SEAT_HOLD_CREATED
CHECKOUT_STARTED
PAYMENT_STARTED
PAYMENT_SUCCESS
PAYMENT_FAILURE
TICKET_VIEWED
TRACKING_VIEWED
```

Do not log sensitive payment payloads or raw phone numbers.

---

# 116. Driver Analytics

```text
TRIP_OPENED
TRIP_STARTED
MANIFEST_VIEWED
QR_SCAN
BOARDING_SUCCESS
NO_SHOW
COD_COLLECTED
GPS_STARTED
GPS_OFFLINE
GPS_RECOVERED
TRIP_COMPLETED
```

---

# 117. Manager Analytics

```text
TRIP_CREATED
TRIP_PUBLISHED
DISPATCH_COMPLETED
VEHICLE_REPLACEMENT
BOOKING_MODIFIED
REFUND_STARTED
REFUND_COMPLETED
ALERT_ACKNOWLEDGED
```

All operational events should correlate with audit IDs where relevant.

---

# PART O — SECURITY UX

# 118. Session Expired

Không đưa user về login ngay nếu silent refresh có thể xử lý.

Flow:

```text
401
 ↓
Refresh token
 ↓
Retry original request once
 ↓
If fail → Login
```

Không retry vô hạn.

---

# 119. Sensitive Information Masking

Passenger:

- Own phone may be visible.
- Driver contact theo product policy.

Driver:

- Passenger phone masked/proxy by default.

Manager:

- Display scope depends on role.

Logs/UI debugging không hiển thị token, secret hoặc full payment credentials.

---

# 120. QR Security UX

Nếu ticket invalid:

- `QR không hợp lệ`.

Nếu expired:

- `Vé đã hết hiệu lực`.

Nếu wrong trip:

- `Vé không thuộc chuyến này`.

Nếu already boarded:

- `Vé đã được sử dụng`.

Không expose signature details.

---

# PART P — NOTIFICATION UX RULES

# 121. Passenger Push Priority

### High

- Trip cancelled.
- Vehicle replacement requiring action.
- Driver/vehicle issue affecting pickup.

### Medium

- Vehicle approaching.
- ETA changed significantly.

### Normal

- Booking confirmation.
- Payment success.
- Ticket issued.

Deduplication key phải được backend tạo; client không tự deduplicate chỉ dựa trên text notification.

---

# 122. Manager Alert Priority

### Critical

- Active trip no GPS.
- Severe route deviation.
- Trip operational failure.

### High

- Long stop.
- Large delay.
- Replacement needed.

### Normal

- Payment mismatch.
- Notification delivery failure.

---

# PART Q — IMPLEMENTATION ORDER

# 123. Passenger implementation order

```text
P0 Auth
P1 Home/Search
P2 Trip Detail
P3 Seat Map + realtime
P4 Booking + Hold
P5 Passenger Info
P6 Checkout + Payment
P7 Ticket/QR
P8 Tracking
P9 Notifications
P10 Profile
```

---

# 124. Driver implementation order

```text
D0 Auth
D1 Today's Trips
D2 Trip Detail
D3 Start Trip
D4 Native Tracking Service
D5 Manifest
D6 QR Boarding
D7 No-show/COD
D8 Offline Sync
D9 Navigation
D10 End Trip
D11 Diagnostics
```

Native tracking should be developed early because it is a critical architecture constraint, not a polish feature.

---

# 125. Manager implementation order

```text
M0 Auth/RBAC shell
M1 Dashboard
M2 Vehicle
M3 Seat Layout
M4 Route
M5 Trip
M6 Dispatch
M7 Booking/POS
M8 Payment/Refund
M9 Live Radar
M10 Alerts
M11 Replacement
M12 Reports
M13 Audit
M14 Settings
```

---

# PART R — DEFINITION OF DONE

# 126. Screen Definition of Done

Một screen chỉ coi là complete khi có:

- [ ] UI normal state.
- [ ] Loading state.
- [ ] Empty state.
- [ ] Error state.
- [ ] Permission denied state nếu applicable.
- [ ] Offline behavior nếu applicable.
- [ ] Responsive layout.
- [ ] Accessibility labels.
- [ ] API contract mapped.
- [ ] Analytics events.
- [ ] Navigation/deep link.
- [ ] Back behavior.
- [ ] Refresh behavior.
- [ ] Realtime behavior nếu applicable.
- [ ] Acceptance tests.

---

# 127. Release Gates

## Passenger MVP

- [ ] Search works with sub-route.
- [ ] Segment seat inventory correct.
- [ ] Double-booking concurrency test passed.
- [ ] Payment idempotency passed.
- [ ] Ticket QR passed.

## Driver MVP

- [ ] Background GPS stable on target devices.
- [ ] Offline buffer validated.
- [ ] Boarding replay protection passed.
- [ ] Driver authorization tested.

## Manager MVP

- [ ] Dispatch conflicts blocked.
- [ ] Trip snapshots verified.
- [ ] Seat map segment inspection verified.
- [ ] RBAC verified.
- [ ] Audit trail verified.

---

# 128. Final Product Structure

```text
BUSGO
│
├── Passenger App
│   ├── Authentication
│   ├── Search
│   ├── Trip Detail
│   ├── Segment Selection
│   ├── Seat Map
│   ├── Booking
│   ├── Payment
│   ├── Ticket
│   ├── Live Tracking
│   ├── Notifications
│   └── Profile
│
├── Driver App
│   ├── Authentication
│   ├── Assigned Trips
│   ├── Active Trip
│   ├── Manifest
│   ├── Stop Management
│   ├── Boarding
│   ├── COD
│   ├── Navigation
│   ├── GPS Health
│   ├── Offline Sync
│   └── Diagnostics
│
└── Manager Portal
    ├── Dashboard
    ├── Live Radar
    ├── Fleet
    ├── Seat Layout
    ├── Routes
    ├── Trips
    ├── Dispatch
    ├── Drivers
    ├── Bookings
    ├── POS/Hotline
    ├── Payments
    ├── Refunds
    ├── Vehicle Replacement
    ├── Alerts
    ├── Notifications
    ├── Reports
    ├── Audit
    ├── RBAC
    └── Settings
```

---

# 129. Critical UI Principles

1. **Seat availability must always be segment-aware.**
2. **UI state is never more authoritative than server state.**
3. **Payment pending is not payment failed.**
4. **Realtime disconnect must degrade gracefully.**
5. **Driver GPS must survive Flutter UI lifecycle.**
6. **Historical trip/ticket data must use snapshots.**
7. **Manager destructive actions require explicit confirmation and audit.**
8. **Every important screen has loading, empty, error and permission states.**
9. **Realtime clients must handle duplicates, out-of-order events and reconnect.**
10. **Security is enforced by backend authorization; UI hiding is only a UX layer.**

---

# 130. Reference to System Architecture

UI implementation phải giữ các ranh giới domain của BusGo SRS v2.0:

```text
Passenger / Driver / Manager
            ↓
        Core APIs
            ↓
PostgreSQL = authoritative business state
Redis = lock/cache/realtime coordination
MQTT = telemetry ingestion
WebSocket = client realtime delivery
ETA Engine = route-aware arrival estimation
```

Đây là baseline để team Product, UX/UI, Mobile, Frontend Web và Backend dùng chung một contract về behavior của hệ thống.
