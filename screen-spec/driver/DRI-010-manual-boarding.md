# DRI-010 — Driver Manual Boarding & PNR Search

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Search Modal  
**Priority:** P1 (Operational Fallback)  
**Route:** `/driver/trip/:id/manual-boarding`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-10`, `BR-SCAN-002`, `UC-DRI-MAN-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Allow drivers to manually check in passengers who cannot display their QR code (e.g. dead phone battery, smashed screen, paper SMS ticket) by searching by seat code, PNR, passenger name, or last 4 digits of phone number.
- **Actor:** Driver.
- **Outcome:** Passenger identified and confirmed boarded manually with reason logged.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Tìm kiếm & Check-in thủ công                  │
├───────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐  │
│  │ 🔍 [ Nhập mã ghế, PNR hoặc SĐT...         ] │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  KẾT QUẢ TÌM THẤY (1 hành khách)                  │
│                                                   │
│ ┌─ SEARCH RESULT CARD ─────────────────────────┐  │
│ │ 🟡 CHƯA LÊN XE · Ghế: A02 (Tầng 1)           │  │
│ │ Mã PNR: BG-88219                             │  │
│ │ Hành khách: Nguyễn Văn Nam · SĐT: 098***321  │  │
│ │ Tuyến: Bến xe Giáp Bát ➔ Bến xe Phía Bắc     │  │
│ │ 💳 Đã thanh toán: 176.000 đ                  │  │
│ │                                              │  │
│ │ ┌──────────────────────────────────────────┐ │  │
│ │ │    ✅ XÁC NHẬN CHO LÊN XE (CTA - 64dp)   │ │  │
│ │ └──────────────────────────────────────────┘ │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-MANUAL-001`: Manual boarding records `scan_method: 'MANUAL'` in the audit trail.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/boarding/manual`
- **TC-DRI-010-01:** Searching "A02" immediately retrieves passenger and allows check-in.
