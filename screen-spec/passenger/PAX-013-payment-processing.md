# PAX-013 — Passenger Payment Processing & Gateway Webview

**App:** Passenger  
**Platform:** iOS / Android (Flutter)  
**Screen Type:** Full Screen Webview / Native VietQR Display  
**Priority:** P0 (Core Journey / Financial)  
**Route:** `/payment/:paymentId`  
**Version:** 1.0  
**Source Requirements:** `F-PAS-13`, `BR-PAY-001`, `BR-PAY-002`, `UC-PAS-PAY-001`  
**Taste-Skill Config:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 5`, `VISUAL_DENSITY: 3`

---

## 1. Purpose & User Story
- **Purpose:** Securely execute online payment transaction via Payment Gateway Webview (VNPAY / MoMo App-to-App SDK) or dynamic Bank Transfer VietQR with real-time payment webhook listening.
- **Actor:** Passenger.
- **Entry Condition:** Booking created in `PAX-012-checkout.md`.
- **Outcome:** Payment processed; user routed to `PAX-014-payment-result.md` (or directly to `PAX-015-booking-success.md` on instant webhook callback).

---

## 2. Business Context & Invariants
- **Requirements Trace:** `BR-PAY-001` (Payment Initiation), `BR-PAY-002` (Idempotent Webhooks), `UC-PAS-PAY-001`.
- **CRITICAL INVARIANT:** Client MUST NEVER assume payment is completed based on webview redirect URL alone. The server-side webhook / verification query to the payment provider is the sole authoritative confirmation of fund settlement.

---

## 3. Information Architecture & Navigation
```text
Parent Screen: [PAX-012 Checkout]
Previous Screen: [PAX-012 Checkout]
Next Screen: [PAX-014 Payment Result] ──► [PAX-015 Booking Success]
Exit Points:
  ├── Tap Cancel Payment -> Confirmation dialog -> Return to PAX-012 (Payment marked CANCELLED)
  └── Payment Webhook Emitted -> Auto-navigates to PAX-014 / PAX-015
```

---

## 4. Wireframe-level Screen Structure & Visual Hierarchy

### 4.1. VietQR Mode Wireframe
```text
┌───────────────────────────────────────────────────┐
│ [←] Thanh toán chuyển khoản             [⏳ 07:45]│
├───────────────────────────────────────────────────┤
│  Mã đơn hàng: BG-88219 · Số tiền: 176.000 đ       │
│                                                   │
│  ┌─ DYNAMIC VIETQR CONTAINER ──────────────────┐  │
│  │                                             │  │
│  │          [ VIETQR CODE IMAGE ]              │  │
│  │             (High Contrast)                 │  │
│  │                                             │  │
│  │  Ngân hàng: MBBank (Quân Đội)               │  │
│  │  Số TK:     9988221100   [ Sao chép ]       │  │
│  │  Chủ TK:    CONG TY CP CONG NGHE BUSGO      │  │
│  │  Nội dung:  BG88219      [ Sao chép ]       │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  (i) Vui lòng giữ nguyên nội dung chuyển khoản    │
│  Hệ thống sẽ tự động xác nhận sau 5 - 15 giây.    │
│                                                   │
│  [ Mở ứng dụng Ngân hàng (App-to-App) ]          │
│                                                   │
├───────────────────────────────────────────────────┤
│ [🔄 Tôi đã chuyển tiền ]   [ Hủy thanh toán ]     │
└───────────────────────────────────────────────────┘
```

---

## 5. Component-by-Component Spec

| Component | Type | Required | Data Source | State | Interaction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GatewayWebview` | In-App Webview | Conditional | VNPAY/MoMo URL | Loading / Rendered | Intercepts success/cancel deep links |
| `VietQRContainer` | Card | Conditional | VietQR API | Normal | High-contrast QR with 1-tap copy buttons |
| `CopyButton` | IconButton | Yes | Clipboard API | Normal / Copied | Copies account number / PNR transfer memo |
| `BankingDeepLinkCTA`| Button | Conditional | App Scheme | Enabled | Launches installed mobile banking app |
| `PaymentCountdown` | Sticky Timer | Yes | Server TTL | Running | Syncs with payment window |

---

## 6. API Contract

### 6.1. Initiate Payment Transaction
- **Endpoint:** `POST /api/v1/payments/initiate`
- **Auth:** Optional Bearer
- **Headers:** `Content-Type: application/json`, `Idempotency-Key: uuid`
- **Request Body:**
```json
{
  "booking_id": "bkg_77192a83",
  "payment_method": "VIETQR",
  "return_url": "busgo://payment/callback"
}
```
- **Response `200 OK`:**
```json
{
  "status": "success",
  "data": {
    "payment_id": "pay_99218a",
    "payment_method": "VIETQR",
    "amount_vnd": 176000,
    "qr_url": "https://img.vietqr.io/image/MB-9988221100-compact2.png?amount=176000&addInfo=BG88219",
    "account_number": "9988221100",
    "bank_code": "MB",
    "bank_name": "Ngân hàng TMCP Quân Đội (MBBank)",
    "transfer_memo": "BG88219",
    "expires_at": "2026-08-27T14:10:00Z"
  }
}
```

---

## 7. Business Rules
- `BR-PAY-001` (Payment Initiation & Idempotency): Payment transaction must include a valid idempotency key and match booking total amount exactly. Client listens to WebSocket event `PAYMENT_COMPLETED` on room `booking:{bookingId}`.
- `BR-PAY-002` (Idempotent Webhooks & Instant Navigation): System accepts IPN webhook callbacks idempotently without re-issuing tickets. When the WebSocket event fires, client immediately navigates to `PAX-014-payment-result.md` or `PAX-015-booking-success.md`.
- `BR-PAY-003` (App Lifecycle & Active Fallback Polling - REV-02): When the app returns to the foreground (resumes from banking app or multitasking), the client immediately queries `POST /api/v1/passenger/payments/:orderId/verify-status` and initiates a 3-second fallback polling loop to guarantee prompt payment resolution even if WebSocket disconnected during app switching.
- `BR-PAY-004` (Manual Payment Confirmation Trigger - REV-02): Passenger tapping "Tôi đã chuyển tiền" triggers an immediate server-side bank reconciliation query, displaying a transient spinner without blocking the UI.
- `BR-PAY-005` (Cancellation Confirmation): Tapping "Hủy thanh toán" displays confirmation dialog: *"Bạn có chắc chắn muốn hủy giao dịch thanh toán này?"* while preserving seat hold for remaining TTL.

---

## 8. Analytics & Telemetry
- `PAYMENT_GATEWAY_OPENED`: `{ payment_id: "pay_99218a", method: "VIETQR", amount: 176000 }`
- `ACCOUNT_NUMBER_COPIED`: `{ account: "9988221100" }`
- `BANKING_APP_OPENED`: `{ bank_code: "MB" }`
- `PAYMENT_WEBHOOK_RECEIVED`: `{ status: "SUCCESS", latency_ms: 6200 }`
- `MANUAL_PAYMENT_VERIFY_TRIGGERED`: `{ order_id: "ord_88219a", trigger: "USER_CLICK" }`

---

## 9. UI Copy & Localization
- **Title:** *"Thanh toán đơn hàng"*
- **Transfer Memo Label:** *"Nội dung chuyển khoản (Bắt buộc)"*
- **Copy Feedback:** *"Đã sao chép vào bộ nhớ tạm"*
- **Banking App CTA:** *"Mở ứng dụng Ngân hàng"*
- **Check Status CTA:** *"Tôi đã chuyển tiền"*
- **Cancel Dialog Body:** *"Nếu hủy, ghế của bạn vẫn sẽ được giữ trong thời gian đếm ngược còn lại."*

---

## 10. Acceptance Criteria & Test Matrix

### Acceptance Criteria:
```gherkin
Scenario: Realtime VietQR payment confirmation
  Given the passenger is viewing the VietQR code on PAX-013
  When the backend receives the bank webhook and broadcasts PAYMENT_COMPLETED
  Then the app instantly displays a green checkmark animation
  And navigates to PAX-015 Booking Success.
```

### Test Matrix:
| Test ID | Type | Condition | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-PAX-013-01` | Functional | Tap copy account button | Copies to clipboard, shows toast |
| `TC-PAX-013-02` | Realtime | Receive `PAYMENT_COMPLETED` WS | Auto-navigates to Booking Success |
| `TC-PAX-013-03` | Lifecycle | App resumes from background | Executes active status poll within 3s |
