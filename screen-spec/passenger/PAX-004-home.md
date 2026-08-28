# PAX-004 — Passenger Home & Discovery

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Tab Root / Main Dashboard  
**Priority:** P0 (Core Journey)  
**Route:** `/home`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-04`, `BR-DISC-001`, `UC-PAS-HOME-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Serve as the central discovery and operational hub for passengers. Allows users to quickly initiate trip searches, access ongoing/upcoming trip tracking cards in 1-tap, view saved frequent routes, and review critical transit notices.
- **Actor:** Passenger (Guest or Authenticated).
- **Entry Condition:** Default landing after launch/login; bottom navigation "Trang chủ" tab tap.
- **Outcome:** Passenger easily searches for interprovincial trips or navigates directly to live tracking for an active ticket.

---

## 2. Business Context
- **Requirements Trace:** `BR-DISC-001` (Instant Route Search), `BR-TICK-001` (Prominent Active Ticket Display), `UC-PAS-HOME-001`.
- **Business Invariant:** If the passenger has a ticket for a trip that is currently `IN_TRANSIT` or departing within $< 2\text{ hours}$, the Active Ticket Tracking Hero Card MUST be sticky at the top of the feed.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: None (Root Tab)
Previous Screen: N/A
Next Screen:
  ├── [PAX-005 Location Picker] (Tap Origin or Destination)
  ├── [PAX-006 Search Results] (Tap "Tìm chuyến xe")
  ├── [PAX-017 Ticket Detail] (Tap Active Ticket Card)
  ├── [PAX-018 Live Tracking] (Tap "Theo dõi trực tiếp" on Active Card)
  └── [PAX-020 Notifications] (Tap Bell Icon in App Bar)
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ BusGo       [Xin chào, Nam 👋]       [🔔 2] [👤]  │
├───────────────────────────────────────────────────┤
│                                                   │
│  [ ACTIVE TICKET HERO CARD (If trip is today) ]   │
│  ┌─────────────────────────────────────────────┐  │
│  │ 🟢 ĐANG DI CHUYỂN · Khởi hành: 14:00        │  │
│  │ Hà Nội (Giáp Bát) ────────► Thanh Hóa       │  │
│  │ Ghế: A02 · Biển số: 29B-123.45              │  │
│  │ [ 📍 Theo dõi xe (ETA: 15p) ] [ Xem vé QR ] │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ SEARCH COMPONENT CARD ─────────────────────┐  │
│  │ 🟢 Điểm đi:   [ Hà Nội - Bến Giáp Bát     ] │  │
│  │      [ ⇅ Đổi chiều ]                       │  │
│  │ 🔴 Điểm đến:  [ Thanh Hóa - Bến Phía Bắc  ] │  │
│  │ 📅 Ngày đi:   [ Hôm nay, 27/08/2026       ] │  │
│  │ 💺 Số vé:     [ 1 Hành khách              ] │  │
│  │ ┌─────────────────────────────────────────┐ │  │
│  │ │          TÌM CHUYẾN XE (CTA)            │ │  │
│  │ └─────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  Tuyến đường phổ biến                             │
│  [ Hà Nội ↔ Ninh Bình ]  [ Hà Nội ↔ Thanh Hóa ]   │
│                                                   │
│  Ưu đãi nổi bật                                   │
│  [ Banner: Giảm 20% đặt vé sớm chặng Bắc Nam ]   │
│                                                   │
├───────────────────────────────────────────────────┤
│ [🏠 Trang chủ]  [🎫 Vé của tôi]  [🔔 Thông báo]  [👤 Tài khoản] │
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **Active Trip Hero Card (Conditional):** Elevated emerald/sapphire card with live pulsing status indicator and direct "Theo dõi xe" action.
2. **Search Card:** Clean, high-contrast elevated white container ($16\text{dp}$ padding, radius $12\text{px}$) with dedicated origin/destination fields.
3. **Primary CTA:** High-emphasis Brand Blue button *"TÌM CHUYẾN XE"*.
4. **Recent & Popular Corridors:** Horizontal chip scroll for 1-tap route prefill.

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TopAppBar` | Header | Yes | Auth Context | Authenticated / Guest | Tap Avatar -> Profile; Tap Bell -> Notifications |
| `ActiveTicketCard` | Dynamic Card | Conditional | Active Ticket API | Hidden / Visible | Tap -> Ticket Detail; Tap Track -> Live Tracking |
| `OriginStopField` | Form Selector | Yes | Search State | Filled / Empty | Tap opens `PAX-005` (Origin mode) |
| `SwapRouteButton` | IconButton | Yes | Search State | Enabled | Smooth rotation animation ($180^\circ$); swaps origin/dest |
| `DestStopField` | Form Selector | Yes | Search State | Filled / Empty | Tap opens `PAX-005` (Destination mode) |
| `DateSelector` | DatePicker Pill | Yes | Search State | Today / Tomorrow / Custom | Tap opens native Bottom Sheet Calendar |
| `SearchCTA` | Button | Yes | Form State | Enabled / Loading | Tap navigates to `PAX-006` Search Results |
| `PopularCorridors` | Horizontal Scroll | Yes | Server API | Normal | Tap chips prefills origin/dest/date |
| `PromoCarousel` | Image Carousel | No | Marketing CMS | Normal | Tap opens web promotion details |

---

## 6. API Contract

### 6.1. Home Feed Aggregation
- **Endpoint:** `GET /api/v1/passenger/home-feed`
- **Auth:** Optional Bearer (Public compatible)
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "active_ticket": {
      "ticket_id": "tkt_88192a",
      "pnr": "BG-88219",
      "trip_id": "trp_991823",
      "trip_status": "IN_TRANSIT",
      "route_name": "Hà Nội - Thanh Hóa",
      "pickup_stop": "Bến xe Giáp Bát",
      "dropoff_stop": "Bến xe Phía Bắc Thanh Hóa",
      "departure_time": "2026-08-27T14:00:00+07:00",
      "seat_code": "A02",
      "vehicle_plate": "29B-123.45",
      "current_eta_minutes": 15
    },
    "popular_routes": [
      { "origin_id": "stp_hn_01", "origin_name": "Hà Nội", "dest_id": "stp_th_01", "dest_name": "Thanh Hóa", "min_price": 180000 },
      { "origin_id": "stp_hn_01", "origin_name": "Hà Nội", "dest_id": "stp_nb_01", "dest_name": "Ninh Bình", "min_price": 120000 }
    ],
    "unread_notifications_count": 2
  }
}
```

---

## 7. Business Rules
- `BR-HOME-001`: If Origin and Destination are identical, the "Tìm chuyến xe" CTA is disabled with helper text *"Điểm đi và điểm đến không được trùng nhau"*.
- `BR-HOME-002`: Search date defaults to current local date (`Asia/Ho_Chi_Minh`), never allowing past dates.
- `BR-HOME-003`: Active Ticket card updates ETA every 60 seconds via lightweight polling if screen is active.

---

## 8. Exception Flows & Matrix

| Scenario | Trigger | UI Feedback | System Action | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| No Network | Offline on Home open | Persistent top offline pill | Render cached feed data & saved stops | Tap "Thử lại" |
| Origin not picked | Tap Search with empty origin | Red highlight around origin field | Focus jumps to origin picker | Select origin |
| Active Trip Cancelled | Trip cancelled by operator | Active card turns red with alert banner | Push notification triggered | Tap to view refund options (`PAX-021`) |

---

## 9. Analytics & Telemetry
- `HOME_VIEWED`: `{ has_active_ticket: true, active_trip_id: "trp_991823" }`
- `ROUTE_SWAP_CLICKED`: `{ origin: "Hà Nội", destination: "Thanh Hóa" }`
- `SEARCH_INITIATED`: `{ origin_id: "stp_hn_01", dest_id: "stp_th_01", departure_date: "2026-08-27" }`
- `ACTIVE_TICKET_TRACKING_CLICKED`: `{ ticket_id: "tkt_88192a", current_eta: 15 }`

---

## 10. UI Copy & Localization
- **Greeting Guest:** *"Xin chào! Bạn muốn đi đâu?"*
- **Greeting User:** *"Xin chào, {name} 👋"*
- **Search CTA:** *"TÌM CHUYẾN XE"*
- **Swap Tooltip:** *"Đổi chiều"*
- **Active Trip Status:** *"Xe đang di chuyển · Dự kiến đến sau {eta} phút"*
- **Track CTA:** *"Theo dõi xe"*
- **Ticket CTA:** *"Xem vé QR"*

---

## 11. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Initiate search with pre-filled route
  Given the passenger is on PAX-004 Home
  And selects Origin "Hà Nội" and Destination "Thanh Hóa" for Date "2026-08-27"
  When the passenger taps "TÌM CHUYẾN XE"
  Then the app routes to PAX-006 with query parameters origin_id, dest_id, date.

Scenario: Live ticket card display
  Given the passenger has an upcoming ticket departing today
  When the passenger opens the app
  Then PAX-004 displays the Active Ticket Card at the top with live vehicle plate and ETA.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-004-01` | Functional | Tap swap button | Swaps origin and destination values smoothly |
| `TC-PAX-004-02` | Lifecycle | Passenger with active trip | Active card displayed prominently |
| `TC-PAX-004-03` | Validation | Search with same origin & dest | Shows validation error, blocks search |
