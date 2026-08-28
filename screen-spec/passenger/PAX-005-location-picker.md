# PAX-005 — Location & Stop Picker

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen Modal / Search Sheet  
**Priority:** P0 (Core Journey)  
**Route:** `/search/location-picker`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-05`, `BR-DISC-001`, `UC-PAS-SEARCH-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Provide a high-speed, indexed fuzzy search interface for selecting provinces, cities, interprovincial bus terminals, and specific pickup/dropoff stop locations along transit corridors.
- **Actor:** Passenger.
- **Entry Condition:** Tapped Origin field, Destination field, or Filter location on `PAX-004` or `PAX-006`.
- **Outcome:** Selected stop/province saved to search state; modal closes returning result to calling screen.

---

## 2. Information Architecture & Navigation
```text
Parent Screen: [PAX-004 Home] or [PAX-006 Search Results]
Previous Screen: [PAX-004 Home]
Next Screen: Return to Parent Screen with selected location payload
Entry Points: Origin Input, Destination Input, Route Filter Bar
Exit Points:
  ├── Tap Back / Close -> Return without changes
  ├── Tap Location Item -> Set selection and pop back
```

---

## 3. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Chọn điểm đi                                  │
├───────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐  │
│  │ 🔍 [ Tìm tỉnh, thành phố, bến xe...       ] │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  📍 Vị trí hiện tại                               │
│  [ Sử dụng vị trí hiện tại của bạn ]              │
│                                                   │
│  ⭐ Địa điểm đã lưu                               │
│  [ Nhà riêng: Bến xe Nước Ngầm, Hà Nội ]          │
│  [ Công ty: 184 Lê Duẩn, Hà Nội ]                 │
│                                                   │
│  🏙️ Tỉnh / Thành phố phổ biến                     │
│  [ Hà Nội ] [ Ninh Bình ] [ Thanh Hóa ] [ Nghệ An ]│
│                                                   │
│  ──────── KẾT QUẢ TÌM KIẾM ─────────────────────  │
│  📍 Bến xe Giáp Bát                               │
│     Km6 Giải Phóng, Giáp Bát, Hoàng Mai, Hà Nội   │
│                                                   │
│  📍 Bến xe Nước Ngầm                              │
│     Số 1 Ngọc Hồi, Hoàng Liệt, Hoàng Mai, Hà Nội  │
│                                                   │
│  📍 Bến xe Mỹ Đình                                │
│     Số 20 Phạm Hùng, Mỹ Đình 2, Nam Từ Liêm, HN   │
└───────────────────────────────────────────────────┘
```

---

## 4. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SearchInput` | InputField | Yes | User Query | Autofocused / Active | Instant fuzzy filtering ($\ge 1\text{ char}$) |
| `CurrentLocationItem` | ListItem | Yes | GPS Sensor | Available / Permission Denied | Tap gets closest matching terminal |
| `SavedPlacesSection` | List | Conditional | Local / User Profile | Hidden if empty | 1-tap select saved address |
| `PopularCitiesGrid` | Horizontal Wrap | Yes | Static Catalog | Normal | Tap sets province query |
| `StopResultsList` | Virtualized List | Yes | API / Indexed Cache | Loading / Populated / Empty | Tap selects stop and pops screen |

---

## 5. API Contract

### 5.1. Search Bus Stops & Locations
- **Endpoint:** `GET /api/v1/routes/stops/search`
- **Auth:** Public
- **Query Params:** `query=Gia+Bat`, `province_id=HN`, `limit=20`
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "stop_id": "stp_hn_gb",
        "name": "Bến xe Giáp Bát",
        "short_code": "GB",
        "province_name": "Hà Nội",
        "address": "Km6 Giải Phóng, Giáp Bát, Hoàng Mai, Hà Nội",
        "lat": 20.9803,
        "lng": 105.8421,
        "is_major_terminal": true
      },
      {
        "stop_id": "stp_hn_nn",
        "name": "Bến xe Nước Ngầm",
        "short_code": "NN",
        "province_name": "Hà Nội",
        "address": "Số 1 Ngọc Hồi, Hoàng Liệt, Hoàng Mai, Hà Nội",
        "lat": 20.9634,
        "lng": 105.8398,
        "is_major_terminal": true
      }
    ]
  }
}
```

---

## 6. Business Rules
- `BR-LOC-001`: Search query utilizes Vietnamese unaccented search (e.g. typing `"thanh hoa"` matches `"Thanh Hóa"`).
- `BR-LOC-002`: Stop catalog for popular corridors is pre-cached in local SQLite database on first app launch for offline instantaneous typing response ($< 16\text{ms}$).

---

## 7. UI Copy & Localization
- **Title (Origin):** *"Chọn điểm đi"*
- **Title (Destination):** *"Chọn điểm đến"*
- **Search Placeholder:** *"Nhập tỉnh thành, bến xe hoặc điểm đón..."*
- **Empty Query Copy:** *"Không tìm thấy điểm đón/trả phù hợp. Vui lòng thử từ khóa khác."*
- **Current Location Label:** *"Sử dụng vị trí hiện tại"*

---

## 8. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Search stop with unaccented text
  Given the passenger is on PAX-005 Location Picker
  When the passenger types "giap bat"
  Then the list instantly filters and highlights "Bến xe Giáp Bát"
  And tapping the item returns "stp_hn_gb" to PAX-004.
```

### Test Matrix:
| Test ID | Type | Input | Expected Output |
| :--- | :--- | :--- | :--- |
| `TC-PAX-005-01` | Functional | "ninh binh" | Displays Ninh Bình terminal and major expressway stops |
| `TC-PAX-005-02` | Offline | Airplane mode | Returns pre-cached major stops from SQLite |
