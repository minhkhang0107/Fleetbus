# DRI-011 — Driver Mark Passenger No-Show Confirmation

**App:** Driver  
**Platform:** Android / iOS  
**Screen Type:** Modal / Confirmation Flow  
**Priority:** P1 (Operational Exception)  
**Route:** `/driver/trip/:id/no-show/:ticketId`  
**Version:** 1.0  
**Source Requirements:** `F-DRI-11`, `BR-MAN-001`, `UC-DRI-MAN-003`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 0`, `VISUAL_DENSITY: 6`

---

## 1. Purpose & User Story
- **Purpose:** Allow the driver to mark an absent passenger as `NO_SHOW` when they fail to board before vehicle departure, after attempting phone contact and waiting out the mandatory 10-minute grace period. Releases the seat for remaining downstream segments if applicable.
- **Actor:** Driver.
- **Outcome:** Passenger status transitions to `NO_SHOW`; seat released for downstream segments; incident logged in audit trail.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ ⚠️ XÁC NHẬN HÀNH KHÁCH VẮNG MẶT (NO-SHOW)          │
├───────────────────────────────────────────────────┤
│                                                   │
│  Ghế: A02 · Hành khách: Nguyễn Văn Nam            │
│  Điểm đón: Bến xe Giáp Bát (Giờ hẹn: 14:00)       │
│  Thời gian hiện tại: 14:15 (Đã quá giờ 15 phút)   │
│                                                   │
│ ┌─ MANDATORY VERIFICATION ─────────────────────┐  │
│ │ ☑️ Đã gọi điện cho khách (Gọi lúc 14:05 & 14:10)│
│ │ ☑️ Đã phát thanh gọi tên tại bến             │  │
│ │ ☑️ Đã chờ đủ thời gian quy định (10 phút)    │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ 📝 LÝ DO VẮNG MẶT                                 │
│ ┌─────────────────────────────────────────────┐   │
│ │ 🔘 Không liên lạc được / Tắt máy            │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ⚪ Khách báo hủy đột xuất không đi          │   │
│ ├─────────────────────────────────────────────┤   │
│ │ ⚪ Khách đến muộn sau khi xe đã xuất bến    │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
├───────────────────────────────────────────────────┤
│ [ ❌ XÁC NHẬN VẮNG MẶT (CTA - 64dp) ]             │
│ [ Quay lại tiếp tục chờ ]                         │
└───────────────────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- `BR-NOSHOW-001`: Driver cannot mark No-Show prior to scheduled departure time $+10\text{ minutes}$ unless passenger explicitly requested cancellation via phone.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/tickets/{ticketId}/no-show`
- **TC-DRI-011-01:** Verifies No-show updates ticket to `NO_SHOW` and logs call timestamp.
