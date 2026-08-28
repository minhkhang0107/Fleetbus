# PAX-015 — Passenger Booking Success & PNR Summary

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen Confirmation  
**Priority:** P0 (Core Journey)  
**Route:** `/booking-success/:bookingId`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-15`, `BR-BOOK-001`, `BR-TICK-001`, `UC-PAS-BOOK-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Confirm successful payment and booking completion, issue authoritative Passenger Name Record (PNR) and electronic ticket(s), provide 1-tap ticket viewing, calendar syncing, and sharing via Zalo/SMS.
- **Actor:** Passenger.
- **Entry Condition:** Payment confirmed from `PAX-013` / `PAX-014` or direct COD booking confirmation.
- **Outcome:** Passenger reviews issued PNR and navigates to `PAX-017-ticket-detail-qr.md` or returns to `PAX-004-home.md`.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-BOOK-001` (Booking State: `CONFIRMED`), `BR-TICK-001` (Ticket Issuance), `UC-PAS-BOOK-002`.
- **Business Invariant:** System generates unique 6-character alphanumeric PNR (e.g. `BG-88219`) and creates individual `tickets` records with initial state `ISSUED`.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-013 Payment Processing]
Previous Screen: [PAX-013 Payment Processing]
Next Screen: 
  ├── [PAX-017 Ticket Detail / QR] (Tap "XEM VÉ XE")
  ├── [PAX-018 Live Tracking] (Tap "Theo dõi vị trí xe")
  └── [PAX-004 Home] (Tap "Về trang chủ")
System Back Button: Navigates cleanly to [PAX-004 Home] (Clearing checkout navigation stack).
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│                                                   │
│                     [ ✅ ]                        │
│               ĐẶT VÉ THÀNH CÔNG!                  │
│       Cảm ơn bạn đã đồng hành cùng BusGo          │
│                                                   │
│ ┌─ PNR TICKET PASS CONTAINER ──────────────────┐  │
│ │ Mã đặt chỗ (PNR):       [ BG-88219 ]         │  │
│ │ Tuyến:                  Hà Nội ➔ Thanh Hóa   │  │
│ │ Khởi hành:              14:00 · 27/08/2026   │  │
│ │ Điểm đón:               Bến xe Giáp Bát      │  │
│ │ Điểm trả:               Bến xe Phía Bắc      │  │
│ │ Ghế:                    A02 (Tầng 1)         │  │
│ │ Xe:                     Limousine 34 Phòng   │  │
│ │ Trạng thái thanh toán:  ĐÃ THANH TOÁN (176k) │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  (i) Thông tin vé đã được gửi về SĐT 0987***321   │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │             XEM VÉ ĐIỆN TỬ (CTA)            │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [ 📅 Thêm vào Lịch ]   [ 📲 Chia sẻ qua Zalo ]   │
│  [ Về trang chủ ]                                 │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SuccessConfettiAnimation`| Lottie SVG | Yes | Static Asset | Plays once ($1.5\text{s}$) | Haptic success feedback |
| `PnrSummaryCard` | Ticket Pass Card | Yes | Booking API | Normal | Tap PNR copies code to clipboard |
| `ViewTicketCTA` | Button | Yes | Flow State | Brand Blue | Navigates to `PAX-017-ticket-detail-qr.md` |
| `AddToCalendarButton` | Outlined Button | Yes | Event Calendar API| Enabled | Adds departure alarm to Apple/Google Calendar |
| `ShareTicketButton` | Outlined Button | Yes | Native Share Sheet | Enabled | Generates text summary for Zalo/SMS |
| `HomeButton` | Text Button | Yes | Navigation | Normal | Pops stack and returns to `PAX-004` |

---

## 6. API Contract

### 6.1. Get Confirmed Booking Details
- **Endpoint:** `GET /api/v1/bookings/{bookingId}`
- **Auth:** Optional Bearer (Session verified)
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "booking_id": "bkg_77192a83",
    "pnr": "BG-88219",
    "status": "CONFIRMED",
    "total_amount_vnd": 176000,
    "payment_method": "VNPAY",
    "tickets": [
      {
        "ticket_id": "tkt_88192a",
        "seat_code": "A02",
        "passenger_name": "Nguyễn Văn Nam",
        "status": "ISSUED"
      }
    ],
    "trip": {
      "trip_id": "trp_991823",
      "route_name": "Hà Nội - Thanh Hóa",
      "departure_time": "2026-08-27T14:00:00+07:00",
      "pickup_name": "Bến xe Giáp Bát",
      "dropoff_name": "Bến xe Phía Bắc"
    }
  }
}
```

---

## 7. Business Rules
- `BR-SUCCESS-001`: Navigating back from `PAX-015` MUST clear the entire booking flow stack from memory so pressing back cannot return to checkout or seat selection.
- `BR-SUCCESS-002`: System triggers automatic SMS / Zalo Notification confirmation with PNR and web link within $5\text{ seconds}$ of booking confirmation.

---

## 8. Analytics & Telemetry
- `BOOKING_SUCCESS_VIEWED`: `{ booking_id: "bkg_77192a83", pnr: "BG-88219", total_amount: 176000 }`
- `VIEW_TICKET_CLICKED`: `{ ticket_id: "tkt_88192a" }`
- `TICKET_SHARED`: `{ channel: "zalo" | "system_share" }`
- `CALENDAR_EVENT_ADDED`: `{ departure_time: "2026-08-27T14:00:00+07:00" }`

---

## 9. UI Copy & Localization
- **Success Title:** *"Đặt vé thành công!"*
- **Success Subtitle:** *"Cảm ơn bạn đã lựa chọn BusGo. Chúc bạn có một chuyến đi an toàn và thoải mái!"*
- **PNR Label:** *"Mã đặt chỗ (PNR):"*
- **View Ticket CTA:** *"XEM VÉ ĐIỆN TỬ"*
- **Calendar CTA:** *"Thêm vào Lịch"*
- **Share CTA:** *"Chia sẻ vé qua Zalo / Tin nhắn"*
- **Home CTA:** *"Về trang chủ"*

---

## 10. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: View booking success and PNR
  Given the payment succeeds for booking "bkg_77192a83"
  When PAX-015 renders
  Then it displays the confirmed PNR "BG-88219" and trip details
  And tapping "XEM VÉ ĐIỆN TỬ" opens PAX-017 with the authoritative QR code.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-015-01` | Functional | Tap "XEM VÉ ĐIỆN TỬ" | Navigates to `/ticket/{ticketId}` |
| `TC-PAX-015-02` | Navigation | Press hardware back button | Returns to `/home`, checkout stack purged |
| `TC-PAX-015-03` | OS Integration | Tap "Thêm vào Lịch" | Requests calendar permission and inserts trip event |
