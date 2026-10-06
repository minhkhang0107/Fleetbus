# DRI-006 — Driver Active Trip Cockpit & In-Transit Dashboard

**App:** Driver  
**Platform:** Android (Primary Tablet/Phone) / iOS  
**Screen Type:** Full Screen High-Visibility Cockpit (Active Mode Lock)  
**Priority:** P0 (Core Operational / Safety Critical)  
**Route:** `/driver/trip/:id/active`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-06`, `BR-DRI-004`, `BR-TEL-001`, `UC-DRI-TRIP-003`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0` (Hard Disabled in Drive Mode), `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Serve as the central in-cabin operational cockpit while the vehicle is in transit. Displays glanceable critical driving metrics (Speed, Next Stop Name, Distance, Arrival ETA, Boarding Counters), monitors background GPS telemetry health, and provides 1-tap ultra-large touch actions for Stop Arrival, QR Boarding, Manifest, and Incident Reporting.
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** Trip started on `DRI-005-start-trip.md` or app resumed while active trip is in progress.
- **Outcome:** Driver operates vehicle with minimal distraction and maximum safety; manages passenger boarding smoothly at every stop.

---

## 2. Driver Safety & Ergonomics Invariants
- **ZERO DISTRACTING ANIMATIONS:** All continuous UI animations, auto-sliding carousels, and complex decorative transitions are hard-disabled (`MOTION_INTENSITY: 0`).
- **GLANCEABILITY (0.8m Dashboard Distance):** Text sizes for speed, next stop, and ETA use bold numerals $\ge 24\text{px}$ with high-contrast surfaces (Slate 900 dark theme default).
- **TOUCH TARGET MINIMUM:** All primary action buttons have a physical height of **$72\text{dp}$** (spanning full screen width).

---

## 3. Information Architecture & Navigation
```text
Parent Screen: None (Active Drive Lock)
Previous Screen: Locked from back navigation (Must explicitly tap "KẾT THÚC CHUYẾN" at final stop)
Child Modals / Sub-screens:
  ├── [DRI-007 Manifest] (Tap "DANH SÁCH HÀNH KHÁCH")
  │     └── [Onboard Hail Passenger] (Tap "➕ THÊM KHÁCH DỌC ĐƯỜNG")
  ├── [DRI-008 Stop Detail] (Tap Next Stop Card)
  ├── [DRI-009 Scan QR] (Tap "QUÉT VÉ QR")
  ├── [DRI-013 Navigation] (Tap "BẢN ĐỒ DẪN ĐƯỜNG")
  ├── [DRI-014 GPS Health] (Tap Top GPS Status Pill)
  ├── [DRI-015 Offline Sync Center] (Tap Sync Outbox Pill)
  ├── [DRI-019 Incident Report] (Tap SOS / Warning Icon)
  └── [DRI-017 End Trip] (Tap "KẾT THÚC CHUYẾN ĐI" at final terminal)
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ 🟢 ĐANG CHẠY · 29B-123.45      [🛰️ GPS Tốt] [📦 0] │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ SPEED & TELEMETRY GLANCE BAR ───────────────┐  │
│ │   [ 62 ] km/h          [ ~14 ] phút nữa       │  │
│ │   TỐC ĐỘ HIỆN TẠI      DỰ KIẾN ĐẾN TRẠM KẾ   │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ NEXT STOP HIGHLIGHT CARD (Large Glanceable) ┐  │
│ │ 🚏 TRẠM KẾ TIẾP (Trạm 2/4):                   │  │
│ │ BẾN XE NINH BÌNH                             │  │
│ │ (Khoảng cách còn lại: 8.2 km)                │  │
│ │                                              │  │
│ │ ⬆️ ĐÓN: 4 khách            ⬇️ TRẢ: 8 khách    │  │
│ │ 💵 Thu tiền COD: 1 vé (220.000 đ)            │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  TIẾN ĐỘ CHUYẾN ĐI: ĐÃ ĐÓN 24/28 KHÁCH            │
│  [████████████████████████░░░░] (85%)             │
│                                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │     📷 QUÉT VÉ QR LÊN XE (CTA - 72dp)       │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │    📋 DANH SÁCH HÀNH KHÁCH (MANIFEST - 64dp)│   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ [ 🗺️ Bản đồ ]  [ ⚠️ Báo sự cố/kẹt xe ]  [ 🏁 Kết thúc ]│
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **Speed & Arrival Countdown:** Large bold digits ($32\text{px}$) readable at a glance.
2. **Next Stop Target Card:** High-contrast bordered card ($18\text{px}$ stop name) detailing expected boarding/alighting counts.
3. **Primary Operational CTA:** Full-width High-Contrast Button ($72\text{dp}$): *"QUÉT VÉ QR LÊN XE"*.
4. **Secondary Operational CTA:** Full-width Button ($64\text{dp}$): *"DANH SÁCH HÀNH KHÁCH"*.
5. **Emergency Bar:** Quick shortcuts for Map navigation, SOS incident declaration, and End Trip.

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TelemetryGlanceBar` | Metric Deck | Yes | Native GPS Sensor | 60Hz update | Real-time speed & heading display |
| `NextStopHighlightCard`| Card | Yes | Route Snapshot + ETA| Active | Tap opens `DRI-008-stop-detail.md` |
| `GpsHealthPill` | Status Badge | Yes | GPS Service Manager | LIVE (Green) / WARN (Amber) / LOST (Red) | Tap opens `DRI-014-gps-health-monitor.md` |
| `ScanQrCTA` | DriverActionPill| Yes | Navigation | Brand Blue ($72\text{dp}$) | Tap opens `DRI-009-scan-qr.md` |
| `ManifestCTA` | DriverActionPill| Yes | Navigation | Slate ($64\text{dp}$) | Tap opens `DRI-007-manifest.md` |
| `IncidentSOSButton` | Outlined Pill | Yes | Navigation | Red Accent | Tap opens `DRI-019-incident-delay-report.md` |
| `EndTripButton` | Outlined Pill | Yes | Trip State | Enabled at final stop | Tap opens `DRI-017-end-trip.md` |

---

## 6. Background Telemetry Protocol

- **Transport:** MQTT over TLS (`ssl://mqtt.busgo.vn:8883`)
- **Topic:** `busgo/telemetry/{vehicleId}`
- **Sampling Frequency:** $1\text{ sample / 3 seconds}$
- **Payload Format:**
```json
{
  "trip_id": "trp_991823",
  "vehicle_id": "veh_29b_12345",
  "driver_id": "drv_8821a",
  "lat": 20.98124,
  "lng": 105.84301,
  "speed_kmh": 62.4,
  "heading": 185.0,
  "accuracy_meters": 4.2,
  "altitude_meters": 12.0,
  "device_timestamp": "2026-08-27T14:02:10.000Z",
  "battery_level_pct": 92,
  "is_charging": true,
  "sequence": 1420
}
```

---

## 7. Business Rules & Offline Resilience
- `BR-COCKPIT-003` (Telemetry accepted only while running - review FND-A41): The server accepts a telemetry ping only for a trip in `IN_TRANSIT` (`400 TRIP_NOT_ACTIVE`) and only with a latitude in [-90, 90], a longitude in [-180, 180] and a non-negative speed (`400 INVALID_TELEMETRY`). Starting a trip (`DRI-005`) requires status `READY`, which is reached only after the whole readiness checklist is complete (`400 INVALID_TRIP_STATE`).
- `BR-COCKPIT-001`: If cellular network is lost, the native Android service automatically diverts MQTT payloads into a local SQLite table (`offline_telemetry_queue`) with zero dropped frames.
- `BR-COCKPIT-002`: When network returns, `DRI-015-offline-sync-center.md` flushes buffered telemetry in batched HTTP chunks (`POST /api/v1/driver/telemetry/batch-replay`).
- `BR-COCKPIT-003`: The app acquires an Android WakeLock (`PARTIAL_WAKE_LOCK`) and screen stay-awake lock while in active trip mode.

---

## 8. Analytics & UI Copy
- `ACTIVE_COCKPIT_VIEWED`: `{ trip_id: "trp_991823", next_stop_id: "stp_nb" }`
- `SCAN_QR_LAUNCHED`: `{ from_stop_id: "stp_hn_gb" }`
- **Next Stop Prefix:** *"TRẠM KẾ TIẾP:"*
- **Boarding Counter:** *"⬆️ Đón: {board} · ⬇️ Trả: {alight}"*
- **COD Counter:** *"💵 Thu COD: {count} vé ({amount} đ)"*
- **Scan CTA:** *"📷 QUÉT VÉ QR LÊN XE"*
- **Manifest CTA:** *"📋 DANH SÁCH HÀNH KHÁCH"*

---

## 9. Acceptance Criteria & Test Matrix
- **AC-001:** Cockpit renders high-contrast metrics; tapping "QUÉT VÉ QR" opens the camera scanner within $<200\text{ms}$.
- **TC-DRI-006-01:** Verifies background GPS continues publishing even when screen is locked or another app is opened.
