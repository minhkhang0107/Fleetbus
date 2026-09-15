# FLOW-03: Thu Tiền COD & Biên Lai Nợ Tiền Thừa Tại Trạm Dừng (COD Collection & Debt Settlement)

**Mã tài liệu:** `FLOW-03`  
**Phiên bản:** 1.0  
**Liên kết màn hình:** [DRI-012](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-012-fare-collection-cod.md), [DRI-017](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/driver/DRI-017-cash-reconciliation-shift-end.md), [PAX-012](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-012-payment-methods.md), [PAX-015](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/passenger/PAX-015-ticket-detail-qr.md), [MGR-017](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-017-booking-management.md), [MGR-028](file:///home/david/Downloads/scripts/AI_tools/tools/FleetBus/screen-spec/manager/MGR-028-audit-logs.md)

---

## 1. Mục Tiêu & Mô Tả Nghiệp Vụ

Trong vận tải liên tỉnh tại Việt Nam, một tỷ lệ lớn hành khách vẫn chọn hình thức thanh toán tiền mặt khi lên xe (COD - Cash on Delivery) hoặc đón xe dọc đường. 
Thực tế nảy sinh hai vấn đề nan giải:
1. **Tài xế / phụ xe không có đủ tiền lẻ trả lại**: Ví dụ vé 220.000đ, khách đưa tờ 500.000đ nhưng đầu ca tài xế chưa có đủ 280.000đ tiền lẻ.
2. **Nguy cơ thất thoát tiền mặt**: Thu tiền mặt dễ dẫn đến gian lận nếu không có sự đối soát khép kín giữa số tiền thực thu, tiền nợ và tiền nộp về thủ quỹ.

Hệ thống giải quyết triệt để vấn đề này qua tính năng **Biên Lai Nợ Tiền Thừa (Debt Receipt / Change Voucher)**:
- Tài xế ghi nhận số tiền khách đưa và số tiền còn nợ trên màn hình `DRI-012`.
- Hệ thống phát sinh một mã QR Biên lai nợ tiền thừa đẩy thẳng vào ứng dụng của hành khách (hoặc in/gửi SMS).
- Khi xe ghé trạm dừng chân hoặc bến cuối, khách mang mã này đến quầy thủ quỹ trạm dừng để nhận lại tiền mặt, hoặc chọn nhận chuyển khoản qua VietQR.
- Cuối ca chạy, tài xế thực hiện chốt sổ tiền mặt trên `DRI-017`, đối chiếu số tiền thực tế với số tiền hệ thống tính toán trước khi bàn giao cho quản lý.

---

## 2. Sơ Đồ Trình Tự Tương Tác (Mermaid Sequence Diagram)

> [!TIP]
> **Tùy chọn tải & xem bản vẽ UML:** [Xem ảnh Vector SVG](./images/FLOW-03-cod-cash-debt-settlement.svg) | [Xem ảnh PNG HD](./images/FLOW-03-cod-cash-debt-settlement.png)

![UML Sequence Diagram FLOW-03](./images/FLOW-03-cod-cash-debt-settlement.svg)

```mermaid
sequenceDiagram
    autonumber
    actor PAX as 📱 Hành Khách
    actor DRI as 🚍 Phụ Xe / Tài Xế (Tablet)
    participant GW as ⚙️ API Gateway
    participant DB as 🗄️ PostgreSQL Database
    actor POS as 🏪 Quầy Thu Ngân Trạm Nghỉ
    actor MGR as 🖥️ Điều Hành / Thủ Quỹ (Manager Portal)

    %% Giai đoạn 1: Thu tiền & Phát sinh biên lai nợ
    Note over PAX,DRI: 1. Thu tiền COD & Khách đưa tiền mệnh giá lớn (DRI-012)
    PAX->>DRI: Lên xe, đưa 500.000đ tiền mặt (Giá vé: 220.000đ)
    DRI->>DRI: Tài xế kiểm tra túi tiền: Thiếu 280.000đ tiền thối
    DRI->>DRI: Trên DRI-012 nhập: Số tiền nhận: 500.000đ -> Chọn [Ghi Nợ Tiền Thừa: 280.000đ]
    DRI->>GW: POST /api/v1/driver/trips/TRIP101/tickets/TK101/collect-cod<br/>{receivedAmount: 500000, fare: 220000, debtAmount: 280000}
    activate GW
    GW->>DB: UPDATE bookings SET payment_status='COLLECTED_CASH_WITH_DEBT'
    GW->>DB: INSERT INTO debt_receipts (receiptId: "DEBT-88", amount: 280000, status: 'PENDING')
    GW-->>DRI: 200 OK {receiptId: "DEBT-88", qrPayload: "BUSGO_DEBT:88:280K"}
    deactivate GW
    DRI->>PAX: Xác nhận trên App hành khách hoặc gửi tin nhắn biên lai nợ kèm QR DEBT-88

    %% Giai đoạn 2: Khách lấy lại tiền thừa tại Trạm dừng chân
    Note over PAX,POS: 2. Xe dừng nghỉ 30 phút - Khách đến Quầy nhận tiền thừa
    PAX->>POS: Xuất trình mã QR DEBT-88 tại Quầy Thu Ngân Trạm Dừng
    POS->>GW: POST /api/v1/ops/debt-receipts/DEBT-88/redeem<br/>{cashierId: "CSH-HN01", stationId: "REST-STATION-PHUTHO"}
    activate GW
    GW->>DB: UPDATE debt_receipts SET status='REDEEMED', redeemed_at=NOW()
    GW-->>POS: 200 OK {valid: true, amount: 280000, passengerName: "Nguyễn Văn A"}
    deactivate GW
    POS->>PAX: Xuất quỹ trả 280.000đ tiền mặt cho hành khách (hoặc bấm bắn VietQR vào STK khách)
    POS-->>PAX: Trả tiền thành công, trạng thái biên lai nợ chuyển thành ĐÃ HOÀN TẤT

    %% Giai đoạn 3: Chốt sổ cuối ca chạy
    Note over DRI,MGR: 3. Chốt sổ bàn giao tiền mặt cuối chuyến (DRI-017)
    DRI->>DRI: Xe về bến cuối, mở màn hình DRI-017 (Quyết toán tiền mặt)
    DRI->>GW: GET /api/v1/driver/trips/TRIP101/cash-summary
    activate GW
    GW-->>DRI: 200 OK {expectedCash: 3500000, codTicketsCount: 7, totalDebtIssued: 280000}
    deactivate GW
    DRI->>DRI: Đếm tiền mặt thực tế trong ví: 3.500.000đ (Khớp 100%)
    DRI->>GW: POST /api/v1/driver/trips/TRIP101/cash-reconciliation<br/>{actualAmount: 3500000, variance: 0, notes: "Khớp đủ tiền, 0 lệch"}
    activate GW
    GW->>DB: INSERT INTO cash_settlements (...)
    GW-->>DRI: 200 OK {status: "SETTLED"}
    deactivate GW
    GW-->>MGR: Cập nhật MGR-017 & Báo cáo thủ quỹ: Chuyến xe đã chốt sổ thành công
```

---

## 3. Quy Định Kiểm Soát & Đối Soát Tài Chính

1. **Khóa liên động trạng thái (State Interlocking)**: Một chuyến xe chỉ có thể đóng trạng thái `COMPLETED` khi toàn bộ các khoản COD đều đã được chốt (hoặc thu đủ tiền, hoặc ghi nhận biên lai nợ đã nạp vào hệ thống).
2. **Giới hạn nợ tiền thừa tối đa**: Mỗi tài xế không được phát hành tổng biên lai nợ vượt quá $1.000.000\text{đ}$ trên một chuyến đi để giảm thiểu rủi ro gian lận.
3. **Audit Log Bất biến**: Bất kỳ hành động phát hành biên lai nợ hay hoàn trả tiền thừa tại trạm dừng đều được ghi vào bảng `audit_logs` có đính kèm tọa độ GPS và định danh nhân viên thực hiện.
