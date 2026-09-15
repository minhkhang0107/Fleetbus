# PAX-018 — Passenger Live Bus Tracking & Realtime Map

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen Interactive Map  
**Priority:** P0 (Core Journey / Realtime)  
**Route:** `/tracking/:tripId`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-18`, `BR-GPS-001`, `BR-ETA-001`, `UC-PAS-TRACK-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Provide passengers with an authoritative, real-time spatial view of their bus's exact GPS location, vehicle bearing/heading, road-matched route path, passenger's pickup location pin, live ETA countdown to arrival, traffic congestion indicators, and connection status indicator (`LIVE`, `RECONNECTING`, `STALE`, `OFFLINE`).
- **Actor:** Passenger.
- **Entry Condition:** Tapped "Theo dõi xe" from Home Active Card (`PAX-004`), My Tickets (`PAX-016`), Ticket Detail (`PAX-017`), or push alert.
- **Outcome:** Passenger accurately anticipates bus arrival at pickup point with zero guesswork; reduces boarding missed rates to $<0.1\%$.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-GPS-001` (Realtime Telemetry Ingestion), `BR-ETA-001` (Map-Matched Dynamic ETA), `BR-CONN-001` (Connection State Management), `UC-PAS-TRACK-001`.
- **CRITICAL INVARIANT:** Client MUST distinguish between **device GPS timestamp** and **server received timestamp**.
- **No Client Animation Simulation:** Client does NOT synthesize fake vehicle movement if GPS telemetry has ceased. If telemetry is older than $60\text{ seconds}$, status transitions to `STALE`.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-017 Ticket Detail] or [PAX-004 Home]
Previous Screen: Calling screen
Next Screen:
  ├── [PAX-019 ETA Detail] (Tap ETA Card or Pull Up Drawer)
  ├── [PAX-017 Ticket Detail] (Tap "Xem vé QR" floating shortcut)
  └── [Driver VoIP Call] (Tap Phone Icon)
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Theo dõi trực tiếp            [🟢 Trực tiếp (GPS)]│
├───────────────────────────────────────────────────┤
│                                                   │
│                                                   │
│                 [ INTERACTIVE MAP ]               │
│                                                   │
│                     🚌 (Bus Marker: 29B-123.45)   │
│                     │  Heading: 180° · 62 km/h    │
│                     ▼                             │
│                  ════════════════ (Route Polyline)│
│                     │                             │
│                     📍 (Your Pickup: Giáp Bát)    │
│                                                   │
│                                                   │
│  [🎯 Canh giữa xe]            [ ➕ Phóng to ]     │
│  [📍 Vị trí của tôi]          [ ➖ Thu nhỏ ]      │
│                                                   │
├───────────────────────────────────────────────────┤
│ ┌─ FLOATING REALTIME ETA BOTTOM SHEET ─────────┐  │
│ │ 🟢 DỰ KIẾN ĐÓN BẠN SAU:                      │  │
│ │            ~14 PHÚT  (8.2 km)                │  │
│ │                                              │  │
│ │ Điểm đón: Bến xe Giáp Bát, Hà Nội            │  │
│ │ Xe: 29B-123.45 (Bác tài: Trần Văn Bình)      │  │
│ │                                              │  │
│ │ ───────────────────────────────────────────  │  │
│ │ [ 📞 Gọi tài xế ]         [ 🎫 Xem vé QR ]   │  │
│ └──────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

### Visual Hierarchy:
1. **Interactive Realtime Map:** High-contrast Mapbox / Google Maps tile with route polyline and custom vector Bus Pin with heading indicator.
2. **Floating ETA Summary Sheet:** Prominent emerald green arrival countdown ($24\text{px}$, Bold): `~14 PHÚT (8.2 km)`.
3. **Connection State Pill:** Top-right pill indicating `LIVE`, `RECONNECTING`, or `STALE`.
4. **Primary Quick Actions:** 1-tap call driver and 1-tap show ticket QR code pass.

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `LiveMapView` | Native Map | Yes | Mapbox/Google SDK | Rendered | Pan, pinch-to-zoom, rotate |
| `VehicleMarker` | Custom Vector Marker| Yes | WS Telemetry | Animated Heading | Smooth interpolation between GPS points |
| `PickupStopMarker`| Custom Pin | Yes | Ticket Snapshot | Static Pin | Tap centers map on pickup station |
| `ConnectionBadge` | Status Pill | Yes | Realtime Gateway | LIVE / RECONNECTING / STALE / OFFLINE | Tap shows connection details |
| `EtaBottomSheet` | Draggable Drawer | Yes | ETA Service | Collapsed / Expanded | Swipe up expands `PAX-019` timeline |
| `RecenterButton` | Floating Button | Yes | Camera Context | Enabled | Snaps camera to follow bus position |

---

## 6. Realtime WebSocket Architecture

- **WebSocket Room:** `trip:{tripId}`
- **Subscribed Events:**
  - `TRACKING_UPDATE`:
```json
{
  "event": "TRACKING_UPDATE",
  "trip_id": "trp_991823",
  "vehicle_id": "veh_29b_12345",
  "lat": 20.9812,
  "lng": 105.8430,
  "speed_kmh": 62,
  "heading": 185,
  "accuracy_meters": 5.0,
  "device_timestamp": "2026-08-27T14:02:10.000Z",
  "server_timestamp": "2026-08-27T14:02:11.200Z",
  "sequence": 1420
}
```
  - `ETA_UPDATED`:
```json
{
  "event": "ETA_UPDATED",
  "trip_id": "trp_991823",
  "target_stop_id": "stp_hn_gb",
  "eta_minutes": 14,
  "distance_remaining_meters": 8200,
  "is_delayed": false
}
```
  - `TRIP_DELAYED`: `{ "delay_minutes": 15, "reason": "Kẹt xe tại Pháp Vân" }`
  - `VEHICLE_REPLACED`: `{ "new_plate": "29B-999.88", "reason": "Sự cố kỹ thuật" }`

---

## 7. API Contract (Initial Snapshot & Fallback Polling)

### 7.1. Get Authoritative Tracking Snapshot
- **Endpoint:** `GET /api/v1/trips/{tripId}/tracking`
- **Auth:** Bearer
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "trip_status": "IN_TRANSIT",
    "vehicle": {
      "plate": "29B-123.45",
      "model": "Limousine 34",
      "driver_name": "Trần Văn Bình",
      "driver_phone_masked": "091***456"
    },
    "current_position": {
      "lat": 20.9812,
      "lng": 105.8430,
      "speed_kmh": 62,
      "heading": 185,
      "last_updated": "2026-08-27T14:02:10Z"
    },
    "route_polyline": "u{`_C_ab_E... (encoded polyline)",
    "pickup_stop": {
      "stop_id": "stp_hn_gb",
      "name": "Bến xe Giáp Bát",
      "lat": 20.9803,
      "lng": 105.8421,
      "planned_time": "14:00",
      "eta_minutes": 14,
      "distance_km": 8.2
    }
  }
}
```

---

## 8. Business Rules & Connection Resilience
- `BR-TRACK-001`: If WebSocket drops, client immediately falls back to REST polling (`GET /trips/{id}/tracking`) every $10\text{ seconds}$ while attempting exponential backoff WebSocket reconnection ($1\text{s}, 2\text{s}, 4\text{s}, 8\text{s}$).
- `BR-TRACK-002`: If no GPS position has been received for $>60\text{s}$, ConnectionBadge changes to `STALE` (Amber: *"Dữ liệu xe bị chậm"*). If $>180\text{s}$, badge changes to `OFFLINE` (Red: *"Mất tín hiệu GPS xe — Đang kết nối lại"*).
- `BR-TRACK-003`: When vehicle enters within $1.0\text{km}$ ($<5\text{ minutes}$ ETA) of passenger's pickup geofence, trigger local high-priority alert chime: *"Xe sắp đến điểm đón của bạn!"*.
- `BR-TRACK-004` (Rest-Stop & Depot Status): If vehicle speed is $0\text{ km/h}$ for $>5\text{ minutes}$ within a designated rest stop or meal depot geofence, the map sheet displays an informational badge: *"Xe đang tại Trạm dừng nghỉ ({stop_name}) — Dự kiến tiếp tục hành trình sau {minutes} phút"* to prevent passenger confusion regarding vehicle stoppage.

---

## 9. Analytics & Telemetry
- `LIVE_TRACKING_OPENED`: `{ trip_id: "trp_991823", initial_eta_minutes: 14 }`
- `TRACKING_RECONNECTED`: `{ duration_disconnected_ms: 3400, retry_attempts: 1 }`
- `NEAR_PICKUP_GEOFENCE_TRIGGERED`: `{ trip_id: "trp_991823", distance_meters: 800 }`

---

## 10. UI Copy & Localization
- **Header:** *"Theo dõi vị trí xe"*
- **Status Live:** *"Trực tiếp (GPS)"*
- **Status Reconnecting:** *"Đang kết nối lại..."*
- **Status Stale:** *"Dữ liệu chậm ({seconds}s)"*
- **Status Offline:** *"Mất tín hiệu GPS"*
- **ETA Label:** *"Dự kiến đón bạn sau:"*
- **ETA Format:** *"~{minutes} phút ({distance} km)"*
- **Call Driver CTA:** *"Gọi tài xế"*
- **Show QR CTA:** *"Xem vé QR"*

---

## 11. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Live bus tracking with smooth movement
  Given the passenger opens PAX-018 for active trip "trp_991823"
  When the backend publishes TRACKING_UPDATE with coordinates (20.9812, 105.8430)
  Then the bus marker smoothly interpolates to the new position
  And the ETA badge reflects ~14 phút.

Scenario: Fallback polling on WebSocket disconnect
  Given WebSocket connection fails
  When the app detects disconnect
  Then ConnectionBadge switches to "Đang kết nối lại..."
  And the app transparently switches to 10s REST polling to maintain live position.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-018-01` | Realtime | Receive telemetry stream | Updates bus marker position and heading smoothly |
| `TC-PAX-018-02` | Resilience | Disable server WebSocket | Gracefully degrades to REST polling |
| `TC-PAX-018-03` | Stale State | Kill driver GPS for 70s | Shows STALE warning pill |
