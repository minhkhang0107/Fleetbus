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
- **OFFLINE VERIFICATION INVARIANT:** The app verifies the ticket payload signature against the secret key pre-cached during `DRI-001` login. No network connection is needed at the moment of scanning.
- **SIGNATURE INVARIANT (review FND-A24):** Every payload carries an HMAC that is **always recomputed and compared in constant time before any other check**. A payload with a missing or wrong signature is rejected with `INVALID_SIGNATURE`, even when its window and ticket id look valid. The server (`POST /driver/trips/{tripId}/boarding`) applies the same rule, because it is the single source of truth when the device is online.
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

## 6. Offline Validation Algorithm & Multi-Format Support

The scanner auto-detects payload format and executes instant local validation ($<150\text{ms}$):

```dart
// Dart offline verification engine supporting dynamic TOTP, Group QR, and static offline signatures
ScanResult verifyScannedPayload(String payload, String tripSecret, int currentTimestampMs) {
  // Format 1: Dynamic 30s TOTP string (BUSGO|pnr|tid|window|hmac); hmac = HMAC16("QR|pnr|tid|window")
  if (payload.startsWith('BUSGO|')) {
    final parts = payload.split('|');
    if (parts.length >= 5) {
      final pnr = parts[1];
      final tid = parts[2];
      final scannedWindow = int.parse(parts[3]);
      final hmac = parts[4];
      final currentWindow = currentTimestampMs ~/ 30000;
      
      // Signature first, constant-time compare; then permit +-2 windows (60s drift tolerance - REV-03)
      final expectedHmac = computeHmac16("QR|$pnr|$tid|${parts[3]}", tripSecret);
      if (!constantTimeEquals(hmac, expectedHmac)) {
        return ScanResult.invalid(reason: 'INVALID_SIGNATURE');
      }
      if ((currentWindow - scannedWindow).abs() <= 2) {
        return ScanResult.valid(ticketId: tid, pnr: pnr, method: 'DYNAMIC_TOTP');
      }
      return ScanResult.invalid(reason: 'QR_EXPIRED');
    }
  }

  // Format 2: Unified Group Boarding QR (BUSGO_GRP|pnr|orderId|seatCount|tids|window|hmac - REV-01)
  // hmac = HMAC16("GRP|pnr|orderId|seatCount|tids|window")
  if (payload.startsWith('BUSGO_GRP|')) {
    final parts = payload.split('|');
    if (parts.length >= 7) {
      final pnr = parts[1];
      final orderId = parts[2];
      final seatCount = int.parse(parts[3]);
      final ticketIds = parts[4].split(',');
      final scannedWindow = int.parse(parts[5]);
      final hmac = parts[6];
      final currentWindow = currentTimestampMs ~/ 30000;

      final expectedHmac = computeHmac16("GRP|$pnr|$orderId|${parts[3]}|${parts[4]}|${parts[5]}", tripSecret);
      if (!constantTimeEquals(hmac, expectedHmac)) {
        return ScanResult.invalid(reason: 'INVALID_SIGNATURE');
      }
      if ((currentWindow - scannedWindow).abs() <= 2) {
        return ScanResult.validGroup(pnr: pnr, ticketIds: ticketIds, method: 'GROUP_TOTP');
      }
      return ScanResult.invalid(reason: 'QR_EXPIRED');
    }
  }

  // Format 3: Offline JSON signature (Zero connectivity fallback / Printed Ticket)
  // {"tkt","pnr","seat","trip","sig"}; sig = HMAC16("tkt|pnr|seat|trip"); valid only for the ticket's own trip
  try {
    final Map<String, dynamic> data = jsonDecode(payload);
    final expectedSig = computeHmac16("${data['tkt']}|${data['pnr']}|${data['seat']}|${data['trip']}", tripSecret);
    if (constantTimeEquals(data['sig'], expectedSig) && data['trip'] == currentTripId) {
      return ScanResult.valid(ticketId: data['tkt'], pnr: data['pnr'], method: 'STATIC_OFFLINE');
    }
  } catch (_) {}

  return ScanResult.invalid(reason: 'SIGNATURE_MISMATCH_OR_EXPIRED');
}
```

- **SQLite Local Outbox Table (`offline_boarding_events`):**
  - `ticket_id: TEXT PRIMARY KEY`
  - `trip_id: TEXT`
  - `scanned_at: TEXT (ISO 8601)`
  - `scan_method: TEXT ('DYNAMIC_TOTP' | 'GROUP_TOTP' | 'STATIC_OFFLINE' | 'MANUAL_PIN')`
  - `synced: INTEGER (0 = false, 1 = true)`

---

## 7. Acceptance Criteria & Test Matrix
- **AC-001:** Scanning a valid signed QR marks ticket `BOARDED`, plays green chime, and queues event to SQLite within $<150\text{ms}$.
- **AC-002:** Scanning a valid Group QR marks all tickets within the PNR as `BOARDED` simultaneously.
- **TC-DRI-009-01:** Scanning a QR with an invalid HMAC signature produces red error card with low buzz.
- **TC-DRI-009-02:** Scanning a valid Group QR successfully batch-boards all tickets and updates trip manifest counter.
