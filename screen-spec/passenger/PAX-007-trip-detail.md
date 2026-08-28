# PAX-007 — Passenger Trip Detail

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen  
**Priority:** P0 (Core Journey)  
**Route:** `/trip/:tripId`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-07`, `BR-DISC-002`, `UC-PAS-TRIP-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Provide an exhaustive overview of a specific bus trip: vehicle specifications, interior photos, list of scheduled stops along the route timeline with estimated times, luggage policy, cancellation rules, and operator ratings before seat selection.
- **Actor:** Passenger.
- **Entry Condition:** Tapped a trip card from `PAX-006-search-results.md` or opened via deep link `busgo://trip/{tripId}`.
- **Outcome:** Passenger reviews trip details and proceeds to Pickup & Dropoff stop selection (`PAX-008`) or directly to Seat Map (`PAX-009`).

---

## 2. Information Architecture & Navigation
```text
Parent Screen: [PAX-006 Search Results]
Previous Screen: [PAX-006 Search Results]
Next Screen: [PAX-008 Pickup/Dropoff] ──► [PAX-009 Seat Map]
Entry Points: Search Result Card, Home Promotion, Shared Deep Link
Exit Points:
  ├── Tap Back -> Return to PAX-006
  ├── Tap "Chọn điểm đón / trả" -> PAX-008
  └── Tap "Chọn chỗ ngồi" (Sticky CTA) -> Direct to PAX-009 (if default stops accepted)
```

---

## 3. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Chi tiết chuyến đi                  [🔗 Chia sẻ]│
├───────────────────────────────────────────────────┤
│                                                   │
│  🚌 Limousine 34 Phòng VIP                        │
│  Nhà xe BusGo Express · ⭐ 4.8 (1.2k đánh giá)     │
│                                                   │
│  [ Gallery ảnh xe: Phòng nằm, Cổng sạc, Wifi... ] │
│                                                   │
│  ┌─ LỘ TRÌNH & ĐIỂM DỪNG ──────────────────────┐  │
│  │ 🟢 14:00 · Bến xe Giáp Bát (Hà Nội)          │  │
│  │    │ (Điểm đón dự kiến của bạn)             │  │
│  │    ▼ 15:15 · Trạm dừng nghỉ Liêm Tuyền       │  │
│  │    ▼ 16:10 · Bến xe Ninh Bình                │  │
│  │ 🔴 17:30 · Bến xe Phía Bắc (Thanh Hóa)       │  │
│  │      (Điểm trả dự kiến của bạn)              │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  Tiện ích xe                                      │
│  [ 📶 Wifi tốc độ cao ]  [ 🔌 Cổng sạc Type-C ]   │
│  [ 🥤 Nước uống & khăn ]  [ ❄️ Điều hòa lọc khí ] │
│                                                   │
│  Chính sách & Hành lý                             │
│  • Hành lý miễn phí: 20kg xách tay + gửi hầm      │
│  • Miễn phí hủy vé trước giờ chạy 12 tiếng        │
│                                                   │
├───────────────────────────────────────────────────┤
│ 220.000 đ / vé              [ CHỌN CHỖ NGỒI (CTA) ]│
│ (Còn 8 chỗ trống)                                 │
└───────────────────────────────────────────────────┘
```

---

## 4. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `VehicleGallery` | Image Carousel | Yes | Vehicle Media CMS | Normal | Tap expands full-screen photo viewer |
| `OperatorRatingBadge` | Rating Pill | Yes | Aggregated Reviews | ⭐ 4.8 / 5 | Tap opens customer reviews modal |
| `RouteTimelineView` | Interactive List | Yes | Route Snapshot | Expanded / Collapsed | Displays all stops with arrival times |
| `AmenitiesGrid` | 2-Col Grid | Yes | Vehicle Specs | Normal | Icon + text description |
| `PolicyAccordion` | Accordion List | Yes | Operator Policy | Collapsible | Tap expands baggage & refund policies |
| `StickyBottomBar` | Elevation Bar | Yes | Pricing State | Normal | Displays price + "CHỌN CHỖ NGỒI" button |

---

## 5. API Contract

### 5.1. Fetch Trip Master Detail
- **Endpoint:** `GET /api/v1/trips/{tripId}`
- **Auth:** Public
- **Query Params:** `origin_stop_id=stp_hn_gb&dest_stop_id=stp_th_01`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "route_name": "Hà Nội - Thanh Hóa",
    "departure_time": "2026-08-27T14:00:00+07:00",
    "arrival_time": "2026-08-27T17:30:00+07:00",
    "vehicle": {
      "type": "LIMOUSINE_34",
      "name": "Limousine 34 Phòng VIP",
      "license_plate": "29B-123.45",
      "images": [
        "https://cdn.busgo.vn/vehicles/limo34_interior_1.webp",
        "https://cdn.busgo.vn/vehicles/limo34_interior_2.webp"
      ],
      "amenities": ["WIFI", "USB_TYPE_C", "WATER", "BLANKET", "MASSAGE_CHAIR"]
    },
    "stops_timeline": [
      { "stop_id": "stp_hn_gb", "stop_name": "Bến xe Giáp Bát", "planned_time": "14:00", "is_pickup": true },
      { "stop_id": "stp_lt", "stop_name": "Trạm dừng Liêm Tuyền", "planned_time": "15:15", "is_transit": true },
      { "stop_id": "stp_nb", "stop_name": "Bến xe Ninh Bình", "planned_time": "16:10", "is_transit": true },
      { "stop_id": "stp_th_01", "stop_name": "Bến xe Phía Bắc", "planned_time": "17:30", "is_dropoff": true }
    ],
    "policies": {
      "free_cancellation_hours_before": 12,
      "luggage_allowance_kg": 20,
      "pet_allowed": false
    },
    "segment_pricing": {
      "fare_vnd": 220000,
      "available_seats": 8
    }
  }
}
```

---

## 6. Business Rules
- `BR-TRIP-001`: If user navigates via deep link without specifying pickup/dropoff, the route defaults to the first stop (Origin terminal) and final stop (Destination terminal).
- `BR-TRIP-002`: Seat count is synchronized with server cache and updated if the screen is idle $> 2\text{ minutes}$.

---

## 7. Analytics & Telemetry
- `TRIP_DETAIL_VIEWED`: `{ trip_id: "trp_991823", fare: 220000, vehicle_type: "LIMOUSINE_34" }`
- `GALLERY_PHOTO_VIEWED`: `{ photo_index: 0 }`
- `SELECT_SEATS_CTA_CLICKED`: `{ trip_id: "trp_991823" }`

---

## 8. UI Copy & Localization
- **Title:** *"Chi tiết chuyến đi"*
- **Amenities Title:** *"Tiện ích trên xe"*
- **Policy Title:** *"Chính sách chuyến đi"*
- **Free Cancellation Label:** *"Hủy miễn phí trước {hours} tiếng khởi hành"*
- **Luggage Policy:** *"Hành lý: Tối đa {kg}kg hành lý xách tay và gửi hầm"*
- **Select Seat CTA:** *"CHỌN CHỖ NGỒI"*

---

## 9. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Passenger views trip specifications and taps Select Seat
  Given the passenger is viewing trip "trp_991823"
  When the passenger inspects the route timeline and taps "CHỌN CHỖ NGỒI"
  Then the app proceeds to PAX-008 or PAX-009 with the requested segment parameters.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-007-01` | Functional | Tap photo in carousel | Opens full-screen gallery viewer |
| `TC-PAX-007-02` | UI | Check stop timeline | Correctly highlights pickup and dropoff stations |
| `TC-PAX-007-03` | Performance | Load images on 4G | Uses cached webp thumbnails $< 300\text{ms}$ |
