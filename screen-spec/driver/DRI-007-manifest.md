# DRI-007 — Driver Passenger Manifest & Segment Boarding Roster

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen List & Search  
**Priority:** P0 (Core Operational)  
**Route:** `/driver/trip/:id/manifest`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-07`, `BR-MAN-001`, `UC-DRI-MAN-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Provide drivers with the complete, segment-aware passenger manifest for the active trip. Allows filtering passengers by stop (Expected at this stop, already boarded, upcoming stops, alighting passengers), searching by seat code or passenger name, initiating direct call bridge to masked phone numbers, manual check-in, and marking no-shows.
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** Tapped "DANH SÁCH HÀNH KHÁCH" from `DRI-006-active-trip-dashboard.md`.
- **Outcome:** Driver verifies passenger identities, tracks boarding progress, and collects COD fares.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Danh sách hành khách (Manifest)    [🔍 Tìm tên]│
├───────────────────────────────────────────────────┤
│ ┌─ STOP FILTER TABS ───────────────────────────┐  │
│ │ [ 🔘 TRẠM NÀY: PHÁP VÂN (6) ] │ [ TẤT CẢ (28) ]│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  Đã lên xe: 4/6 khách · Còn lại: 2 khách          │
│                                                   │
│ ┌─ PASSENGER ITEM 1 (Boarded) ─────────────────┐  │
│ │ 🟢 ĐÃ LÊN XE · Ghế: A01 (Tầng 1)             │  │
│ │ 👤 Trần Văn Hùng · SĐT: 098***112            │  │
│ │ 📍 Trả tại: Bến xe Ninh Bình                 │  │
│ │ 💳 ĐÃ THANH TOÁN (Online VNPAY)              │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ PASSENGER ITEM 2 (Pending Boarding · COD) ──┐  │
│ │ 🟡 CHƯA LÊN XE · Ghế: A02 (Tầng 1)           │  │
│ │ 👤 Nguyễn Văn Nam · SĐT: 098***321           │  │
│ │ 📍 Trả tại: Bến xe Phía Bắc Thanh Hóa        │  │
│ │ 💵 THU COD: 220.000 đ                        │  │
│ │                                              │  │
│ │ [ 📞 Gọi khách ]  [ 💵 Thu COD ]  [ ✅ Lên xe ]│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ PASSENGER ITEM 3 (No-show Risk) ────────────┐  │
│ │ 🔴 CHƯA LÊN XE · Ghế: B04 (Tầng 1)           │  │
│ │ 👤 Lê Thị Mai · SĐT: 091***889               │  │
│ │ [ 📞 Gọi khách ]              [ ⏰ Báo vắng mặt ]│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ 📷 QUÉT QR NHANH ]   [ ➕ THÊM KHÁCH DỌC ĐƯỜNG ]│
└───────────────────────────────────────────────────┘
```

---

## 3. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `StopFilterTabs` | TabBar | Yes | Route Stops | Selected Stop / All | Filters manifest list by stop sequence |
| `PassengerItemCard`| List Card | Yes | Manifest API | Boarded / Pending / No-Show | Tap opens passenger actions |
| `MaskedCallButton` | Outlined CTA | Yes | VoIP Bridge | Enabled | Calls passenger via secure proxy |
| `CollectCodButton` | Button | Conditional | Ticket Fare State | Visible if COD pending | Opens `DRI-012-cod.md` |
| `ManualBoardCTA` | Button | Yes | Manifest State | Enabled | Marks boarded with 1 tap (`DRI-010`) |
| `MarkNoShowCTA` | Text CTA | Yes | Departure Time | Enabled after grace | Opens `DRI-011-no-show.md` |
| `OnboardHailCTA` | Primary CTA | Yes | Manifest State | Enabled | Opens On-the-road Hail Passenger Sheet |

---

## 4. API Contract

### 4.1. Get Trip Manifest
- **Endpoint:** `GET /api/v1/driver/trips/{tripId}/manifest`
- **Auth:** Bearer (Driver)
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "total_passengers": 28,
    "boarded_count": 24,
    "manifest": [
      {
        "ticket_id": "tkt_88192a",
        "pnr": "BG-88219",
        "seat_code": "A02",
        "deck": 1,
        "passenger_name": "Nguyễn Văn Nam",
        "phone_masked": "098***321",
        "pickup_stop_id": "stp_hn_pv",
        "dropoff_stop_name": "Bến xe Phía Bắc",
        "boarding_status": "ISSUED",
        "payment_method": "COD",
        "cod_amount_vnd": 220000
      }
    ]
  }
}
```

### 4.2. Onboard Hail Passenger (Đón khách vẫy dọc đường - REV-05)
- **Endpoint:** `POST /api/v1/driver/trips/{tripId}/onboard-hail`
- **Auth:** Bearer (Driver)
- **Request Body:**
```json
{
  "passenger_name": "Khách Vẫy Dọc Đường",
  "phone": "0912345678",
  "dropoff_stop_id": "stp_th_bx",
  "seat_code": "B06",
  "fare_amount_vnd": 180000,
  "payment_method": "CASH",
  "amount_collected_vnd": 200000,
  "change_settlement_method": "CASH_RETURNED"
}
```
- **Response `201 Created`:**
```json
{
  "status": "success",
  "data": {
    "ticket_id": "tkt_hail_99120",
    "pnr": "BG-HAIL-771",
    "seat_code": "B06",
    "boarding_status": "BOARDED",
    "payment_status": "SUCCESS",
    "amount_collected_vnd": 200000,
    "change_due_vnd": 20000
  }
}
```

---

## 5. Security & Privacy
- **PII Masking Invariant:** Driver app ONLY receives masked phone numbers (`098***321`). Clicking "Gọi khách" uses the backend Twilio / Stringee VoIP proxy bridge.

---

## 6. Business Rules (REV-05)
- `BR-MAN-002` (Đón khách dọc đường):
  - Phụ xe/tài xế chỉ được phép thêm khách vẫy dọc đường vào ghế còn trống (`VACANT`) trên chuyến xe.
  - Ngay khi tạo thành công, vé được chuyển thẳng trạng thái `BOARDED`, `Payment` ghi nhận `SUCCESS` với tiền mặt thu tại chỗ, và tự động đồng bộ vào nhật trình xe để tính doanh thu ca trực của tài xế.

---

## 7. Acceptance Criteria & Test Matrix
- **AC-001:** Manifest groups passengers by current stop by default; tapping "Lên xe" updates status to `BOARDED` and decrements pending count.
- **AC-002:** Tapping "THÊM KHÁCH DỌC ĐƯỜNG" allows assigning an empty seat, instantly issuing a boarded ticket and recording cash payment.
- **TC-DRI-007-01:** Verifies COD pending badge is visible only for unpaid tickets.
- **BR-HAIL-002 (Server-side fare and checks - review FND-A40):** The hail fare is the trip fare set by the server; `fare_amount_vnd` sent by the client is ignored. The trip must be `IN_TRANSIT` (`400 TRIP_NOT_ACTIVE`), `seat_code` is required (`400 SEAT_REQUIRED`) and must be free (`409 SEAT_OCCUPIED`), cash received must cover the fare (`400 INSUFFICIENT_AMOUNT`), and a phone, when given, must be valid. `WALLET_CREDIT` for the change needs a phone (`400 WALLET_PHONE_REQUIRED`). No fabricated default phone is stored. Hail cash is tracked separately from COD cash (`total_hail_collected_vnd`).
- **Privacy (OQ-007):** Every driver response shows only `phone_masked` (for example `098***456`). The full phone stays on the server for notifications.
- **TC-DRI-007-02:** Verifies onboard hail passenger assigns vacant seat and marks ticket boarded.

