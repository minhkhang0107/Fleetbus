# DRI-005 — Driver Start Trip Confirmation & Dispatch Lock

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Action Confirmation  
**Priority:** P0 (Operational Blocking)  
**Route:** `/driver/trip/:id/start-confirm`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-05`, `BR-DRI-004`, `UC-DRI-TRIP-003`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Provide the formal, high-consequence transition action to start the trip. Starts the native Android Background/Foreground GPS tracking service, establishes the persistent MQTT publish connection, transitions trip state in PostgreSQL to `IN_TRANSIT`, locks the trip into Active Driving Mode (`DRI-006`), and broadcasts `TRIP_STARTED` to passenger tracking subscribers.
- **Actor:** Driver.
- **Entry Condition:** Safety checklist completed on `DRI-004-readiness.md`.
- **Outcome:** Trip status becomes `IN_TRANSIT`; background GPS telemetry starts publishing; UI locks to Cockpit `DRI-006`.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Xác nhận bắt đầu chuyến đi                    │
├───────────────────────────────────────────────────┤
│                                                   │
│                     [ 🚌 ]                        │
│             BẮT ĐẦU CHUYẾN XE                     │
│                                                   │
│  Tuyến: Hà Nội ──────────────► Thanh Hóa          │
│  Xe: 29B-123.45 · Xuất bến: 14:00 (Hôm nay)       │
│  Điểm xuất phát: Bến xe Giáp Bát, Hà Nội          │
│                                                   │
│ ┌─ SYSTEM HEALTH PRE-CHECK ────────────────────┐  │
│ │ 🟢 GPS Vệ tinh:       Đã bắt được (Độ chính xác: 4m)│
│ │ 🟢 Kết nối mạng 4G:   Tốt (Viettel LTE)      │  │
│ │ 🟢 Dịch vụ chạy nền: Sẵn sàng               │  │
│ │ 🟢 Pin thiết bị:      92% (Đang sạc tẩu)     │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  ⚠️ Lưu ý quan trọng:                             │
│  Sau khi bấm bắt đầu, hệ thống sẽ tự động phát    │
│  tín hiệu định vị GPS trực tiếp đến hành khách.   │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │    🚀 BẮT ĐẦU CHUYẾN XE NGAY (CTA - 72dp)   │  │
│  │             (Trượt để xuất bến)             │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-START-001`: Starting a trip requires Android Foreground Service notification with permission `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION`.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/start`
- **Request Body:**
```json
{
  "start_lat": 20.9803,
  "start_lng": 105.8421,
  "device_timestamp": "2026-08-27T14:00:00Z"
}
```
- **TC-DRI-005-01:** Verifies sliding CTA starts MQTT foreground service and switches to `DRI-006`.
