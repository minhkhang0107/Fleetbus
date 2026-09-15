# DRI-010 — Driver Manual Boarding & Offline PIN Verification

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Search & PIN Verification Modal  
**Priority:** P1 (Operational Fallback)  
**Route:** `/driver/trip/:id/manual-boarding`  
**Version:** 1.1  
**Source Requirements:** `F-DRI-10`, `BR-SCAN-002`, `BR-DEL-001`, `UC-DRI-MAN-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Allow drivers to manually check in passengers who cannot display their QR code (e.g. dead phone battery, broken screen, delegated ticket sent via SMS with 6-digit PIN) by searching the trip roster by seat code, PNR, passenger name, or entering the 6-digit offline verification PIN.
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** Tapped "Nhập mã PNR / Số điện thoại bằng tay" on `DRI-009` or "Lên xe" on `DRI-007`.
- **Outcome:** Passenger identity verified; ticket transitioned to `BOARDED`; event recorded in SQLite outbox queue (`DRI-015`).

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Check-in thủ công & Nhập mã PIN               │
├───────────────────────────────────────────────────┤
│ ┌─ MODE TABS ───────────────────────────────────┐ │
│ │ [ 🔘 TÌM THEO GHẾ / SĐT ] │ [ 🔑 MÃ PIN 6 SỐ ] │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ [ TAB 1: TÌM KIẾM MANIFEST ]                      │
│ ┌───────────────────────────────────────────────┐ │
│ │ 🔍 [ Nhập số ghế (A02), PNR hoặc 4 số cuối SĐT]│ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ KẾT QUẢ TÌM THẤY (1 hành khách):                  │
│ ┌─ SEARCH RESULT CARD ──────────────────────────┐ │
│ │ 🟡 CHƯA LÊN XE · Ghế: A02 (Tầng 1)            │ │
│ │ Mã PNR: BG-88219                              │ │
│ │ Hành khách: Nguyễn Văn Nam · SĐT: 098***321   │ │
│ │ Tuyến: Bến xe Giáp Bát ➔ Bến xe Phía Bắc      │ │
│ │ 💳 Đã thanh toán Online (176.000 đ)           │ │
│ │                                               │ │
│ │ ┌───────────────────────────────────────────┐ │ │
│ │ │    ✅ XÁC NHẬN CHO LÊN XE (CTA - 64dp)    │ │ │
│ │ └───────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ───────────────────────────────────────────────── │
│                                                   │
│ [ TAB 2: NHẬP MÃ PIN 6 SỐ (REV-01, REV-03) ]     │
│ Khách xuất trình mã PIN từ tin nhắn SMS ủy quyền: │
│ ┌───────────────────────────────────────────────┐ │
│ │  [ 6 ]  [ 8 ]  [ 2 ]    [ 9 ]  [ 1 ]  [ 4 ]   │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ┌───────────────────────────────────────────────┐ │
│ │      🔑 KIỂM TRA MÃ PIN & LÊN XE (CTA)        │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ModeTabs` | TabBar | Yes | Local State | Search / PIN Mode | Switches between manifest search and 6-digit PIN input |
| `SearchInput` | TextField | Conditional | Local Manifest | Focused | Live-filters trip manifest by seat, PNR, or phone |
| `PinInputField` | 6-Box Pin Input | Conditional | User Input | Numeric (6 digits) | Auto-submits on 6th digit |
| `PassengerResultCard`| Elevated Card | Conditional | Search Query | Found / Not Found | Shows passenger details, payment status, and confirm button |
| `ManualBoardCTA` | Button | Yes | Result State | Primary Emerald | Checks in passenger with `scan_method: 'MANUAL_OVERRIDE'` |
| `VerifyPinCTA` | Button | Conditional | PIN State | Brand Primary | Checks in passenger with `scan_method: 'OFFLINE_PIN'` |

---

## 4. API Contract

### 4.1. Submit Manual Boarding / PIN Verification
- **Endpoint:** `POST /api/v1/driver/trips/{tripId}/boarding/manual`
- **Auth:** Bearer (Driver)
- **Headers:** `Content-Type: application/json`, `Idempotency-Key: uuid`
- **Request Body (PIN Mode - REV-01, REV-03):**
```json
{
  "ticket_id": "tkt_88192a",
  "pin": "682914",
  "scan_method": "OFFLINE_PIN",
  "device_timestamp": "2026-08-27T14:06:00Z"
}
```
- **Request Body (Search / Override Mode):**
```json
{
  "ticket_id": "tkt_88192a",
  "seat_code": "A02",
  "pnr": "BG-88219",
  "reason": "DEAD_PHONE_BATTERY",
  "scan_method": "MANUAL_OVERRIDE",
  "device_timestamp": "2026-08-27T14:06:00Z"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "ticket_id": "tkt_88192a",
    "pnr": "BG-88219",
    "seat_code": "A02",
    "passenger_name": "Nguyễn Văn Nam",
    "boarding_status": "BOARDED",
    "scan_method": "OFFLINE_PIN",
    "boarded_at": "2026-08-27T14:06:00Z"
  }
}
```

---

## 5. Business Rules
- `BR-DEL-001` (Offline 6-digit PIN Verification - REV-01, REV-03):
  - In dead phone battery or delegated ticket scenarios, driver enters the 6-digit PIN.
  - Driver app executes cryptographic verification `verifyTicketPin(ticketId, pin, tripSecret)` locally using cached daily trip keys.
  - On match, ticket transitions to `BOARDED` and records `scan_method: 'OFFLINE_PIN'`.
- `BR-MANUAL-001` (Manual Override Audit):
  - Manual boarding by seat/phone requires driver confirmation and logs `scan_method: 'MANUAL_OVERRIDE'` with reason (`DEAD_PHONE_BATTERY`, `SMASHED_SCREEN`, `PAPER_SMS`).
- `BR-MANUAL-002` (Brute-force Prevention):
  - Entering an incorrect 6-digit PIN $>5$ consecutive times locks PIN boarding for that ticket for 5 minutes, requiring manual ID verification.

---

## 6. Analytics & Telemetry
- `MANUAL_BOARDING_OPENED`: `{ trip_id: "trp_991823" }`
- `PIN_BOARDING_ATTEMPT`: `{ ticket_id: "tkt_88192a", success: true }`
- `MANUAL_OVERRIDE_SUBMITTED`: `{ ticket_id: "tkt_88192a", reason: "DEAD_PHONE_BATTERY" }`

---

## 7. UI Copy & Localization
- **Header:** *"Check-in thủ công & Nhập PIN"*
- **Tab Search:** *"Tìm theo Ghế / SĐT"*
- **Tab PIN:** *"Mã PIN 6 số"*
- **PIN Instruction:** *"Nhập 6 chữ số từ SMS vé ủy quyền hoặc mã dự phòng"*
- **Invalid PIN:** *"Mã PIN không chính xác. Vui lòng kiểm tra lại"*
- **Confirm CTA:** *"XÁC NHẬN CHO LÊN XE"*

---

## 8. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Manual passenger search and boarding
  Given passenger has dead phone battery
  When driver enters seat "A02" in manual boarding search
  Then passenger card displays with status CHƯA LÊN XE
  And tapping "Xác nhận cho lên xe" updates status to BOARDED.

Scenario: Delegated ticket check-in via 6-digit PIN
  Given passenger received SMS delegation with PIN "682914"
  When driver enters "682914" on the PIN tab
  Then client verifies cryptographic PIN against trip secret
  And successfully marks ticket BOARDED with scan_method OFFLINE_PIN.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-DRI-010-01` | Functional | Search by seat "A02" | Retrieves passenger and confirms boarding |
| `TC-DRI-010-02` | Crypto Flow | Enter valid 6-digit PIN | Verifies offline and marks ticket BOARDED |
| `TC-DRI-010-03` | Security | Enter wrong PIN 5 times | Temporarily locks PIN entry and displays warning |
