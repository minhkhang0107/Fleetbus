# PAX-009 — Passenger Interactive Seat Map

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen  
**Priority:** P0 (Core Journey / Blocking)  
**Route:** `/trip/:tripId/seat-map`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-09`, `BR-SEAT-001`, `BR-SEAT-002`, `UC-PAS-SEAT-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Provide an interactive, high-fidelity 2D visual seat map of the bus layout (single or double deck), allowing passengers to inspect available seats for their specific segment $[S_{pickup}, S_{dropoff}]$, select up to 5 seats, view real-time occupancy updates, and initiate a distributed 10-minute seat hold.
- **Actor:** Passenger.
- **Entry Condition:** Proceeded from `PAX-008-pickup-dropoff.md` or direct entry from Trip Detail.
- **Outcome:** Seats selected; passenger taps "Tiếp tục" -> transitions to `PAX-010-seat-hold.md` where distributed Redis lock is acquired.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-SEAT-001` (Segment-Based Occupancy), `BR-SEAT-002` (Server Authoritative Inventory), `BR-SEAT-003` (Max 5 seats per single passenger booking transaction), `UC-PAS-SEAT-001`.
- **CRITICAL DOMAIN INVARIANT:** A seat is AVAILABLE if and only if there is NO overlapping booking or active hold for any sub-segment between $S_{pickup}$ and $S_{dropoff}$.
- **Never calculate availability** as `vehicle.total_seats - total_booked`. Every seat's segment occupancy bitmask is evaluated by the server.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-008 Pickup/Dropoff] or [PAX-007 Trip Detail]
Previous Screen: [PAX-008 Pickup/Dropoff]
Next Screen: [PAX-010 Seat Hold Confirmation] ──► [PAX-011 Passenger Info]
Entry Points: Pickup/Dropoff CTA, Trip Detail Direct CTA
Exit Points:
  ├── Tap Back -> Return to PAX-008 (releases local selections)
  └── Tap "Tiếp tục" -> Navigates to `/trip/{tripId}/seat-hold` with selected seat codes
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Chọn chỗ ngồi                      [❓ Hướng dẫn]│
├───────────────────────────────────────────────────┤
│  Hà Nội ➔ Thanh Hóa (14:00, 27/08/2026)           │
│  Đón: Bến xe Giáp Bát · Trả: Bến xe Phía Bắc      │
├───────────────────────────────────────────────────┤
│ ┌─ DECK SWITCHER (Tầng) ────────────────────────┐ │
│ │ [ 🔘 TẦNG DƯỚI (Deck 1) ] │ [ ⚪ TẦNG TRÊN (Deck 2) ] │ │
│ └───────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────┤
│ 🏷️ SEAT LEGEND (Chú thích)                         │
│ [ ⬜ Trống ] [ 🟦 Đang chọn ] [ 🟨 Đang giữ ] [ ⬛ Đã đặt ] │
├───────────────────────────────────────────────────┤
│                                                   │
│      ┌─────────────────────────────────────┐      │
│      │        🚌 ĐẦU XE / TÀI XẾ           │      │
│      └─────────────────────────────────────┘      │
│                                                   │
│       Cột Trái (A)      Lối đi      Cột Phải (B)  │
│      ┌────────────┐               ┌────────────┐  │
│      │  [ A01 ]   │               │  [ B01 ]   │  │
│      │  220.000 đ │               │  220.000 đ │  │
│      │  (Trống)   │               │  (Đã đặt)  │  │
│      └────────────┘               └────────────┘  │
│      ┌────────────┐               ┌────────────┐  │
│      │  [ A02 ]   │               │  [ B02 ]   │  │
│      │  220.000 đ │               │  220.000 đ │  │
│      │ (ĐANG CHỌN)│               │  (Đang giữ)│  │
│      └────────────┘               └────────────┘  │
│      ┌────────────┐               ┌────────────┐  │
│      │  [ A03 ]   │               │  [ B03 ]   │  │
│      │  220.000 đ │               │  220.000 đ │  │
│      │  (Trống)   │               │  (Trống)   │  │
│      └────────────┘               └────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ Ghế đã chọn: A02 (Tầng 1)                         │
│ Tổng tiền: 220.000 đ         [ TIẾP TỤC (1) (CTA) ]│
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **Interactive 2D Seat Matrix:** Scaled cleanly with clear aisle separation, large tap targets ($\ge 48\text{dp}$).
2. **Sticky Bottom Summary Bar:** Highlights selected seat codes (`A02`), total price, and active CTA button.
3. **Deck Selector Tabs:** High-contrast pill switcher for multi-deck buses.
4. **Color-Blind Accessible Legend:** Pairs color with clear icon and text labels.

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TripHeaderSummary` | Card | Yes | Route Context | Normal | Tap "Sửa" pops back to stop selection |
| `DeckSwitcher` | Segmented Tab | Conditional | Seat Layout | Deck 1 / Deck 2 | Tap animates seat grid flip |
| `SeatLegendBar` | Legend Row | Yes | Static Specs | Normal | Explains Available, Selected, Held, Booked |
| `SeatCell` | Custom Widget | Yes | Seat Grid API | 6 Visual States | Tap toggles selection (if Available) |
| `RealtimeIndicator` | Pill | Yes | WebSocket Client | LIVE / RECONNECTING | Indicates live sync status |
| `StickyActionBar` | Elevation Bar | Yes | Selection State | Disabled (0 seats) / Enabled | Tap advances to `PAX-010` Seat Hold |

---

## 6. Seat Cell States & Visual Matrix

| Seat State | Background Color | Border Color | Text Color | Tap Behavior | Screen Reader Announcement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AVAILABLE` | `#FFFFFF` | `#94A3B8` | `#0F172A` | Toggles to `SELECTED`; haptic click | *"Ghế A01, tầng 1, 220 nghìn, còn trống"* |
| `SELECTED` | `#0F52BA` (Brand Blue) | `#0A387E` | `#FFFFFF` | Toggles back to `AVAILABLE` | *"Ghế A01, đang được bạn chọn"* |
| `LOCKED_BY_OTHER` | `#FEF3C7` (Soft Amber)| `#F59E0B` | `#92400E` | Shows toast: *"Ghế đang tạm giữ"* | *"Ghế A01, đang tạm giữ bởi người khác"* |
| `BOOKED` | `#E2E8F0` (Slate 200) | `#CBD5E1` | `#94A3B8` | Disabled (No action) | *"Ghế A01, đã được đặt"* |
| `BLOCKED` | `#FEE2E2` (Red 100) | `#FCA5A5` | `#991B1B` | Disabled (No action) | *"Ghế A01, tạm khóa"* |
| `MAINTENANCE` | `#F1F5F9` (Slate 100) | `#E2E8F0` | `#CBD5E1` | Disabled (Wrench icon) | *"Ghế A01, đang bảo trì"* |

---

## 7. Realtime WebSocket Architecture

- **WebSocket Room:** `trip:{tripId}`
- **Subscribed Events:**
  - `SEAT_HELD`: `{ seat_code: "B02", deck: 1, segment_id: "seg_hn_th", locked_until: "2026-08-27T14:10:00Z" }`
  - `SEAT_RELEASED`: `{ seat_code: "B02", deck: 1, segment_id: "seg_hn_th" }`
  - `SEAT_BOOKED`: `{ seat_code: "B01", deck: 1, segment_id: "seg_hn_th" }`
- **Client Handling:**
  - If a seat currently selected by the user is broadcasted as `SEAT_HELD` or `SEAT_BOOKED` by another user (conflict race condition):
    1. Instantly uncheck the seat.
    2. Play subtle haptic warning.
    3. Display banner: *"Ghế {seatCode} vừa được giữ bởi người khác. Vui lòng chọn ghế khác."*
    4. Recalculate total price.

---

## 8. API Contract

### 8.1. Get Trip Seat Map & Segment Occupancy
- **Endpoint:** `GET /api/v1/trips/{tripId}/seat-map`
- **Auth:** Public
- **Query Params:** `pickup_stop_id=stp_hn_gb&dropoff_stop_id=stp_th_pb`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "vehicle_layout": {
      "type": "DOUBLE_DECK_SLEEPER",
      "total_decks": 2,
      "rows": 6,
      "columns": 3,
      "aisle_column_index": 2
    },
    "seats": [
      {
        "seat_code": "A01",
        "deck": 1,
        "row": 1,
        "column": 1,
        "type": "VIP_CABIN",
        "price_vnd": 220000,
        "segment_state": "AVAILABLE"
      },
      {
        "seat_code": "A02",
        "deck": 1,
        "row": 2,
        "column": 1,
        "type": "VIP_CABIN",
        "price_vnd": 220000,
        "segment_state": "AVAILABLE"
      },
      {
        "seat_code": "B01",
        "deck": 1,
        "row": 1,
        "column": 3,
        "type": "VIP_CABIN",
        "price_vnd": 220000,
        "segment_state": "BOOKED"
      },
      {
        "seat_code": "B02",
        "deck": 1,
        "row": 2,
        "column": 3,
        "type": "VIP_CABIN",
        "price_vnd": 220000,
        "segment_state": "LOCKED_BY_OTHER",
        "locked_until": "2026-08-27T14:08:12Z"
      }
    ]
  }
}
```

---

## 9. Business Rules
- `BR-SEAT-001` (Segment occupancy - Phase E review, `OQ-028`): The map answers for one segment. `GET /trips/{id}/seat-map?pickup_stop_id=&dropoff_stop_id=` (none means the whole route) returns each seat's `segment_state` for that segment: `BOOKED` if any booking overlaps it, `BLOCKED`, `LOCKED_BY_OTHER` if another passenger holds an overlapping segment, otherwise `AVAILABLE`. `state` is the whole-route view (`BOOKED` only when every segment is sold). A seat sold from stop 1 to stop 2 is `AVAILABLE` for stop 2 to stop 3. Unknown stops give `400 STOP_NOT_FOUND`, a backwards pair `400 INVALID_SEGMENT`.
- `BR-SEAT-003`: Maximum 5 seats can be selected per transaction. Selecting a 6th seat displays a toast: *"Bạn chỉ được chọn tối đa 5 ghế trong một lần đặt."*
- `BR-SEAT-002`: Seat selections are local until the user taps "Tiếp tục", which commits the Redis lock hold in `PAX-010`.
- `BR-SEAT-004`: If the network disconnects, the WebSocket connection pill shows `RECONNECTING`. Selections are frozen until reconnection succeeds and snapshot re-validation is executed.

---

## 10. Exception Flows & Matrix

| Scenario | Trigger | UI Feedback | System Action | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Seat Selection Conflict | Another user locks seat while selecting | Toast banner: *"Ghế {code} vừa được giữ bởi người khác"* | Deselect seat, update state to `LOCKED_BY_OTHER` | Choose another seat |
| Max Seats Exceeded | Passenger taps 6th seat | Warning toast: *"Tối đa 5 ghế"* | Block 6th selection | Deselect an existing seat |
| WebSocket Dropped | Network glitch | Amber header badge: *"Đang kết nối lại..."* | Reconnection loop + REST snapshot refresh | Auto-recovers on network return |

---

## 11. Analytics & Telemetry
- `SEAT_MAP_VIEWED`: `{ trip_id: "trp_991823", pickup_id: "stp_hn_gb", dropoff_id: "stp_th_pb" }`
- `SEAT_CELL_SELECTED`: `{ seat_code: "A02", deck: 1, fare: 220000 }`
- `SEAT_CELL_DESELECTED`: `{ seat_code: "A02", duration_selected_ms: 12000 }`
- `SEAT_SELECTION_CONFLICT`: `{ seat_code: "B02", conflict_type: "RACE_HOLD" }`
- `SEAT_MAP_CONTINUE_CLICKED`: `{ selected_seats: ["A02"], total_fare: 220000 }`

---

## 12. UI Copy & Localization
- **Header:** *"Chọn chỗ ngồi"*
- **Deck 1 Tab:** *"TẦNG DƯỚI (Tầng 1)"*
- **Deck 2 Tab:** *"TẦNG TRÊN (Tầng 2)"*
- **Front of Bus:** *"ĐẦU XE / BÁC TÀI"*
- **Selected Count:** *"Ghế đã chọn: {seats}"*
- **Total Price:** *"Tổng tiền: {price} đ"*
- **Continue CTA:** *"TIẾP TỤC ({count})"*
- **Conflict Message:** *"Ghế {code} vừa có khách khác giữ chỗ. Vui lòng chọn ghế khác."*

---

## 13. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Select available seat and proceed
  Given the passenger is viewing PAX-009 Seat Map for trip "trp_991823"
  And seat A02 is in AVAILABLE state
  When the passenger taps seat A02
  Then A02 turns brand blue (SELECTED)
  And the bottom bar updates to "Ghế đã chọn: A02" with "Tổng tiền: 220.000 đ"
  And tapping "TIẾP TỤC (1)" routes to PAX-010 Seat Hold.

Scenario: Realtime hold broadcast conflict
  Given the passenger has selected seat A02
  When a WebSocket event SEAT_HELD for A02 from another user is received
  Then the app automatically deselects A02
  And displays a warning toast "Ghế A02 vừa được giữ bởi người khác"
  And updates the bottom bar total price to 0 đ.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-009-01` | Functional | Select 1-5 available seats | Calculates total price correctly |
| `TC-PAX-009-02` | Validation | Attempt to select 6th seat | Blocks selection with limit toast |
| `TC-PAX-009-03` | Realtime | Receive WS `SEAT_HELD` for selected seat | Auto-deselects with conflict notice |
| `TC-PAX-009-04` | Accessibility | VoiceOver swipe across seat grid | Announces seat code, deck, price, and status in Vietnamese |
