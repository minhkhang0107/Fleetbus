# MGR-017 — Manager Global Booking & PNR Directory

**App:** Manager Operations Portal  
**Platform:** Web (Desktop)  
**Screen Type:** Full Screen Data Table  
**Priority:** P0 (Core Operations / Sales)  
**Route:** `/ops/bookings`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-17`, `BR-BOOK-001`, `UC-MGR-BOOK-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide a high-speed search and filtering engine across all passenger bookings: query by PNR, customer phone number, passenger name, trip ID, departure date, channel (Online vs POS vs Hotline), and payment status (`PAID`, `PENDING_COD`, `CANCELLED`, `REFUNDED`).
- **Actor:** Customer Service Staff / Accountant / Dispatcher.
- **Outcome:** Booking located; 1-click entry into `MGR-018-booking-detail.md`.

---

## 2. API Contract & Data Schema
- **Endpoint:** `GET /api/v1/ops/bookings`
- **Query Params:** `query=BG-88219&status=CONFIRMED&date=2026-08-27&page=1&limit=25`
- **TC-MGR-017-01:** Verifies typing 6-digit PNR instantly returns exact matching booking record.
