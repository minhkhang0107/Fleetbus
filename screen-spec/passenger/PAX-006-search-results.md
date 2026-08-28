# PAX-006 — Passenger Search Results

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen  
**Priority:** P0 (Core Journey)  
**Route:** `/search-results`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-06`, `BR-DISC-002`, `UC-PAS-SEARCH-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Display all available scheduled bus trips matching the passenger's requested origin, destination, and departure date. Allows multi-criteria filtering (time of day, vehicle type, price, seat availability), date switching, and rapid inspection of segment pricing and departure times.
- **Actor:** Passenger.
- **Entry Condition:** Submitted search form on `PAX-004-home.md` or selected alternate date from date carousel.
- **Outcome:** Passenger selects a trip card and proceeds to `PAX-007-trip-detail.md` or `PAX-009-seat-map.md`.

---

## 2. Business Context
- **Requirements Trace:** `BR-DISC-002` (Segment-Aware Trip Filtering), `BR-SEAT-001` (Segment Seat Availability Calculation), `UC-PAS-SEARCH-002`.
- **Business Invariant:** Seat availability shown on each trip card MUST represent the available inventory for the **exact requested segment** $[S_{origin}, S_{dest}]$, calculated by intersecting available seats across all intervening route sub-segments.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-004 Home]
Previous Screen: [PAX-004 Home]
Next Screen: [PAX-007 Trip Detail] or [PAX-008 Pickup/Dropoff]
Entry Points: Home Search CTA, Date carousel chip tap
Exit Points:
  ├── Tap Back -> Return to PAX-004 Home
  ├── Tap Filter Pill -> Opens Filter Bottom Sheet
  ├── Tap Trip Card -> Navigates to `/trip/{tripId}?origin={originId}&dest={destId}`
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Hà Nội ➔ Thanh Hóa        [🔍 Đổi tìm kiếm]   │
├───────────────────────────────────────────────────┤
│ 📅 DATE CAROUSEL BAR                              │
│ [ Hôm nay 27/08 ] [ T5 28/08 ] [ T6 29/08 ] [ 📅 ]│
├───────────────────────────────────────────────────┤
│ ⚙️ FILTER & SORT PILLS                            │
│ [ ⇅ Giờ đi sớm nhất ] [ Giường nằm ] [ Giá rẻ ]   │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ TRIP RESULT CARD 1 ─────────────────────────┐  │
│ │ 14:00 ────────────────────────► 17:30        │  │
│ │ Bến Giáp Bát                   Bến Phía Bắc  │  │
│ │ (3 giờ 30 phút · 160 km)                     │  │
│ │                                              │  │
│ │ 🚌 Limousine 34 Phòng VIP · Wifi · Sạc USB   │  │
│ │ 🟢 Còn 8 chỗ trống cho chặng này             │  │
│ │                                              │  │
│ │ 220.000 đ / vé               [ CHỌN CHUYẾN ] │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ TRIP RESULT CARD 2 ─────────────────────────┐  │
│ │ 15:30 ────────────────────────► 19:00        │  │
│ │ Bến Nước Ngầm                  Bến Phía Bắc  │  │
│ │ (3 giờ 30 phút)                              │  │
│ │ 🚌 Giường Nằm 40 Chỗ                         │  │
│ │ 🟢 Còn 14 chỗ trống                          │  │
│ │                                              │  │
│ │ 180.000 đ / vé               [ CHỌN CHUYẾN ] │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **Trip Departure & Arrival Time:** High-contrast large numerals ($18\text{px}$, Bold).
2. **Fare & CTA Button:** Clear price display in Brand Blue with direct "CHỌN CHUYẾN" action button.
3. **Availability Pill:** Semantic green indicator showing exact remaining seats for this segment.
4. **Vehicle & Amenities Tag:** Muted secondary pill line (Limousine, Wifi, USB).

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HeaderRouteSummary` | App Bar | Yes | Route Context | Normal | Tap opens search modifier modal |
| `DateCarousel` | Horizontal List | Yes | Date Range (+14d) | Active / Inactive | Tap switches active date, reloads list |
| `FilterSortBar` | Chip Carousel | Yes | Client Filter State | Filtered / Default | Tap opens bottom sheet filters |
| `TripResultCard` | Reusable Card | Yes | API Result Item | Normal / Sold Out | Tap card or CTA opens Trip Detail |
| `EmptyStateView` | Illustration & Text | Conditional | Result Count === 0 | Hidden / Visible | Tap "Đổi ngày đi" / "Tìm tuyến khác" |
| `SkeletonCardLoader`| Shimmer Skeleton | Conditional | API In-Flight | Active during load | None |

---

## 6. API Contract

### 6.1. Search Trips Endpoint
- **Endpoint:** `GET /api/v1/trips/search`
- **Auth:** Public
- **Query Params:** `origin_stop_id=stp_hn_gb&dest_stop_id=stp_th_01&date=2026-08-27&vehicle_type=ALL&sort_by=DEPARTURE_TIME_ASC`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "search_meta": {
      "origin_name": "Bến xe Giáp Bát (Hà Nội)",
      "dest_name": "Bến xe Phía Bắc (Thanh Hóa)",
      "date": "2026-08-27",
      "total_trips": 12
    },
    "trips": [
      {
        "trip_id": "trp_991823",
        "route_id": "rt_hn_th_01",
        "route_name": "Hà Nội - Ninh Bình - Thanh Hóa",
        "departure_time": "2026-08-27T14:00:00+07:00",
        "arrival_time": "2026-08-27T17:30:00+07:00",
        "duration_minutes": 210,
        "distance_km": 160,
        "vehicle_type": "LIMOUSINE_34",
        "vehicle_name": "Limousine 34 Phòng VIP",
        "amenities": ["WIFI", "USB_CHARGER", "WATER", "BLANKET"],
        "segment_fare": 220000,
        "available_seats_count": 8,
        "trip_status": "SCHEDULED"
      }
    ]
  }
}
```

---

## 7. Business Rules
- `BR-SEARCH-001`: Only trips with `trip_status IN ('SCHEDULED', 'DISPATCHED')` and `available_seats_count > 0` are eligible for booking.
- `BR-SEARCH-002`: Trips departing within $< 15\text{ minutes}$ from now are locked from new online booking and marked *"Đóng đặt vé trực tuyến"*.
- `BR-SEARCH-003`: Pull-to-refresh invalidates client cache and queries fresh availability from PostgreSQL.

---

## 8. Exception Flows & Matrix

| Scenario | Trigger | UI Feedback | System Action | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Zero Trips Found | No scheduled trips on chosen date | Empty state illustration + *"Hết chuyến cho ngày 27/08"* | Suggest adjacent dates with available trips | Tap next day chip |
| API Timeout ($>6\text{s}$) | Slow 3G network | Shimmer skeleton replaced with retry card | Display retry button | Tap "Thử lại" |
| All Trips Sold Out | All trips have `available_seats_count === 0` | Banner: *"Tất cả chuyến trong ngày đã kín chỗ"* | Provide option to join waitlist / check next day | Tap "Xem ngày mai" |

---

## 9. Analytics & Telemetry
- `SEARCH_RESULTS_VIEWED`: `{ origin_id: "stp_hn_gb", dest_id: "stp_th_01", results_count: 12 }`
- `DATE_SWITCHED`: `{ previous_date: "2026-08-27", new_date: "2026-08-28" }`
- `FILTER_APPLIED`: `{ filter_vehicle: "LIMOUSINE", sort_by: "PRICE_ASC" }`
- `TRIP_CARD_SELECTED`: `{ trip_id: "trp_991823", fare: 220000, rank_index: 0 }`

---

## 10. UI Copy & Localization
- **Header:** *"{Origin} ➔ {Destination}"*
- **Choose CTA:** *"CHỌN CHUYẾN"*
- **Duration Format:** *"{hours} giờ {mins} phút"*
- **Seats Available:** *"Còn {count} chỗ trống cho chặng này"*
- **Sold Out Pill:** *"Hết chỗ"*
- **Empty Title:** *"Không tìm thấy chuyến xe phù hợp"*
- **Empty Subtitle:** *"Vui lòng chọn ngày khác hoặc thay đổi bộ lọc tìm kiếm."*

---

## 11. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: View trips matching requested segment
  Given the passenger searches for Hà Nội -> Thanh Hóa on 2026-08-27
  When PAX-006 loads
  Then it displays the list of scheduled trips with segment fare and accurate seat count
  And tapping a trip card opens PAX-007 Trip Detail.

Scenario: Switch date via top carousel
  Given the passenger is viewing 27/08
  When the passenger taps "T6 28/08"
  Then the active chip highlights in brand blue
  And the list reloads trips for 2026-08-28.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-006-01` | Functional | Tap trip card | Navigates to `/trip/{tripId}` |
| `TC-PAX-006-02` | Filter | Apply filter "Limousine" | Only displays Limousine trips |
| `TC-PAX-006-03` | Edge Case | Trip with 0 seats remaining | Button says "Hết chỗ" (Disabled) |
