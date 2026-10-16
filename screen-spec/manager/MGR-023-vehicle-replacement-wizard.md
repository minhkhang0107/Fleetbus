# MGR-023 — Manager Emergency Vehicle Replacement Wizard

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Multi-Step Emergency Wizard  
**Priority:** P0 (Mission-Critical / Incident Recovery)  
**Route:** `/ops/trip/:id/replace-vehicle`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-23`, `BR-REP-001`, `UC-MGR-REP-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Execute emergency bus swaps when a vehicle suffers a breakdown or major delay before or during a trip. The wizard guides the dispatcher through 3 structured steps:
  1. Select replacement vehicle from available depot fleet.
  2. Algorithmic seat remapping (1-to-1 seat code match + manual drag-and-drop conflict resolution if replacement bus has smaller capacity or different layout).
  3. Commit transaction, generate new vehicle snapshot, update driver cockpit manifest (`DRI-006`), and broadcast replacement notice push notifications (`PAX-024`) to all booked passengers.
- **Actor:** Duty Dispatcher / Operations Director.
- **Outcome:** Vehicle swapped seamlessly; passenger seats remapped; alerts broadcasted in $<60\text{ seconds}$.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Điều động xe thay thế khẩn cấp (Trip: Hà Nội ➔ Thanh Hóa 14:00)         │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─ STEP INDICATOR ────────────────────────────────────────────────────────┐ │
│ │ [ 🟢 1. CHỌN XE THAY THẾ ] ──► [ 🟢 2. ÁNH XẠ GHẾ & XỬ LÝ XUNG ĐỘT ] ──► [ 3. XÁC NHẬN ]│
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ STEP 2: MA TRẬN ÁNH XẠ GHẾ (SEAT REMAPPING) ───────────────────────────┐ │
│ │ XE CŨ: 29B-123.45 (Limo 34)       │ XE MỚI: 29B-999.88 (Limo 34 VIP)    │ │
│ │ • Ghế A01 (Nguyễn Văn Nam)        │ 🟢 ➔ Tự động gán: Ghế A01 (Khớp 100%)│ │
│ │ • Ghế A02 (Trần Văn Hùng)         │ 🟢 ➔ Tự động gán: Ghế A02 (Khớp 100%)│ │
│ │ • Ghế B04 (Lê Thị Mai)            │ 🟡 ➔ Xung đột vị trí: Gán sang B02   │ │
│ │                                   │                                      │
│ │ [ ⚡ TỰ ĐỘNG ÁNH XẠ TỐI ƯU ]      │ [ ✋ Kéo thả điều chỉnh thủ công ]   │ │
│ └───────────────────────────────────┴──────────────────────────────────────┘ │
│                                                                             │
│ 📢 TỰ ĐỘNG THÔNG BÁO CHO 28 HÀNH KHÁCH:                                     │
│ ☑️ Gửi thông báo Push Notification tới ứng dụng Hành khách                   │
│ ☑️ Gửi tin nhắn SMS cập nhật biển số xe mới (29B-999.88)                    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ [ 🚀 HOÀN TẤT ĐỔI XE & PHÁT THÔNG BÁO (CTA) ]   [ Hủy bỏ ]                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-REPLACE-002` (Validated replacement - review FND-A47): The replacement must be an existing vehicle of the fleet (`404 VEHICLE_NOT_FOUND`) with status `STANDBY` (`409 VEHICLE_UNAVAILABLE`) and with at least as many seats as are booked (`409 CAPACITY_INSUFFICIENT`, carrying the overflow so the dispatcher can resolve it first, see `BR-REPLACE-001`). A replacement driver, when given, must exist (`404 DRIVER_NOT_FOUND`). The checks run before any change; on success the old vehicle becomes `MAINTENANCE`, the new vehicle becomes `IN_TRANSIT` (or `ASSIGNED` for a trip not yet running), passengers keep their seat codes and are notified. The system never invents a vehicle for an unknown plate.
- `BR-REPLACE-001`: If the replacement bus has lower capacity than total booked passengers (e.g. 40-seat replaced by 34-seat), the system forces the dispatcher to resolve the overflow passengers (by offering priority transfers to next trip or 100% refund $+ 50\text{k VND}$ voucher) before committing the swap.
- `BR-REPLACE-003` (Replacement driver - Phase C review FND-C08): A replacement driver must be in the staff directory with status `ON_DUTY` and a licence that has not expired (`409 DRIVER_UNAVAILABLE`, nothing changes); an unknown id gives `404 DRIVER_NOT_FOUND`. The directory uses the same ids as the driver app (`DRI-001`). On success the trip moves to the new vehicle and driver in the driver app too: the new driver sees it under `DRI-002`, the replaced driver no longer does and gets `403` on it, and the passengers get the notice of `PAX-024` and a `SWAP` notification.
- **API Endpoint:** `POST /api/v1/ops/trips/{tripId}/replace-vehicle`
- **Request Body:**
```json
{
  "new_vehicle_id": "veh_29b_99988",
  "reason": "MECHANICAL_BREAKDOWN",
  "seat_mappings": [
    { "old_seat": "A01", "new_seat": "A01", "ticket_id": "tkt_88192a" },
    { "old_seat": "B04", "new_seat": "B02", "ticket_id": "tkt_88192b" }
  ],
  "notify_passengers": true
}
```
- **TC-MGR-023-01:** Verifies completing replacement wizard updates trip vehicle plate, adjusts manifest, and broadcasts `VEHICLE_REPLACED` to all connected clients.
