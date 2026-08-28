# MGR-019 — Manager Counter POS & Hotline Trip Search

**App:** Manager Operations Portal  
**Platform:** Web (Desktop / POS Terminal)  
**Screen Type:** Fast Counter Flow  
**Priority:** P0 (Sales & Revenue)  
**Route:** `/ops/pos`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-19`, `BR-POS-001`, `UC-MGR-POS-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide an ultra-fast keyboard-first ticket selling screen for bus station ticket counter clerks and hotline operators. Clerks can search routes by shorthand codes (e.g. `HN-TH`), pick departure time slots, see live seat availability, and advance to instant seat selection and checkout in $<10\text{ seconds}$.
- **Actor:** Station Ticket Clerk / Hotline Call Center Agent.
- **Outcome:** Trip selected; advances to `MGR-020-pos-seat-map-checkout.md`.

---

## 2. API Contract & Shortcuts
- **Endpoint:** `GET /api/v1/ops/pos/trips?origin=stp_hn_gb&dest=stp_th_pb&date=2026-08-27`
- **Keyboard Shortcuts:** `F2` -> Focus Route Search; `Enter` -> Select 1st trip; `Space` -> Open Seat Map.
- **TC-MGR-019-01:** Verifies clerk can execute search without touching the mouse.
