# DRI-004 — Driver Vehicle Readiness & Safety Checklist

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Checklist  
**Priority:** P0 (Safety & Compliance Blocking)  
**Route:** `/driver/trip/:id/readiness`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-04`, `BR-DRI-003`, `UC-DRI-TRIP-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Enforce mandatory pre-trip safety and physical vehicle verification before trip start: verify fuel level, tire pressure, brake test, air conditioning, emergency hammer & fire extinguisher, and input start odometer reading.
- **Actor:** Driver / Lead Technician.
- **Entry Condition:** Proceeded from `DRI-003-trip-detail-prestart.md`.
- **Outcome:** Checklist submitted; trip marked `READY_FOR_START`; advances to `DRI-005-start-trip.md`.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Kiểm tra an toàn trước chuyến                │
├───────────────────────────────────────────────────┤
│  Xe: 29B-123.45 · Bác tài: Trần Văn Bình          │
│  (Vui lòng tích chọn đủ các hạng mục an toàn)     │
│                                                   │
│ ┌─ CHECKLIST ITEMS ────────────────────────────┐  │
│ │ ☑️ 1. Giấy tờ xe & Phù hiệu xe hợp lệ         │  │
│ ├─────────────────────────────────────────────┤   │
│ │ ☑️ 2. Mức nhiên liệu: Đầy / Đủ hành trình    │  │
│ ├─────────────────────────────────────────────┤   │
│ │ ☑️ 3. Áp suất lốp & Hệ thống phanh an toàn   │  │
│ ├─────────────────────────────────────────────┤   │
│ │ ☑️ 4. Điều hòa, Đèn chiếu sáng & Gạt mưa     │  │
│ ├─────────────────────────────────────────────┤   │
│ │ ☑️ 5. Bình cứu hỏa & Búa thoát hiểm đầy đủ   │  │
│ ├─────────────────────────────────────────────┤   │
│ │ ☑️ 6. Vệ sinh khoang khách & Túi rác sạch sẽ │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ 🔢 SỐ CÔNG-TƠ-MÉT XUẤT PHÁT (Odometer)            │
│ ┌─────────────────────────────────────────────┐   │
│ │ [ 142850 ] km                               │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ TIẾP TỤC: XUẤT BẾN CHUYẾN ĐI (CTA - 64dp) ]     │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-READINESS-001`: All 6 checklist items must be checked and valid odometer reading entered before the Continue CTA unlocks.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/readiness`
- **Request Body:**
```json
{
  "odometer_start_km": 142850,
  "checklist": {
    "documents_valid": true,
    "fuel_ok": true,
    "tires_brakes_ok": true,
    "ac_lights_ok": true,
    "safety_equipment_ok": true,
    "cleanliness_ok": true
  }
}
```
- **TC-DRI-004-01:** Submitting checklist sets trip state to `READY_FOR_START` and transitions to `DRI-005`.
