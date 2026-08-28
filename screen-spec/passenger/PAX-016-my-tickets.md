# PAX-016 — Passenger My Tickets Directory

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Tab Root  
**Priority:** P0 (Core Journey)  
**Route:** `/tickets`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-16`, `BR-TICK-001`, `UC-PAS-TICK-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Provide a centralized directory of all electronic tickets belonging to the passenger, organized across three distinct tabs: **Sắp đi (Upcoming)**, **Lịch sử (Completed)**, and **Đã hủy (Cancelled)**. Allows rapid inspection of boarding status, 1-tap QR display, live tracking access, and cancellation requests.
- **Actor:** Passenger.
- **Entry Condition:** Tapped "Vé của tôi" in the bottom navigation bar.
- **Outcome:** Passenger selects any ticket to open `PAX-017-ticket-detail-qr.md` or navigates to live bus tracking (`PAX-018`).

---

## 2. Information Architecture & Navigation
```text
Parent Screen: None (Root Tab)
Previous Screen: N/A
Next Screen:
  ├── [PAX-017 Ticket Detail / QR] (Tap any Ticket Card)
  ├── [PAX-018 Live Tracking] (Tap "Theo dõi xe" on upcoming ticket)
  └── [PAX-004 Home] (Tap "Đặt vé ngay" on empty state)
```

---

## 3. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ Vé của tôi                              [🔍 Tìm vé]│
├───────────────────────────────────────────────────┤
│ ┌─ TICKET FILTER TABS ─────────────────────────┐  │
│ │ [ 🟢 SẮP ĐI (1) ] │ [ LỊCH SỬ ] │ [ ĐÃ HỦY ]  │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ UPCOMING TICKET CARD ───────────────────────┐  │
│ │ 🟢 ĐÃ XÁC NHẬN · Khởi hành: Hôm nay 14:00    │  │
│ │ Mã vé: BG-88219                              │  │
│ │                                              │  │
│ │ Hà Nội (Giáp Bát) ────────► Thanh Hóa        │  │
│ │ 💺 Ghế: A02 (Tầng 1) · Limousine 34 Phòng    │  │
│ │ 🚌 Biển số xe: 29B-123.45                    │  │
│ │ 👤 Người đi: Nguyễn Văn Nam                  │  │
│ │                                              │  │
│ │ ───────────────────────────────────────────  │  │
│ │ [ 📍 Theo dõi xe (ETA: 15p) ]  [ 🎫 Xem QR ] │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ PAST TICKET SUMMARY ────────────────────────┐  │
│ │ ⚪ HOÀN THÀNH · 20/08/2026                   │  │
│ │ Hà Nội ➔ Ninh Bình · Ghế B04                 │  │
│ │ [ Đặt lại chuyến này ]        [ Đánh giá ⭐ ]│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ [🏠 Trang chủ]  [🟢 🎫 Vé của tôi]  [🔔]  [👤]    │
└───────────────────────────────────────────────────┘
```

---

## 4. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TicketTabs` | TabBar | Yes | Local State | Upcoming / History / Cancelled | Tap switches ticket list |
| `SearchTicketIcon` | IconButton | Yes | Navigation | Enabled | Opens search by PNR or phone |
| `UpcomingTicketCard`| Elevated Card | Yes | Ticket API | Confirmed / In-Transit | Tap opens Ticket Detail; Tap Track -> PAX-018 |
| `RebookCTA` | Button | No | Past Ticket | Enabled | Prefills search form on PAX-004 |
| `EmptyTicketView` | State Card | Conditional | List Count === 0 | Visible if empty | Tap "Đặt vé ngay" routes to Home |

---

## 5. API Contract

### 5.1. Fetch Passenger Tickets
- **Endpoint:** `GET /api/v1/passenger/tickets`
- **Auth:** Bearer (or phone-verified guest session)
- **Query Params:** `tab=UPCOMING|HISTORY|CANCELLED&page=1&limit=10`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "tickets": [
      {
        "ticket_id": "tkt_88192a",
        "pnr": "BG-88219",
        "trip_id": "trp_991823",
        "trip_status": "IN_TRANSIT",
        "ticket_status": "ISSUED",
        "route_name": "Hà Nội - Thanh Hóa",
        "pickup_stop": "Bến xe Giáp Bát",
        "dropoff_stop": "Bến xe Phía Bắc",
        "departure_time": "2026-08-27T14:00:00+07:00",
        "seat_code": "A02",
        "deck": 1,
        "passenger_name": "Nguyễn Văn Nam",
        "vehicle_plate": "29B-123.45",
        "fare_vnd": 176000,
        "current_eta_minutes": 15
      }
    ],
    "total": 1
  }
}
```

---

## 6. Business Rules
- `BR-MYTICKETS-001`: Tickets with `trip_status IN ('SCHEDULED', 'DISPATCHED', 'IN_TRANSIT')` and `ticket_status IN ('ISSUED', 'BOARDED')` appear under the **Sắp đi** tab.
- `BR-MYTICKETS-002`: Pull-to-refresh queries latest status and checks if vehicle replacement or delay announcements have occurred.

---

## 7. Analytics & Telemetry
- `MY_TICKETS_VIEWED`: `{ tab: "UPCOMING", total_count: 1 }`
- `TICKET_CARD_CLICKED`: `{ ticket_id: "tkt_88192a", pnr: "BG-88219" }`
- `TRACKING_SHORTCUT_CLICKED`: `{ trip_id: "trp_991823" }`

---

## 8. UI Copy & Localization
- **Header:** *"Vé của tôi"*
- **Tab Upcoming:** *"Sắp đi"*
- **Tab History:** *"Lịch sử"*
- **Tab Cancelled:** *"Đã hủy"*
- **Track CTA:** *"Theo dõi xe"*
- **QR CTA:** *"Xem vé QR"*
- **Empty Title:** *"Bạn chưa có vé sắp đi nào"*
- **Empty Subtitle:** *"Khám phá ngay các tuyến xe chất lượng cao cùng BusGo."*
- **Empty CTA:** *"ĐẶT VÉ NGAY"*

---

## 9. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Passenger views upcoming tickets
  Given the passenger has 1 active ticket for trip "trp_991823"
  When the passenger taps the "Vé của tôi" bottom navigation tab
  Then PAX-016 displays the ticket card with route, departure time, seat code, and QR button
  And tapping "Xem vé QR" opens PAX-017.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-016-01` | Functional | Switch to "Lịch sử" tab | Displays completed historical trips |
| `TC-PAX-016-02` | Lifecycle | Guest user (No login) | Prompts to search by PNR & phone number |
