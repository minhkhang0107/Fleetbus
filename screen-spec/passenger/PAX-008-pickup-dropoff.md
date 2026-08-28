# PAX-008 — Passenger Pickup & Dropoff Stop Selection

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen / 2-Step Flow  
**Priority:** P0 (Core Journey)  
**Route:** `/trip/:tripId/pickup-dropoff`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-08`, `BR-DISC-002`, `UC-PAS-TRIP-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Allow the passenger to explicitly pick their boarding point (Pickup Stop) and alighting point (Dropoff Stop) along the trip's authorized corridor, view detailed street addresses, pickup notes, and transit surcharges before entering the seat map.
- **Actor:** Passenger.
- **Entry Condition:** Proceeded from `PAX-007-trip-detail.md` or tapped "Thay đổi điểm đón/trả" from Seat Map / Checkout.
- **Outcome:** Valid pickup and dropoff stop sequence selected; segment fare recalculated; user routed to `PAX-009-seat-map.md`.

---

## 2. Business Context
- **Requirements Trace:** `BR-SEAT-001` (Segment Definition: $S_{pickup} < S_{dropoff}$ based on stop sequence order), `UC-PAS-TRIP-002`.
- **Business Invariant:** A passenger CANNOT select a dropoff stop whose route sequence index is $\le$ the pickup stop index.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-007 Trip Detail]
Previous Screen: [PAX-007 Trip Detail]
Next Screen: [PAX-009 Seat Map]
Entry Points: Trip Detail CTA, Seat Map Header Edit Button
Exit Points:
  ├── Tap Back -> Return to PAX-007
  └── Tap "Tiếp tục chọn ghế" -> Navigates to `/trip/{tripId}/seat-map?pickup={pId}&dropoff={dId}`
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Chọn điểm đón & trả                          │
├───────────────────────────────────────────────────┤
│ ┌─ STEP TABS ──────────────────────────────────┐  │
│ │ [ 🟢 1. ĐIỂM ĐÓN (1/2) ] │ [ 🔴 2. ĐIỂM TRẢ ]│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  Danh sách điểm đón tại Hà Nội                    │
│                                                   │
│  ┌─ RADIO ITEM 1 (Selected) ───────────────────┐  │
│  │ 🔘 14:00 · Bến xe Giáp Bát                  │  │
│  │    Km6 Giải Phóng, Giáp Bát, Hoàng Mai      │  │
│  │    (Điểm xuất bến chính · Miễn phí đón)     │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ RADIO ITEM 2 ──────────────────────────────┐  │
│  │ ⚪ 14:30 · Trạm thu phí Pháp Vân            │  │
│  │    Đầu cao tốc Pháp Vân - Cầu Giẽ           │  │
│  │    (Đón dọc đường · Vui lòng có mặt sớm 10p)│  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ RADIO ITEM 3 ──────────────────────────────┐  │
│  │ ⚪ 13:30 · Trung chuyển: 184 Lê Duẩn        │  │
│  │    Văn phòng BusGo Hoàn Kiếm                │  │
│  │    (+30.000 đ phí trung chuyển)             │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
├───────────────────────────────────────────────────┤
│ Đón: Bến xe Giáp Bát (14:00)                      │
│ [ TIẾP TỤC: CHỌN ĐIỂM TRẢ (CTA) ]                 │
└───────────────────────────────────────────────────┘
```

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `StepSwitcher` | TabBar | Yes | Flow Step | Step 1 (Pickup) / Step 2 (Dropoff) | Tap switches step |
| `StopRadioList` | List of Cards | Yes | Route Stop API | Selected / Unselected / Disabled | Tap selects stop with haptic |
| `TransferFeeBadge` | Semantic Tag | Conditional | Stop Surcharge | Visible if fee $> 0$ | Displays extra fee |
| `StickyContinueBar`| Action Bar | Yes | Selection State | Disabled / Enabled | Tap advances to Step 2 or Seat Map |

---

## 6. API Contract

### 6.1. Fetch Pickup & Dropoff Stops
- **Endpoint:** `GET /api/v1/trips/{tripId}/stops`
- **Auth:** Public
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "pickup_stops": [
      {
        "stop_id": "stp_hn_gb",
        "name": "Bến xe Giáp Bát",
        "address": "Km6 Giải Phóng, Giáp Bát, Hoàng Mai, Hà Nội",
        "sequence_order": 1,
        "planned_time": "14:00",
        "transfer_fee_vnd": 0,
        "note": "Xuất phát đúng giờ tại phòng chờ số 4"
      },
      {
        "stop_id": "stp_hn_pv",
        "name": "Trạm thu phí Pháp Vân",
        "address": "Đầu cao tốc Pháp Vân - Cầu Giẽ",
        "sequence_order": 2,
        "planned_time": "14:30",
        "transfer_fee_vnd": 0,
        "note": "Xe đón tại làn dừng khẩn cấp"
      }
    ],
    "dropoff_stops": [
      {
        "stop_id": "stp_th_pb",
        "name": "Bến xe Phía Bắc (Thanh Hóa)",
        "address": "Phường Điện Biên, TP. Thanh Hóa",
        "sequence_order": 4,
        "planned_time": "17:30",
        "transfer_fee_vnd": 0
      }
    ]
  }
}
```

---

## 7. Business Rules
- `BR-STOP-001`: Dropoff stop sequence order must be strictly greater than Pickup stop sequence order (`dropoff.sequence_order > pickup.sequence_order`).
- `BR-STOP-002`: Any stop surcharge (e.g. transfer van $+30,000\text{ VND}$) is dynamically added to the segment base fare and displayed in the checkout summary.

---

## 8. UI Copy & Localization
- **Step 1 Title:** *"Chọn điểm đón tại {Origin}"*
- **Step 2 Title:** *"Chọn điểm trả tại {Destination}"*
- **Step 1 CTA:** *"TIẾP TỤC: CHỌN ĐIỂM TRẢ"*
- **Step 2 CTA:** *"TIẾP TỤC: CHỌN CHỖ NGỒI"*
- **Transfer Van Note:** *"Xe trung chuyển đón trước giờ khởi hành {mins} phút"*

---

## 9. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Select valid pickup and dropoff sequence
  Given the passenger is on Step 1 (Pickup)
  When the passenger selects "Bến xe Giáp Bát" and taps "Tiếp tục"
  Then the view transitions to Step 2 (Dropoff)
  And when the passenger selects "Bến xe Phía Bắc" and taps "Tiếp tục chọn ghế"
  Then the app proceeds to PAX-009 Seat Map with pickup=stp_hn_gb and dropoff=stp_th_pb.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-008-01` | Functional | Select pickup and dropoff | Updates route state and enables continue CTA |
| `TC-PAX-008-02` | Validation | Sequence index check | Invalid sequence cannot be submitted |
