# MGR-006 — Manager Vehicle Create & Edit

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Form Modal / Drawer  
**Priority:** P1 (Fleet Management)  
**Route:** `/ops/vehicles/new` & `/ops/vehicles/:id/edit`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-06`, `BR-FLEET-001`, `UC-MGR-FLEET-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Register new physical vehicles into the system, bind license plate numbers, select vehicle manufacturer/model, associate default Seat Layout Template (`MGR-007`), set default depot base, and input periodic inspection/registration expiry dates.
- **Actor:** Fleet Admin.
- **Outcome:** Vehicle saved and made available for daily dispatch planning (`MGR-014`).

---

## 2. Business Rules & API Contract
- `BR-VEH-001`: License plate format must follow Vietnamese transport regulation (e.g. `29B-123.45`, `51B-999.88`).
- **API Endpoint:** `POST /api/v1/ops/vehicles` (Create) & `PUT /api/v1/ops/vehicles/{id}` (Update)
- **TC-MGR-006-01:** Verifies plate uniqueness check prevents duplicate vehicle registration.
