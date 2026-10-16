# Giai đoạn C: Phát hiện (bảy luồng xuyên app)

Ngày: 2026-10-07
Phương pháp: đọc `FLOW-01` đến `FLOW-07`, chạy từng luồng qua HTTP với đăng nhập thật cho hành khách, tài xế và nhân viên điều hành, và so với các màn hình (đã sửa ở Giai đoạn A). Mỗi luồng có test trong `test/flows/flow_conformance.test.js` (16 test); 15 trong 16 test đã thấy đỏ trước khi sửa (`TC-FLOW-C15` chỉ chặn hồi quy). Kết quả: `npm test` **198/198** (trước giai đoạn: 182), `npm run lint` 56 file, `npm run e2e` thành công.

## 1. Phát hiện

| ID | Phát hiện | Mức | Trạng thái |
|---|---|---|---|
| FND-C01 | **Điều hành không thấy ghế đang giữ.** `seat-matrix` chỉ trả số đếm; không có trạng thái từng ghế, nên ghế đang giữ, giữ qua hotline, đã bán, bị khóa đều vô hình ở MGR-013 | Cao | Đã sửa: một dòng cho mỗi ghế (`AVAILABLE`, `HELD`, `HOTLINE_HOLD`, `BOOKED` kèm PNR, `BLOCKED` kèm lý do) |
| FND-C02 | **Không khóa được ghế kỹ thuật.** `POST .../seats/override-lock` và `BR-INVENTORY-001` có trong spec nhưng không có trong server | Trung bình | Đã làm (vai trò điều phối, lý do bắt buộc, nhật ký kiểm toán, app và quầy đều bị chặn) |
| FND-C03 | **Chậm quá 30 phút vẫn mất tiền khi hủy.** `PAX-025` ghi hoàn 100%, code vẫn trả 0% trong vòng 6 giờ. Chính spec tự mâu thuẫn: bảng bậc ghi "dưới 6 giờ: 0%", `BR-CANCEL-001` ghi "bị chặn" | Cao (tiền) | Đã sửa cả hai: dưới 6 giờ vẫn hủy được và hoàn 0%; điều hành công bố chậm trên 30 phút thì hoàn 100% (`DELAY_WAIVER`) |
| FND-C04 | **Biên lai nợ tiền thừa là sổ chết.** Không có hạn mức (flow ghi 1.000.000 đ nhưng không có trong spec lẫn code) và không có cách trả: khách không bao giờ nhận lại tiền trong hệ thống | Cao (tiền) | Đã sửa: hạn mức 1.000.000 đ mỗi chuyến, `POST /ops/debt-receipts/{code}/redeem` cho thu ngân, trả một lần, có nhật ký |
| FND-C05 | **Hotline không giới hạn số ghế mỗi số điện thoại.** Một cuộc gọi có thể giữ cả xe | Trung bình | Đã sửa: tối đa 4 ghế mỗi số điện thoại, hold hết hạn không tính |
| FND-C06 | **Ví vé sai so với `PAX-016` và `PAX-017`.** Tab `HISTORY` không tồn tại (giá trị lạ trả về tất cả vé); vé `BOARDED` biến khỏi "Sắp đi" ngay khi lên xe thay vì ở lại đến hết chuyến; vé đã lên xe mở ra lỗi `TICKET_NOT_ACTIVE` thay vì hiện "ĐÃ LÊN XE" | Cao | Đã sửa (`BR-MYTICKETS-004`, `BR-TICKET-007`): tab theo chuyến, vé đã dùng mở được và không có QR |
| FND-C07 | **Vị trí xe không tới radar điều hành.** Chuyến `trp_hn_th_01` chạy xe `29B-882.19` không có trong đội xe, nên mọi ping bị bỏ rơi ở phía điều hành. Ngoài ra radar đổi trạng thái xe theo tốc độ: xe dừng ở trạm thành `STANDBY` và trở thành ứng viên xe thay thế. Điều hành không tự tính `STALE` hay `OFFLINE`, và khách không bao giờ thấy `OFFLINE` | Cao | Đã sửa: tìm xe qua chuyến, trạng thái xe theo chuyến, `LIVE` đến 60 giây, `STALE` đến 180 giây, `OFFLINE` sau đó, cùng ngưỡng ở cả hai bên; tuổi vị trí là tuổi của ping |
| FND-C08 | **Đổi xe không đến app tài xế.** Tài xế thay thế không thấy chuyến, tài xế cũ vẫn là chủ chuyến. Danh bạ tài xế của điều hành khác app tài xế (cùng mã `drv_8821a` nhưng khác tên; thiếu tài xế hết hạn). Tài xế hết hạn giấy phép vẫn được chọn | Cao | Đã sửa: chuyến chuyển sang tài xế mới, danh bạ cùng mã và tên với app tài xế, tài xế không đủ điều kiện bị `409 DRIVER_UNAVAILABLE` |
| FND-C09 | **Vắng mặt không đến khách và điều hành.** Chỉ manifest của tài xế đổi | Trung bình | Đã sửa: vé `NO_SHOW`, đếm vắng mặt ở điều hành, thông báo cho khách |
| FND-C10 | **Bắt đầu chuyến không đến điều hành.** Chuyến và xe không đổi sang `IN_TRANSIT` khi tài xế bấm bắt đầu | Trung bình | Đã sửa (`TRIP_STARTED`) |
| FND-C11 | **Dữ liệu mẫu của ba dịch vụ không khớp nhau.** Số ghế đã bán ở điều hành (14) khác kho ghế (2); xe của chuyến mẫu không có trong đội xe; trạng thái chuyến khác nhau giữa điều hành và tài xế | Trung bình | **Sửa một phần:** chuyến `trp_hn_th_01` (xe `veh_04` mới, trạng thái `READY`, 2 ghế đã bán, tên tài xế). Chuyến `trp_991823` vẫn hiện `IN_TRANSIT` ở điều hành trong khi tài xế chưa bắt đầu, và số ghế mẫu của nó (28 trên 34) không khớp sơ đồ 22 ghế: để Giai đoạn D |
| FND-C12 | **Cả bảy FLOW mô tả một hệ thống khác.** Redis, PostgreSQL, WebSocket, MQTT, mã màn hình cũ (`PAX-015` là "vé QR" khi spec là `PAX-017`), đường dẫn cũ (`hail-passengers`, `swap-vehicle`, `bookings/hold`, `cash-reconciliation`), trường hợp "thanh toán một phần" mà server không hỗ trợ, liên kết `file:///home/david/Downloads/...` hỏng, và ảnh sơ đồ vẽ hành vi sai | Cao (tài liệu) | Đã viết lại cả bảy flow, tài liệu tổng và README; xóa ảnh cũ |
| FND-C13 | Tồn đọng ngoài phạm vi: `DRI-012-cod.md` là bản trùng (cùng inode) của `DRI-012-cod-collection.md`; `README.md` gốc còn liên kết tuyệt đối hỏng | Thấp | Chuyển sang Giai đoạn D |

## 2. Việc cố ý không làm (quyết định BA, xem `decision-log.md` D67 đến D69)

- Nút nghỉ ở trạm dừng và hai endpoint `rest-stop`: không màn hình tài xế nào có. Trạng thái trạm dừng tự động cần vị trí trạm dừng (`OQ-030`).
- Danh sách đen khách giữ chỗ rồi bỏ, nhắc trước khi hết hạn, voucher 20% khi chậm quá 45 phút, thuật toán dồn ghế, vé ký lại cho xe mới, hai endpoint `cash-summary` và `cash-reconciliation`: không có màn hình, kênh gửi tin hay ví voucher (`OQ-031`).
- Vắng mặt vẫn không nhả ghế (`OQ-028`), WebSocket và MQTT (`OQ-002`).

## 3. Test

`test/flows/flow_conformance.test.js` (16 test). Năm test cũ đổi kỳ vọng vì dữ liệu mẫu hoặc quy tắc spec đã đổi, không nới lỏng; một test hợp đồng cần thêm phương thức Dart:

| Test | Đổi | Lý do |
|---|---|---|
| `TC-MGR-02`, `TC-MGR-03`, `TC-SRV-04` | đội xe 3 thành 4 xe, `total_tracked_vehicles` 3 thành 4 | Thêm xe `29B-882.19` còn thiếu (FND-C11) |
| `TC-SYNC-02`, `TC-SPEC-A37` | vé `BOARDED` kiểm ở tab `UPCOMING` thay vì `COMPLETED` | `BR-MYTICKETS-001`, `BR-MYTICKETS-004` (FND-C06) |
| `TC-CLIENT-manager-04` | không đổi kỳ vọng; thêm hai phương thức vào `manager_api_service.dart` để đạt | Mỗi endpoint của manager phải có một phương thức |

## 4. Giới hạn

- Không có Flutter SDK: hai phương thức Dart mới (`setSeatLock`, `redeemDebtReceipt`) theo đúng mẫu của file nhưng chưa biên dịch; test hợp đồng chỉ kiểm đường dẫn, method và khóa idempotency.
- Test chạy trên bộ nhớ, một tiến trình; thời gian giả lập (hold quá hạn, im lặng 61 giây và 181 giây) qua tham số `mockNow` hoặc `now` mà service đã có.
- Chưa có chứng cứ về hành vi thời gian thực vì không có kênh đẩy: các flow nói rõ app phải hỏi lại.
