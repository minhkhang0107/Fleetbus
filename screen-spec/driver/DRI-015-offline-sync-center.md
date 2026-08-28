# DRI-015 — Driver Offline Mode, Outbox Queue & Sync Center

**App:** Driver  
**Platform:** Android (SQLite Local Store) / iOS  
**Screen Type:** Full Screen Sync Hub  
**Priority:** P0 (Core Operational / Data Integrity)  
**Route:** `/driver/sync-center`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-15`, `BR-SYNC-001`, `UC-DRI-SYNC-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Manage, inspect, and synchronize offline queued operational events (Boarding events, COD cash receipts, GPS telemetry batches, Incident reports) recorded while the vehicle passed through dead-zone cellular areas (mountain passes, tunnels).
- **Actor:** Driver / Dispatch Assistant.
- **Outcome:** Offline SQLite queue drained and acknowledged by backend with 100% data fidelity.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Trung tâm đồng bộ dữ liệu ngoại tuyến         │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ SYNC STATUS BANNER ─────────────────────────┐  │
│ │ 🟢 KẾT NỐI MẠNG: ĐÃ KHÔI PHỤC (4G Viettel)   │  │
│ │ Đang đồng bộ dữ liệu lên máy chủ...          │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ 📦 HÀNG ĐỢI DỮ LIỆU NGOẠI TUYẾN (SQLite Queue)    │
│                                                   │
│ ┌─ QUEUE BREAKDOWN ────────────────────────────┐  │
│ │ • Vé quét ngoại tuyến:        6 vé (Chờ gửi) │  │
│ │ • Thu tiền COD ngoại tuyến:   1 vé (220.000đ)│  │
│ │ • Tọa độ GPS đã lưu đệm:      142 điểm       │  │
│ │ • Báo cáo sự cố ngoại tuyến:  0 báo cáo      │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│  Tiến độ đồng bộ: [██████████████░░░░] 75%        │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ 🔄 ĐỒNG BỘ NGAY BÂY GIỜ (CTA - 64dp) ]          │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & Batch API Contract
- `BR-SYNC-001`: Synced boarding events use `Idempotency-Key` and original `scanned_at` device timestamp so backend manifest ordering is preserved accurately regardless of sync delay.
- **API Endpoint:** `POST /api/v1/driver/telemetry/batch-replay`
- **Request Body:**
```json
{
  "trip_id": "trp_991823",
  "boarding_events": [
    { "ticket_id": "tkt_88192a", "scanned_at": "2026-08-27T14:32:00Z", "method": "QR_OFFLINE" }
  ],
  "telemetry_points": [
    { "lat": 20.9812, "lng": 105.8430, "speed_kmh": 62.4, "t": "2026-08-27T14:32:00Z" }
  ]
}
```
- **TC-DRI-015-01:** Verifies flushing sync queue clears SQLite outbox records and marks them synced.
