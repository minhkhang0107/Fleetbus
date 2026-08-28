# MGR-020 — Manager POS Fast Seat Selector & Instant Ticket Issuance

**App:** Manager Operations Portal  
**Platform:** Web (Desktop / Thermal Printer Integration)  
**Screen Type:** Full Screen Counter Terminal  
**Priority:** P0 (Sales & Revenue)  
**Route:** `/ops/pos/checkout`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-20`, `BR-POS-001`, `UC-MGR-POS-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Fast counter seat selector and instant POS checkout: 1-click pick seats, enter passenger phone (or default guest), select payment (Counter Cash, POS Card Swipe, Counter VietQR), and trigger instant thermal ticket printing ($80\text{mm}$ ESC/POS).
- **Actor:** Station Ticket Clerk.
- **Outcome:** Ticket issued; PNR generated; ESC/POS thermal ticket printed; cash recorded in drawer.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Bán vé tại quầy (POS): Hà Nội ➔ Thanh Hóa (14:00, 27/08) [🖨️ Máy in: OK]│
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 💺 SƠ ĐỒ GHẾ NHANH (Tầng 1)          │ 💵 THANH TOÁN & THÔNG TIN KHÁCH      │
│ [ A01 - 220k ]  [ B01 - ĐÃ BÁN ]     │                                      │
│ [ A02 - 220k ]  [ B02 - TẠM GIỮ ]    │ Số điện thoại khách (Nhận vé SMS):   │
│ [ A03 - 220k ]  [ B03 - 220k ]       │ [ 0987 654 321                     ] │
│                                      │                                      │
│ 💺 TẦNG 2                            │ Tên hành khách: [ Nguyễn Văn Nam   ] │
│ [ A07 - 220k ]  [ B07 - 220k ]       │                                      │
│                                      │ Hình thức thanh toán:                │
│ 📊 ĐÃ CHỌN: Ghế A02 (1 vé)           │ [ 🔘 TIỀN MẶT ] [ ⚪ QUẸT THẺ POS ]  │
│                                      │ [ ⚪ VIETQR TẠI QUẦY ]               │
│                                      │                                      │
│                                      │ Tiền khách đưa: [ 500000 ] đ         │
│                                      │ Tiền thừa trả:  [ 280000 ] đ         │
│                                      │                                      │
│                                      │ ┌──────────────────────────────────┐ │
│                                      │ │ 🖨️ XUẤT VÉ & IN NGAY [F9] (CTA)  │ │
│                                      │ └──────────────────────────────────┘ │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-POS-002`: Counter ticket issuance directly issues tickets with status `CONFIRMED` and payment status `SUCCESS` in a single database transaction.
- **API Endpoint:** `POST /api/v1/ops/pos/orders`
- **TC-MGR-020-01:** Verifies pressing `F9` executes transaction and triggers silent thermal print job.
