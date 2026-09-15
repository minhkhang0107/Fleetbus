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
- **OFFLINE VERIFICATION INVARIANT:** The app verifies the ticket payload signature against the daily secret key pre-cached during `DRI-001` login. No network connection is needed at the moment of scanning.

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
  // Format 1: Dynamic 30s TOTP string (BUSGO|pnr|tid|window|hmac)
  if (payload.startsWith('BUSGO|')) {
    final parts = payload.split('|');
    if (parts.length >= 5) {
      final pnr = parts[1];
      final tid = parts[2];
      final scannedWindow = int.parse(parts[3]);
      final hmac = parts[4];
      final currentWindow = currentTimestampMs ~/ 30000;
      
      // Permit +-2 windows (60s drift tolerance - REV-03)
      if ((currentWindow - scannedWindow).abs() <= 2) {
        final expectedHmac = computeHmac16("{\"pnr\":\"$pnr\",\"ticket_id\":\"$tid\",\"w\":$scannedWindow}", tripSecret);
        if (hmac == expectedHmac) {
          return ScanResult.valid(ticketId: tid, pnr: pnr, method: 'DYNAMIC_TOTP');
        }
      }
    }
  }

  // Format 2: Unified Group Boarding QR (BUSGO_GRP|pnr|seatCount|tids|window|hmac - REV-01)
  if (payload.startsWith('BUSGO_GRP|')) {
    final parts = payload.split('|');
    if (parts.length >= 6) {
      final pnr = parts[1];
      final seatCount = int.parse(parts[2]);
      final ticketIds = parts[3].split(',');
      final scannedWindow = int.parse(parts[4]);
      final hmac = parts[5];
      final currentWindow = currentTimestampMs ~/ 30000;
      
      if ((currentWindow - scannedWindow).abs() <= 2) {
        final expectedHmac = computeHmac16("{\"pnr\":\"$pnr\",\"seats\":$seatCount,\"tids\":\"${parts[3]}\",\"w\":$scannedWindow}", tripSecret);
        if (hmac == expectedHmac) {
          return ScanResult.validGroup(pnr: pnr, ticketIds: ticketIds, method: 'GROUP_TOTP');
        }
      }
    }
  }

  // Format 3: Offline JSON signature (Zero connectivity fallback / Printed Ticket)
  try {
    final Map<String, dynamic> data = jsonDecode(payload);
    final expectedSig = hmacSha256("${data['tid']}:${data['trp']}:${data['seat']}:${data['iat']}", tripSecret);
    if (data['sig'] == expectedSig && data['trp'] == currentTripId) {
      return ScanResult.valid(ticketId: data['tid'], pnr: data['pnr'], method: 'STATIC_OFFLINE');
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
