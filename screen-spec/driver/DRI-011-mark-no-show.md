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
- `BR-NOSHOW-002` (State and timing enforced by the server - review FND-A43): The grace period is 10 minutes after the scheduled departure (`400 NO_SHOW_TOO_EARLY` before it). `passenger_requested_cancel: true` waives it. Only a passenger who is still waiting can be marked: a passenger already `BOARDED`, `NO_SHOW` or `CANCELLED` gives `400 INVALID_PASSENGER_STATE`; a ticket not on the manifest gives `404 TICKET_NOT_FOUND`. Releasing the seat for the remaining segments needs a segment model and is not part of this phase (`OQ-028`).
- `BR-NOSHOW-001`: Driver cannot mark No-Show prior to scheduled departure time $+10\text{ minutes}$ unless passenger explicitly requested cancellation via phone.
- `BR-NOSHOW-003` (Everyone sees the absence - Phase C review FND-C09): A recorded no-show sets the passenger ticket to `NO_SHOW` (history tab of `PAX-016`, status pill on `PAX-017`), counts in `no_show_passengers` of the trip for the manager, and sends the passenger a `NO_SHOW` notification. The seat is released in the shared inventory from the stop the bus has reached (`current_stop_index` of `DRI-008`) to the end of the passenger's segment, so it can be sold or hailed for the rest of the trip (`OQ-028`); the part already driven stays booked. No refund is made.
- **API Endpoint:** `POST /api/v1/driver/trips/{tripId}/tickets/{ticketId}/no-show`
- **TC-DRI-011-01:** Verifies No-show updates ticket to `NO_SHOW` and logs call timestamp.

## Design review 2 (D105): grace period at the passenger's own stop

- `BR-NOSHOW-004`: a passenger can be marked absent only when the bus is at their pickup stop and has waited there 10 minutes: for the first stop, the trip has started and 10 minutes have passed since the planned departure; for a later stop, the driver has recorded the arrival there (`POST .../stops/{stopId}/arrive`) and 10 minutes have passed since that arrival. Otherwise `400 BUS_NOT_AT_STOP` or `400 NO_SHOW_TOO_EARLY`. The earlier rule counted from the trip departure, so a passenger waiting at Ninh Bình could lose the ticket while the bus was still in Hà Nội.
- The UI shows the "Vắng mặt" button disabled with the time it opens ("Vắng · 14:35").
- Test: `TC-NOSHOW-01`, `TC-NOSHOW-02`.
