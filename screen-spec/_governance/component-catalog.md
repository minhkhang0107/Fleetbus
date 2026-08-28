# BusGo Shared Component Catalog

**Document Version:** 1.0  
**Scope:** Reusable UI components across Passenger App, Driver App, and Manager Portal

---

## 1. Component Registry

| Component Name | Primary Surface | Description | Accessibility Role |
| :--- | :--- | :--- | :--- |
| `SeatCell` | PAX-009, MGR-007, MGR-013, MGR-020 | Interactive 2D seat unit displaying code, deck, pricing, and segment occupancy | `button` / `gridcell` |
| `TripCard` | PAX-004, PAX-006, DRI-002, MGR-010 | Summary card displaying route, vehicle type, departure/arrival time, fare, and CTA | `article` |
| `StatusBadge` | All Apps | Semantic pill indicating entity lifecycle (Trip, Booking, Ticket, Payment) | `status` |
| `ConnectionBadge` | PAX-018, DRI-014, MGR-003 | Realtime connectivity state indicator (LIVE, RECONNECTING, STALE, OFFLINE) | `status` |
| `ETABadge` | PAX-018, PAX-019, DRI-006, MGR-003 | Realtime estimated time of arrival with traffic indicator | `timer` / `text` |
| `RouteTimeline` | PAX-007, PAX-018, DRI-007, MGR-009 | Vertical / horizontal stop progression timeline with current bus pin | `list` |
| `TicketCard` | PAX-015, PAX-016, PAX-017 | Digital boarding pass with PNR, passenger name, seat number, and trip summary | `region` |
| `QRCodeView` | PAX-017, DRI-009 | High-contrast QR code display with offline fallback & cryptographic signature | `img` |
| `PaymentMethodCard`| PAX-012, PAX-013, MGR-020 | Selectable payment method card (VNPAY, MoMo, Card, COD) with status | `radio` |
| `CountdownTimer` | PAX-010, PAX-013, MGR-020 | Synchronized lock expiry countdown timer with warning triggers | `timer` |
| `AlertBanner` | All Apps | Inline or top-level notification for delays, replacements, or connection drops | `alert` |
| `DataTable` | MGR-005, MGR-010, MGR-017, MGR-021 | Sortable, paginated, responsive enterprise data table with sticky headers | `table` |
| `FilterBar` | PAX-006, MGR-010, MGR-017 | Multi-criteria filter pill bar with badge counters and clear-all trigger | `search` |
| `AuditTimeline` | MGR-012, MGR-018, MGR-028 | Chronological actor-stamped event history with state diff inspection | `feed` |
| `DriverActionPill` | DRI-006, DRI-008, DRI-009 | Ultra-large ($64\text{dp}$) primary operational CTA with haptic confirmation | `button` |

---

## 2. Component Specifications

### 2.1. `SeatCell`
```typescript
interface SeatCellProps {
  seatCode: string;          // e.g. "A01", "B04"
  deck: 1 | 2;               // Lower deck (1) or Upper deck (2)
  state: 'AVAILABLE' | 'SELECTED' | 'LOCKED_BY_OTHER' | 'BOOKED' | 'BLOCKED' | 'MAINTENANCE';
  price: number;             // e.g. 250000 VND
  isAccessible?: boolean;    // Wheelchair / Elderly priority
  onSelect: (seatCode: string) => void;
}
```
**Interaction & Micro-states:**
- `AVAILABLE`: White fill, `#94A3B8` border. Tap triggers `onSelect` -> instant haptic feedback + state changes to `SELECTED`.
- `SELECTED`: Filled with `brand.primary` (`#0F52BA`), text white. Tap toggles selection off.
- `LOCKED_BY_OTHER`: Soft amber fill (`#FEF3C7`), small clock icon. Tap shows tooltip: *"Ghế đang được hành khách khác giữ chỗ"*.
- `BOOKED`: Light slate fill (`#E2E8F0`), muted text (`#94A3B8`). Tap is disabled.
- `BLOCKED`: Red crosshatch fill (`#FEE2E2`). Tap is disabled.
- **Accessibility Label:** `"Ghế [seatCode], tầng [deck], [price] đồng, [state_vietnamese]"`

---

### 2.2. `ConnectionBadge`
```typescript
interface ConnectionBadgeProps {
  state: 'LIVE' | 'RECONNECTING' | 'STALE' | 'OFFLINE';
  lastPingSeconds?: number;
  onRetry?: () => void;
}
```
**Visual Representations:**
- `LIVE`: Green dot with subtle 2s pulse animation (`#16A34A`), text *"Trực tiếp (GPS)"*.
- `RECONNECTING`: Amber rotating spinner icon (`#D97706`), text *"Đang kết nối lại..."*.
- `STALE`: Amber warning icon (`#D97706`), text *"Dữ liệu chậm 2 phút"*.
- `OFFLINE`: Red cloud-off icon (`#DC2626`), text *"Mất mạng - Đang lưu ngoại tuyến"*.

---

### 2.3. `ETABadge`
```typescript
interface ETABadgeProps {
  etaMinutes: number;           // e.g. 14 min
  distanceKm: number;           // e.g. 8.2 km
  isDelayed: boolean;
  delayMinutes?: number;        // e.g. +10 min
  stopName: string;             // e.g. "Trạm Phủ Lý"
}
```
**Layout:**
- Compact pill showing `~14 phút (8.2 km)`.
- If `isDelayed === true`, displays secondary red pill `Trễ +10p` next to arrival estimate.

---

### 2.4. `RouteTimeline`
```typescript
interface RouteTimelineProps {
  stops: Array<{
    stopId: string;
    stopName: string;
    plannedArrivalTime: string;
    actualArrivalTime?: string;
    status: 'PASSED' | 'CURRENT' | 'UPCOMING';
    passengerBoardCount?: number;
    passengerAlightCount?: number;
  }>;
  currentVehiclePosition?: { lat: number; lng: number };
}
```
**Visual Logic:**
- Passed stops: Solid green line and checked icon.
- Current stop / segment: Glowing vehicle pin animated along the route line.
- Upcoming stops: Muted dashed line with hollow station circles.

---

### 2.5. `CountdownTimer`
```typescript
interface CountdownTimerProps {
  targetTimestamp: string;      // ISO 8601 server timestamp
  warningThresholdSeconds?: number; // default 120s (2 min)
  onExpire: () => void;
}
```
**Behavior:**
- Calculated as `remainingMs = new Date(targetTimestamp).getTime() - Date.now()`.
- Display format: `mm:ss` (e.g. `09:42`).
- When remaining time $< 120\text{s}$, text color shifts from `#0F172A` to `#DC2626` with pulsing icon.
- When timer reaches `00:00`, invokes `onExpire()` to trigger seat hold cleanup modal.
