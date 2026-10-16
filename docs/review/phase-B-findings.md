# Giai đoạn B: Phát hiện (ba app Flutter)

Ngày: 2026-10-06
Phương pháp: đọc ba service API Dart và các màn hình, so với spec và với hợp đồng server của Giai đoạn A. **Máy không có Flutter hoặc Dart SDK**, nên không biên dịch, không chạy `flutter analyze`, không chạy test Dart. Mã Dart mới đã được đọc lại cẩn thận nhưng **chưa từng được biên dịch**.

## 1. Phát hiện

| ID | Phát hiện | Mức | Trạng thái |
|---|---|---|---|
| FND-B01 | **Không màn hình nào gọi API.** 15 màn hình passenger, 15 file driver, 9 màn hình manager là giao diện tĩnh với dữ liệu cứng và trạng thái cục bộ (ví dụ màn chọn ghế chọn sẵn `A01`). Không file nào import service API; cổng web `web_dist` cũng là trang tĩnh, không có `fetch`. Ba app hiện không thể đặt vé, soát vé hay điều xe thật | Cao | **Còn mở**: cần Flutter SDK để nối và kiểm chứng |
| FND-B02 | Client passenger và driver **không gửi token**; không client nào gửi `Idempotency-Key` | Cao | Đã sửa trong ba service |
| FND-B03 | Client driver cố định `x-driver-id: drv_8821a`: mọi tài xế đăng nhập đều là cùng một người | Cao | Đã sửa (danh tính lấy từ token) |
| FND-B04 | Client driver gọi COD bằng `{pnr, amountVnd}` trong khi server cần `ticket_id` và `amount_collected_vnd`: thu COD **chưa từng chạy được** | Cao | Đã sửa |
| FND-B05 | Client passenger tạo đơn không gửi `holdId` và gửi giá `unitPriceVnd` do client tự đặt | Cao | Đã sửa (`holdId` bắt buộc, không gửi giá) |
| FND-B06 | Ví vé mặc định số `0912345678`, thông báo mặc định `usr_default`, giữ ghế nhận `userId` truyền vào | Trung bình | Đã sửa (theo token) |
| FND-B07 | Hủy vé gửi `departureTime` do client chọn | Trung bình | Đã sửa (server dùng giờ trên vé) |
| FND-B08 | Cả ba client gọi các đường dẫn alias, không phải đường dẫn chuẩn của `api-screen-map` | Trung bình | Đã sửa; còn giữ alias phía server (xem mục 3) |
| FND-B09 | Thiếu phương thức cho 28 endpoint: passenger 10 (dừng, nhả giữ ghế, xác minh thanh toán, trạng thái thanh toán, đơn, vé đoàn, ủy quyền vé, hồ sơ, thông báo đổi xe, thông báo hoãn chuyến), driver 8 (chi tiết chuyến, vé vẫy, đến điểm dừng, lên xe thủ công, vắng mặt, GPS, chẩn đoán, hồ sơ), manager 10 (danh sách chuyến, chi tiết chuyến, kho ghế, danh sách và chi tiết đơn, giữ chỗ hotline, hoàn tiền, hoãn chuyến, cảnh báo, nhật ký). Trước đó: passenger 15, driver 11, manager 10 phương thức | Trung bình | Đã sửa: nay passenger 25, driver 19, manager 20, đúng bằng số endpoint của từng loại trong danh mục API |
| FND-B10 | `STATE.md` khẳng định "Complete typed HTTP integration" và "15 screens covering PAX-001 to PAX-025"; ba tiêu đề test mobile khẳng định phủ `PAX-001..025`, `DRI-001..019`, `MGR-001..030` trong khi chỉ kiểm vài file có tồn tại | Trung bình | Đã sửa tài liệu và tiêu đề test |
| FND-B11 | Độ phủ màn hình so với spec (theo mục đích từng màn hình): Passenger 19/25, Driver 14/19, Manager 9/30. Nhãn mã màn hình của manager trong code và `STATE.md` lệch số của spec (ví dụ `MGR-008` ghi là "Fleet & Crew", spec `MGR-008` là danh sách tuyến) | Trung bình | **Còn mở** (mục 2) |
| FND-B12 | Script e2e cũ nhiều bước chỉ in kết quả (kể cả `undefined`) mà không bao giờ thất bại, và dùng alias, danh tính tự khai | Trung bình | Đã viết lại: kiểm bắt buộc ở từng bước, đăng nhập thật |

## 2. Màn hình spec chưa có trong app

- **Passenger (6):** `PAX-008` chọn điểm đón và trả, `PAX-015` đặt vé thành công, `PAX-022` hồ sơ, `PAX-023` điểm dừng và liên hệ đã lưu, `PAX-024` thông báo đổi xe, `PAX-025` thông báo hoãn chuyến.
- **Driver (5):** `DRI-005` bắt đầu chuyến, `DRI-014` theo dõi GPS, `DRI-016` chẩn đoán, `DRI-017` kết thúc chuyến, `DRI-018` hồ sơ ca.
- **Manager (21):** `MGR-004`, `006`, `007`, `008`, `009`, `010`, `011`, `012`, `013`, `015`, `016`, `017`, `018`, `021`, `022`, `024`, `025`, `026`, `028`, `029`, `030` (chi tiết xe, tạo xe, bố cục ghế, danh sách và tạo tuyến, danh sách và tạo chuyến, chi tiết chuyến, kho ghế, tài xế, đơn, thanh toán, hoàn tiền, hoãn chuyến, cảnh báo, thông báo, nhật ký, vai trò, cài đặt).

Đây là ước lượng theo mục đích từng màn hình, không theo mã trong chú thích.

## 3. Việc đã làm

- `test/mobile/api_client_contract.test.js` (17 test): đọc mã Dart dưới dạng chuỗi và kiểm mọi lời gọi nằm trong danh mục endpoint của server, đúng method, `Idempotency-Key` đúng chỗ, mỗi endpoint của một loại client có một phương thức, không còn danh tính hay giá cứng, thân yêu cầu có đủ trường, token được giữ sau đăng nhập. Đã thấy 11 test đỏ trước khi sửa. Hai test (đường dẫn, idempotency) khi đó pass vì chưa có lời gọi nào để kiểm; test đầu tiên của mỗi client chặn trường hợp này.
- Ba service Dart viết lại cùng một mẫu: `_get`, `_post`, `_delete` thêm token và khóa idempotency, phương thức nhận khóa tùy chọn để thử lại đúng một thao tác.
- `FLEETBUS_AUTH` mặc định `enforce` ở mọi môi trường (`off` chỉ cho thử nghiệm cục bộ, bị bỏ qua ở production). Đóng D45 và `OQ-022`.
- Server nhận thêm `arrive` (DRI-008) trong danh sách cần Idempotency-Key, đúng spec.
- Alias server vẫn trả lời (danh sách ở `api-screen-map` mục 5) vì chưa thể xác nhận không còn client nào dùng chúng; có thể bỏ khi các màn hình được nối.

## 4. Giới hạn

- Mã Dart mới **chưa biên dịch**. Rủi ro lỗi cú pháp hoặc kiểu cần được loại bỏ bằng `flutter analyze` khi có SDK.
- Test hợp đồng đọc văn bản, không chạy client thật; nó bắt lệch đường dẫn, method, khóa và tên trường, không bắt lỗi logic Dart.
- Chưa nối màn hình với service, chưa viết 32 màn hình còn thiếu (FND-B01, FND-B11).
