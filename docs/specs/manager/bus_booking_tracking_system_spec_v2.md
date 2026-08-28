# Software Requirements Specification (SRS) & System Architecture
# BusGo — Hệ Thống Đặt Chỗ & Theo Dõi Xe Khách Thời Gian Thực

**Version:** 2.0  
**Status:** Implementation-ready baseline  
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
