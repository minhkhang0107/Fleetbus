# DRI-017 — Driver End Trip & Manifest Reconciliation

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Full Screen Reconciliation & Handover  
**Priority:** P0 (Operational Blocking)  
**Route:** `/driver/trip/:id/end`  
**Version:** 1.1  
**Source Requirements:** `F-DRI-17`, `BR-DRI-005`, `BR-COD-002`, `BR-HAIL-001`, `UC-DRI-TRIP-004`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Formally complete the active trip at the final destination terminal. Reconciles passenger manifest (boarded, no-show, alighted counts), confirms total cash collected (COD fares + on-the-road hail fares), compiles issued rest-stop debt receipts for cashier clearance, records final odometer reading, terminates native Android GPS foreground tracking service, transitions trip state in PostgreSQL to `COMPLETED`, and returns driver to shift schedule (`DRI-002`).
- **Actor:** Driver / Assistant Driver.
- **Entry Condition:** Vehicle arrived at final stop on `DRI-006` or `DRI-008`.
- **Outcome:** Trip completed; telemetry service stopped; manifest locked; shift financial handover ledger updated.

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
│ │ 💵 BẢN ĐỐI SOÁT TIỀN MẶT THU TẠI XE:        │   │
│ │ • Tiền vé COD (4 vé):         880.000 đ     │   │
│ │ • Khách vẫy dọc đường (2 vé): 360.000 đ     │   │
│ │ ─────────────────────────────────────────── │   │
│ │ 🟢 TỔNG TIỀN NỘP VỀ BẾN:      1.240.000 đ   │   │
│ ├─────────────────────────────────────────────┤   │
│ │ 📑 BIÊN LAI NỢ TIỀN THỪA PHÁT HÀNH (REV-04): │   │
│ │ • Số lượng: 1 biên lai (DR-88192A-280K)     │   │
│ │ • Số tiền cần hoàn trả tại trạm: 280.000 đ  │   │
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

## 3. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TripSummaryCard` | Container Card | Yes | Trip + Manifest | Static Summary | Displays route, vehicle, passenger counts |
| `FinancialSummaryCard`| Summary Card | Yes | Payment Records | Reconciled | Breaks down COD cash, Hail cash, and total cash |
| `DebtReceiptAuditCard`| Warning Card | Conditional | Debt Records | Issued Receipts | Lists pending rest-stop debt receipts for cashier |
| `OdometerInput` | NumberField | Yes | User Input | Auto-calculated | Driver inputs end odometer |
| `SignaturePad` | Canvas Widget | Yes | User Gesture | Signed / Empty | Captures driver electronic signature |
| `CompleteTripCTA` | Primary Button | Yes | Form Valid | Enabled | Submits end trip payload with Idempotency Key |

---

## 4. API Contract

### 4.1. End Active Trip & Handover Manifest
- **Endpoint:** `POST /api/v1/driver/trips/{tripId}/end`
- **Auth:** Bearer (Driver)
- **Headers:** `Content-Type: application/json`, `Idempotency-Key: uuid`
- **Request Body:**
```json
{
  "odometer_end_km": 143015,
  "total_boarded": 27,
  "total_no_show": 1,
  "total_cod_collected_vnd": 880000,
  "total_hail_collected_vnd": 360000,
  "total_cash_to_handover_vnd": 1240000,
  "debt_receipts_summary": {
    "total_count": 1,
    "total_amount_vnd": 280000,
    "receipt_codes": ["DR-88192A-280K"]
  },
  "driver_signature_svg": "<svg>...</svg>",
  "end_timestamp": "2026-08-27T17:35:00Z"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "trip_id": "trp_991823",
    "trip_status": "COMPLETED",
    "total_boarded": 27,
    "total_cash_to_handover_vnd": 1240000,
    "financial_reconciliation_status": "PENDING_DEPOT_SETTLEMENT",
    "completed_at": "2026-08-27T17:35:00Z"
  }
}
```

---

## 5. Business Rules
- `BR-END-001` (Offline Outbox Synchronization): If local SQLite queue (`DRI-015`) contains unsynced events, the app displays warning: *"Đang có 2 sự kiện chưa đồng bộ. Hệ thống sẽ tự động đồng bộ khi kết nối lại."* and queues the end trip event locally.
- `BR-END-002` (GPS Lifecycle): Ending a trip immediately halts the Android Foreground GPS tracking notification and frees native location provider resources.
- `BR-END-003` (Cash & Debt Reconciliation - REV-04, REV-05): Total cash to handover is computed as:
  $$\text{Total Cash} = \text{COD Pre-booked Cash} + \text{Onboard Hail Cash}$$
  Any `REST_STOP_DEBT_RECEIPT` vouchers issued during the trip are listed in the end report for physical/financial clearance at the depot cashier office.

---

## 6. Analytics & Telemetry
- `END_TRIP_SCREEN_OPENED`: `{ trip_id: "trp_991823" }`
- `CASH_RECONCILIATION_CONFIRMED`: `{ total_cash: 1240000, cod_cash: 880000, hail_cash: 360000 }`
- `TRIP_COMPLETED_SUCCESS`: `{ trip_id: "trp_991823", odometer_diff: 165 }`

---

## 7. UI Copy & Localization
- **Header:** *"Tổng kết & Kết thúc chuyến đi"*
- **Total Cash Label:** *"TỔNG TIỀN NỘP VỀ BẾN:"*
- **COD Label:** *"Tiền vé COD:"*
- **Hail Label:** *"Khách vẫy dọc đường:"*
- **Debt Label:** *"Biên lai nợ tiền thừa phát hành:"*
- **Odometer Helper:** *"Nhập số công-tơ-mét hiện tại trên bảng đồng hồ"*
- **Submit CTA:** *"HOÀN TẤT & KẾT THÚC CHUYẾN ĐI"*

---

## 8. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Driver completes trip with COD and Hail cash
  Given driver has collected 880.000 đ COD and 360.000 đ Hail cash
  And issued 1 rest stop debt receipt for 280.000 đ
  When DRI-017 renders
  Then it displays total cash to deposit as 1.240.000 đ
  And lists the debt receipt code
  And submitting with signature transitions trip to COMPLETED.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-DRI-017-01` | Functional | Submit end trip report | Transitions trip status to `COMPLETED` and routes to `DRI-002` |
| `TC-DRI-017-02` | Financial | End trip with Hail & COD | Accurately calculates total cash to deposit and logs debt receipts |
