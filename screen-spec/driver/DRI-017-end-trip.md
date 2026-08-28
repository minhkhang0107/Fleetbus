# DRI-017 — Driver End Trip & Manifest Reconciliation

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Reconciliation & Handover  
**Priority:** P0 (Operational Blocking)  
**Route:** `/driver/trip/:id/end`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-17`, `BR-DRI-005`, `UC-DRI-TRIP-004`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Formally complete the active trip at the final destination terminal. Reconciles passenger manifest (boarded, no-show, alighted counts), confirms total COD cash collected for depot deposit, records end odometer reading, terminates the native Android GPS foreground service, transitions trip state in PostgreSQL to `COMPLETED`, and returns driver to shift schedule (`DRI-002`).
- **Actor:** Driver.
- **Entry Condition:** Vehicle arrived at final stop on `DRI-006` or `DRI-008`.
- **Outcome:** Trip completed; telemetry service stopped; manifest locked; shift financial ledger updated.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Tổng kết & Kết thúc chuyến đi                 │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ TRIP RECONCILIATION SUMMARY ────────────────┐  │
│ │ Tuyến: Hà Nội ──────────────► Thanh Hóa      │  │
│ │ Xe: 29B-123.45 · Bác tài: Trần Văn Bình      │  │
│ │ Xuất bến: 14:00 · Về bến: 17:35 (Đúng giờ)   │  │
│ ├─────────────────────────────────────────────┤   │
│ │ 👥 TỔNG HÀNH KHÁCH:           28 khách      │   │
│ │ • Đã lên xe & phục vụ:        27 khách      │   │
│ │ • Vắng mặt (No-show):         1 khách       │   │
│ ├─────────────────────────────────────────────┤   │
│ │ 💵 TỔNG TIỀN MẶT COD ĐÃ THU:  880.000 đ     │   │
│ │ (4 vé · Cần nộp lại kế toán bến)             │   │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ 🔢 SỐ CÔNG-TƠ-MÉT KẾT THÚC (Odometer)             │
│ ┌─────────────────────────────────────────────┐   │
│ │ [ 143015 ] km  (Quãng đường: 165 km)        │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ ✍️ KÝ XÁC NHẬN BÀN GIAO MANIFEST                   │
│ ┌─────────────────────────────────────────────┐   │
│ │ [ Vùng ký chữ ký điện tử trên màn hình ]    │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ 🏁 HOÀN TẤT & KẾT THÚC CHUYẾN ĐI (CTA - 72dp) ] │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-END-001`: If offline SQLite queue (`DRI-015`) contains unsynced events, the app displays warning: *"Đang có 2 sự kiện chưa đồng bộ. Hệ thống sẽ tự động đồng bộ khi kết nối lại."* and stores end trip event locally.
- `BR-END-002`: Ending a trip immediately stops the Android Foreground GPS tracking notification and frees system resources.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/end`
- **Request Body:**
```json
{
  "odometer_end_km": 143015,
  "total_boarded": 27,
  "total_no_show": 1,
  "total_cod_collected_vnd": 880000,
  "driver_signature_svg": "<svg>...</svg>",
  "end_timestamp": "2026-08-27T17:35:00Z"
}
```
- **TC-DRI-017-01:** Submitting end trip transitions trip status to `COMPLETED` and routes driver back to `DRI-002-today-trips.md`.
