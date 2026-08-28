# MGR-007 — Manager Visual Seat Layout Builder & Template Versioning

**App:** Manager Operations Portal  
**Platform:** Web (Desktop $\ge 1440\text{px}$)  
**Screen Type:** Full Screen Visual Editor  
**Priority:** P1 (Fleet Architecture)  
**Route:** `/ops/seat-layouts/builder`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-07`, `BR-FLEET-001`, `UC-MGR-FLEET-003`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide an interactive drag-and-drop 2D visual editor to create, customize, and version vehicle seat layout templates: define number of decks (Single / Double), rows $\times$ columns grid, designate aisle walkways, driver cabin, stairwells, restrooms, configure individual seat codes, seat classes (Standard, Sleeper, VIP Cabin), and default base pricing multiplier.
- **Actor:** Fleet Operations Engineer / System Admin.
- **Outcome:** Reusable, immutable versioned seat layout schema generated in PostgreSQL (`seat_layouts`).

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Thiết kế sơ đồ ghế (Seat Layout Builder)    [💾 Lưu mẫu phiên bản mới] │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ ⚙️ CẤU HÌNH SƠ ĐỒ CHUNG              │ 🎨 TRÌNH SOẠN THẢO 2D TRỰC QUAN      │
│ Tên mẫu: [ Limousine 34 Phòng VIP  ] │                                      │
│ Loại xe: [ Giường nằm 2 tầng      ▼] │ ┌─ DECK 1 (TẦNG DƯỚI) ─────────────┐ │
│ Số tầng: [ 2 Tầng ]                  │ │ 🚌 ĐẦU XE / TÀI XẾ               │ │
│ Kích thước lưới: [ 6 Hàng x 3 Cột ]  │ │                                  │ │
│                                      │ │ [ A01 - VIP ]  (Lối đi) [ B01 ]  │ │
│ 💺 CÔNG CỤ ĐẶT GHẾ (Palette)         │ │ [ A02 - VIP ]  (Lối đi) [ B02 ]  │ │
│ [ 🟦 Ghế VIP Cabin ] [ 🟨 Giường nằm]│ │ [ A03 - VIP ]  (Lối đi) [ B03 ]  │ │
│ [ 🚪 Cửa lên xuống ] [ 🚻 Nhà vệ sinh]│ │ [ A04 - VIP ]  (Lối đi) [ B04 ]  │ │
│ [ ❌ Ô trống ]       [ 🪜 Cầu thang ]│ │ [ A05 - VIP ]  (Lối đi) [ B05 ]  │ │
│                                      │ │ [ A06 - VIP ]  (Lối đi) [ B06 ]  │ │
│ 📊 THÔNG SỐ TỔNG HỢP:                │ └──────────────────────────────────┘ │
│ • Tổng số ghế kinh doanh: 34 ghế     │                                      │
│ • Tầng 1: 17 phòng · Tầng 2: 17 phòng│ ┌─ DECK 2 (TẦNG TRÊN) ─────────────┐ │
│ • Phiên bản hiện tại: v2.0           │ │ [ A07 - VIP ]  (Lối đi) [ B07 ]  │ │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. Layout JSON Schema & Versioning
```json
{
  "layout_name": "Limousine 34 Phòng VIP",
  "version": 2,
  "decks": 2,
  "rows": 6,
  "columns": 3,
  "total_sellable_seats": 34,
  "grid": [
    { "deck": 1, "row": 1, "col": 1, "type": "VIP_CABIN", "seat_code": "A01", "is_sellable": true },
    { "deck": 1, "row": 1, "col": 2, "type": "AISLE", "is_sellable": false },
    { "deck": 1, "row": 1, "col": 3, "type": "VIP_CABIN", "seat_code": "B01", "is_sellable": true }
  ]
}
```

---

## 4. Acceptance Criteria & Test Matrix
- **AC-001:** Layout builder calculates total sellable seats dynamically as cells are converted between `VIP_CABIN` and `AISLE`.
- **TC-MGR-007-01:** Editing an existing layout in production creates a new immutable version ($v+1$) without mutating historical trip snapshots.
