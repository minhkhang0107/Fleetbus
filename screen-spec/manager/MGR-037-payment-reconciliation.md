# MGR-037 — Payment Settings, Bank Transfers and Manual Confirmation

**App:** Manager Operations Portal (`/manager` → "Thanh toán")  
**Platform:** Web (Desktop) + server  
**Priority:** P0 (money)  
**Version:** 1.0 (D163, 2026-10-27)  
**Roles:** FLEET_DIRECTOR edits settings; FINANCIAL_CONTROLLER reads settings; CASHIER, FINANCIAL_CONTROLLER, FLEET_DIRECTOR confirm payments; FLEET_DIRECTOR, FINANCIAL_CONTROLLER assign unmatched transfers

---

## 1. Purpose
Money always goes straight into the bus company's own bank account; the platform never holds it. The server must still know, per company, when a passenger has paid so the ticket is issued — automatically through a provider (SePay first), and by hand when no provider is set or a notification is missing.

## 2. Settings per company (MGR-038 API)
- **Payment methods** offered to passengers: `BANK_TRANSFER` (VietQR) and/or `CASH` (pay the driver). At least one. The passenger app hides what the company does not offer; checkout refuses it (422 `PAYMENT_METHOD_NOT_ALLOWED`).
- **Transfer detection** (`transfer_provider`): `MANUAL` (cashier confirms) or `SEPAY` (automatic). Providers are plug-ins (`source/server/core/payments/`): each declares its own credential fields and the web form is generated from them, so adding Casso / payOS / a bank API is one server file and no web change.
- **SePay credentials**: webhook authentication (`API_KEY` or `HMAC`), webhook secret, optional API token (enables reconciliation). Stored in the company's own encrypted database, never returned in clear (`••••` + last 4), never logged, never in the audit log.
- **Webhook URL** to paste into my.sepay.vn → Tích hợp WebHooks: `/api/v1/webhooks/sepay/{MÃ NHÀ XE}` (event: tiền vào).

## 3. How a transfer becomes a ticket (one engine for every source)
Every incoming transfer — SePay webhook, SePay reconciliation, the generic VietQR webhook, the cashier's confirmation — is normalized and goes through the same rules:
1. Outgoing transfer: ignored.
2. Same transaction seen again (provider id or bank reference): nothing changes (providers retry).
3. Credited account is not the company's: recorded `WRONG_ACCOUNT`, no order touched.
4. Matching: transfer memo, case and separators ignored, every `BG` + 6 digits candidate tried, only orders of this company. None: recorded `UNMATCHED`, office alerted, listed for assignment.
5. Order already paid: full refund request of this transfer (`DUPLICATE_TRANSFER`).
6. Amounts add up across transfers. Less than the fare: `PARTIAL`, order keeps waiting, office alerted with the amount still missing.
7. Paid in full: tickets issued. More than the fare: tickets issued and a refund request for the excess (`OVERPAID_EXCESS`).
8. After the payment window: tickets issued if the trip is still on sale and the seats are still free (`LATE_SETTLED`); otherwise all money received is refunded (`LATE_REFUND`).
9. An order expiring with part of the money: that money is refunded (`UNDERPAID_EXPIRED`). Refunded money no longer counts toward the order.
The webhook always answers 200 once the call is authentic (SePay: body `{"success": true}`), so providers do not resend; only a bad signature (401) or an unknown company (404) is refused.

## 4. Reconciliation (when a notification is late or lost)
- Passenger taps "Tôi đã chuyển tiền": if the company uses SePay with an API token, the server reads SePay's recent transactions first (at most once per 15 s per order), so a paid order turns PAID right away.
- Background sweep every 60 s (`FLEETBUS_RECONCILE_MS`, 0 = off) for companies with orders waiting, one company at a time (SePay allows 2 requests/s).

## 5. Office screen "Thanh toán"
- **Hình thức thanh toán** (director): methods, provider, generated credential form, webhook URL + guide, "Kiểm tra kết nối", last webhook time, reconciliation status.
- **Đơn chờ thanh toán**: online orders waiting / expired / overdue of the last 3 days with amount, received, missing; "Xác nhận đã nhận tiền" (amount + mandatory note, e.g. which statement line) goes through the same engine.
- **Giao dịch chưa khớp đơn**: unmatched transfers; enter the PNR and "Gán". "Xem tất cả" shows every transfer with its outcome.
Every confirmation, assignment and settings change is in "Nhật ký thao tác".

## 6. API
| Method | Path | Roles |
|---|---|---|
| GET | `/api/v1/ops/payment-settings` | FLEET_DIRECTOR, FINANCIAL_CONTROLLER |
| PUT | `/api/v1/ops/payment-settings` | FLEET_DIRECTOR |
| POST | `/api/v1/ops/payment-settings/test` | FLEET_DIRECTOR |
| GET | `/api/v1/ops/pending-payments` | FLEET_DIRECTOR, CASHIER, FINANCIAL_CONTROLLER |
| POST | `/api/v1/ops/orders/{orderId}/confirm-payment` | FLEET_DIRECTOR, CASHIER, FINANCIAL_CONTROLLER (idempotent) |
| GET | `/api/v1/ops/bank-transactions?outcome=UNMATCHED\|ALL` | FLEET_DIRECTOR, CASHIER, FINANCIAL_CONTROLLER |
| POST | `/api/v1/ops/bank-transactions/{txId}/assign` | FLEET_DIRECTOR, FINANCIAL_CONTROLLER (idempotent) |
| POST | `/api/v1/webhooks/sepay/{operatorCode}` | public, SePay API key or HMAC (`X-SePay-Signature`, `X-SePay-Timestamp`, 300 s window) |

## 7. Tests
`test/server/bank_settlement.test.js`, `test/server/sepay.test.js`, `test/mobile/manager_web.test.js`, passenger `operator_test.dart`.
