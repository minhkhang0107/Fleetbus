# MGR-018 — Manager Booking Master Ledger & Audit Trail

**App:** Manager Operations Portal  
**Platform:** Web (Desktop Baseline $\ge 1440\text{px}$)  
**Screen Type:** Full Screen Audit & Transaction Ledger  
**Priority:** P0 (Core Customer Support / Financial)  
**Route:** `/ops/booking/:id`  
**Version:** 1.0  
**Source Requirements:** `F-MGR-18`, `BR-BOOK-001`, `BR-PAY-001`, `UC-MGR-BOOK-002`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 8`

---

## 1. Purpose & User Story
- **Purpose:** Provide an exhaustive financial, operational, and audit record for a booking: view PNR, buyer contact, individual ticket codes and boarding states, payment gateway transaction IDs, webhook receipts, voucher usage, change history, and trigger customer support actions (Resend SMS/Email, Reseat Passenger, Issue Refund via `MGR-022`, Cancel Booking).
- **Actor:** Customer Service Lead / Finance Auditor.
- **Outcome:** Customer issues resolved; full compliance audit trail preserved.

---

## 2. Wireframe-level Screen Structure & Visual Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [←] Chi tiết đơn đặt vé: BG-88219 (ID: bkg_77192a)       [🟢 ĐÃ XÁC NHẬN - PAID]│
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 👤 THÔNG TIN KHÁCH HÀNG              │ 🎫 DANH SÁCH VÉ & TRẠNG THÁI         │
│ • Người đặt: Nguyễn Văn Nam          │ • Vé 1: tkt_88192a · Ghế A02 (Tầng 1)│
│ • Số điện thoại: 0987 654 321        │   Khách: Nguyễn Văn Nam              │
│ • Email: nam.nguyen@example.com      │   Trạng thái: 🟢 ĐÃ LÊN XE (14:32)   │
│ • Kênh đặt: App iOS (Khách vãng lai) │   [ 🎫 In lại vé ]  [ 🔄 Đổi ghế ]   │
│                                      │                                      │
│ 💳 GIAO DỊCH THANH TOÁN (VNPAY)      │ 📜 NHẬT KÝ KIỂM TOÁN (AUDIT TRAIL)   │
│ • Số tiền: 176.000 đ                 │ • 14:00:22 - Tạo giữ chỗ Redis (hld) │
│ • Mã GD Cổng: VNPAY_14882199         │ • 14:02:15 - Tạo đơn hàng (Checkout) │
│ • Mã chuẩn chi: 998822               │ • 14:03:40 - Webhook VNPAY thành công│
│ • Thời gian TT: 27/08/2026 14:03:40  │ • 14:32:05 - Tài xế quét QR lên xe   │
│                                      │                                      │
│ [ 📲 Gửi lại SMS/Zalo vé ]  [ 🖨️ In hóa đơn VAT ]  [ ❌ Hủy vé & Hoàn tiền ]│
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. Business Rules & API Contract
- **Endpoint:** `GET /api/v1/ops/bookings/{bookingId}`
- **Action Endpoint:** `POST /api/v1/ops/bookings/{bookingId}/resend-confirmation`
- **TC-MGR-018-01:** Verifies audit trail displays chronological event log with operator actor stamps.
