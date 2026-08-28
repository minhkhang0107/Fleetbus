# DRI-019 — Driver Incident & Delay Quick Report

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen / Quick Action Sheet  
**Priority:** P1 (Operational Emergency / Delay)  
**Route:** `/driver/trip/:id/incident`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-19`, `BR-DELAY-001`, `UC-DRI-INC-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Provide a rapid, 2-tap incident reporting interface for drivers during active trips to notify the Operations Control Center (`MGR-025`) and trigger automated passenger ETA recalculation for common disruption events (Highway traffic jam, flat tire, minor breakdown, extreme weather, medical emergency).
- **Actor:** Driver.
- **Outcome:** Incident logged; Operations Control Center alerted in real time; passenger ETAs updated.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [✕] Báo cáo sự cố & Khai báo trễ chuyến          │
├───────────────────────────────────────────────────┤
│                                                   │
│ 🚨 CHỌN LOẠI SỰ CỐ NHANH (1-Tap):                 │
│                                                   │
│ ┌─ INCIDENT GRID ──────────────────────────────┐  │
│ │ [ 🚗 ÙN TẮC GIAO THÔNG (Kẹt xe) ]           │  │
│ │ [ 🛞 THAY LỐP / SỰ CỐ NHỎ (Trễ ~20-30p) ]   │  │
│ │ [ 🛠️ HỎNG XE CẦN XE THAY THẾ (Cứu hộ) ]     │  │
│ │ [ 🌧️ THỜI TIẾT XẤU / MƯA BÃO GIẢM TỐC ĐỘ ]   │  │
│ │ [ 🚑 CẤP CỨU / SỰ CỐ KHẨN CẤP (SOS) ]       │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ⏱️ ƯỚC TÍNH THỜI GIAN CHẬM TRỄ:                   │
│ [ +15 phút ]  [ +30 phút ]  [ +45 phút ]  [ >1h ] │
│                                                   │
│ 📝 Ghi chú bằng giọng nói / Tin nhắn nhanh:       │
│ [ 🎙️ Bấm giữ để nói: "Kẹt xe tại trạm Pháp Vân" ] │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ 🚨 GỬI BÁO CÁO VỀ ĐIỀU ĐỘ (CTA - 72dp) ]        │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-INCIDENT-001`: Reporting an incident with estimated delay automatically creates a high-priority incident on `MGR-025-operations-alerts.md` and triggers automatic passenger broadcast push notifications.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/incidents`
- **Request Body:**
```json
{
  "incident_type": "TRAFFIC_JAM",
  "estimated_delay_minutes": 30,
  "audio_note_url": "https://cdn.busgo.vn/audio/inc_99182.m4a",
  "current_lat": 20.9812,
  "current_lng": 105.8430
}
```
- **TC-DRI-019-01:** Submitting report emits `TRIP_DELAYED` event and updates Operations Radar in real time.
