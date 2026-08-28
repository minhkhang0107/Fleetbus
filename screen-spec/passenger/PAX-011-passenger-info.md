# PAX-011 — Passenger Contact & Traveler Information

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen / Form Flow  
**Priority:** P0 (Core Journey)  
**Route:** `/checkout/passenger-info`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-11`, `BR-BOOK-001`, `UC-PAS-BOOK-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Collect verified contact information for booking confirmations and digital ticket delivery (SMS/Email), as well as individual passenger details for each reserved seat (including support for booking on behalf of elderly relatives or children).
- **Actor:** Passenger.
- **Entry Condition:** Proceeded from `PAX-010-seat-hold.md` with active hold token.
- **Outcome:** Validated passenger and contact data saved; proceeds to `PAX-012-checkout.md`.

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-BOOK-001` (Mandatory contact phone and full name per ticket), `UC-PAS-BOOK-001`.
- **Business Invariant:** Primary contact phone MUST be a valid Vietnamese mobile number to receive ticket SMS and driver pickup calls.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-009 Seat Map] / [PAX-010 Seat Hold]
Previous Screen: [PAX-010 Seat Hold]
Next Screen: [PAX-012 Checkout]
Entry Points: Seat Hold Success
Exit Points:
  ├── Tap Back -> Returns to PAX-009 (Hold remains active in background)
  └── Tap "Tiếp tục thanh toán" -> Advances to PAX-012 Checkout
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌───────────────────────────────────────────────────┐
│ [←] Thông tin hành khách                 [⏳ 09:12]│
├───────────────────────────────────────────────────┤
│ 👤 THÔNG TIN NGƯỜI ĐẶT (Nhận vé & Thông báo)       │
│                                                   │
│ [ ⭐ Chọn từ danh bạ đã lưu ]                     │
│                                                   │
│ Họ và tên người đặt *                             │
│ ┌─────────────────────────────────────────────┐   │
│ │ Nguyễn Văn Nam                              │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ Số điện thoại nhận vé *                           │
│ ┌─────────────────────────────────────────────┐   │
│ │ 0987 654 321                                │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ Email nhận hóa đơn VAT & Vé điện tử (Tùy chọn)    │
│ ┌─────────────────────────────────────────────┐   │
│ │ nam.nguyen@example.com                      │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ 💺 DANH SÁCH HÀNH KHÁCH THEO GHẾ                  │
│                                                   │
│ ┌─ GHẾ A02 (Tầng 1) ──────────────────────────┐   │
│ │ ☑️ Sử dụng thông tin người đặt               │   │
│ │ Hành khách: Nguyễn Văn Nam (0987654321)     │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ 📝 GHI CHÚ CHO NHÀ XE (Tùy chọn)                  │
│ ┌─────────────────────────────────────────────┐   │
│ │ Ví dụ: Có trẻ em đi kèm, người già say xe...│   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
├───────────────────────────────────────────────────┤
│ 1 vé · Ghế: A02 · 220.000 đ                       │
│ [ TIẾP TỤC THANH TOÁN (CTA) ]                     │
└───────────────────────────────────────────────────┘
```

---

## 5. Form Specification

| Field Name | Type | Required | Validation Regex | Placeholder | Keyboard | Masking |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `contact_name` | Text | Yes | `^[\p{L}\s]{2,50}$` | `Nguyễn Văn A` | Text | Trim whitespace |
| `contact_phone` | Phone | Yes | `^(0[3\|5\|7\|8\|9])[0-9]{8}$` | `0912 345 678` | Phone | Space separated |
| `contact_email` | Email | No | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | `name@email.com` | Email | Lowercase |
| `note` | Text | No | Max 200 chars | `Ghi chú đón xe...`| Text | None |

---

## 6. Business Rules
- `BR-INFO-001`: If user is logged in, autofill `contact_name`, `contact_phone`, and `contact_email` from user profile (`PAX-022`).
- `BR-INFO-002`: Checkbox "Sử dụng thông tin người đặt cho tất cả ghế" copies primary contact to all seat assignments by default.
- `BR-INFO-003`: If booking for multiple seats, individual names can be provided for identity verification on boarding.

---

## 7. Analytics & Telemetry
- `PASSENGER_INFO_VIEWED`: `{ hold_token: "hld_99218ab4c", seats_count: 1 }`
- `AUTOFILL_USED`: `{ source: "profile" | "saved_contacts" }`
- `PASSENGER_INFO_SUBMITTED`: `{ has_email: true, has_note: false }`

---

## 8. UI Copy & Localization
- **Header:** *"Thông tin hành khách"*
- **Contact Section:** *"Thông tin liên hệ (Nhận vé SMS & Zalo)"*
- **Seat Section:** *"Danh sách người đi theo ghế"*
- **Autofill CTA:** *"Chọn từ danh bạ đã lưu"*
- **CTA:** *"TIẾP TỤC THANH TOÁN"*
- **Validation Error Name:** *"Họ và tên phải từ 2 đến 50 ký tự."*
- **Validation Error Phone:** *"Vui lòng nhập số điện thoại 10 chữ số hợp lệ."*

---

## 9. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Autofill from logged-in account
  Given the passenger is logged in as "Nguyễn Văn Nam" (0987654321)
  When PAX-011 loads
  Then the Contact Name and Phone fields are prefilled
  And the "Tiếp tục thanh toán" button is immediately enabled.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-011-01` | Form Validation | Enter invalid phone "0123" | Shows error, disables CTA |
| `TC-PAX-011-02` | Functional | Select saved contact | Replaces fields with selected person |
