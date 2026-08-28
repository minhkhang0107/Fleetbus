# MGR-009 — Manager Route & Geofence Stop Builder

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Full Screen Interactive Map & Sequence Builder  
**Priority:** P1 (Core Infrastructure)  
**Route:** `/ops/routes/builder`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-09`, `BR-ROUTE-001`, `BR-GEO-001`, `UC-MGR-ROUTE-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Design interprovincial transit routes and corridor polylines: add, reorder, and configure intermediate bus terminals/pickup points, specify planned travel times and distances between stops, draw GPS geofence arrival detection polygons (circular radius $100\text{m} - 500\text{m}$), and generate the segment pricing matrix.
- **Actor:** Route Operations Planner / GIS Engineer.
- **Outcome:** Validated route corridor with PostGIS geofences and segment matrix committed to database.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Thiết kế tuyến đường & Điểm dừng (Route Builder)      [💾 Lưu tuyến mới]│
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 🚏 DANH SÁCH ĐIỂM DỪNG (Thứ tự)      │ 🗺️ BẢN ĐỒ LỘ TRÌNH & GEOFENCE         │
│                                      │                                      │
│ ┌─ STOP 1 (Xuất phát) ─────────────┐ │        [ INTERACTIVE MAPBOX ]        │
│ │ 🟢 1. Bến xe Giáp Bát (Hà Nội)   │ │                                      │
│ │    Km0 · Bến xuất bến chính      │ │        📍 1. Bến xe Giáp Bát (Hà Nội)│
│ │    Bán kính Geofence: [ 200 ] m  │ │        │  (Vòng tròn xanh: 200m)     │
│ └──────────────────────────────────┘ │        ▼                             │
│ ┌─ STOP 2 (Đón trả dọc đường) ─────┐ │        📍 2. Trạm Liêm Tuyền (Hà Nam)│
│ │ ⚪ 2. Trạm thu phí Liêm Tuyền    │ │        │                             │
│ │    +50 km · Thời gian: +1h 15m   │ │        ▼                             │
│ │    Bán kính Geofence: [ 300 ] m  │ │        📍 3. Bến xe Ninh Bình        │
│ └──────────────────────────────────┘ │        │                             │
│ ┌─ STOP 3 (Điểm cuối) ─────────────┐ │        ▼                             │
│ │ 🔴 3. Bến xe Phía Bắc Thanh Hóa  │ │        📍 4. Bến xe Phía Bắc (TH)    │
│ │    +160 km · Thời gian: +3h 30m  │ │                                      │
│ └──────────────────────────────────┘ │ ════════════════ (Road Polyline Route)│
│                                      │                                      │
│ [ ➕ Thêm điểm dừng mới dọc tuyến ]  │ [ 🛣️ Tự động nắn đường theo Cao tốc]  │
│                                      │                                      │
│ 📊 MA TRẬN PHÂN CHẶNG TỰ ĐỘNG:       │ 💰 BẢNG GIÁ THEO CHẶNG:              │
│ • Chặng 1: Giáp Bát ➔ Liêm Tuyền     │ • Giá vé: 100.000 đ                  │
│ • Chặng 2: Liêm Tuyền ➔ Ninh Bình    │ • Giá vé:  60.000 đ                  │
│ • Chặng 3: Giáp Bát ➔ Thanh Hóa      │ • Giá vé: 220.000 đ (Toàn tuyến)     │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. Business Rules & PostGIS Geofencing
- `BR-GEO-001`: Each stop defines a PostGIS `ST_Buffer(geography(point), radius_meters)` polygon used by the ingestion pipeline (`DRI-008`) to automatically trigger stop arrivals.
- `BR-GEO-002`: Segment matrix automatically creates $N(N-1)/2$ sub-routes where each segment $[S_i, S_j]$ ($i < j$) has its own configurable base price.
- **TC-MGR-009-01:** Reordering stops recalculates distances and updates polyline in real time.
