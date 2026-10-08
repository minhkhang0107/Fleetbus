# DRI-009 — Driver Offline QR Boarding Scanner

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Camera Scanner  
**Priority:** P0 (Core Operational / Boarding)  
**Route:** `/driver/trip/:id/scan`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-09`, `BR-SCAN-001`, `BR-TICK-002`, `UC-DRI-SCAN-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Provide ultra-fast ($<200\text{ms}$), high-throughput camera QR scanning for boarding passengers. Validates cryptographic HMAC-SHA256 ticket signatures offline (zero network dependency), plays audio/vibrational feedback, checks COD payment requirements, and records the boarding event into local SQLite outbox queue (`DRI-015`).
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** Tapped "QUÉT VÉ QR" from `DRI-006` or `DRI-008`.
- **Outcome:** Passenger boarding validated; seat marked `BOARDED`; COD collected if applicable.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-SCAN-001` (Offline Cryptographic Ticket Validation), `BR-SCAN-002` (Duplicate Scan Prevention), `UC-DRI-SCAN-001`.
- **OFFLINE VERIFICATION INVARIANT (D104):** The tablet never holds the ticket secret. Before the trip (`DRI-004`, `DRI-005`) it downloads the manifest (`GET /api/v1/driver/trips/{tripId}/manifest`), in which every row carries `boarding_check: { qr_version, qr_digest, pin_digest }`. Offline, a scanned QR is valid when its ticket is on the manifest, its version equals `qr_version` and its signature equals `qr_digest`; a PIN is valid when `sha256(ticket_id|pin)` equals `pin_digest`. A lost tablet therefore exposes one trip at most, never the means to forge any ticket. Online, the server checks the same way.
- **SIGNATURE INVARIANT (review FND-A24):** Every payload carries an HMAC that is **always recomputed and compared in constant time before any other check**. A payload with a missing or wrong signature is rejected with `INVALID_SIGNATURE`, even when its version and ticket id look valid. The server (`POST /driver/trips/{tripId}/boarding`) applies the same rule, because it is the single source of truth when the device is online.
- **TRIP-SCOPE INVARIANT (review FND-A36):** A ticket is matched on `ticket_id` inside the manifest of the trip being scanned. A valid signature for a ticket that is not on this trip returns `WRONG TRIP`; the PNR alone never selects a passenger.
- **SINGLE BOARDING PATH (review FND-A37):** QR, group QR, PIN, offline ticket and manual boarding all end in the same step, which marks the passenger `BOARDED` and publishes `PASSENGER_BOARDED`, so the passenger wallet and the manager dashboard stay in sync.

---

## 3. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [✕ Đóng]      QUÉT VÉ QR LÊN XE      [🔦 Bật đèn] │
├───────────────────────────────────────────────────┤
│                                                   │
│             ┌───────────────────────┐             │
│             │ ┏                   ┓ │             │
│             │                       │             │
│             │     [ CAMERA FEED ]   │             │
│             │     (Active Scanner)  │             │
│             │                       │             │
│             │ ┗                   ┛ │             │
│             └───────────────────────┘             │
│          (Căn chỉnh mã QR vào trong khung)        │
│                                                   │
│ ┌─ SCAN FEEDBACK CARD (Success Pop-up) ────────┐  │
│ │ 🟢 HỢP LỆ · ĐÃ XÁC NHẬN LÊN XE               │  │
│ │                                              │  │
│ │ Ghế: A02 (Tầng 1) · Khách: Nguyễn Văn Nam    │  │
│ │ Tuyến: Hà Nội ➔ Thanh Hóa                    │  │
│ │ 💳 Đã thanh toán VNPAY Online (176.000 đ)    │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ [ ⌨️ Nhập mã PNR / Số điện thoại bằng tay ]       │
│                                                   │
├───────────────────────────────────────────────────┤
│ Đã quét trạm này: 5 / 6 khách (Còn lại: 1)        │
└───────────────────────────────────────────────────┘
```

---

## 4. Scan Result States & Audio/Haptic Matrix

| Scan Outcome | Visual Banner | Audio Tone | Haptic Pattern | System Action |
| :--- | :--- | :--- | :--- | :--- |
| **VALID (Paid)** | Green card: *"HỢP LỆ · ĐÃ LÊN XE"* | High-pitch Double Beep | 1 Short Click | Mark ticket `BOARDED`; queue to SQLite |
| **VALID (Group QR)** | Green card: *"HỢP LỆ · VÉ ĐOÀN ({n} KHÁCH)"* | Fanfare Chime | 2 Crisp Clicks | Batch board all N tickets in PNR; queue to SQLite |
| **VALID (COD Pending)** | Amber card: *"CẦN THU TIỀN COD"* | Triple Alert Chime | 2 Quick Pulses | Navigates to `DRI-012-cod.md` to collect cash |
| **ALREADY BOARDED** | Red card: *"VÉ ĐÃ LÊN XE TRƯỚC ĐÓ"* | Low Buzz | Long Heavy Pulse | Block duplicate; display timestamp of scan |
| **WRONG TRIP** | Red card: *"SAI CHUYẾN XE / SAI NGÀY"* | Low Buzz | Long Heavy Pulse | Show expected trip info on screen |
| **FORGED / EXPIRED** | Red card: *"CHỮ KÝ VÉ KHÔNG HỢP LỆ"* | Alarm Siren | Continuous Vibration| Reject boarding; record security incident |

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CameraPreview` | Native Scanner | Yes | Mobile Camera | 60 FPS scanning | Auto-detects QR codes |
| `TorchButton` | IconButton | Yes | Device Flashlight | OFF / ON | Toggles camera flashlight for night stops |
| `FeedbackOverlay` | Pop-up Card | Yes | Scan Engine | Success / Warning / Error | Displays scan summary for 2.0s |
| `ManualInputCTA` | Button | Yes | Navigation | Enabled | Opens `DRI-010-manual-boarding.md` |

---

## 6. Offline Validation Algorithm (D104)

The scanner reads the payload and checks it against the downloaded manifest ($<150\text{ms}$), without any secret:

```dart
ScanResult verifyScannedPayload(String payload, Manifest manifest) {
  // Single ticket: BUSGO|pnr|ticket_id|v<version>|hmac16
  if (payload.startsWith('BUSGO|')) {
    final p = payload.split('|');
    if (p.length != 5 || !RegExp(r'^v\d+$').hasMatch(p[3])) return ScanResult.invalid('MALFORMED_PAYLOAD');
    final row = manifest.byTicketId(p[2]);
    if (row == null) return ScanResult.invalid('TICKET_WRONG_TRIP');
    if (row.boardingStatus == 'BOARDED') return ScanResult.invalid('ALREADY_BOARDED');
    if (int.parse(p[3].substring(1)) != row.check.qrVersion) return ScanResult.invalid('QR_REVOKED');
    if (!constantTimeEquals(p[4], row.check.qrDigest)) return ScanResult.invalid('INVALID_SIGNATURE');
    if (row.isUnpaidCod) return ScanResult.codRequired(row);            // BR-COD-006
    return ScanResult.valid(row, method: 'QR');
  }
  // Group: BUSGO_GRP|pnr|order|count|tid:v1,tid:v1|hmac16. The tablet checks each member as above
  // (version and per-ticket digest); the group signature itself is checked by the server when online.
  if (payload.startsWith('BUSGO_GRP|')) return verifyGroupMembers(payload, manifest);
  return ScanResult.invalid('INVALID_FORMAT');
}
```

- **SQLite Local Outbox Table (`offline_boarding_events`):**
  - `ticket_id: TEXT PRIMARY KEY`
  - `trip_id: TEXT`
  - `scanned_at: TEXT (ISO 8601)`
  - `scan_method: TEXT ('QR' | 'GROUP_QR' | 'PIN' | 'MANUAL_OVERRIDE')`
  - `synced: INTEGER (0 = false, 1 = true)`

---

## 7. Acceptance Criteria & Test Matrix
- **AC-001:** Scanning a valid signed QR marks ticket `BOARDED`, plays green chime, and queues event to SQLite within $<150\text{ms}$.
- **AC-002:** Scanning a valid Group QR marks all tickets within the PNR as `BOARDED` simultaneously.
- **TC-DRI-009-01:** Scanning a QR with an invalid HMAC signature produces red error card with low buzz.
- **TC-DRI-009-02:** Scanning a valid Group QR successfully batch-boards all tickets and updates trip manifest counter.


## Design review 2026-10-07: COD ticket boarding (D100)

- `BR-COD-006`: an unpaid COD ticket boards **only** through the COD collection (`DRI-012`, `POST .../payments/cod-collect`), which marks it `BOARDED` in the same step. Manual boarding, PIN and QR scan of that ticket answer `409 COD_PAYMENT_REQUIRED` with `{ticket_id, seat_code, cod_amount_vnd}`; a group QR boards the paid members and lists the others in `cod_pending_passengers`.
- UI: the manifest row of an unpaid COD ticket has one primary action **"Thu {giá} & cho lên xe"** (opens the `DRI-012` sheet), never a separate "Cho lên xe" button. A scan that returns `COD_PAYMENT_REQUIRED` opens the same sheet with the fare filled in.
- Test: `test/server/cod_boarding_gate.test.js` (`TC-DSG-01` to `04`).
