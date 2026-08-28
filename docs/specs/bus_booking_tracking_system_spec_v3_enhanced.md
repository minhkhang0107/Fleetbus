# Software Requirements Specification (SRS) & System Architecture
# BusGo — Hệ Thống Đặt Chỗ & Theo Dõi Xe Khách Thời Gian Thực

**Version:** 3.0  
**Status:** SA/BA enhanced master baseline — production sign-off requires closure of listed open decisions  
**Primary platforms:** Flutter Passenger App, Flutter + Native Android Driver App, React/Next.js Admin Portal  
**Backend:** NestJS/TypeScript (default) or Go  
**Database:** PostgreSQL 16+ / PostGIS  
**Cache & distributed coordination:** Redis 7+  
**Realtime:** MQTT + WebSocket  
**Maps:** Mapbox or Google Maps Platform  

---

## 1. Executive Summary

BusGo số hóa toàn bộ quy trình vận hành xe khách liên tỉnh và xe trung chuyển, tập trung vào hai bài toán cốt lõi:

1. **Đặt chỗ theo chặng và giữ ghế realtime** mà không xảy ra double-booking.
2. **Theo dõi xe và ETA theo từng điểm đón** với dữ liệu GPS realtime, hỗ trợ mạng chập chờn và thiết bị di động chạy nền.

Hệ thống gồm Passenger App, Driver App, Admin Portal, Core Backend, Realtime Telemetry/ETA Services, PostgreSQL/PostGIS, Redis, MQTT/WebSocket và các cổng thanh toán.

### 1.1. Nguyên tắc thiết kế bắt buộc

- PostgreSQL là **source of truth** cho booking, payment, ticket và các trạng thái nghiệp vụ lâu dài.
- Redis chỉ dùng cho **temporary lock, cache, Pub/Sub và coordination**, không phải source of truth.
- Ghế được quản lý theo **trip + seat + route segment**, không coi một ghế là BOOKED cho toàn bộ chuyến nếu khách chỉ đi một phần tuyến.
- Trip phải có **snapshot** của route stops và seat layout tại thời điểm dispatch để thay đổi cấu hình tương lai không làm sai dữ liệu lịch sử.
- Payment callback phải **idempotent**; cùng một giao dịch có thể được callback nhiều lần nhưng chỉ tạo một hiệu ứng nghiệp vụ.
- Telemetry phải phân biệt **device timestamp** và **server received timestamp**, có sequence để xử lý offline replay/out-of-order.
- Latest vehicle position phục vụ realtime phải được giữ ở Redis/fast state store; telemetry history lưu PostgreSQL partitioned tables.
- ETA phải dựa trên **route-aware/map-matched path**, không chỉ lấy khoảng cách thẳng và tốc độ tức thời.
- Mọi thao tác nhạy cảm phải được bảo vệ bằng **RBAC + resource-level authorization + audit log**.

---

# 2. System Actors

## 2.1. Passenger Mobile Application

Dành cho hành khách:

- Đăng nhập bằng số điện thoại + OTP.
- Tìm chuyến theo điểm đi, điểm đến, ngày và loại xe.
- Chọn điểm đón/trả dọc tuyến.
- Chọn ghế theo layout thực tế của chuyến.
- Giữ ghế realtime.
- Thanh toán online hoặc COD.
- Nhận PNR và vé QR.
- Theo dõi vị trí xe và ETA tới điểm đón.
- Nhận push notification.

## 2.2. Driver Mobile Application

Dành cho tài xế/phụ xe:

- Đăng nhập bằng tài khoản nội bộ.
- Xem lịch chạy và manifest.
- Bắt đầu/kết thúc chuyến.
- Thu tiền COD.
- Quét QR và xác nhận boarded/no-show.
- Gọi khách qua masked phone hoặc cơ chế liên lạc được cấp quyền.
- Chạy Background/Foreground GPS.
- Offline buffer khi mất mạng.

## 2.3. Admin Portal / Operations CMS

- Quản lý xe và seat layout.
- Quản lý route và route stops.
- Tạo trip và dispatch.
- Gán xe/tài xế/phụ xe.
- Quản lý giá theo chặng.
- POS/đặt vé hotline.
- Điều hành fleet realtime.
- Đổi xe, đổi vé, hủy/hoàn tiền.
- Quản lý người dùng và phân quyền.
- Audit và báo cáo.

## 2.4. System Services

- Core API.
- Telemetry ingestion.
- ETA engine.
- Realtime gateway.
- Notification service.
- Payment adapters.
- Background jobs/scheduler.

---

# 3. System Architecture

```text
                               ┌──────────────────────────┐
                               │      Admin Portal         │
                               │ React / Next.js           │
                               └────────────┬─────────────┘
                                            │ HTTPS/WSS
                                            │
┌────────────────────┐            ┌────────▼─────────┐            ┌──────────────────────┐
│ Passenger App      │ HTTPS/WSS  │ API Gateway      │ HTTPS/WSS  │ Driver App           │
│ Flutter            ├────────────► Nginx / LB        ◄────────────┤ Flutter + Native GPS │
└────────────────────┘            └────────┬─────────┘            └──────────┬───────────┘
                                           │                                   │
                         ┌─────────────────┴────────────────┐                 │ MQTT
                         │                                  │                 │
                ┌────────▼─────────┐              ┌────────▼──────────┐      │
                │ Core Backend API │              │ Realtime Gateway  │      │
                │ NestJS / Go      │              │ WS / Socket.IO    │      │
                └───────┬──────────┘              └────────┬──────────┘      │
                        │                                  │                 │
          ┌─────────────┼──────────────┐                   │                 │
          │             │              │                   │                 │
   ┌──────▼─────┐ ┌─────▼─────┐ ┌────▼────────┐    ┌──────▼─────────┐       │
   │ PostgreSQL │ │   Redis   │ │ Payment     │    │ Redis Pub/Sub  │       │
   │ + PostGIS  │ │ Lock/Cache│ │ Gateways    │    │ Latest Position│       │
   └──────┬─────┘ └─────┬─────┘ └─────────────┘    └────────────────┘       │
          │             │                                                    │
          │             │         ┌───────────────────────────────┐          │
          │             └────────►│ Telemetry / ETA Service       │◄─────────┘
          │                       │ Go / Node.js                  │
          │                       └───────────────┬───────────────┘
          │                                       │
          └───────────────────────────────────────┘
```

## 3.1. Recommended deployment model

### Phase 1

- Core Backend: modular monolith.
- Telemetry/ETA: separate service.
- PostgreSQL: primary database.
- Redis: single logical deployment with HA capability.
- MQTT: EMQX or equivalent.
- Nginx/API Gateway.

### Phase 2 / scale-out

Có thể tách riêng:

- Booking Service.
- Payment Service.
- Notification Service.
- Dispatch Service.
- Telemetry Service.
- ETA Service.
- Realtime Gateway.

Không bắt buộc microservice ngay từ ngày đầu.

---

# 4. Functional Requirements

# 4.1. Passenger App

## F-PAS-01 — Authentication & Account

- Register/login via phone + OTP.
- Refresh token rotation.
- Profile management.
- Frequently used pickup/dropoff locations.
- Passenger contacts / people traveling on behalf of user.

## F-PAS-02 — Trip Search

Filters:

- Origin.
- Destination.
- Departure date/time.
- Vehicle type.
- Pickup/dropoff stop.
- Price range.
- Availability.

Search must understand **sub-route travel**.

Ví dụ route:

```text
Hanoi → Phu Ly → Ninh Binh → Thanh Hoa → Vinh
```

Passenger có thể tìm:

```text
Phu Ly → Thanh Hoa
```

## F-PAS-03 — Trip Detail

Phải hiển thị:

- Route.
- Scheduled departure/arrival.
- Pickup/dropoff stops.
- Vehicle type.
- Seat layout.
- Fare for selected segment.
- Available seats **cho chính segment được chọn**.

## F-PAS-04 — Realtime Seat Selection & Holding

Seat states:

- `AVAILABLE`
- `LOCKED_BY_ME`
- `LOCKED_BY_OTHER`
- `BOOKED`
- `BLOCKED`
- `MAINTENANCE`

Seat availability phải được tính theo:

```text
trip_id
+ seat_id
+ requested segment [pickup_stop_order, dropoff_stop_order)
```

Không được coi toàn bộ seat là BOOKED nếu booking chỉ chiếm một phần route.

## F-PAS-05 — Booking

Booking flow:

```text
SEARCH
 ↓
SELECT SEGMENT
 ↓
SELECT SEAT(S)
 ↓
SEAT HOLD
 ↓
CREATE BOOKING
 ↓
PAYMENT
 ↓
PAID / COD
 ↓
TICKET ISSUED
```

Booking phải lưu snapshot các thông tin cần thiết để lịch sử không phụ thuộc vào dữ liệu mutable hiện tại.

## F-PAS-06 — Payment

Hỗ trợ:

- VietQR/Napas247.
- MoMo.
- ZaloPay.
- ATM/Card theo gateway được chọn.
- COD.

Yêu cầu:

- Idempotency.
- Callback signature verification.
- Transaction reconciliation.
- Timeout/expiration.
- Refund.
- Partial refund nếu nghiệp vụ cho phép.

## F-PAS-07 — E-Ticket

Ticket gồm:

- PNR.
- Passenger name/phone.
- Trip.
- Pickup/dropoff.
- Seat.
- Vehicle/plate.
- Boarding information.
- QR token.

QR không chứa dữ liệu nhạy cảm dạng plaintext. Payload phải có nonce/expiration và HMAC signature.

## F-PAS-08 — Live Tracking & ETA

Passenger xem:

- Vehicle current position.
- Heading/bearing.
- Speed.
- Route.
- Pickup point.
- Distance to pickup.
- ETA to pickup.
- Last update time.
- Tracking freshness/state.

## F-PAS-09 — Notifications

Push events:

- Booking created.
- Payment success/failure.
- Ticket issued.
- Vehicle approaching pickup.
- ETA changed significantly.
- Trip delayed.
- Trip cancelled/replaced.
- Refund status.

Notification phải idempotent, có deduplication key.

---

# 4.2. Driver App

## F-DRI-01 — Authentication

- Internal account.
- Role-based access.
- Session/device registration.
- Optional device trust.

## F-DRI-02 — Trip Assignment

Hiển thị:

- Trip.
- Vehicle.
- Departure time.
- Route.
- Stops.
- Primary/assistant driver.

Không cho phép tài xế truy cập trip không được phân công nếu không có elevated role.

## F-DRI-03 — Manifest

Manifest được sort theo route sequence và pickup time.

Mỗi ticket:

- Passenger.
- Number of seats.
- Seat code.
- Pickup/dropoff.
- Payment status.
- Boarding status.
- COD amount nếu có.

## F-DRI-04 — Boarding

Các thao tác:

- Scan QR.
- Manual board.
- No-show.
- Collected COD.

Boarding phải có audit event và timestamp.

QR scan phải chống replay:

```text
FIRST SCAN  → BOARDING SUCCESS
SECOND SCAN → ALREADY_BOARDED
```

## F-DRI-05 — Background GPS Telemetry

Start Trip phải kích hoạt native Android Foreground Service hoặc cơ chế tương đương trên iOS được platform cho phép.

### GPS policy

```text
v >= 5 km/h
    → target interval 3 sec
    → or distance delta >= 15m

v < 5 km/h for > 60 sec
    → target interval 30 sec
```

Actual delivery phụ thuộc Android/iOS OS scheduling.

## F-DRI-06 — Offline Resilient Buffer

Khi mất mạng:

- Ghi local SQLite.
- Giữ thứ tự sequence.
- Retry exponential backoff.
- Upload theo batch khi online.
- Server deduplicate theo `(device_id, trip_id, sequence)`.

## F-DRI-07 — GPS Integrity

Driver App phải phát hiện/cảnh báo:

- Location permission revoked.
- GPS disabled.
- Mock location nếu platform/device cho phép phát hiện.
- Device clock anomaly.
- No GPS fix.
- Low accuracy.
- App process restarted.
- Network offline.

## F-DRI-08 — Navigation

Có thể tích hợp Mapbox Navigation hoặc Google Navigation.

Navigation không được làm telemetry ingestion phụ thuộc trực tiếp vào Map SDK.

---

# 4.3. Admin Portal

## F-ADM-01 — Fleet Management

Vehicle fields tối thiểu:

- Plate number.
- VIN/frame number.
- Model.
- Vehicle type.
- Capacity.
- Deck count.
- Registration inspection expiry.
- Active/inactive.

## F-ADM-02 — Seat Layout Builder

Hỗ trợ:

- Multi-deck.
- Seat/cabin.
- Door.
- Stair.
- Driver area.
- Blocked area.
- Arbitrary seat codes.

Layout phải có version.

## F-ADM-03 — Route Management

Route gồm:

```text
Origin
Destination
Route stops
Stop order
Coordinates
Offset time
```

Mỗi stop có stable ID.

## F-ADM-04 — Trip Management

Trip được tạo từ route + vehicle + crew + schedule.

Khi publish trip, hệ thống tạo snapshot:

```text
TripStop snapshot
SeatLayout snapshot
Pricing snapshot
```

## F-ADM-05 — Dispatch

Validation trước khi assign:

- Vehicle không trùng trip time window.
- Driver không trùng trip time window.
- Assistant không trùng trip time window.
- Vehicle active.
- Driver active.
- Seat layout hợp lệ.

## F-ADM-06 — Pricing

Hỗ trợ:

- Base price.
- Segment price.
- Weekend/holiday surcharge.
- Campaign/promotion.
- Booking fee.
- Refund fee nếu có.

Giá cuối cùng phải được snapshot vào booking/booking items.

## F-ADM-07 — Live Operations Radar

Hiển thị:

- Active vehicles.
- Last location.
- Speed.
- Heading.
- Current route position.
- ETA.
- Connection freshness.
- Route deviation.
- Long stop.

## F-ADM-08 — POS / Hotline

Agent có thể:

- Search trip.
- Hold seat.
- Create booking.
- Collect cash.
- Issue ticket.
- Rebook.
- Cancel/refund theo permission.

## F-ADM-09 — Vehicle Replacement

Khi đổi xe:

```text
Original Vehicle
      ↓
Replacement Vehicle
      ↓
Seat Mapping
      ↓
Affected Tickets
      ↓
Notify / Rebook / Refund
```

Không tự động giả định seat code cũ tồn tại trên xe mới.

## F-ADM-10 — Audit

Audit log cho:

- User/role changes.
- Vehicle changes.
- Route changes.
- Trip dispatch.
- Manual seat blocking.
- Manual booking modification.
- Payment/refund operations.
- Boarding overrides.
- Vehicle replacement.

---

# 5. Core Domain Model

```text
User
 ├── Passenger profile
 └── Driver profile

Vehicle
 └── SeatLayoutVersion
        └── Seat definitions

Route
 └── RouteStop(s)

Trip
 ├── TripStopSnapshot(s)
 ├── TripSeat(s)
 ├── TripCrew
 └── TripPricingSnapshot

Booking
 ├── BookingItem(s)
 ├── PaymentTransaction(s)
 └── Ticket(s)

Ticket
 ├── Seat
 ├── Segment
 ├── BoardingEvent(s)
 └── QR credential

Trip
 └── Telemetry
        ├── Current Position
        └── Historical Events
```

---

# 6. Segment-Based Seat Inventory

Đây là thay đổi kiến trúc bắt buộc so với phiên bản ban đầu.

## 6.1. Route segment model

Nếu route có:

```text
Stop 0: Hanoi
Stop 1: Phu Ly
Stop 2: Ninh Binh
Stop 3: Thanh Hoa
Stop 4: Vinh
```

Booking:

```text
Phu Ly → Thanh Hoa
```

chiếm seat trên các segment:

```text
1 → 2
2 → 3
```

Không chiếm:

```text
0 → 1
3 → 4
```

## 6.2. Occupancy rule

Hai booking conflict khi:

```text
same trip
AND same seat
AND route segments overlap
```

Mathematically:

```text
[from_a, to_a) overlaps [from_b, to_b)
iff
from_a < to_b AND from_b < to_a
```

## 6.3. Recommended tables

```text
trip_seats
-----------
id
trip_id
seat_code
seat_layout_version_id
status

trip_seat_occupancies
---------------------
id
trip_id
trip_seat_id
booking_item_id
from_stop_order
to_stop_order
status
```

Unique seat conflict có thể được bảo vệ ở application transaction và database bằng model phù hợp. PostgreSQL phải là lớp cuối cùng đảm bảo consistency.

## 6.4. Booking transaction

Một transaction đặt ghế phải:

1. Validate trip status.
2. Validate pickup/dropoff.
3. Validate seat belongs to trip.
4. Detect segment overlap.
5. Acquire short-lived Redis lock.
6. Re-check authoritative state.
7. Create booking + booking items.
8. Persist hold/expiration.
9. Commit DB transaction.
10. Publish domain/realtime event.
11. Release Redis lock.

Không phát event `SEAT_AVAILABLE/BOOKED` trước khi transaction commit thành công.

---

# 7. Distributed Seat Locking

## 7.1. Redis role

Redis lock chỉ bảo vệ concurrent attempts trong khoảng thời gian rất ngắn.

Ví dụ key:

```text
seat_lock:{trip_id}:{seat_id}:{segment_hash}
```

TTL business hold: **10 phút**.

Lock ownership phải có unique token:

```text
owner_token = UUID
```

Release chỉ được phép khi token khớp.

## 7.2. Redis Lua behavior

Atomic behavior:

```text
IF key absent
  SET key owner_token NX PX 600000
  RETURN SUCCESS
ELSE
  RETURN FAILED
```

Multi-seat request phải atomic theo toàn bộ requested seat set hoặc fail toàn bộ.

## 7.3. Expiration

Không dựa chỉ vào Redis TTL để xác định trạng thái business.

Booking phải có:

```text
hold_expires_at
```

Worker có thể cleanup expired holds.

## 7.4. Realtime events

Events:

```text
SEAT_HOLD_CREATED
SEAT_HOLD_EXPIRED
SEAT_HOLD_CANCELLED
SEAT_BOOKED
SEAT_RELEASED
```

Event payload phải có:

- event_id.
- trip_id.
- seat_id.
- segment.
- occurred_at.
- version/sequence nếu dùng ordered stream.

---

# 8. Booking State Machine

```text
DRAFT
  ↓
SEAT_HELD
  ↓
PAYMENT_PENDING
  ├───────────────┐
  │               │
  ▼               ▼
PAID            EXPIRED
  ↓
TICKET_ISSUED
  ↓
CHECKED_IN
  ↓
COMPLETED
```

Cancellation/refund branches:

```text
SEAT_HELD       → CANCELLED
PAYMENT_PENDING → CANCELLED / EXPIRED
PAID            → CANCEL_REQUESTED
CANCEL_REQUESTED → REFUNDING → REFUNDED
PAID            → CANCELLED_NO_REFUND (theo policy)
```

Các transition phải được whitelist; API không được cho phép client tự set status bất kỳ.

---

# 9. Ticket / Boarding State

```text
WAITING
  ↓
APPROACHING
  ↓
BOARDED
  ↓
COMPLETED
```

Alternative:

```text
WAITING → NO_SHOW
```

`NO_SHOW` chỉ được set theo policy của operator; có thể yêu cầu contact attempt trước khi xác nhận.

Boarding event nên là append-only audit event thay vì chỉ overwrite một field.

---

# 10. Trip State Machine

```text
DRAFT
 ↓
SCHEDULED
 ↓
ACTIVE
 ↓
COMPLETED
```

Branches:

```text
DRAFT/SCHEDULED → CANCELLED
SCHEDULED → DELAYED
SCHEDULED → VEHICLE_REPLACEMENT_PENDING
```

`ACTIVE` chỉ được set bởi driver start hoặc authorized operations action.

---

# 11. Payment Architecture

## 11.1. Payment entities

```text
payments
payment_transactions
refunds
```

Recommended fields:

```text
payment_id
booking_id
provider
provider_transaction_id
amount
currency
status
idempotency_key
provider_payload_hash
created_at
updated_at
```

## 11.2. Payment states

```text
CREATED
 ↓
INITIATED
 ↓
PENDING
 ├── SUCCESS
 ├── FAILED
 └── EXPIRED
```

Refund:

```text
REFUND_REQUESTED
 ↓
REFUNDING
 ↓
REFUNDED / REFUND_FAILED
```

## 11.3. Idempotency

Provider callback có thể tới nhiều lần.

Server phải đảm bảo:

```text
same provider_transaction_id
→ one business effect
```

Không tạo duplicate:

- payment.
- ticket.
- booking confirmation.
- notification.

## 11.4. Reconciliation

Background job định kỳ đối soát:

```text
Provider reports
vs
Local payment transactions
```

Các mismatch phải được đưa vào trạng thái manual review.

---

# 12. Database Design

## 12.1. Users / Identity

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Driver profile và role nên là bảng/domain riêng thay vì nhét toàn bộ nghiệp vụ driver vào users.

---

## 12.2. Routes

```sql
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    origin_city VARCHAR(100) NOT NULL,
    destination_city VARCHAR(100) NOT NULL,
    distance_km NUMERIC(8,2),
    estimated_duration_min INT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_name VARCHAR(255) NOT NULL,
    stop_order INT NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    offset_minutes INT NOT NULL DEFAULT 0,
    is_main_station BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_route_stop_order UNIQUE(route_id, stop_order)
);

CREATE INDEX idx_route_stops_location
    ON route_stops USING GIST(location);
```

---

# 12.3. Vehicle & Seat Layout Versioning

Không lưu mutable seat layout duy nhất trên `vehicles`.

```sql
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    vin VARCHAR(100),
    model_name VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    total_capacity INT NOT NULL,
    deck_count INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seat_layout_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    version_no INT NOT NULL,
    layout_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_vehicle_layout_version UNIQUE(vehicle_id, version_no)
);
```

`seat_layout_versions.layout_json` có thể chứa:

- deck.
- row/column.
- seat code.
- seat type.
- x/y/grid position.
- door/stair metadata.
- blocked area.

---

# 12.4. Trips & Trip Snapshots

```sql
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    seat_layout_version_id UUID NOT NULL REFERENCES seat_layout_versions(id),
    primary_driver_id UUID NOT NULL REFERENCES users(id),
    assistant_driver_id UUID REFERENCES users(id),
    departure_time TIMESTAMPTZ NOT NULL,
    estimated_arrival_time TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trip_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    source_route_stop_id UUID,
    stop_name VARCHAR(255) NOT NULL,
    stop_order INT NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    scheduled_arrival_offset_min INT NOT NULL DEFAULT 0,
    scheduled_departure_offset_min INT,
    is_pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_dropoff_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_trip_stop_order UNIQUE(trip_id, stop_order)
);
```

`trip_stops` là snapshot; thay đổi route template không làm thay đổi trip đã publish.

---

# 12.5. Trip Seat Inventory

```sql
CREATE TABLE trip_seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    seat_code VARCHAR(20) NOT NULL,
    deck INT NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
    UNIQUE(trip_id, seat_code)
);
```

Business occupancy theo segment:

```sql
CREATE TABLE trip_seat_occupancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    trip_seat_id UUID NOT NULL REFERENCES trip_seats(id),
    booking_item_id UUID,
    from_stop_order INT NOT NULL,
    to_stop_order INT NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_stop_order < to_stop_order)
);
```

Application service phải enforce segment overlap. Có thể dùng PostgreSQL range/exclusion constraint ở bước production hardening nếu model được chuẩn hóa bằng range type:

```text
trip_id + trip_seat_id + int4range(from_stop_order, to_stop_order)
```

---

# 12.6. Bookings & Tickets

```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pnr_code VARCHAR(20) UNIQUE NOT NULL,
    trip_id UUID NOT NULL REFERENCES trips(id),
    user_id UUID NOT NULL REFERENCES users(id),
    total_amount NUMERIC(12,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'VND',
    status VARCHAR(30) NOT NULL DEFAULT 'SEAT_HELD',
    hold_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    trip_seat_id UUID NOT NULL REFERENCES trip_seats(id),
    pickup_stop_id UUID NOT NULL REFERENCES trip_stops(id),
    dropoff_stop_id UUID NOT NULL REFERENCES trip_stops(id),
    from_stop_order INT NOT NULL,
    to_stop_order INT NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    passenger_phone VARCHAR(20) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_stop_order < to_stop_order)
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_item_id UUID NOT NULL UNIQUE REFERENCES booking_items(id) ON DELETE CASCADE,
    ticket_code VARCHAR(40) UNIQUE NOT NULL,
    qr_nonce VARCHAR(100) UNIQUE NOT NULL,
    qr_key_version VARCHAR(30) NOT NULL,
    board_status VARCHAR(30) NOT NULL DEFAULT 'WAITING',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Điểm quan trọng: uniqueness seat không nằm ở `booking_id + seat_code`; việc conflict được xác định theo **trip + seat + segment**.

---

# 12.7. Payments

```sql
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id),
    provider VARCHAR(50) NOT NULL,
    provider_transaction_id VARCHAR(150),
    idempotency_key VARCHAR(150) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'VND',
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED',
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_transaction_id),
    UNIQUE(provider, idempotency_key)
);
```

---

# 12.8. Boarding Events

```sql
CREATE TABLE boarding_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    event_type VARCHAR(30) NOT NULL,
    operator_user_id UUID,
    source VARCHAR(30) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB
);
```

Append-only events giúp audit và debug tốt hơn so với chỉ update `board_status`.

---

# 13. Telemetry Architecture

## 13.1. Ingestion channel

MQTT topic:

```text
telemetry/trips/{trip_id}/location
```

Optional command/config topic:

```text
telemetry/devices/{device_id}/commands
```

## 13.2. Payload

```json
{
  "device_id": "driver-device-123",
  "trip_id": "c7a8e23b-5779-4b10-85f6-282e7ad6b201",
  "vehicle_id": "9d3e8fa1-3211-4fa3-b6d8-112233445566",
  "sequence": 10231,
  "latitude": 21.028511,
  "longitude": 105.854444,
  "bearing": 142.5,
  "speed_kmh": 58.2,
  "accuracy_meters": 3.8,
  "device_timestamp": 1787558418000
}
```

Server bổ sung:

```text
server_received_at
server_processed_at
```

## 13.3. Telemetry validation

Server phải reject/quarantine:

- Invalid trip.
- Driver/device không assigned.
- Out-of-range coordinates.
- Unrealistic speed jump.
- Duplicate sequence.
- Sequence cũ hơn watermark quá lớn.

Không nhất thiết reject cứng mọi outlier GPS; có thể giữ raw telemetry và đánh dấu quality.

---

# 14. Current Position vs Historical Telemetry

## 14.1. Latest state

Redis key:

```text
vehicle:{vehicle_id}:latest_position
trip:{trip_id}:latest_position
```

Giá trị gồm:

- lat/lng.
- bearing.
- speed.
- accuracy.
- device_timestamp.
- server_received_at.
- sequence.
- telemetry_quality.

## 14.2. Historical storage

```sql
CREATE TABLE vehicle_telemetry_logs (
    id BIGSERIAL,
    trip_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    sequence BIGINT NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    heading NUMERIC(5,2),
    speed_kmh NUMERIC(6,2),
    accuracy_m NUMERIC(7,2),
    device_timestamp TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    telemetry_quality VARCHAR(30),
    PRIMARY KEY (recorded_at, id)
) PARTITION BY RANGE (recorded_at);
```

Partition theo ngày hoặc tháng tùy volume thực tế. Với hệ thống nhiều xe và sampling 3 giây, partitioning nên được coi là design mặc định.

Index chính:

```text
(trip_id, recorded_at DESC)
(vehicle_id, recorded_at DESC)
(device_id, sequence)
```

---

# 15. ETA Engine

ETA không được tính chỉ bằng khoảng cách Euclidean/chim bay.

## 15.1. Pipeline

```text
GPS
 ↓
Quality Filter
 ↓
Map Matching
 ↓
Route Position
 ↓
Remaining Road Path
 ↓
Travel Time Estimation
 ↓
Planned Stop Dwell Time
 ↓
ETA
```

## 15.2. Inputs

- Current position.
- Matched route position.
- Remaining road distance.
- Historical speed profile.
- Current traffic nếu provider hỗ trợ.
- Scheduled stop dwell time.
- Current delay.
- Vehicle speed trend.

## 15.3. Output

```json
{
  "trip_id": "...",
  "stop_id": "...",
  "distance_remaining_meters": 8500,
  "estimated_seconds_remaining": 720,
  "estimated_arrival_time": "2026-08-27T04:20:00Z",
  "confidence": 0.91,
  "calculated_at": "2026-08-27T04:08:00Z"
}
```

## 15.4. Recalculation policy

Không gọi Directions/Distance API mỗi telemetry packet.

Recalculate khi một hoặc nhiều điều kiện xảy ra:

- Vehicle moved vượt threshold.
- ETA delta vượt threshold.
- Traffic data thay đổi.
- Route position thay đổi đáng kể.
- Stop sequence thay đổi.
- Telemetry freshness phục hồi sau mất kết nối.

Cache route geometry và static routing data.

---

# 16. Geofencing & Passenger Notification

Geofence không được trigger mỗi lần GPS crossing threshold.

State machine:

```text
NOT_TRIGGERED
 ↓
WITHIN_3KM
 ↓
APPROACHING_NOTIFIED
 ↓
AT_PICKUP_ZONE
 ↓
BOARDED / NO_SHOW / PASSED
```

Push rule có thể gồm:

- ETA <= 15 phút.
- Distance <= 3 km.
- Strong ETA shift.
- Trip delayed.

Mỗi logical notification có:

```text
notification_type
trip_id
ticket_id
stop_id
notification_key
```

để deduplicate.

---

# 17. Realtime WebSocket

## 17.1. Rooms

```text
trip:{trip_id}
fleet:active
booking:{booking_id}
```

Passenger chỉ subscribe trip mà họ có quyền theo dõi.

Admin có thể subscribe `fleet:active` theo scope/tenant/operation region.

## 17.2. Tracking event

```json
{
  "event": "TRACKING_UPDATE",
  "event_id": "evt-123",
  "trip_id": "c7a8e23b-5779-4b10-85f6-282e7ad6b201",
  "vehicle": {
    "lat": 21.028511,
    "lng": 105.854444,
    "bearing": 142.5,
    "speed": 58.2
  },
  "pickup": {
    "stop_id": "...",
    "distance_remaining_meters": 8500,
    "estimated_seconds_remaining": 720
  },
  "last_updated": 1787558418000
}
```

Client phải xử lý:

- Out-of-order events.
- Missing event.
- Stale event.
- Reconnect.
- Snapshot + incremental events.

Khi reconnect, client phải lấy một authoritative snapshot trước khi nhận incremental events tiếp theo.

---

# 18. API Design

## Passenger

```http
POST /auth/otp/request
POST /auth/otp/verify
POST /auth/token/refresh

GET  /trips/search
GET  /trips/{trip_id}
GET  /trips/{trip_id}/seat-map?pickup_stop_id=...&dropoff_stop_id=...

POST /trips/{trip_id}/seat-holds
DELETE /seat-holds/{hold_id}

POST /bookings
GET  /bookings/{booking_id}
POST /bookings/{booking_id}/cancel

POST /payments
GET  /payments/{payment_id}
POST /payments/webhooks/{provider}

GET /tickets/{ticket_id}
GET /trips/{trip_id}/tracking
```

## Driver

```http
GET  /driver/trips
GET  /driver/trips/{trip_id}/manifest
POST /driver/trips/{trip_id}/start
POST /driver/trips/{trip_id}/stop
POST /driver/tickets/{ticket_id}/board
POST /driver/tickets/{ticket_id}/no-show
POST /driver/telemetry/batch
```

## Admin

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

---

# 19. Authorization & Security

## 19.1. Roles

Tối thiểu:

```text
SUPER_ADMIN
OPERATIONS_ADMIN
DISPATCHER
TICKET_AGENT
DRIVER
PASSENGER
FINANCE
```

## 19.2. Resource-level authorization

Ví dụ:

```text
DRIVER A
→ Trip A
→ Passenger manifest của Trip A
```

Không được mặc định truy cập toàn bộ booking/driver data.

## 19.3. Authentication

- HTTPS/TLS.
- JWT access token.
- Rotating refresh token.
- Token revocation strategy.
- Device/session tracking.

## 19.4. QR Security

HMAC-SHA256 hoặc cơ chế token ký tương đương.

Khuyến nghị payload tối thiểu:

```text
version
 ticket_id
 nonce
 issued_at
 expires_at
```

Không đưa phone/address/full booking payload vào QR.

## 19.5. Sensitive data

Phone/email/identity data phải:

- Không log plaintext trong application logs.
- Mask khi hiển thị không cần thiết.
- Encrypt at rest nếu yêu cầu compliance.
- Access audit.

## 19.6. Rate limiting

Rate limit cho:

- OTP.
- Login.
- Seat hold.
- Booking create.
- Payment endpoints.
- WebSocket connection.
- Telemetry ingestion.

---

# 20. Dispatch & Operational Constraints

## 20.1. Assignment conflict

Không cho phép:

```text
Same vehicle
Trip A: 08:00–12:00
Trip B: 10:00–14:00
```

Tương tự đối với primary driver/assistant driver.

Validation phải tính cả buffer/turnaround time nếu operation yêu cầu.

## 20.2. Vehicle replacement

Replacement workflow phải hỗ trợ:

- New vehicle.
- New seat layout.
- Seat mapping.
- Affected tickets.
- Passenger notification.
- Automatic rebooking khi mapping an toàn.
- Manual resolution khi mapping thất bại.
- Refund path.

Không overwrite historical vehicle metadata của ticket đã phát hành.

---

# 21. Observability

## Metrics

### Booking

- seat_hold_success_rate.
- seat_hold_conflict_rate.
- booking_conversion_rate.
- payment_success_rate.
- payment_callback_duplicate_rate.

### Telemetry

- telemetry_ingest_rate.
- telemetry_processing_latency.
- telemetry_drop_rate.
- offline_replay_count.
- stale_vehicle_count.
### Realtime

- websocket_connections.
- event_broadcast_rate.
- websocket_delivery_latency.
- reconnect_rate.

### ETA

- ETA calculation latency.
- ETA error distribution nếu ground truth thu thập được.
- map/routing API calls.
- cache hit rate.

## Logging

Structured JSON logs với:

```text
request_id
trace_id
user_id
trip_id
booking_id
vehicle_id
event_id
```

Không log secrets/payment credentials.

## Tracing

Distributed tracing nên áp dụng ít nhất cho:

```text
Passenger API
Booking
Payment callback
Telemetry ingestion
ETA calculation
Realtime broadcast
```

---

# 22. Reliability & Failure Handling

## 22.1. Redis unavailable

- New seat holds phải fail-safe, không tự bypass locking.
- Existing PostgreSQL bookings vẫn đọc được.
- Realtime có thể degrade nhưng business data không mất.

## 22.2. PostgreSQL unavailable

- Không tạo booking/payment state mới.
- Không phát success response giả.

## 22.3. MQTT unavailable

Driver local queue tiếp tục buffer.

Server side:

- Mark vehicle telemetry stale.
- Admin radar hiển thị connection stale.

## 22.4. WebSocket unavailable

Passenger fallback:

```text
WSS unavailable
→ REST snapshot / polling với backoff
```

## 22.5. Payment callback lost

Reconciliation job kiểm tra provider.

Không release booking chỉ vì frontend timeout nếu payment provider chưa xác nhận trạng thái cuối.

---

# 23. Offline & Ordering Model

Mỗi telemetry packet có:

```text
device_id
trip_id
sequence
```

Server duy trì watermark:

```text
last_processed_sequence[device_id, trip_id]
```

Rules:

- `sequence == last + 1`: normal.
- `sequence <= last`: duplicate/late; không apply latest state nhưng có thể lưu raw.
- `sequence > last + 1`: gap detected; lưu tiếp, đánh dấu gap; không block toàn stream.

Latest position phải ưu tiên packet mới theo `device_timestamp` + sanity check, không chỉ theo network arrival time.

---

# 24. Performance & SLA

## 24.1. API

Mục tiêu baseline:

- P95 read API < 500 ms.
- P95 write API < 800 ms, không tính external payment/provider processing.

## 24.2. Seat booking

Concurrent seat attempts phải không tạo duplicate booking.

Mục tiêu:

```text
5,000+ concurrent users
```

có thể scale bằng stateless backend + Redis + PostgreSQL connection pooling.

Benchmark phải kiểm tra workload thực:

```text
search
+ seat-map read
+ seat hold
+ booking
+ websocket
```

không chỉ kiểm tra số lượng TCP/WebSocket connections.

## 24.3. Telemetry latency

Target trong điều kiện 4G/5G tốt:

```text
GPS capture
→ ingest
→ process
→ broadcast
≤ 1.5 sec P95
```

SLA phải đo theo percentile thay vì khẳng định hard upper bound cho mọi packet.

## 24.4. Realtime freshness

Passenger phải hiển thị:

```text
last_updated
```

và cảnh báo stale khi vượt ngưỡng, ví dụ 15–30 giây tùy product requirement.

---

# 25. Scaling Model

Ví dụ 500 vehicles với GPS 3 giây/lần:

```text
500 × 20
≈ 10,000 telemetry events/min
≈ 166.7 events/sec
```

14.4 triệu events/ngày nếu sampling liên tục 24h ở mức 3 giây.

Vì vậy:

- MQTT phải scale độc lập.
- Telemetry service phải stateless.
- Latest state ở Redis.
- Historical telemetry partitioned.
- DB writes có thể batch/asynchronous.
- WebSocket broadcast scale theo connection shard/instance + Pub/Sub.

---

# 26. Map Provider Cost Control

Không gọi map routing API cho từng GPS packet.

Caching:

```text
Static route geometry → long TTL
Route matrix → cache
ETA result → short TTL
Traffic-aware result → controlled refresh
```

Client có thể animate marker locally giữa hai telemetry updates nhưng không được coi animation là actual GPS accuracy.

---

# 27. Notifications

Notification service nên có:

```text
notifications
notification_deliveries
```

State:

```text
PENDING
→ SENT
→ DELIVERED
→ FAILED
```

Mỗi notification event có dedupe key.

Retry phải có exponential backoff và dead-letter/manual review cho persistent failures.

---

# 28. Data Retention

Chính sách cần cấu hình theo environment/operator.

Ví dụ:

```text
Transactional booking/payment data
→ long-term retention

Telemetry raw
→ hot storage 7–30 days
→ archive after that

Application logs
→ 7–30 days hot

Audit logs
→ long-term
```

Retention phải tuân thủ quy định dữ liệu và chính sách doanh nghiệp thực tế.

---

# 29. Testing Strategy

## Unit tests

Bắt buộc cho:

- Segment overlap calculation.
- Seat locking.
- Booking state transitions.
- Payment state transitions.
- Refund policy.
- QR verification.
- ETA calculation.
- Geofence transition.
- Telemetry ordering.

## Integration tests

- PostgreSQL transaction/concurrency.
- Redis locking.
- Payment provider mock.
- MQTT ingestion.
- WebSocket event propagation.

## Load tests

Scenarios:

1. 5,000 concurrent seat-map users.
2. 1,000 concurrent WebSocket users.
3. High-conflict same-seat booking.
4. Telemetry burst after driver reconnect.
5. Payment callback retry storm.

## Chaos/failure tests

- Redis outage.
- PostgreSQL failover.
- MQTT disconnect.
- WebSocket reconnect storm.
- Payment provider timeout.
- Driver offline 30 minutes then reconnect.

---

# 30. Security Testing

- Authentication bypass.
- Broken access control.
- IDOR on booking/ticket/trip resources.
- JWT refresh token replay.
- OTP brute force.
- QR replay.
- QR tampering.
- Payment webhook forgery.
- WebSocket unauthorized subscription.
- MQTT topic authorization.
- Rate limit bypass.
- Sensitive data leakage in logs.

---

# 31. Project Repository Structure

Monorepo được khuyến nghị ở giai đoạn đầu:

```text
busgo/
├── apps/
│   ├── passenger_app/
│   ├── driver_app/
│   └── admin_portal/
│
├── services/
│   ├── core_api/
│   ├── telemetry_service/
│   └── notification_worker/
│
├── packages/
│   ├── api_contracts/
│   ├── domain_models/
│   └── shared_utils/
│
├── infra/
│   ├── docker/
│   ├── k8s/
│   ├── nginx/
│   ├── mqtt/
│   ├── postgres/
│   └── redis/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── events/
│   └── runbooks/
│
└── tests/
    ├── integration/
    ├── load/
    └── e2e/
```

---

# 32. Event Catalog

Core domain events:

```text
TRIP_PUBLISHED
TRIP_STARTED
TRIP_DELAYED
TRIP_COMPLETED
TRIP_CANCELLED

SEAT_HOLD_CREATED
SEAT_HOLD_EXPIRED
SEAT_HOLD_CANCELLED
SEAT_BOOKED
SEAT_RELEASED

BOOKING_CREATED
BOOKING_PAID
BOOKING_CANCELLED
BOOKING_REFUNDED

TICKET_ISSUED
TICKET_BOARDED
TICKET_NO_SHOW

VEHICLE_REPLACED
DRIVER_ASSIGNED
DRIVER_UNASSIGNED

TELEMETRY_RECEIVED
VEHICLE_POSITION_UPDATED
ETA_UPDATED

NOTIFICATION_CREATED
```

Mỗi event nên có:

```text
event_id
event_type
aggregate_id
aggregate_type
occurred_at
version
payload
```

---

# 33. Seat Hold + Booking Transaction — Reference Flow

```text
Passenger
   │
   │ POST /trips/T1/seat-holds
   ▼
Core API
   │
   ├── Validate trip
   ├── Validate segment
   ├── Validate requested seats
   │
   ├── Acquire Redis lock(s)
   │
   ├── DB transaction
   │     ├── Re-check occupancy
   │     ├── Create booking
   │     ├── Create booking_items
   │     └── Create occupancy records
   │
   ├── Commit
   │
   ├── Publish SEAT_HOLD_CREATED
   │
   └── Release Redis lock ownership token
   │
   ▼
Passenger
   │
   └── Countdown 10 min
```

Nếu DB commit thất bại:

```text
NO SUCCESS RESPONSE
NO BOOKING SUCCESS EVENT
RELEASE REDIS LOCK
```

---

# 34. Payment Flow — Reference

```text
Passenger
  ↓
Create Payment
  ↓
Provider
  ↓
Payment Pending
  │
  ├── SUCCESS ───────► webhook
  │                     ↓
  │                  idempotency check
  │                     ↓
  │                  mark payment PAID
  │                     ↓
  │                  mark booking PAID
  │                     ↓
  │                  issue ticket
  │                     ↓
  │                  release/cleanup hold
  │
  ├── FAILED
  └── EXPIRED
```

Frontend response timeout không được tự suy ra payment failed.

---

# 35. Driver Telemetry Flow — Reference

```text
Fused Location Provider
        ↓
Native Tracking Service
        ↓
Local Queue
        ↓
MQTT
        ↓
Telemetry Ingestion
        ↓
Validate / Deduplicate / Order
        ├──────────────► Redis latest position
        │
        ├──────────────► PostgreSQL telemetry history
        │
        └──────────────► ETA Engine
                                ↓
                           Redis Pub/Sub
                                ↓
                          WebSocket Gateway
                                ↓
                     Passenger + Admin Portal
```

---

# 36. Driver App Native Architecture

```text
Flutter UI
   │
   ├── Trip / Manifest / Boarding UI
   │
   ▼
Platform Channel / Native Bridge
   │
   ▼
TrackingService
   ├── FusedLocationProvider
   ├── Foreground Service
   ├── Local SQLite Queue
   ├── Connectivity Monitor
   ├── MQTT Client
   ├── Retry Scheduler
   └── Device/Permission Health
```

GPS engine không nên phụ thuộc vào lifecycle của Flutter widget/UI.

---

# 37. Production Readiness Checklist

## Booking

- [ ] Segment-based occupancy implemented.
- [ ] PostgreSQL concurrency protection verified.
- [ ] Redis lock ownership token implemented.
- [ ] Hold expiration handled server-side.
- [ ] Multi-seat atomic hold tested.
- [ ] Realtime seat events only after DB commit.

## Payment

- [ ] Provider signatures verified.
- [ ] Callback idempotency implemented.
- [ ] Reconciliation implemented.
- [ ] Refund state machine implemented.
- [ ] Payment audit trail implemented.

## Driver

- [ ] Native foreground tracking service.
- [ ] Offline queue.
- [ ] Sequence number.
- [ ] Permission health.
- [ ] Device/network recovery.
- [ ] Mock/stale location handling.

## Telemetry

- [ ] MQTT ACL.
- [ ] Latest state Redis.
- [ ] Partitioned history.
- [ ] Telemetry deduplication.
- [ ] Out-of-order handling.
- [ ] Stale detection.

## ETA

- [ ] Map matching.
- [ ] Route-aware remaining distance.
- [ ] Traffic strategy.
- [ ] Cache strategy.
- [ ] ETA confidence.
- [ ] Geofence state machine.

## Security

- [ ] RBAC.
- [ ] Resource-level authorization.
- [ ] Rotating refresh token.
- [ ] Rate limits.
- [ ] QR anti-replay.
- [ ] Webhook authentication.
- [ ] Audit logs.

## Operations

- [ ] Assignment conflict detection.
- [ ] Vehicle replacement.
- [ ] Seat mapping.
- [ ] Passenger notification.
- [ ] Rebooking/refund workflow.

---

# 38. Recommended Implementation Roadmap

## Phase 1 — Booking MVP

### Backend

- Auth.
- User.
- Route.
- Stop.
- Vehicle.
- Seat layout version.
- Trip.
- Trip stops.
- Trip seats.
- Segment-based booking.
- Redis seat hold.
- Booking.
- Basic payment.
- Ticket/QR.

### Passenger

- Login.
- Search.
- Trip detail.
- Segment selection.
- Seat map.
- Hold.
- Checkout.
- Ticket.

### Admin

- Vehicle.
- Seat layout.
- Route.
- Trip.
- Booking.

---

## Phase 2 — Driver & Telemetry

- Driver authentication.
- Manifest.
- Boarding.
- Native foreground GPS.
- Offline queue.
- MQTT.
- Telemetry ingestion.
- Redis latest location.
- WebSocket tracking.
- Admin radar.

---

## Phase 3 — ETA & Operations

- Map matching.
- ETA engine.
- Geofencing.
- Push notification.
- Route deviation.
- Long stop detection.
- Trip delay state.
- Driver/vehicle reassignment.

---

## Phase 4 — Production Hardening

- Payment reconciliation.
- Refund automation.
- Vehicle replacement.
- Advanced RBAC.
- Audit.
- Observability.
- Load tests.
- Chaos tests.
- Data retention/archive.
- Disaster recovery.

---

# 39. Key Architectural Decisions

| Decision | Recommendation |
|---|---|
| Backend | NestJS modular monolith initially |
| High-volume telemetry | Separate service |
| DB | PostgreSQL + PostGIS |
| Cache/lock | Redis |
| GPS ingestion | MQTT |
| Client realtime | WebSocket |
| Current location | Redis |
| History telemetry | PostgreSQL partitioning |
| Seat model | Trip + Seat + Segment |
| Lock source | Redis temporary lock |
| Booking source of truth | PostgreSQL |
| Seat layout | Versioned snapshot |
| Trip route | TripStop snapshot |
| Payment | Idempotent adapter model |
| ETA | Route-aware engine |
| Driver GPS | Native foreground service |
| Authorization | RBAC + resource scope |
| Architecture | Modular monolith + dedicated telemetry first |

---

# 40. Critical Invariants

Các invariant sau phải được coi là **hard business rules**:

1. Một ticket chỉ thuộc một booking item.
2. Một booking item chỉ thuộc một trip seat.
3. Một seat không thể bị chiếm bởi hai booking có segment overlap.
4. Booking success chỉ được xác nhận sau khi DB transaction commit.
5. Payment callback lặp lại không tạo thêm business effect.
6. Ticket đã boarded không thể boarded lần thứ hai.
7. Driver chỉ được thao tác trên trip được authorization.
8. Vehicle/driver không được dispatch vào các trip có lịch chồng lấn.
9. Telemetry duplicate không làm thay đổi latest state sai thứ tự.
10. Historical trip không bị thay đổi khi route/vehicle configuration hiện tại thay đổi.
11. Redis mất kết nối không được làm hệ thống bypass cơ chế chống double-booking.
12. WebSocket event không phải source of truth; client luôn có cách lấy authoritative snapshot.

---

# 41. Final Architecture Summary

BusGo nên được triển khai theo mô hình:

```text
                  BUSINESS TRANSACTIONS
                         │
                         ▼
               ┌─────────────────┐
               │   Core Backend  │
               │  NestJS / Go    │
               └───────┬─────────┘
                       │
          ┌────────────┼─────────────┐
          │            │             │
          ▼            ▼             ▼
      PostgreSQL     Redis        Payment
      + PostGIS     Lock/Cache   Providers
          │            │
          │            │
          │            └──── Pub/Sub ─────┐
          │                               │
          │                               ▼
          │                       Realtime Gateway
          │                               │
          │                         WebSocket
          │                               │
          │                    ┌──────────┴─────────┐
          │                    │                    │
          │                Passenger              Admin
          │
          │
          └──── Historical Telemetry

DRIVER APP
   │
   ├── Native GPS Foreground Service
   ├── SQLite Offline Queue
   └── MQTT
         │
         ▼
   Telemetry Service
      ├── Validate
      ├── Deduplicate
      ├── Latest Position → Redis
      ├── History → PostgreSQL
      └── ETA Engine
```

## Kết luận

Phiên bản 2.0 này biến spec ban đầu từ một **high-level system specification** thành một baseline có thể dùng để:

- thiết kế database chính thức;
- định nghĩa REST/WebSocket/MQTT contract;
- chia module cho backend/mobile/admin;
- viết acceptance criteria;
- thiết kế load/integration tests;
- và triển khai MVP mà không khóa kiến trúc vào những quyết định sai ngay từ đầu.

Đặc biệt, bốn thay đổi nền tảng cần giữ nguyên trong implementation là:

```text
1. Segment-based seat occupancy
2. PostgreSQL = source of truth, Redis = coordination
3. Trip/SeatLayout snapshot versioning
4. Idempotent Payment + ordered/offline Telemetry
```


---

# 42. SA/BA Enhancement Scope and Review Baseline

## 42.1. Objective of v3

Phiên bản 3.0 giữ nguyên các quyết định kiến trúc đúng của v2 và bổ sung các khoảng trống cần thiết để tài liệu có thể được dùng đồng thời cho:

- Business owner / Product Owner xác nhận nghiệp vụ.
- BA xây dựng backlog, use case, acceptance criteria và UAT.
- SA thiết kế component, data ownership, consistency model và integration.
- Backend/Mobile/Admin team triển khai API, state machine và UI.
- QA xây dựng test case chức năng, integration, concurrency, security và failure handling.
- DevOps/SRE xây dựng deployment, observability, backup/restore và DR.

## 42.2. Nguyên tắc review

Ba lớp phải được phân biệt rõ:

```text
Business Rule
    ↓
System Requirement
    ↓
Technical Design / Implementation Detail
```

Business rule không được ẩn trong code. Technical implementation không được làm thay đổi business behavior đã được phê duyệt.

## 42.3. Definition of Ready cho requirement

Một requirement được coi là Ready for Development khi có đủ:

1. Actor.
2. Trigger.
3. Preconditions.
4. Main flow.
5. Alternative flow.
6. Exception flow.
7. Business rules.
8. Data required.
9. Authorization.
10. Audit requirement.
11. Acceptance criteria.
12. Non-functional impact nếu có.

---

# 43. Business Context and Scope

## 43.1. Business objectives

BusGo phải hỗ trợ tối thiểu các mục tiêu nghiệp vụ:

- Tối đa hóa khả năng bán ghế theo từng đoạn tuyến.
- Không bán trùng ghế trên các segment giao nhau.
- Giảm thao tác thủ công trong điều phối.
- Cung cấp thông tin xe realtime cho hành khách và vận hành.
- Kiểm soát tiền mặt/COD và thanh toán điện tử.
- Giữ nguyên dữ liệu lịch sử sau khi route, vehicle hoặc pricing thay đổi.
- Cho phép xử lý sự cố vận hành mà không phá vỡ audit trail.

## 43.2. In scope

```text
Passenger
Driver / Assistant
Admin / Operations
Vehicle / Seat Layout
Route / Stop
Trip / Dispatch
Segment Inventory
Booking / Ticket
Payment / Refund / COD
Boarding / No-show
GPS Telemetry
Realtime Tracking
ETA / Geofence
Notification
Audit / Reporting
Security / Observability
```

## 43.3. Out of scope mặc định

Các nội dung sau không được suy diễn là có trong MVP nếu chưa được Product Owner phê duyệt:

- Loyalty / point.
- Subscription.
- Corporate account billing.
- Dynamic pricing theo machine learning.
- Driver payroll.
- Vehicle maintenance management đầy đủ.
- Marketplace nhiều operator độc lập.
- Cargo / parcel management.
- Multi-stop transfer orchestration giữa nhiều chuyến.

Nếu cần, phải tạo requirement riêng và đánh giá ảnh hưởng domain.

---

# 44. Business Assumptions and Open Decisions

Các nội dung chưa được định nghĩa rõ trong v2 phải được xem là **Open Decision**, không được developer tự chọn silent.

| ID | Decision | Default đề xuất | Owner |
|---|---|---|---|
| OD-001 | Một booking có nhiều hành khách hay mỗi passenger một booking item | Một booking có thể nhiều booking items | Product |
| OD-002 | Có cho phép đặt nhiều ghế cho cùng một passenger | Có, theo policy | Product |
| OD-003 | Có cho phép child/infant seat | Chưa mặc định | Product |
| OD-004 | COD chỉ dành cho agent hay Passenger | Cho phép nếu operator bật | Product |
| OD-005 | Payment success sau khi hold expired | Không auto-confirm; vào recovery/manual review | Finance/Product |
| OD-006 | Cancellation policy theo thời gian | Cấu hình theo operator | Product |
| OD-007 | Có cho phép pickup ngoài stop | Không trong baseline | Product |
| OD-008 | Có cho phép dropoff ngoài stop | Không trong baseline | Product |
| OD-009 | Một vehicle có được chạy nhiều route template | Có | Operations |
| OD-010 | Một trip có thể đổi driver khi ACTIVE | Có, phải audit | Operations |
| OD-011 | Passenger có nhìn thấy plate trước khi dispatch | Theo policy | Product |
| OD-012 | Passenger có tracking trước giờ departure | Không, trừ khi business yêu cầu | Product |
| OD-013 | ETA dùng traffic provider nào | Cấu hình provider | SA/Product |
| OD-014 | Data retention cụ thể | Chờ policy/legal | Legal/Product |
| OD-015 | Multi-tenant | Không bắt buộc MVP; nhưng model nên tránh khóa thiết kế | SA |

---

# 45. Glossary and Canonical Terminology

| Term | Definition |
|---|---|
| Route | Tuyến mẫu, định nghĩa thứ tự các stop |
| Route Stop | Stop thuộc route template |
| Trip | Một chuyến cụ thể theo ngày/giờ |
| Trip Stop | Snapshot stop của trip |
| Segment | Đoạn giữa hai stop liên tiếp |
| Trip Seat | Ghế cụ thể thuộc một trip |
| Occupancy | Quyền sử dụng seat trên một hoặc nhiều segment |
| Hold | Quyền giữ seat tạm thời trong thời gian giới hạn |
| Booking | Container của một hoặc nhiều booking items |
| Booking Item | Một quyền đặt seat cho một passenger/segment |
| Ticket | Credential để boarding |
| Boarding | Xác nhận passenger đã lên xe |
| No-show | Passenger không boarding theo policy |
| Dispatch | Gán resource cho trip và đưa trip vào trạng thái sẵn sàng chạy |
| Telemetry | Dữ liệu vị trí/thiết bị phát ra |
| Latest Position | Vị trí mới nhất có tính authoritative cho realtime |
| ETA | Thời gian dự kiến tới một stop cụ thể |
| Stale | Dữ liệu không còn đủ mới để coi là realtime |
| Reconciliation | Đối soát trạng thái với payment provider |
| Operational Override | Thao tác nghiệp vụ có quyền đặc biệt để xử lý ngoại lệ |

Canonical identifier phải dùng tên nhất quán xuyên API, DB, event, code và tài liệu.

---

# 46. Multi-Operator / Tenant Strategy

## 46.1. Recommendation

MVP có thể vận hành cho một operator, nhưng domain model không nên hard-code giả định `single tenant` nếu có khả năng sản phẩm phục vụ nhiều nhà xe.

Nếu hỗ trợ tenant từ đầu, các business resource chính nên có:

```text
tenant_id / operator_id
```

trên:

- vehicles.
- routes.
- trips.
- users/roles.
- bookings.
- pricing.
- payment configuration.
- notification configuration.
- operational scope.

## 46.2. Isolation rule

Mọi query business phải được scope theo tenant nếu tenant mode bật.

Không cho phép:

```text
Tenant A user
→ query resource của Tenant B
```

Resource-level authorization phải thực hiện sau khi resource đã được tenant scope.

---

# 47. Domain Ownership and Aggregate Boundaries

## 47.1. Recommended bounded contexts

```text
Identity & Access
Fleet
Route
Trip / Dispatch
Inventory / Seat
Booking
Ticket / Boarding
Payment
Operations
Telemetry
ETA / Location
Notification
Audit
Reporting
```

## 47.2. Source of truth theo domain

| Domain | Source of truth |
|---|---|
| Identity | PostgreSQL |
| Role / permission | PostgreSQL |
| Vehicle | PostgreSQL |
| Route | PostgreSQL |
| Trip | PostgreSQL |
| Seat inventory | PostgreSQL |
| Booking | PostgreSQL |
| Ticket | PostgreSQL |
| Payment | PostgreSQL + provider |
| Latest location | Redis + authoritative telemetry pipeline |
| Historical telemetry | PostgreSQL partitioned storage |
| Realtime delivery | WebSocket gateway / Redis Pub/Sub |
| Notification delivery | PostgreSQL + provider |
| Audit | Append-only PostgreSQL storage / immutable archive policy |

Redis must never be used as the only durable store for business state.

---

# 48. Booking Domain Refinement

## 48.1. Booking entity responsibilities

Booking chịu trách nhiệm:

- ownership của booking.
- tổng giá trị.
- payment association.
- lifecycle của transaction.
- cancellation/refund request.
- booking-level metadata.

Booking item chịu trách nhiệm:

- passenger cụ thể.
- trip seat.
- pickup/dropoff.
- segment.
- unit price.
- item status.

Ticket chịu trách nhiệm:

- boarding credential.
- boarding lifecycle.
- QR/security credential.

Không dùng `booking.status` để suy diễn tất cả item status trong các tình huống partial cancellation/rebooking.

## 48.2. Partial operation requirement

Hệ thống phải cho phép mô hình hóa trường hợp:

```text
Booking có 3 items
    ├── Item 1 → CONFIRMED
    ├── Item 2 → CANCELLED
    └── Item 3 → REFUNDED
```

Nếu product không hỗ trợ partial operation, phải ghi rõ constraint thay vì để data model ngầm giả định toàn booking atomic.

---

# 49. Seat Inventory — Production-Grade Consistency Model

## 49.1. Vấn đề của lock theo segment hash

Redis key dạng:

```text
seat_lock:{trip_id}:{seat_id}:{segment_hash}
```

chỉ ngăn được hai request có cùng key. Hai request khác nhau nhưng segment overlap có thể tạo hai Redis key khác nhau.

Do đó Redis lock **không đủ để đảm bảo business invariant**.

## 49.2. Mandatory database enforcement

Khuyến nghị production dùng một trong hai mô hình sau.

### Option A — PostgreSQL exclusion constraint

Chuẩn hóa segment thành range:

```text
int4range(from_stop_order, to_stop_order, '[)')
```

và áp dụng uniqueness theo:

```text
trip_id
trip_seat_id
segment_range
```

với điều kiện chỉ áp dụng cho occupancy đang active/reserved/held.

### Option B — Normalized trip seat segment inventory

Tạo một row cho mỗi segment:

```text
trip_seat_segment_inventory
---------------------------
id
trip_id
trip_seat_id
segment_order
status
hold_id
booking_item_id
```

Một booking từ stop 1 → 4 chiếm:

```text
1→2
2→3
3→4
```

Transaction lock các row này bằng database row-level lock.

## 49.3. Recommendation

Đối với MVP có số stop nhỏ và cố định theo trip, Option B dễ kiểm chứng nghiệp vụ và dễ debug.

Đối với volume lớn hoặc cần mô hình segment linh hoạt, Option A phù hợp hơn.

Không được để câu “có thể dùng exclusion constraint ở production hardening” nữa; một cơ chế database-level phải được chọn trước khi Production Go-Live.

## 49.4. Hold idempotency

Client retry cùng một request phải không tạo hai hold.

Request cần có:

```text
Idempotency-Key
```

Server lưu mapping:

```text
client/user + idempotency_key
→ request fingerprint
→ response/result
```

Nếu cùng key nhưng payload khác, trả conflict.

---

# 50. Seat Hold Lifecycle

## 50.1. Hold states

```text
CREATED
  ↓
ACTIVE
  ├── CONFIRMED
  ├── CANCELLED
  └── EXPIRED
```

## 50.2. Expiration behavior

Server phải coi `hold_expires_at` là authority nghiệp vụ.

Tại thời điểm request booking/payment:

```text
now < hold_expires_at
    → hold valid

now >= hold_expires_at
    → hold expired
```

Redis TTL chỉ là cleanup accelerator.

## 50.3. Expired hold race

Worker cleanup và user confirmation có thể chạy đồng thời.

Database transaction phải quyết định winner bằng:

- row/version lock.
- state transition validation.
- `hold_expires_at` check.

Không được quyết định chỉ dựa vào thời gian worker chạy.

---

# 51. Pricing and Fare Engine

## 51.1. Fare calculation pipeline

```text
Trip
 ↓
Origin Stop + Destination Stop
 ↓
Base Segment Price
 ↓
Vehicle/Fare Class Rule
 ↓
Campaign/Promotion
 ↓
Surcharge
 ↓
Booking Fee
 ↓
Discount
 ↓
Tax/VAT if applicable
 ↓
Rounding
 ↓
Final Amount
```

## 51.2. Price snapshot

Booking item phải lưu tối thiểu:

```text
base_unit_price
promotion_discount
surcharge_amount
booking_fee_allocated
fee/tax amount if applicable
final_unit_price
currency
pricing_rule_version
```

Không chỉ lưu `unit_price` nếu hệ thống cần audit về sau.

## 51.3. Price conflict

Sau khi user mở seat map, admin có thể thay đổi giá.

Khi checkout:

- hệ thống phải xác định price version.
- nếu policy cho phép giữ giá, áp dụng giá snapshot từ thời điểm hold.
- nếu không, báo price changed trước khi payment.

Business rule này phải được Product Owner phê duyệt.

---

# 52. Trip Lifecycle — Detailed State Model

## 52.1. Recommended states

```text
DRAFT
  ↓
PUBLISHED
  ↓
SCHEDULED
  ├── CANCELLED
  ├── DELAYED
  └── VEHICLE_REPLACEMENT_PENDING
        ↓
      SCHEDULED
        ↓
     BOARDING
        ↓
      ACTIVE
        ↓
     COMPLETED
```

`BOARDING` nên tồn tại nếu vận hành cần phân biệt thời gian xe đang chuẩn bị đón khách với thời điểm xe đã chạy.

## 52.2. State transition policy

| From | To | Actor | Conditions |
|---|---|---|---|
| DRAFT | PUBLISHED | Dispatcher | Route/vehicle/pricing valid |
| PUBLISHED | SCHEDULED | System/Dispatcher | Dispatch valid |
| SCHEDULED | BOARDING | Driver/Ops | Within allowed start window |
| BOARDING | ACTIVE | Driver/Ops | Trip start confirmed |
| ACTIVE | COMPLETED | Driver/Ops/System | End condition met |
| SCHEDULED | DELAYED | Ops/System | Delay threshold |
| SCHEDULED | CANCELLED | Authorized Ops | Cancellation policy |
| ACTIVE | DELAYED | Ops/System | Significant delay |

Mọi transition phải ghi audit event.

## 52.3. Start/stop trip idempotency

Gọi `POST /driver/trips/{trip_id}/start` nhiều lần phải không tạo duplicate start events gây sai duration.

API nên dùng idempotency key hoặc optimistic version check.

---

# 53. Route and Stop Business Rules

## 53.1. Stop invariants

Trong một route:

```text
stop_order unique
stop_order tăng dần
coordinates hợp lệ
origin < destination
```

## 53.2. Stop availability

Mỗi stop phải có cấu hình:

```text
pickup_enabled
 dropoff_enabled
```

Không cho phép passenger chọn:

```text
pickup stop không pickup_enabled
```

hoặc:

```text
dropoff stop không dropoff_enabled
```

## 53.3. Segment validity

```text
pickup.stop_order < dropoff.stop_order
```

Không cho phép cùng pickup/dropoff.

## 53.4. Stop ETA semantics

ETA tới stop phải được định nghĩa là:

```text
predicted arrival at stop zone
```

không phải thời điểm passenger boarding hoàn tất.

Nếu business cần ETA boarding, đó là metric khác.

---

# 54. Search and Availability Requirements

## 54.1. Search result contract

Mỗi search result nên xác định rõ:

```text
trip_id
route
pickup_stop
 dropoff_stop
scheduled_departure
scheduled_arrival
fare
currency
vehicle_type
available_seat_count
booking_cutoff
status
```

## 54.2. Availability semantics

`available_seat_count` phải là số seat đáp ứng **đúng segment request**.

Không dùng:

```text
vehicle.total_capacity - total booked seats
```

để trả availability cho sub-route.

## 54.3. Search consistency

Search result chỉ là snapshot không-authoritative.

Seat map và hold phải revalidate lại availability tại transaction boundary.

---

# 55. Booking Cutoff and Operational Time Rules

Cần cấu hình các mốc:

```text
booking_open_at
booking_close_at
seat_hold_close_at
online_payment_close_at
boarding_open_at
boarding_close_at
```

Ví dụ:

```text
Trip departure = 20:00
Online booking close = 19:30
Boarding starts = 19:15
```

Các mốc này phải được định nghĩa bằng business policy, không hard-code.

Timezone phải lưu dưới dạng UTC trong hệ thống và render theo timezone operator/user.

---

# 56. Cancellation / Rebooking / Refund Policy Engine

## 56.1. Cancellation matrix

Policy cần xét ít nhất:

```text
time_to_departure
payment_status
booking/item status
boarding status
operator-initiated vs passenger-initiated
trip cancelled vs passenger cancellation
```

## 56.2. Example policy model

| Scenario | Action |
|---|---|
| Passenger cancel before cutoff | Cancel + refund according to policy |
| Passenger cancel after cutoff | Cancel/no-refund or partial refund |
| Trip cancelled by operator | Refund full or rebook |
| Vehicle replacement breaks seat mapping | Rebook or refund |
| No-show | Follow no-show policy |
| Payment late after hold expiry | Recovery/manual review |

## 56.3. Rebooking

Rebooking phải tạo trace:

```text
old_booking_item
→ rebooking_case
→ new_booking_item
```

Không overwrite lịch sử booking cũ.

---

# 57. Payment Hardening

## 57.1. Payment idempotency levels

Phải chống duplicate ở ba tầng:

```text
API request
Provider callback
Business effect
```

## 57.2. Amount validation

Webhook không được chỉ tin `SUCCESS` từ provider.

Phải validate:

```text
provider transaction
provider status
currency
amount
merchant/account identifier
signature
booking/payment relationship
```

Amount callback phải khớp payment intent.

## 57.3. Late callback after cancellation

Scenario:

```text
Hold expired
→ booking cancelled
→ provider sends SUCCESS later
```

Không được tự động mark booking PAID nếu state transition không hợp lệ.

Kết quả phải vào:

```text
PAYMENT_EXCEPTION / MANUAL_REVIEW
```

và tạo reconciliation case.

## 57.4. Payment webhook transaction

Webhook handler nên:

1. Verify signature.
2. Validate payload.
3. Resolve payment by provider transaction ID.
4. Acquire DB transaction/row lock.
5. Validate allowed transition.
6. Persist provider event idempotently.
7. Update payment.
8. Update booking/item if valid.
9. Create outbox events.
10. Commit.
11. Return provider success response.

Business effect không được phụ thuộc vào việc frontend còn online hay không.

---

# 58. Outbox / Event Reliability

## 58.1. Problem

Flow:

```text
DB COMMIT
    ↓
publish event
```

Nếu process chết sau DB commit nhưng trước publish event, event sẽ mất.

## 58.2. Mandatory recommendation

Đối với business-critical domain events, dùng Transactional Outbox:

```text
Business Transaction
 ├── business tables
 └── outbox_events
          ↓
     commit together
          ↓
      Outbox Worker
          ↓
 Kafka/Redis/NATS/WebSocket/Notification/etc.
```

Nếu không dùng broker, outbox vẫn có thể được worker đọc trực tiếp.

## 58.3. Outbox fields

```text
id
aggregate_type
aggregate_id
event_type
payload
occurred_at
available_at
published_at
attempt_count
last_error
status
```

## 58.4. Exactly-once

Không yêu cầu infrastructure phải đảm bảo exactly-once.

Business consumer phải được thiết kế idempotent để đạt effectively-once effect.

---

# 59. Event Contract Standard

Mọi event phải tuân theo envelope chuẩn:

```json
{
  "event_id": "uuid",
  "event_type": "BOOKING_PAID",
  "event_version": 1,
  "aggregate_type": "booking",
  "aggregate_id": "uuid",
  "occurred_at": "2026-08-27T06:00:00Z",
  "producer": "core-api",
  "correlation_id": "uuid",
  "causation_id": "uuid",
  "payload": {}
}
```

## 59.1. Correlation

Một business journey phải trace được:

```text
request
→ booking
→ payment
→ event
→ ticket
→ notification
```

qua `correlation_id`.

## 59.2. Versioning

Không breaking change event payload mà không tăng `event_version`.

---

# 60. Driver / Crew Domain Refinement

## 60.1. User vs Driver profile

`users` chỉ là identity.

Nên có domain-specific entities:

```text
driver_profiles
crew_assignments

driver_devices
```

## 60.2. Driver device

Nên lưu:

```text
device_id
platform
app_version
os_version
model
last_seen_at
status
trusted_at
revoked_at
```

## 60.3. Assignment lifecycle

```text
ASSIGNED
→ ACCEPTED
→ ACTIVE
→ COMPLETED
```

Có thể có:

```text
ASSIGNED → DECLINED
ASSIGNED → REVOKED
```

Nếu driver đổi giữa chừng, assignment cũ phải được giữ lịch sử.

---

# 61. Manifest and Boarding Business Rules

## 61.1. Boarding validation

Trước khi board phải validate:

```text
ticket exists
trip matches current trip
 ticket not cancelled
 ticket not already boarded
boarding allowed at current operational state
pickup stop/current route position is compatible
```

Nếu scan QR ở nhầm trip, trả lỗi rõ ràng.

## 61.2. Manual boarding

Manual boarding phải yêu cầu:

- reason code.
- operator identity.
- timestamp.
- optional note.

## 61.3. No-show

Không được cho driver đặt NO_SHOW tùy ý nếu chưa tới policy cutoff.

Cần có:

```text
no_show_eligible_at
no_show_reason
contact_attempted
```

nếu business policy yêu cầu.

## 61.4. COD

COD nên có state riêng:

```text
NOT_REQUIRED
DUE
COLLECTED
PARTIAL
FAILED
WAIVED
```

Không dùng `payment.status` duy nhất để biểu diễn tiền mặt đang thu bởi driver.

---

# 62. Vehicle Replacement — Detailed Workflow

## 62.1. Replacement case

Tạo entity nghiệp vụ:

```text
vehicle_replacement_cases
```

với:

```text
trip_id
old_vehicle_id
new_vehicle_id
reason
initiated_by
initiated_at
status
```

## 62.2. Seat mapping

Mỗi mapping phải có:

```text
old_trip_seat_id
new_trip_seat_id
mapping_type
confidence
approved_by
```

`mapping_type`:

```text
EXACT
MANUAL
UNMAPPED
```

## 62.3. Safe auto-rebooking

Chỉ auto-rebook khi:

- ticket chưa boarded.
- new seat tồn tại.
- segment vẫn hợp lệ.
- không conflict.
- policy cho phép.

Nếu một điều kiện fail, chuyển manual resolution.

---

# 63. Telemetry — Security and Device Trust

## 63.1. MQTT authentication

Không cho driver publish chỉ dựa trên `trip_id` trong topic.

Thiết bị phải authenticate bằng credential hoặc certificate phù hợp.

ACL phải ràng buộc:

```text
device → allowed topic scope
```

Ví dụ device A không publish được trip của device B.

## 63.2. Payload trust

Server không được tin tuyệt đối:

```text
vehicle_id
trip_id
speed
device_timestamp
```

Server phải derive/validate association từ authenticated device và assignment hiện tại.

## 63.3. Device clock

Nếu device clock lệch quá threshold:

```text
clock_skew_detected = true
```

Telemetry vẫn có thể lưu raw nhưng quality phải phản ánh anomaly.

---

# 64. Telemetry Ordering Model — Correction

## 64.1. Sequence scope

`sequence` phải được định nghĩa scope rõ ràng.

Khuyến nghị:

```text
device_id + tracking_session_id + sequence
```

thay vì chỉ `device_id + trip_id` nếu một device có thể chạy nhiều phiên trong cùng trip hoặc reconnect/restart tạo session mới.

## 64.2. Tracking session

Mỗi lần Start Trip hoặc Tracking Service restart có thể tạo:

```text
tracking_session_id
```

Server dùng session để tránh sequence reset gây nhầm.

## 64.3. Latest state rule

Latest position update phải dựa trên:

```text
valid session
+ monotonic sequence where meaningful
+ device timestamp sanity
+ server receive time fallback
+ quality score
```

Không overwrite latest state bằng packet stale/out-of-order.

---

# 65. Telemetry Storage Strategy

## 65.1. Raw vs processed

Tách khái niệm:

```text
raw telemetry
processed telemetry
latest position
route position
ETA result
```

Không nên ép tất cả vào một bảng.

## 65.2. Retention tiers

```text
Hot raw telemetry
    ↓
Warm/archive telemetry
    ↓
Cold/delete according to policy
```

## 65.3. Data quality

Mỗi record nên có:

```text
quality_score / quality_flags
```

Ví dụ:

```text
LOW_ACCURACY
MOCK_LOCATION_SUSPECTED
CLOCK_SKEW
SPEED_OUTLIER
LATE_PACKET
DUPLICATE
GAP_AFTER_RECONNECT
```

---

# 66. Route Matching and ETA Acceptance Criteria

## 66.1. Route position

ETA engine phải xác định:

```text
current_route_segment
position_along_segment
remaining_distance_to_target_stop
```

## 66.2. Off-route behavior

Nếu vehicle lệch khỏi route vượt threshold:

```text
route_deviation = true
```

ETA không nên tiếp tục dùng static route distance một cách mù quáng.

## 66.3. ETA confidence

`confidence` phải có định nghĩa nghiệp vụ/kỹ thuật.

Ví dụ confidence có thể giảm khi:

- GPS accuracy thấp.
- telemetry stale.
- route deviation.
- traffic data unavailable.
- historical model thiếu dữ liệu.

Không dùng số 0.91 nếu chưa có cách tính rõ ràng.

## 66.4. ETA acceptance metrics

Nên đo ít nhất:

```text
MAE
P50 error
P90 error
P95 error
arrival early/late bias
```

theo:

```text
route
stop
time-of-day
vehicle type
traffic condition
```

---

# 67. Geofence Robustness

Geofence phải chống:

- GPS jitter.
- vehicle đứng sát ranh giới.
- mất GPS rồi reconnect.
- đi qua zone rất nhanh.
- reverse direction.

Nên có:

```text
entry hysteresis
exit hysteresis
minimum dwell
cooldown
```

Ví dụ:

```text
ENTER radius = 3 km
EXIT radius = 3.5 km
```

để tránh state flip liên tục.

---

# 68. Passenger Tracking Authorization

Passenger không nên chỉ được authorize bằng `trip_id`.

Cần kiểm tra association:

```text
Passenger
  ↓
Valid ticket/booking
  ↓
Trip
  ↓
Tracking entitlement
```

Sau khi ticket bị cancel/refund hoặc trip đã hoàn tất, tracking access phải được revoke theo policy.

Đặc biệt, không để endpoint:

```text
GET /trips/{trip_id}/tracking
```

trở thành public enumeration API.

---

# 69. API Standards

## 69.1. Common headers

Khuyến nghị:

```text
Authorization
Idempotency-Key
X-Correlation-Id
X-Client-Version
X-Device-Id
```

## 69.2. Standard response envelope

```json
{
  "data": {},
  "meta": {
    "request_id": "..."
  }
}
```

Error:

```json
{
  "error": {
    "code": "SEAT_NOT_AVAILABLE",
    "message": "Requested seat is no longer available",
    "details": {},
    "request_id": "..."
  }
}
```

## 69.3. Business error codes

Cần catalog riêng cho các lỗi quan trọng:

```text
TRIP_NOT_BOOKABLE
SEGMENT_INVALID
SEAT_NOT_AVAILABLE
SEAT_HOLD_EXPIRED
SEAT_HOLD_NOT_OWNER
BOOKING_STATE_INVALID
PAYMENT_STATE_INVALID
PAYMENT_AMOUNT_MISMATCH
PAYMENT_CALLBACK_DUPLICATE
TICKET_ALREADY_BOARDED
DRIVER_NOT_ASSIGNED
TRIP_NOT_ACTIVE
TRACKING_NOT_AUTHORIZED
VEHICLE_REPLACEMENT_REQUIRED
```

## 69.4. Pagination/filter/sort

Các API list phải định nghĩa:

- pagination style.
- maximum page size.
- stable sort.
- filtering.
- date range.

Không dùng offset pagination vô hạn cho telemetry hoặc audit volume lớn nếu cần cursor pagination.

---

# 70. API Idempotency Matrix

| API | Idempotency |
|---|---|
| OTP request | Business throttling/dedup |
| Seat hold | Mandatory |
| Booking create | Mandatory |
| Payment create | Mandatory |
| Payment webhook | Mandatory |
| Cancel booking | Mandatory |
| Refund | Mandatory |
| Driver start trip | Mandatory |
| Driver stop trip | Mandatory |
| Board ticket | Mandatory |
| No-show | Mandatory |
| Vehicle replacement | Mandatory |
| Dispatch | Mandatory |

---

# 71. RBAC and Permission Matrix

| Capability | Super Admin | Ops | Dispatcher | Agent | Driver | Finance |
|---|---:|---:|---:|---:|---:|---:|
| Manage users | ✓ | Limited | - | - | - | - |
| Manage vehicles | ✓ | ✓ | ✓ | - | - | - |
| Manage routes | ✓ | ✓ | ✓ | - | - | - |
| Create trip | ✓ | ✓ | ✓ | - | - | - |
| Dispatch | ✓ | ✓ | ✓ | - | - | - |
| View operations radar | ✓ | ✓ | ✓ | Limited | - | - |
| Create hotline booking | ✓ | ✓ | ✓ | ✓ | - | - |
| Refund | ✓ | Policy | - | - | - | ✓ |
| View payment details | ✓ | Limited | - | Limited | - | ✓ |
| Boarding override | ✓ | ✓ | ✓ | - | ✓ limited | - |
| View audit | ✓ | ✓ | Limited | - | - | ✓ |

Ma trận trên là baseline; permission thực tế phải kiểm tra cả resource scope.

---

# 72. Resource-Level Authorization Matrix

## Passenger

```text
Own profile
Own bookings
Own tickets
Trips visible to owned ticket/search result
```

## Driver

```text
Assigned trips
Assigned manifest
Assigned tickets
Assigned telemetry session
```

## Ticket Agent

```text
Bookings within assigned operation scope
Trips within assigned operation scope
Customer PII according to support need
```

## Dispatcher

```text
Fleet/Trips within region/operator scope
```

## Finance

```text
Payment/refund data within finance scope
```

Resource scope must be checked server-side for every endpoint, including WebSocket subscription and export API.

---

# 73. Audit Model Enhancement

Audit log tối thiểu:

```text
audit_id
actor_user_id
actor_role
action
resource_type
resource_id
before_snapshot_hash / before_summary
after_snapshot_hash / after_summary
reason
correlation_id
ip/device metadata if policy permits
occurred_at
```

## 73.1. Non-repudiation

Các thao tác nhạy cảm nên lưu đủ context để điều tra:

```text
who
what
when
where/source
why
before
after
```

Không nhất thiết log toàn bộ PII/raw payload.

---

# 74. Notification Architecture — Production Rules

## 74.1. Channels

Có thể có:

```text
Push
SMS
Email
In-app
```

Channel nào được bật phải cấu hình theo operator và event type.

## 74.2. Notification preference

Passenger nên có:

```text
transactional notifications = mandatory
marketing notifications = opt-in/out
```

## 74.3. Template versioning

Notification nên lưu:

```text
template_id
template_version
locale
rendered_payload_hash
```

để audit nội dung đã gửi.

---

# 75. Admin Operations Requirements

## 75.1. Operations Radar

Mỗi vehicle marker nên có:

```text
vehicle
trip
driver
status
last_update
stale flag
route position
ETA summary
route deviation
long stop
```

## 75.2. Drill-down

Từ marker phải truy cập được:

```text
Trip detail
Manifest
Current passengers
Telemetry health
ETA by stop
Event timeline
```

## 75.3. Operations timeline

Một trip nên có event timeline:

```text
published
assigned
driver started
first GPS
boarding started
delay detected
vehicle replacement
trip completed
```

---

# 76. Reporting Requirements

MVP tối thiểu nên có các báo cáo:

### Sales

```text
bookings/day
revenue/day
occupancy rate
segment load factor
cancellation rate
refund amount
```

### Operations

```text
on-time departure
on-time arrival
trip completion
vehicle utilization
driver utilization
boarding rate
no-show rate
```

### GPS

```text
telemetry coverage
stale vehicle rate
gps quality
route deviation events
```

### Payment

```text
success rate
failure rate
pending amount
refund amount
reconciliation mismatch
COD outstanding
```

Các metric cần định nghĩa công thức, timezone và source of truth.

---

# 77. Operational KPI Definitions

| KPI | Definition |
|---|---|
| Booking conversion | completed booking / valid booking attempts |
| Occupancy rate | occupied segment seats / sellable segment seat inventory |
| No-show rate | no-show tickets / expected boarding tickets |
| On-time departure | actual start <= scheduled start + tolerance |
| On-time arrival | actual arrival <= scheduled arrival + tolerance |
| Telemetry freshness | age of latest accepted telemetry |
| ETA MAE | mean absolute difference predicted vs actual arrival |

Tolerance phải được Product/Operations phê duyệt.

---

# 78. Non-Functional Requirements — Extended

## 78.1. Availability

Baseline đề xuất:

```text
Core API: 99.9% monthly
Booking critical path: 99.95% during operating hours if required
Realtime tracking: 99.5%
```

Đây là target để thảo luận, không phải SLA cam kết cho tới khi infrastructure/budget được xác nhận.

## 78.2. Recovery objectives

Cần chốt:

```text
RPO
RTO
```

Baseline đề xuất:

```text
RPO transactional DB <= 5 min
RTO core booking <= 30 min
```

Giá trị thực tế phụ thuộc architecture và budget.

## 78.3. Scalability

Thiết kế phải cho phép scale độc lập:

```text
API
WebSocket
MQTT
Telemetry processing
ETA workers
Notification workers
```

## 78.4. Security

Tối thiểu:

```text
TLS in transit
secret management
RBAC
resource authorization
rate limiting
audit
webhook verification
device authentication
PII protection
```

## 78.5. Privacy

PII cần có:

```text
purpose
retention
access scope
masking
export/delete policy where legally applicable
```

---

# 79. Disaster Recovery

## 79.1. Backup

PostgreSQL phải có:

- automated backup.
- point-in-time recovery nếu yêu cầu.
- backup verification.
- restore test định kỳ.

## 79.2. Redis recovery

Redis lost data không được làm mất booking truth.

Sau Redis restore/restart:

- cache có thể rebuild.
- active business holds phải reconcile từ DB.
- latest position có thể được rebuild từ latest valid telemetry hoặc stale state.

## 79.3. MQTT recovery

Driver offline queue là secondary recovery path.

Broker restart không được làm duplicate telemetry tạo business side effect.

---

# 80. Security Threat Model

## Threat categories

```text
Credential theft
OTP abuse
IDOR
Privilege escalation
Seat race
QR replay
Webhook forgery
MQTT impersonation
Tracking privacy leakage
PII leakage
DoS / rate abuse
Device compromise
Clock manipulation
```

## Security controls

```text
short-lived access token
refresh rotation
OTP rate limits
resource ACL
DB consistency constraints
signed webhook
MQTT auth + ACL
signed QR / anti-replay
PII masking
audit
anomaly detection
```

---

# 81. QR Credential Design

QR nên được coi là **credential**, không phải source of truth.

## 81.1. Recommended model

```text
ticket_id
credential_id
nonce
issued_at
expires_at
key_version
signature
```

## 81.2. Scan flow

```text
Scan
 ↓
Decode
 ↓
Signature verify
 ↓
Credential validity
 ↓
Ticket lookup
 ↓
Trip validation
 ↓
Boarding policy
 ↓
Atomic state transition
 ↓
Audit event
```

`ALREADY_BOARDED` phải được quyết định từ backend state, không phải chỉ từ QR payload.

---

# 82. Data Integrity Rules

Database constraints cần được ưu tiên ở nơi có thể:

```text
NOT NULL
UNIQUE
FOREIGN KEY
CHECK
EXCLUSION / range constraint where applicable
```

Không chỉ dựa vào validation ở NestJS/Go.

Ví dụ:

```text
from_stop_order < to_stop_order
amount >= 0
capacity > 0
stop_order unique per route/trip
plate unique
PNR unique
ticket_code unique
provider transaction unique when available
```

---

# 83. Concurrency Scenarios — Mandatory Test Matrix

| Scenario | Expected result |
|---|---|
| 2 users same seat same segment | 1 success, 1 conflict |
| 2 users same seat non-overlap segment | both success |
| 2 users same seat partially overlap | only 1 success |
| Multi-seat request one seat conflict | entire request fail |
| Hold expires during payment | deterministic recovery state |
| Duplicate booking request | same logical booking/result |
| Duplicate webhook | one business effect |
| Webhook + timeout | eventual consistent correct status |
| Two dispatchers assign same vehicle | one wins |
| Driver + ops start trip | one canonical active transition |
| Two QR scans simultaneously | one boarded, one already-boarded |
| Duplicate telemetry | no latest-state regression |
| Out-of-order telemetry | latest state remains valid |
| Reconnect with sequence gap | data retained, gap observable |

---

# 84. Acceptance Criteria Standard

Mỗi feature phải dùng Given/When/Then.

## Example — Seat Hold

```text
Given trip T is bookable
And seat A1 is available for segment 1→3
When passenger requests hold for A1
Then the server creates one active hold
And returns hold_expires_at
And publishes no event before DB commit
```

## Example — Overlap Conflict

```text
Given A1 is occupied on 1→3
When another passenger requests A1 on 2→4
Then request is rejected as SEAT_NOT_AVAILABLE
```

## Example — Non-overlap

```text
Given A1 is occupied on 1→3
When another passenger requests A1 on 3→4
Then request is allowed if all other rules pass
```

## Example — Duplicate Payment Callback

```text
Given payment P is already SUCCESS
When the same provider callback is received again
Then no second ticket is created
And no duplicate notification is created
```

---

# 85. End-to-End Business Journey

## 85.1. Passenger journey

```text
Discover trip
 ↓
Select pickup/dropoff
 ↓
View segment-specific availability
 ↓
Select passenger(s)
 ↓
Select seat(s)
 ↓
Hold
 ↓
Checkout
 ↓
Payment/COD
 ↓
Ticket issued
 ↓
Pre-trip notification
 ↓
Live tracking
 ↓
Boarding
 ↓
Trip completion
```

## 85.2. Driver journey

```text
Login
 ↓
View assignment
 ↓
Accept assignment
 ↓
Pre-trip device/GPS health
 ↓
Start trip / Boarding
 ↓
Telemetry
 ↓
Manifest + Boarding
 ↓
COD collection
 ↓
Trip active
 ↓
Stop trip
 ↓
Final telemetry flush
 ↓
Completion
```

## 85.3. Operations journey

```text
Configure fleet
 ↓
Configure route
 ↓
Configure pricing
 ↓
Create trip
 ↓
Dispatch
 ↓
Monitor radar
 ↓
Resolve delays/incidents
 ↓
Replace vehicle if necessary
 ↓
Resolve affected tickets
 ↓
Close trip
 ↓
Reconcile payment/operations
```

---

# 86. Exception Catalog

Hệ thống phải có cách xử lý rõ cho ít nhất:

```text
E-001 Seat conflict
E-002 Hold expiration
E-003 Payment timeout
E-004 Payment late success
E-005 Duplicate webhook
E-006 Refund provider failure
E-007 Driver device offline
E-008 GPS permission revoked
E-009 GPS spoof suspicion
E-010 MQTT unavailable
E-011 WebSocket unavailable
E-012 ETA provider unavailable
E-013 Route deviation
E-014 Vehicle replacement
E-015 Seat mapping failure
E-016 Duplicate QR scan
E-017 Wrong-trip QR scan
E-018 Driver unauthorized trip
E-019 Dispatch conflict
E-020 Database unavailable
E-021 Redis unavailable
E-022 Notification delivery failure
E-023 Duplicate telemetry
E-024 Sequence gap
E-025 Clock anomaly
```

Mỗi exception nên có:

```text
trigger
user impact
system behavior
retry policy
manual action
audit requirement
metric/alert
```

---

# 87. API Coverage Gap Matrix

API v2 mới dừng ở endpoint list. Trước implementation cần bổ sung nhóm API sau.

## Passenger

```http
GET  /me
PATCH /me
GET /me/contacts
POST /me/contacts
DELETE /me/contacts/{id}
GET /bookings
GET /tickets
POST /bookings/{id}/payment-intent
GET /bookings/{id}/tracking-access
GET /trips/{id}/eta?stop_id=...
```

## Driver

```http
GET  /driver/me
GET  /driver/devices
POST /driver/devices/register
POST /driver/devices/{id}/revoke
POST /driver/trips/{id}/accept
POST /driver/trips/{id}/boarding-start
POST /driver/tickets/{id}/collect-cod
GET  /driver/trips/{id}/telemetry-health
```

## Admin

```http
GET  /admin/vehicles
PATCH /admin/vehicles/{id}
GET  /admin/routes
PATCH /admin/routes/{id}
POST /admin/trips/{id}/publish
POST /admin/trips/{id}/cancel
POST /admin/trips/{id}/delay
POST /admin/trips/{id}/assign-driver
POST /admin/trips/{id}/unassign-driver
GET  /admin/trips/{id}/manifest
GET  /admin/trips/{id}/timeline
POST /admin/replacement-cases
GET  /admin/payment-reconciliation/cases
GET  /admin/reports/*
```

Tên endpoint là baseline; contract đầy đủ phải được define bằng OpenAPI.

---

# 88. OpenAPI / Contract-First Requirement

Trước khi coding client/server song song, phải có:

```text
openapi.yaml
websocket-events.yaml
mqtt-contract.yaml
error-codes.yaml
```

API contract phải chứa:

- request schema.
- response schema.
- authorization.
- idempotency semantics.
- validation.
- error codes.
- examples.
- pagination.

Contract version phải được quản lý.

---

# 89. Frontend / UX Functional Requirements

## Passenger

Các màn hình tối thiểu:

```text
Splash / Auth
Home / Search
Search Result
Trip Detail
Pickup/Dropoff Selection
Seat Map
Passenger Information
Checkout
Payment
Booking Result
Ticket
Tracking
Booking History
Booking Detail
Profile
Notification Center
```

## Driver

```text
Login
Trip List
Trip Detail
Pre-trip Health
Manifest
Boarding Scanner
Manual Boarding
COD Collection
Live Trip
GPS/Connection Status
Incident / Report
Trip Summary
```

## Admin

```text
Login
Dashboard
Fleet
Vehicle Detail
Seat Layout Builder
Routes
Stop Management
Trip Planner
Dispatch Board
Booking/POS
Live Radar
Replacement Workflow
Payment/Reconciliation
Users/Roles
Audit
Reports
Settings
```

Mỗi màn hình phải được mô tả riêng bằng functional spec ở cấp UI trong tài liệu sản phẩm tương ứng.

---

# 90. UX States / Empty / Error / Offline Requirements

Mọi màn hình critical phải định nghĩa:

```text
Loading
Success
Empty
Validation error
Business error
Network error
Offline
Stale data
Unauthorized
Forbidden
Expired
Retrying
```

Driver app phải đặc biệt hiển thị:

```text
GPS OFF
Permission revoked
MQTT offline
Pending upload count
Last successful sync
Device clock warning
Battery/OS restriction warning where applicable
```

---

# 91. Localization and Time Rules

Hệ thống phải hỗ trợ:

- timezone-aware datetime.
- locale-aware currency formatting.
- Vietnamese diacritics.
- phone normalization.

Phone number phải có canonical format trong backend; display format có thể khác.

Date/time API nên dùng ISO 8601 UTC.

---

# 92. Data Migration and Versioning

Mọi thay đổi schema production phải có migration script.

Không sửa trực tiếp production DB bằng tay mà không có migration/audit.

Migration phải có:

```text
forward migration
rollback strategy or compensating strategy
data backfill plan
verification query
performance impact
```

Seat layout và pricing có version độc lập với application release.

---

# 93. Feature Flags and Operational Controls

Nên có feature/config flags cho:

```text
COD enabled
online payment provider enabled
tracking enabled
ETA provider
traffic enabled
promotion enabled
vehicle replacement auto-rebook
no-show policy
booking cutoff
```

Feature flags business-critical phải audit được ai thay đổi, khi nào và giá trị cũ/mới.

---

# 94. Observability — Alerting Rules

Metrics không đủ; cần alert.

## Booking alerts

```text
seat conflict spike
booking conversion drop
payment success drop
DB lock wait increase
```

## Telemetry alerts

```text
stale vehicle ratio spike
MQTT connection failures
telemetry ingestion lag
sequence gap spike
```

## ETA alerts

```text
ETA calculation latency spike
routing provider error rate
ETA error P95 degradation
```

## Payment alerts

```text
pending payment accumulation
reconciliation mismatch spike
refund failure spike
webhook signature failure spike
```

Alert thresholds phải cấu hình theo traffic baseline.

---

# 95. Logging Policy

Không log:

```text
OTP
JWT
refresh token
payment secret
CVV/card secret
full QR credential
unmasked PII unless justified
```

Có thể log masked identifiers:

```text
phone_hash / masked_phone
booking_id
payment_id
trip_id
```

Production logs phải hỗ trợ correlation nhưng không biến thành PII dump.

---

# 96. Testing Pyramid

```text
                 E2E
              /       \
        Contract     Chaos
       /                  \
 Integration             Load
       \                  /
        Domain / Service Unit
```

Tập trung test deterministic business rule ở domain/service layer và test concurrency ở integration layer.

---

# 97. Contract Testing

Mỗi provider/integration phải có contract tests cho:

```text
Payment provider
MQTT broker behavior
Map provider
Push notification provider
SMS provider if used
```

Mục tiêu là phát hiện breaking change trước production.

---

# 98. Load Test Workload Model

Không chỉ test “5,000 users”.

Cần mô phỏng workload mix:

```text
40% search
25% trip detail / seat map
10% hold
8% checkout
5% booking history
5% tracking
3% admin operations
2% realtime reconnect
2% payment callbacks
```

Tỷ lệ này chỉ là baseline giả định để thiết kế test; phải điều chỉnh theo production telemetry thực tế.

---

# 99. Capacity Planning Formula

Telemetry:

```text
events/sec
= active_tracking_devices × events_per_device_per_sec
```

Daily records:

```text
events/day
= events/sec × 86,400
```

DB storage estimate:

```text
raw records/day × average bytes/record
+ index overhead
+ replication
+ backup
```

WebSocket:

```text
connections
× avg messages/sec
× avg message size
```

Các công thức phải được dùng trong capacity review trước production.

---

# 100. Deployment Architecture

## Environment separation

```text
local
DEV
QA
UAT
STAGING
PROD
```

Mỗi environment phải có:

- credentials riêng.
- payment sandbox/live separation.
- MQTT namespace riêng.
- database riêng.
- secrets riêng.

## Deployment

Recommended baseline:

```text
Load Balancer
 ↓
Stateless API instances
 ↓
PostgreSQL HA
Redis HA
MQTT cluster
Telemetry workers
ETA workers
Notification workers
WebSocket gateway cluster
```

---

# 101. Kubernetes / Runtime Readiness

Nếu chạy Kubernetes, mỗi service cần định nghĩa:

```text
Deployment
Service
ConfigMap
Secret reference
HPA
PDB
Readiness probe
Liveness probe
Startup probe
Resource request/limit
```

Stateful dependencies như PostgreSQL/Redis/MQTT nên dùng managed service hoặc architecture có HA rõ ràng, thay vì mặc định tự host trong cùng cluster mà không có operational ownership.

---

# 102. Release Strategy

Khuyến nghị:

```text
DB migration
 ↓
Backend backward-compatible release
 ↓
Mobile/Admin release
 ↓
Feature flag enable
 ↓
Monitor
 ↓
Progressive rollout
```

Không deploy breaking API trước khi client tương thích.

---

# 103. Mobile App Update Strategy

Passenger có thể dùng app version cũ.

Driver app nghiêm trọng hơn vì telemetry/boarding.

Cần có:

```text
minimum_supported_version
recommended_version
forced_upgrade_version
```

Server phải backward compatible trong khoảng version được hỗ trợ.

---

# 104. Incident Management

Mỗi operational incident cần:

```text
incident_id
severity
start_at
detected_at
resolved_at
affected_services
customer_impact
root_cause
mitigation
follow_up_actions
```

Severity baseline:

```text
SEV1: booking/payment/data integrity critical
SEV2: major operational degradation
SEV3: localized feature degradation
SEV4: minor/non-urgent
```

---

# 105. Runbook Requirements

Runbook tối thiểu phải có:

```text
Redis outage
PostgreSQL failover
MQTT outage
Payment provider outage
Map provider outage
Notification provider outage
WebSocket outage
Telemetry backlog
Sequence gap storm
Duplicate payment incident
Vehicle replacement incident
Data restore
```

---

# 106. Go-Live Gates

Production Go-Live chỉ đạt khi:

## Functional

- [ ] Core happy paths pass.
- [ ] All state transitions tested.
- [ ] Cancellation/refund policy validated.
- [ ] Vehicle replacement validated.
- [ ] Boarding/no-show validated.

## Data Integrity

- [ ] Seat concurrency test pass.
- [ ] Payment idempotency pass.
- [ ] Database constraints enabled.
- [ ] Migration verified.

## Security

- [ ] IDOR test pass.
- [ ] RBAC test pass.
- [ ] MQTT ACL verified.
- [ ] Webhook signature verified.
- [ ] QR anti-replay verified.

## Reliability

- [ ] Redis failure test pass.
- [ ] DB failover test pass.
- [ ] MQTT reconnect test pass.
- [ ] Driver offline replay pass.
- [ ] WebSocket reconnect pass.

## Operations

- [ ] Monitoring enabled.
- [ ] Alerting enabled.
- [ ] Backup verified.
- [ ] Restore test completed.
- [ ] Runbooks approved.

---

# 107. Definition of Done

Feature chỉ được coi là Done khi:

1. Requirement và acceptance criteria được approve.
2. API/event contracts cập nhật.
3. DB migration hoàn chỉnh.
4. Unit tests pass.
5. Integration tests pass.
6. Security checks pass.
7. Observability có metric/log/trace cần thiết.
8. Audit requirement hoàn thành.
9. Failure path được test.
10. Documentation cập nhật.
11. QA/UAT sign-off.

---

# 108. Traceability Matrix

Mỗi business requirement phải trace được:

```text
Business Requirement
    ↓
Functional Requirement
    ↓
Use Case
    ↓
API / Event
    ↓
DB Entity
    ↓
Implementation Module
    ↓
Test Case
    ↓
UAT Case
```

Ví dụ:

```text
BR-BOOK-001
→ F-PAS-04
→ UC-BOOK-SELECT-SEAT
→ POST /trips/{id}/seat-holds
→ trip_seat_segment_inventory
→ BookingModule
→ TC-BOOK-CONCURRENCY-001
→ UAT-BOOK-001
```

---

# 109. BA Use Case Catalog

| UC | Name | Primary Actor |
|---|---|---|
| UC-001 | Login Passenger | Passenger |
| UC-002 | Search Trip | Passenger |
| UC-003 | Select Segment | Passenger |
| UC-004 | Hold Seat | Passenger |
| UC-005 | Create Booking | Passenger |
| UC-006 | Pay Booking | Passenger |
| UC-007 | View Ticket | Passenger |
| UC-008 | Track Vehicle | Passenger |
| UC-009 | Login Driver | Driver |
| UC-010 | Start Trip | Driver |
| UC-011 | Scan Ticket | Driver |
| UC-012 | Collect COD | Driver |
| UC-013 | Upload Telemetry | Driver Device |
| UC-014 | Manage Vehicle | Admin |
| UC-015 | Manage Route | Admin |
| UC-016 | Create/Publish Trip | Dispatcher |
| UC-017 | Dispatch Crew | Dispatcher |
| UC-018 | Live Operations | Ops |
| UC-019 | Replace Vehicle | Ops |
| UC-020 | Refund Booking | Finance/Ops |
| UC-021 | Reconcile Payment | Finance |
| UC-022 | Audit Investigation | Admin/Ops |

---

# 110. Detailed Use Case Template

Mỗi UC phải có:

```text
ID
Name
Goal
Primary actor
Supporting actors
Trigger
Preconditions
Postconditions
Main flow
Alternative flows
Exception flows
Business rules
Authorization
Data changes
Events emitted
Notifications
Audit
Acceptance criteria
```

---

# 111. Reference Use Case — UC-004 Hold Seat

**Goal:** Passenger giữ một hoặc nhiều seat cho một segment.

**Preconditions:**

- User authenticated.
- Trip bookable.
- Segment valid.
- Seat selectable.

**Main flow:**

1. Passenger gửi request + idempotency key.
2. API validate input.
3. Check authorization.
4. Acquire concurrency protection.
5. Start DB transaction.
6. Recheck inventory.
7. Create hold.
8. Reserve inventory.
9. Persist expiration.
10. Insert outbox event.
11. Commit.
12. Return hold.

**Failure:**

- conflict → `SEAT_NOT_AVAILABLE`.
- expired trip → `TRIP_NOT_BOOKABLE`.
- Redis unavailable → fail-safe.
- DB unavailable → fail-safe.

**Acceptance:**

- không double-book.
- retry same idempotency key returns same logical result.
- event published only after commit.

---

# 112. Reference Use Case — UC-019 Vehicle Replacement

**Goal:** đổi xe mà không phá vỡ ticket history.

Flow:

```text
Ops selects trip
 ↓
Select replacement vehicle
 ↓
System validates availability
 ↓
Create replacement case
 ↓
Build seat mapping
 ↓
Identify affected tickets
 ↓
Auto-rebook safe tickets
 ↓
Route unresolved tickets to manual queue
 ↓
Notify passengers
 ↓
Audit
```

Không overwrite `ticket` historical vehicle metadata.

---

# 113. Backward Compatibility Rules

## Database

Migration phải hỗ trợ rolling deployment nếu có nhiều backend versions.

## API

Không remove field ngay.

Dùng additive change trước khi deprecate.

## Event

Consumer phải ignore field mới không sử dụng.

Breaking event change phải version hóa.

## Mobile

Backend phải support minimum app versions trong khoảng đã cam kết.

---

# 114. Data Export and Support Tools

Operations support có thể cần:

```text
Booking detail export
Trip manifest export
Payment reconciliation export
Audit export
Telemetry diagnostic export
```

Export phải:

- permission-controlled.
- audited.
- PII-aware.
- bounded by date/filter.

---

# 115. Manual Review Queue

Các case sau phải có queue:

```text
late payment success
payment mismatch
refund failed
vehicle replacement unresolved
seat mapping unresolved
fraud/QR anomaly
telemetry anomaly requiring investigation
```

Mỗi case:

```text
case_id
type
priority
status
assigned_to
created_at
updated_at
resolution
resolved_at
```

---

# 116. Fraud / Abuse Controls

MVP nên có basic controls:

```text
OTP rate limit
multiple holds per user/device limit
rapid booking anomaly
payment retry anomaly
QR scan velocity anomaly
fake GPS signal flag
```

Các rule nâng cao có thể phát triển sau khi có data.

---

# 117. Data Quality Monitoring

Nên có data quality checks:

```text
trip without stops
trip without valid seat layout
booking with invalid segment
occupied seat without booking item
payment success without booking
booking paid without ticket after timeout
telemetry with impossible coordinates
negative/absurd ETA
```

Các invariant monitoring có thể chạy định kỳ.

---

# 118. Reconciliation Jobs

Không chỉ payment.

Cần các reconciliation jobs:

```text
Payment vs provider
Booking vs occupancy
Ticket vs booking item
Trip vs crew assignment
Trip vs vehicle assignment
Telemetry latest state vs latest accepted packet
Notification event vs delivery
```

---

# 119. Scheduler / Background Jobs Catalog

```text
JOB-001 Expire seat holds
JOB-002 Reconcile payments
JOB-003 Process refunds
JOB-004 Publish outbox
JOB-005 Retry notifications
JOB-006 Archive telemetry
JOB-007 Detect stale vehicles
JOB-008 Detect long stops
JOB-009 Detect route deviation
JOB-010 Reconcile occupancy invariants
JOB-011 Cleanup sessions
JOB-012 Generate operational reports
```

Mỗi job cần idempotency và distributed lock / lease nếu chạy nhiều instance.

---

# 120. Background Job Reliability

Mọi job phải có:

```text
job_id
status
attempt
started_at
completed_at
last_error
next_retry_at
```

Không để một record lỗi vô hạn làm block toàn batch.

---

# 121. Architecture Decision Records (ADR)

Nên tạo ADR tối thiểu:

```text
ADR-001 Modular monolith
ADR-002 PostgreSQL source of truth
ADR-003 Redis temporary lock
ADR-004 Segment-based occupancy
ADR-005 Database-level seat consistency
ADR-006 MQTT telemetry
ADR-007 WebSocket realtime
ADR-008 Native driver foreground service
ADR-009 Transactional outbox
ADR-010 PostgreSQL telemetry partitioning
ADR-011 ETA provider strategy
ADR-012 Vehicle replacement model
ADR-013 Payment adapter abstraction
```

Mỗi ADR có:

```text
Context
Decision
Alternatives
Consequences
Status
Date
Owner
```

---

# 122. Recommended Repository Contract

Bổ sung:

```text
contracts/
  openapi/
  websocket/
  mqtt/
  events/
  error-codes/

architecture/
  adrs/
  c4/
  sequence-diagrams/
  data-model/

product/
  use-cases/
  business-rules/
  acceptance-criteria/
  uat/

runbooks/
```

Mục tiêu là tách rõ artifact của BA, SA, Dev và QA.

---

# 123. C4 Architecture Documentation

Nên duy trì bốn mức:

```text
Context
Container
Component
Code
```

Context diagram phải thể hiện:

```text
Passenger
Driver
Operations
Payment Providers
Map Providers
Push/SMS
BusGo
```

Container diagram phải thể hiện:

```text
Passenger App
Driver App
Admin Portal
Core API
Telemetry Service
ETA Engine
Realtime Gateway
PostgreSQL
Redis
MQTT
Notification Service
Payment Providers
```

---

# 124. Sequence Diagrams Required

Trước implementation, phải có sequence diagram cho tối thiểu:

```text
SD-001 Search + Seat Map
SD-002 Seat Hold
SD-003 Booking + Payment
SD-004 Duplicate Payment Callback
SD-005 Booking Cancellation + Refund
SD-006 Driver Start Trip
SD-007 Telemetry Ingestion
SD-008 Offline Replay
SD-009 ETA Update
SD-010 Passenger Tracking Reconnect
SD-011 Boarding QR
SD-012 Vehicle Replacement
SD-013 Dispatch Conflict
SD-014 Notification Retry
```

---

# 125. Final SA Review — What v2 Already Got Right

Các quyết định sau của v2 được giữ nguyên vì phù hợp:

1. PostgreSQL là business source of truth. fileciteturn2file0L34-L44
2. Segment-based occupancy là core model. fileciteturn2file0L606-L658
3. Trip/seat layout snapshot bảo vệ lịch sử. fileciteturn2file1L1045-L1077
4. Payment callback được thiết kế idempotent. fileciteturn2file1L869-L946
5. Telemetry có sequence/offline ordering model. fileciteturn2file2L1747-L1769
6. WebSocket không được coi là source of truth và có snapshot khi reconnect. fileciteturn2file2L1431-L1475
7. Driver GPS được tách khỏi Flutter UI lifecycle. fileciteturn2file3L2188-L2209
8. Các invariant quan trọng đã được xác định rõ. fileciteturn2file3L2389-L2404

---

# 126. Final SA Review — Mandatory Changes Before Implementation

Các điểm dưới đây phải được coi là **P0 / blocker** trước production design sign-off:

### P0-01 Database-level seat concurrency

Không để database enforcement ở dạng “optional hardening”. Phải chọn exclusion constraint hoặc normalized segment inventory.

### P0-02 Transactional Outbox

Các event business-critical phải có outbox để tránh DB commit thành công nhưng event mất.

### P0-03 Payment late-success recovery

Phải định nghĩa rõ payment success đến sau khi hold/booking đã expired/cancelled.

### P0-04 Partial cancellation/rebooking

Phải xác định booking-level hay booking-item-level lifecycle.

### P0-05 COD state

Tách COD collection khỏi payment provider state.

### P0-06 Boarding policy

Phải định nghĩa boarding window, wrong-trip scan, late boarding, manual override và no-show.

### P0-07 Driver device/session model

Sequence phải gắn với tracking session để xử lý restart/reset.

### P0-08 Tracking authorization

Không cho phép query tracking chỉ dựa trên trip ID.

### P0-09 Pricing version and formula

Phải snapshot đủ pricing components và version rule.

### P0-10 API contract

Phải chuyển endpoint list thành OpenAPI contract đầy đủ.

---

# 127. Final BA Review — Requirements That Must Be Approved

Product/Business phải chốt trước UAT:

```text
booking cutoff
cancellation cutoff
refund formula
COD eligibility
late payment handling
no-show policy
boarding window
vehicle replacement policy
seat remapping policy
passenger tracking visibility
ETA expectation / tolerance
notification policy
PII retention
operator/tenant scope
```

Nếu chưa chốt, requirement phải ở trạng thái `OPEN`, không coi là implementation-ready.

---

# 128. Revised Implementation Roadmap

## Phase 0 — Discovery & Contract

```text
Business rule workshop
Use case
State machine review
Open decision closure
API contract
Event contract
ERD
Sequence diagram
ADR
```

## Phase 1 — Booking Foundation

```text
Identity
Route/Stop
Fleet/Seat Layout
Trip
Segment Inventory
Concurrency protection
Pricing
Booking
Payment adapter
Ticket/QR
Passenger MVP
Admin MVP
```

## Phase 2 — Driver / Boarding

```text
Driver identity/device
Assignment
Manifest
Boarding
COD
Native tracking service
Telemetry session
Offline queue
MQTT
```

## Phase 3 — Realtime / ETA / Operations

```text
Telemetry ingestion
Latest state
WebSocket
Tracking authorization
Map matching
ETA
Geofence
Notifications
Operations radar
```

## Phase 4 — Operational Resilience

```text
Vehicle replacement
Rebooking
Refund automation
Reconciliation
Manual review queue
Outbox
Audit
Reporting
```

## Phase 5 — Production Hardening

```text
Load
Chaos
Security testing
DR
Backup restore
Capacity planning
Alerting
Runbooks
Go-live certification
```

---

# 129. Final Readiness Scorecard

Đánh giá sau khi áp dụng v3:

| Area | v2 assessment | v3 target |
|---|---|---|
| Core architecture | Strong | Production-ready baseline |
| Booking concept | Strong | Strong + DB-enforced concurrency |
| Segment inventory | Strong | Production-safe |
| Payment | Good | Complete with exception handling |
| Driver | Good | Complete device/session model |
| Telemetry | Good | Production-grade ordering/security |
| ETA | Conceptually good | Measurable/operationalized |
| Operations | Partial | End-to-end workflows |
| Security | Good baseline | Enforceable model |
| API | Skeleton | Contract-first |
| BA requirements | Partial | Traceable/use-case based |
| Testing | Good baseline | Full release gates |
| DR | Partial | Explicit RPO/RTO + restore process |
| Observability | Good | Alertable/operational |
| Governance | Missing | ADR/change/traceability |

---

# 130. Final Definition: Implementation-Ready

Tài liệu chỉ được gắn trạng thái **Implementation-ready** khi các điều kiện sau được thỏa mãn:

```text
✓ Open Decisions critical = 0
✓ P0 issues = 0
✓ Seat consistency design finalized
✓ Payment exception policy finalized
✓ State machines approved
✓ API OpenAPI approved
✓ Event/MQTT contracts approved
✓ ERD approved
✓ Sequence diagrams approved
✓ RBAC matrix approved
✓ Acceptance criteria approved
✓ NFR targets approved
✓ DR/RPO/RTO approved
✓ UAT scenarios defined
✓ Go-live gates defined
```

Nếu một trong các mục trên còn `TBD`, trạng thái nên là:

```text
Implementation-ready with open decisions
```

thay vì khẳng định tuyệt đối rằng toàn bộ requirement đã hoàn chỉnh.

---

# 131. Final Architecture Principle

Kiến trúc BusGo sau khi bổ sung được định hình theo nguyên tắc:

```text
                 BUSINESS TRUTH
                       │
                       ▼
                PostgreSQL / Domain
                       │
          ┌────────────┼─────────────┐
          │            │             │
          ▼            ▼             ▼
       Outbox       Redis State   Payment State
          │            │
          ▼            ▼
     Async Events   Realtime Read
          │            │
     ┌────┴─────┐      ▼
     │          │  WebSocket
     ▼          ▼      │
Notification   Ops     ├── Passenger
                      └── Admin

Driver Device
     │
     ▼
Native Tracking Session
     │
     ▼
MQTT
     │
     ▼
Telemetry Service
     ├── Validate
     ├── Deduplicate
     ├── Sequence/Ordering
     ├── Latest Position → Redis
     ├── History → PostgreSQL
     └── ETA → Realtime/Notification
```

Đây là nguyên tắc cốt lõi cần giữ khi implementation: **business correctness nằm ở domain/database transaction; Redis và realtime chỉ tăng tốc/đồng bộ; event/notification phải chịu được retry; mọi thao tác quan trọng đều có state machine, authorization và audit.**

---

# 132. Change Log — v2 → v3

| Area | Enhancement |
|---|---|
| BA foundation | Glossary, scope, assumptions, open decisions |
| Domain | Aggregate boundaries, domain ownership |
| Booking | Partial lifecycle, cutoff, idempotency |
| Seat | Mandatory DB consistency model |
| Pricing | Fare calculation and versioning |
| Payment | Late success, amount verification, recovery |
| Events | Transactional outbox, envelope, versioning |
| Driver | Device/session/assignment model |
| Boarding | Policy, COD, no-show |
| Telemetry | Session-aware ordering, quality, security |
| ETA | Accuracy metrics and off-route behavior |
| Authorization | Passenger/driver/ops resource scopes |
| Operations | Replacement case, manual review |
| API | Idempotency, errors, contract-first |
| UX | Screen/state requirements |
| NFR | Availability, DR, RPO/RTO, privacy |
| QA | Concurrency matrix, acceptance criteria, DoD |
| DevOps | Deployment, migration, rollout, runbooks |
| Governance | ADR, traceability, change control |

---

# 133. Approval Checklist

## Product / BA

- [ ] Business scope approved.
- [ ] Open decisions resolved.
- [ ] Cancellation/refund policy approved.
- [ ] COD policy approved.
- [ ] Boarding/no-show policy approved.
- [ ] Vehicle replacement policy approved.

## SA

- [ ] Domain boundaries approved.
- [ ] Seat concurrency strategy approved.
- [ ] Event/outbox strategy approved.
- [ ] Security model approved.
- [ ] NFR/DR approved.

## Engineering

- [ ] API contracts approved.
- [ ] DB schema/migrations approved.
- [ ] Deployment model approved.
- [ ] Observability approved.

## QA

- [ ] Acceptance criteria complete.
- [ ] Concurrency tests defined.
- [ ] Failure scenarios defined.
- [ ] Security test scope defined.
- [ ] UAT scope approved.

---

# 134. Final Recommendation

Sau khi review toàn bộ tài liệu v2, hướng phù hợp nhất không phải là thay đổi kiến trúc nền tảng, mà là **khóa chặt các business invariant và execution contract còn thiếu**.

Các quyết định nền tảng tiếp tục được giữ:

```text
PostgreSQL = business source of truth
Redis = lock/cache/realtime coordination
Trip + Seat + Segment = inventory model
Trip/Route/Seat snapshots = historical consistency
MQTT = driver telemetry transport
WebSocket = client realtime delivery
Native foreground tracking = driver GPS runtime
Idempotency = mandatory for business-critical writes
```

Các bổ sung quan trọng nhất của v3 là:

```text
Database-enforced seat consistency
Transactional outbox
Payment exception/recovery model
Booking-item lifecycle
COD state model
Driver tracking session
Tracking authorization
Pricing versioning
Manual review queue
RBAC/resource scope matrix
OpenAPI/event contract-first
BA use cases + acceptance criteria
NFR/DR/SRE requirements
Traceability + ADR governance
```

Sau các bổ sung này, tài liệu có thể được dùng làm **master baseline** để tách tiếp thành:

```text
01_BusGo_Product_Business_Requirements.md
02_BusGo_Passenger_Spec.md
03_BusGo_Driver_Spec.md
04_BusGo_Admin_Spec.md
05_BusGo_Backend_API_Spec.md
06_BusGo_Database_Spec.md
07_BusGo_Realtime_Telemetry_ETA_Spec.md
08_BusGo_Payment_Spec.md
09_BusGo_Security_Spec.md
10_BusGo_QA_UAT_Test_Spec.md
```

