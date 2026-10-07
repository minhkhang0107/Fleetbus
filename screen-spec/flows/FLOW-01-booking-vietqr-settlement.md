# FLOW-01: Đặt vé, giữ chỗ và thanh toán VietQR

**Mã tài liệu:** `FLOW-01`
**Phiên bản:** 2.0 (viết lại ở Giai đoạn C theo server thật, xem `docs/review/phase-C-findings.md`)
**Màn hình:** [PAX-009](../passenger/PAX-009-seat-map.md), [PAX-010](../passenger/PAX-010-seat-hold.md), [PAX-012](../passenger/PAX-012-checkout.md), [PAX-013](../passenger/PAX-013-payment-processing.md), [PAX-014](../passenger/PAX-014-payment-result.md), [PAX-016](../passenger/PAX-016-my-tickets.md), [MGR-013](../manager/MGR-013-trip-seat-inventory.md), [MGR-017](../manager/MGR-017-booking-search.md), [DRI-007](../driver/DRI-007-manifest.md)

---

## 1. Mục tiêu

Hành khách chọn ghế, giữ chỗ 10 phút, tạo đơn, chuyển khoản VietQR. Khi ngân hàng báo tiền về, hệ thống phát hành vé và cả ba bên cùng thấy: ghế đã bán ở sơ đồ ghế của app và của điều hành, hành khách mới trên danh sách của tài xế, đơn mới và doanh thu trên bảng điều hành.

Server hiện chạy một tiến trình với dữ liệu trong bộ nhớ. Không có Redis, PostgreSQL, WebSocket hay MQTT: khóa ghế là bảng giữ chỗ có hạn trong bộ nhớ, các app đọc lại bằng REST (PAX-013 hỏi trạng thái mỗi 3 giây, PAX-018 mỗi 10 giây). Phần dùng hạ tầng thật là kiến trúc đích, không phải hiện trạng (`OQ-002`).

## 2. Các bước và API thật

| # | Bước | Màn hình | API | Bên khác thấy gì | Test |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 1 | Chọn ghế, giữ 10 phút (mỗi người một phiên giữ trên một chuyến, tối đa 5 ghế). Có thể chọn đoạn đi bằng `pickupStopId`, `dropoffStopId`; bỏ trống là cả tuyến, và ghế đã bán cho đoạn khác vẫn giữ được cho đoạn còn trống (`BR-SEAT-001`, `TC-SEG-01`) | PAX-009, PAX-010 | `POST /api/v1/trips/{tripId}/seats/hold` `{seatCodes, pickupStopId?, dropoffStopId?}` | Điều hành thấy ghế `HELD` kèm `held_until`; app khác thấy `LOCKED_BY_OTHER` | `TC-FLOW-C01`, `TC-SPEC-A31` |
| 2 | Tạo đơn: server tự tính giá, bắt buộc `holdId` còn sống của chính người đó | PAX-012 | `POST /api/v1/bookings/create` | Phiên giữ được kéo dài đến hết hạn thanh toán | `TC-SPEC-A13`, `A16` |
| 3 | Chuyển khoản với nội dung chứa PNR (`BG-xxxxxx`) | PAX-013 | (ngân hàng) | | |
| 4 | Ngân hàng báo tiền về | PAX-014 | `POST /api/v1/webhooks/vietqr/ipn` `{transferMemo, amountVnd, bankRef}` (chữ ký `X-Signature` khi có secret) | Vé phát hành; ghế `BOOKED` kèm PNR; tài xế có thêm hành khách; điều hành có đơn mới, số ghế tăng, thông báo `PAYMENT_SUCCESS` cho khách | `TC-FLOW-C01`, `TC-SYNC-01`, `TC-SPEC-A14` |
| 5 | Ngân hàng gửi lại cùng thông báo | | cùng API | Không đổi gì: không thêm vé, không đếm ghế hai lần, không thêm đơn | `TC-FLOW-C01` |
| 6 | Khách xem vé | PAX-016 | `GET /api/v1/passenger/tickets?tab=UPCOMING` | | `TC-FLOW-C04` |

Nút "Tôi đã chuyển tiền" (`POST /api/v1/passenger/payments/{orderId}/verify-status`) chỉ yêu cầu đối soát, không bao giờ tự phát hành vé (`BR-PAY-004`).

## 3. Sơ đồ

```mermaid
sequenceDiagram
    autonumber
    actor PAX as Hành khách (PAX)
    participant GW as API server
    participant INV as Kho ghế dùng chung
    actor BANK as Ngân hàng
    actor MGR as Điều hành (MGR-013)
    actor DRI as Tài xế (DRI-007)

    PAX->>GW: POST /trips/{id}/seats/hold {seatCodes}
    GW->>INV: giữ ghế 10 phút cho người này
    GW-->>PAX: 200 {hold_id, expires_at}
    MGR->>GW: GET /ops/trips/{id}/seat-matrix
    GW-->>MGR: ghế HELD kèm held_until
    PAX->>GW: POST /bookings/create {tripId, holdId, seatCodes, payer, passengers}
    GW->>GW: kiểm hold, tự tính giá, tạo đơn và PNR
    GW-->>PAX: 201 {order, payment: transfer_memo, qr}
    PAX->>BANK: quét VietQR, chuyển đúng số tiền
    BANK->>GW: POST /webhooks/vietqr/ipn {transferMemo, amountVnd, bankRef}
    GW->>GW: kiểm chữ ký, PNR, số tiền; phát hành vé
    GW->>INV: ghế thành BOOKED kèm PNR
    GW-->>DRI: hành khách vào manifest
    GW-->>MGR: đơn mới, số ghế, doanh thu
    GW-->>PAX: thông báo PAYMENT_SUCCESS; PAX-013 thấy trạng thái PAID khi hỏi lại
    BANK->>GW: gửi lại cùng thông báo
    GW-->>BANK: 200, không thay đổi gì
```

## 4. Ngoại lệ

| Tình huống | Hành vi thật | Hiển thị |
| :--- | :--- | :--- |
| Hết 10 phút chưa thanh toán | Phiên giữ tự hết hạn khi đọc hoặc khi có người mua; ghế trở lại `AVAILABLE` | PAX-010 báo hết giờ; MGR-013 không còn hiện ghế `HELD` (`TC-FLOW-C02`) |
| Chuyển sai số tiền (thiếu hoặc thừa) | `400 AMOUNT_MISMATCH`, không phát hành vé, cảnh báo `PAYMENT_AMOUNT_MISMATCH` cho quản lý (`OQ-018`). Bản cũ của flow ghi "thanh toán một phần" và "ghi có tiền thừa vào ví": **bỏ**, vì không có sổ thanh toán từng phần | Quản lý xử lý ở MGR-021/022 |
| Tiền đến sau khi đơn hết hạn | Đơn `UNMATCHED_OVERDUE`, mở yêu cầu hoàn tiền `UNMATCHED_OVERDUE` và cảnh báo cho quản lý (`OQ-008`) | MGR-022 |
| Webhook trễ hoặc mất | Khách bấm "Tôi đã chuyển tiền"; server chỉ ghi nhận yêu cầu đối soát, không tự xác nhận | PAX-013 tiếp tục hỏi trạng thái |
| Hai người giữ cùng ghế | Người sau nhận `409 SEAT_LOCKED_BY_OTHER` | Toast ở PAX-009 |
| Ghế bị điều hành khóa kỹ thuật | `409 SEAT_BLOCKED` (xem FLOW-05, `MGR-013`) | PAX-009 hiện `BLOCKED` |

## 5. Chưa làm

- Đẩy sự kiện thời gian thực (WebSocket): app phải hỏi lại (`OQ-002`).
- Giá theo chặng: mọi vé đồng giá của chuyến dù đi đoạn nào (`OQ-032`).
