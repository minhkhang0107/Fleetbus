# Giai đoạn E: Việc còn lại sau A đến D

Ngày: 2026-10-07
Phạm vi: các mục còn mở không cần Flutter SDK: `OQ-027` (2FA), `OQ-030` (trạm dừng), `OQ-028` (kho ghế theo chặng). Kết quả: `npm test` **213/213** (trước giai đoạn: 198), `rtk proxy npm run lint` 61 file, `npm run e2e` thành công (chạy hai lần liên tiếp, vì mã TOTP chỉ dùng một lần).

Lưu ý: lệnh `npm run lint` qua bộ lọc RTK in ra "ESLint output (JSON parse failed...)" và mã thoát 1 dù không có lỗi; kết quả thật xem bằng `rtk proxy npm run lint`.

## 1. Đã làm

| Mục | Kết quả | Test |
|---|---|---|
| `OQ-027` TOTP 2FA | Giám đốc điều hành (`FLEET_DIRECTOR`) và kiểm soát tài chính (`FINANCIAL_CONTROLLER`) phải gửi mã `totp` (RFC 6238, SHA1, 30 giây, 6 số, lệch một bước). Hỏi mã sau khi mật khẩu đúng nên không lộ mật khẩu; mã sai tính vào khóa tài khoản; mã đã dùng bị từ chối; production không có khóa thì từ chối chứ không dùng khóa dev | `TC-TOTP-01` đến `06` (có vectơ chuẩn RFC) |
| `OQ-030` Trạm dừng | Bảng trạm dừng có vùng 300 m; đứng dưới 1 km/h quá 5 phút trong vùng thì khách thấy `is_at_rest_stop`, tên trạm, số phút nghỉ; chạy lại hoặc ra khỏi vùng thì mất, kẹt xe ngoài trạm không tính | `TC-REST-01`, `02` (đã thử đột biến: đổi ngưỡng thì đỏ) |
| `OQ-028` Chặng | Kho ghế theo chặng giữa hai điểm dừng: giữ ghế, bán ở quầy, giữ hotline, vé vẫy, ma trận (`PARTIALLY_BOOKED` và trạng thái từng chặng), sơ đồ ghế của app theo `pickup_stop_id`, `dropoff_stop_id`; điểm đón trả được kiểm theo chuyến (`STOP_NOT_FOUND`, `INVALID_SEGMENT`, `STOP_NOT_ALLOWED`); hủy vé chỉ nhả chặng của vé; vắng mặt nhả ghế từ điểm xe đã tới; khách vẫy đi từ điểm xe đã tới | `TC-SEG-01` đến `07` |

## 2. Sửa trên đường đi

- Chuyến mẫu `trp_hn_th_01` thêm điểm dừng trung gian Ninh Bình (đón và trả đều được): với dữ liệu cũ (Hà Nội chỉ đón, Thanh Hóa chỉ trả) không có hai vé nào ghép được trên cùng một ghế, nên mô hình chặng vô nghĩa. Driver app dùng cùng năm điểm dừng.
- `PAX-009` đánh số quy tắc lệch với phần trace của chính nó (`BR-SEAT-001` ghi tối đa 5 ghế trong khi trace ghi là chặng): sửa thành `001` chặng, `003` tối đa 5 ghế, `004` mạng; ma trận truy vết cập nhật theo.
- Test cũ truyền `'a','b'` làm điểm đón trả giả cho `getSeatMap` (trước đây bị bỏ qua) đổi thành "cả tuyến". Test `TC-FLOW-C08` cho khách vẫy đi hết tuyến (`stp_th_sam_son`) thay vì dừng ở `stp_th_pb`, vì dừng sớm thì ghế còn trống chặng cuối (`PARTIALLY_BOOKED`) là đúng.

## 3. Còn mở

| Mục | Lý do |
|---|---|
| `OQ-029` | Không màn hình Flutter nào gọi API, 32 màn hình spec chưa có, mã Dart mới chưa biên dịch (`setSeatLock`, `redeemDebtReceipt`, tham số `totp`). Cần Flutter SDK (vài GB): hỏi chủ dự án trước khi cài |
| `OQ-032` (mới) | Giá vẫn phẳng theo chuyến, không theo chặng. Đổi giá là quyết định kinh doanh, không để BA tự quyết |
| WebSocket, MQTT (`OQ-002`) | Hạ tầng đích, app phải hỏi lại |
| Chưa có màn hình đăng ký khóa TOTP | Quản trị cấp khóa qua biến môi trường `FLEETBUS_TOTP_SECRET_<USER_ID>` |
