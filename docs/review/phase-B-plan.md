# Kế hoạch Giai đoạn B: ba app Flutter

Ngày: 2026-10-06
Tham chiếu: `design.md` (D1 đến D6), `phase-A-findings.md` mục "Việc bắt buộc ở Giai đoạn B".

## 1. Khảo sát (đã làm)

- **Không có Flutter hoặc Dart SDK** trên máy (không có trong PATH, không có ở thư mục thường gặp). Không thể biên dịch, chạy `flutter analyze` hay chạy test Dart. Mọi kiểm chứng ở giai đoạn này là đọc code và test tĩnh bằng Node.
- **Không màn hình nào gọi API.** 15 màn hình passenger, 15 file driver, 9 màn hình manager đều là giao diện tĩnh dùng dữ liệu cứng và trạng thái cục bộ (ví dụ `PassengerSeatMapScreen` chọn sẵn ghế `A01`). Không file nào import service API. Cổng web `web_dist` cũng là trang tĩnh, không có `fetch`.
- **Ba service API** (`passenger_api_service.dart`, `driver_api_service.dart`, `manager_api_service.dart`) tồn tại nhưng chưa được dùng, và lệch hợp đồng server: không gửi token (trừ manager), không gửi `Idempotency-Key`, giá và danh tính do client tự khai, hồ sơ cứng (`drv_8821a`, `0912345678`, `usr_default`), đường dẫn alias, thiếu nhiều phương thức.
- **Độ phủ màn hình so với spec** (theo tên file, không theo mã trong chú thích): Passenger 19/25, Driver khoảng 15/19, Manager khoảng 15/30. Các màn hình còn thiếu và sai nhãn số nằm trong báo cáo phát hiện.

## 2. Phạm vi Giai đoạn B (quyết định BA, D5)

| Bước | Nội dung | Kiểm chứng |
|---|---|---|
| B1 | Khảo sát và lập bảng độ phủ (xong) | Báo cáo |
| B2 | Viết test hợp đồng tĩnh: mọi lời gọi trong ba service phải nằm trong danh mục endpoint của server, đúng method, `Idempotency-Key` đúng chỗ, không còn danh tính hay giá cứng | `test/mobile/api_client_contract.test.js`, đã thấy đỏ trước khi sửa |
| B3 | Sửa ba service Dart theo hợp đồng: token, `Idempotency-Key`, đường dẫn chuẩn, thân yêu cầu đúng, thêm các phương thức còn thiếu | Test hợp đồng xanh, đọc lại bằng mắt |
| B4 | Bật `enforce` làm mặc định ở mọi môi trường (đóng D45, `OQ-022`), chuyển script e2e sang đăng nhập và dùng token | `npm run e2e` chạy với xác thực bật |
| B5 | Cập nhật spec (hợp đồng client, `OQ-029`), `STATE.md` cho đúng thực tế, báo cáo phát hiện B | Tài liệu |

**Ngoài phạm vi** (cần Flutter SDK để làm và kiểm chứng): nối các màn hình tĩnh với service, viết 6 + 4 + 15 màn hình còn thiếu, chạy `flutter analyze` và test Dart. Viết hàng nghìn dòng Dart mà không biên dịch được sẽ tạo ra mã chưa từng chạy; tôi chọn không làm và nêu rõ ở báo cáo.

## 3. Tiêu chí xong

- Test hợp đồng xanh, và đã được chứng minh là bắt được lỗi (đỏ trước khi sửa).
- `npm test`, `npm run lint` xanh; `npm run e2e` thành công với xác thực bật.
- `STATE.md` không còn khẳng định "tích hợp đầy đủ" khi màn hình chưa gọi API.
- Decision Log cập nhật.
