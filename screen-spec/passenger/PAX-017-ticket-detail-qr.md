# PAX-017 — Passenger Ticket Detail & QR Boarding Pass

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen / Boarding Pass  
**Priority:** P0 (Core Journey / Boarding)  
**Route:** `/ticket/:ticketId`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-17`, `BR-TICK-002`, `UC-PAS-TICK-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Serve as the passenger's authoritative digital boarding pass. Displays high-contrast HMAC-SHA256 signed QR code for driver offline scanning, seat code, departure timeline, pickup/dropoff addresses, vehicle license plate, driver contact bridge, and live trip tracking access.
- **Actor:** Passenger.
- **Entry Condition:** Tapped ticket from `PAX-015` or `PAX-016`, or opened from notification deep link.
- **Outcome:** Passenger presents QR code to driver upon boarding; receives instant sound/visual boarding confirmation; accesses live vehicle tracking.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-TICK-002` (Cryptographic Ticket QR Code), `BR-TICK-003` (Screen brightness auto-boost), `UC-PAS-TICK-002`.
- **OFFLINE QR INTEGRITY RULE:** The QR payload contains a cryptographic signature `HMAC-SHA256(ticket_id + trip_id + seat_code + issued_at, secret_key)`. The driver app (`DRI-009`) can verify authenticity without internet connectivity.
- **Offline Caching:** Ticket data and QR image are automatically cached in local encrypted storage upon first load.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-016 My Tickets]
Previous Screen: [PAX-016 My Tickets] or [PAX-015 Booking Success]
Next Screen:
  ├── [PAX-018 Live Tracking] (Tap "Theo dõi vị trí xe trực tiếp")
  ├── [PAX-021 Cancel & Refund] (Tap "Hủy vé / Yêu cầu hoàn tiền")
  └── [PAX-024 Vehicle Replacement Notice] (If vehicle was swapped)
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Vé xe điện tử                   [📤 Chia sẻ vé]│
├───────────────────────────────────────────────────┤
│ ┌─ MULTI-TICKET SWITCHER (Đặt cho 3 người) ────┐  │
│ │ [ 🔘 Vé 1: A01 ]  [ ⚪ Vé 2: A02 ]  [ 👥 QR Đoàn ]│  │
│ └───────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ BOARDING PASS CARD ─────────────────────────┐  │
│ │ BusGo Express · Limousine 34 Phòng VIP       │  │
│ │ Mã đặt chỗ: [ BG-88219 ]  ·  Vé 1/3          │  │
│ │                                              │  │
│ │ ┌──────────────────────────────────────────┐ │  │
│ │ │                                          │ │  │
│ │ │          [ AUTHORITATIVE QR CODE ]       │ │  │
│ │ │         (Dynamic 30s HMAC & Offline)     │ │  │
│ │ │                                          │ │  │
│ │ └──────────────────────────────────────────┘ │  │
│ │ (i) Đưa mã này cho tài xế khi lên xe         │  │
│ │ ⏳ Mã tự xoay sau 24s · ☀️ Độ sáng 100%       │  │
│ │ 🔑 Mã số dự phòng (Offline PIN): [ 682 914 ]  │  │
│ │                                              │  │
│ │ ───────────────────────────────────────────  │  │
│ │ GHẾ / CHỖ:            A01 (Tầng 1 - VIP)     │  │
│ │ HÀNH KHÁCH:           Nguyễn Văn Nam         │  │
│ │ BIỂN SỐ XE:           29B-123.45             │  │
│ │ TRẠNG THÁI:           🟢 ĐÃ XÁC NHẬN (ISSUED)│  │
│ │                                              │  │
│ │ ───────────────────────────────────────────  │  │
│ │ 🟢 ĐIỂM ĐÓN: 14:00 (Hôm nay 27/08/2026)      │  │
│ │    Bến xe Giáp Bát, Hà Nội                   │  │
│ │ 🔴 ĐIỂM TRẢ: 17:30 (Dự kiến)                 │  │
│ │    Bến xe Phía Bắc, Thanh Hóa                │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │    📍 THEO DÕI VỊ TRÍ XE TRỰC TIẾP (CTA)    │   │
│ │            (Xe cách bạn 8.2 km · ETA 15p)   │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ [ 📤 Gửi vé qua Zalo / SMS cho người thân ]       │
│ [ 📞 Liên hệ Bác tài / Nhà xe ]                   │
│ [ ❌ Hủy vé & Yêu cầu hoàn tiền ]                 │
│                                                   │
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **QR Code Container:** Centered high-contrast container with auto-brightness enhancement for seamless scanning in sunlight or night depots.
2. **Seat & Passenger Callout:** Prominent bold seat badge ($24\text{px}$, Brand Blue): `A02 (Tầng 1)`.
3. **Primary CTA:** Full-width Live Tracking button with realtime dynamic ETA badge.
4. **Secondary Actions:** Contact Driver via VoIP/Bridge and Cancel Ticket.

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `QRCodeView` | Canvas Widget | Yes | Signed Payload | High-Contrast | Tap toggles zoom to full screen |
| `BrightnessBooster` | Native Bridge | Yes | Lifecycle State | Active on view | Auto-boosts screen brightness to 100% |
| `SeatBadge` | Semantic Tag | Yes | Ticket Record | Bold Callout | Highlights seat code and deck |
| `TrackingCTA` | Button | Yes | Trip Realtime | Enabled | Navigates to `PAX-018-live-tracking.md` |
| `DriverCallBridge` | Button | Yes | VoIP / Call Proxy | Enabled | Initiates masked phone call to assigned driver |
| `CancelTicketCTA` | Text Button | Yes | Policy Engine | Enabled / Disabled | Navigates to `PAX-021-booking-cancel-refund.md` |

---

## 6. QR Code Cryptographic Payload Specification

### 6.1. Primary High-Security Format (Dynamic 30s Rotating TOTP String)
When app is online or device clock is within $\pm 60$s drift tolerance:
```text
BUSGO|{pnr}|{ticket_id}|{window30s}|{hmac16}
Ví dụ: BUSGO|BG-88219|tkt_88192a|59648457|d6a7c5d8bf86d6c5
```

### 6.2. Offline JSON Signature Format (Zero-connectivity Fallback & Group QR)
Cached locally in SQLite upon booking confirmation, valid throughout departure date:
```json
{
  "ver": 1,
  "tid": "tkt_88192a",
  "pnr": "BG-88219",
  "trp": "trp_991823",
  "seat": "A01",
  "seats": ["A01", "A02"],
  "seg": "stp_hn_gb:stp_th_pb",
  "iat": 1756291200,
  "pin": "682914",
  "sig": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

---

## 7. API Contract

### 7.1. Get Authoritative Ticket Detail
- **Endpoint:** `GET /api/v1/tickets/{ticketId}`
- **Auth:** Bearer
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "ticket_id": "tkt_88192a",
    "pnr": "BG-88219",
    "status": "ISSUED",
    "seat_code": "A01",
    "deck": 1,
    "passenger_name": "Nguyễn Văn Nam",
    "passenger_phone": "+84987654321",
    "offline_pin": "682914",
    "qr_payload": "BUSGO|BG-88219|tkt_88192a|59648457|d6a7c5d8bf86d6c5",
    "group_tickets": [
      { "ticket_id": "tkt_88192a", "seat_code": "A01", "passenger_name": "Nguyễn Văn Nam" },
      { "ticket_id": "tkt_88192b", "seat_code": "A02", "passenger_name": "Trần Thị Mai" }
    ],
    "trip": {
      "trip_id": "trp_991823",
      "status": "IN_TRANSIT",
      "route_name": "Hà Nội - Thanh Hóa",
      "vehicle_plate": "29B-123.45",
      "departure_time": "2026-08-27T14:00:00+07:00",
      "pickup_stop": {
        "name": "Bến xe Giáp Bát",
        "address": "Km6 Giải Phóng, Giáp Bát, Hoàng Mai, Hà Nội",
        "lat": 20.9803,
        "lng": 105.8421
      },
      "dropoff_stop": {
        "name": "Bến xe Phía Bắc",
        "address": "Phường Điện Biên, TP. Thanh Hóa",
        "lat": 19.8212,
        "lng": 105.7891
      },
      "driver": {
        "name": "Trần Văn Bình",
        "phone_masked": "091***456",
        "rating": 4.9
      }
    }
  }
}
```

---

## 8. Business Rules
- `BR-TICKET-001`: Screen automatically boosts display brightness to 100% when viewed and restores user brightness upon exit.
- `BR-TICKET-002`: If driver scans the ticket and marks `BOARDED`, the screen status pill instantly changes to `🟢 ĐÃ LÊN XE` via WebSocket event `PASSENGER_BOARDED`.
- `BR-TICKET-003`: Offline mode guarantees QR is rendered from SQLite cache even without internet connectivity.
- `BR-TICKET-004` (Multi-ticket Carousel & Group QR): For bookings with $\ge 2$ seats under the same PNR, the screen displays a horizontal pill switcher. Swiping toggles individual seat QR passes; tapping "QR Đoàn" produces a unified group boarding QR allowing the driver to board all passengers in one scan.
- `BR-TICKET-005` (Ticket Sharing & Delegation): User can tap "Chia sẻ vé" to enter a recipient's phone number. The system sends an SMS with a secure authenticated web link (`https://busgo.vn/pass/:shareToken`) and displays a 6-digit offline PIN (`offline_pin`) allowing relatives without the mobile app to board seamlessly.
- `BR-TICKET-006` (Drift Tolerance): Driver verification engine permits $\pm 2$ window steps ($\pm 60$ seconds) to prevent false rejections due to device clock discrepancies.

---

## 9. Analytics & Telemetry
- `TICKET_DETAIL_VIEWED`: `{ ticket_id: "tkt_88192a", is_offline: false }`
- `QR_ZOOM_CLICKED`: `{ ticket_id: "tkt_88192a" }`
- `DRIVER_CALL_CLICKED`: `{ trip_id: "trp_991823" }`
- `CANCEL_TICKET_INTENT`: `{ ticket_id: "tkt_88192a" }`

---

## 10. UI Copy & Localization
- **Header:** *"Vé xe điện tử"*
- **QR Helper:** *"Đưa mã này cho tài xế hoặc phụ xe khi lên xe"*
- **Brightness Notice:** *"Màn hình đã được tăng sáng để quét mã dễ dàng hơn"*
- **Status Issued:** *"ĐÃ XÁC NHẬN"*
- **Status Boarded:** *"ĐÃ LÊN XE"*
- **Track CTA:** *"THEO DÕI VỊ TRÍ XE TRỰC TIẾP"*
- **Cancel CTA:** *"Hủy vé & Yêu cầu hoàn tiền"*

---

## 11. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: View ticket and verify brightness boost
  Given the passenger opens ticket "tkt_88192a"
  When PAX-017 loads
  Then the app renders the high-contrast QR code
  And boosts screen brightness to maximum
  And displays pickup/dropoff and seat details.

Scenario: Realtime boarding status update
  Given the passenger is displaying PAX-017
  When the driver scans the QR code and submits BOARDED
  Then the status badge instantly updates to "ĐÃ LÊN XE" with a green checkmark animation.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-017-01` | Offline | Airplane mode | Successfully loads cached QR code from storage |
| `TC-PAX-017-02` | Realtime | WS event `PASSENGER_BOARDED` | Changes status badge to "ĐÃ LÊN XE" |
| `TC-PAX-017-03` | OS | App paused / exited | Restores original user screen brightness |
