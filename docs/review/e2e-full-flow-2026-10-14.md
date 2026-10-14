# Kiểm thử full luồng: 2 emulator + web điều hành (14/10/2026)

**Phạm vi:** đặt vé đến kết thúc chuyến, chạy trên thiết bị thật (emulator), không dùng dữ liệu giả lập trong code test.
**Người chạy:** Claude (BA, kiểm thử). Code sửa do Gemini (agy) viết theo đề bài, Claude review và kiểm lại.
**Quyết định đi kèm:** D148 trong `decision-log.md`. Ảnh chụp ở `e2e-2026-10-14/`.

## Môi trường

| Thành phần | Chi tiết |
|---|---|
| Server | `npm start` (Node, DB SQLite mã hóa theo nhà xe), push Firebase bật (`FLEETBUS_FCM_SERVICE_ACCOUNT`) |
| App khách | emulator-5554 (Pixel 5), `vn.busgo.passenger.dev`, build debug flavor `develop` |
| App tài xế | emulator-5556, `vn.busgo.driver.dev`, xe chạy giả lập (không bật `FLEETBUS_DEVICE_GPS`) |
| Web điều hành | `http://localhost:3000/manager`, Chrome headless, tài khoản `dispatcher@busgo.vn` |
| Thanh toán | Webhook VietQR IPN có chữ ký HMAC, gửi tay thay ngân hàng |

## Kịch bản và kết quả

| # | Bước | Nơi chạy | Kết quả |
|---|---|---|---|
| 1 | Đổi sơ đồ xe 29B-888.22 sang Giường nằm 34 chỗ | Web > Đội xe | Đạt |
| 2 | Gán xe 29B-888.22 và tài xế Phạm Quốc Huy (TX9912) cho chuyến 19:30 | Web > Điều độ chuyến | Đạt. Lỗi: danh sách xe ghi số chỗ thô (B3) |
| 3 | Đăng nhập OTP, tìm chuyến, xem sơ đồ 2 tầng 3 dãy, chọn A05 (tầng dưới) và B03 (tầng trên) | App khách | Đạt |
| 4 | Giữ ghế 10 phút, nhập tên, tạo mã VietQR, ngân hàng báo đã nhận (IPN) | App khách + webhook | Đạt. Lỗi: màn thành công hứa "đã gửi SMS" (B4); hai mốc "có mặt trước" khác nhau (B6) |
| 5 | Xin quyền thông báo sau khi đặt vé, xem vé QR và mã PIN dự phòng | App khách | Đạt |
| 6 | Chuyến hiện 2/34 ghế đã bán, danh sách điểm đón đúng | Web > Điều độ chuyến | Đạt |
| 7 | Tài xế đăng nhập, thấy chuyến và 2 khách, kiểm tra xe 6/6, xuất bến | App tài xế | Đạt (quyền vị trí đã cấp từ trước nên không hỏi lại) |
| 8 | Cho A05 lên bằng mã PIN, B03 lên bằng "Cho lên xe" | App tài xế | Đạt |
| 9 | Rời trạm, gửi vị trí | App tài xế | Đạt. Lỗi: "Đến trạm kế 409 phút" (B7) |
| 10 | Khách nhận "Xe đã tới điểm đón", theo dõi xe trên bản đồ | App khách | Đạt. Lỗi: mỗi vé một push (B2); băng báo cũ không tự ẩn (B5) |
| 11 | Bản đồ xe, tổng quan ca trực | Web | Đạt. Lỗi: bản đồ ghi tài xế mặc định của xe (B3) |
| 12 | Nhập số km, kết thúc chuyến, nộp 0 đ | App tài xế | Đạt |
| 13 | Vé chuyển sang "Lịch sử" | App khách | **Lỗi**: vé vẫn ở "Sắp đi" (B5) |
| 14 | Kiểm lại toàn bộ bản sửa trên chuyến tăng cường 21:00 (tạo qua Lịch chạy) | Cả 3 | Đạt, xem phần dưới |

## Lỗi tìm thấy và cách sửa

| Mã | Mức | Lỗi | Sửa | Người làm | Kiểm lại trên thiết bị |
|---|---|---|---|---|---|
| B1 | **Cao** | Chuyến đã kết thúc vẫn hiện khi tìm chuyến và vẫn bán được vé (đã bán thật đơn BG-187489 cho chuyến 19:30 đã xong) | `saleBlock`/`saleStatus` chặn chuyến `COMPLETED` (409 `TRIP_COMPLETED`); chuyến đang chạy vẫn bán cho các trạm phía trước | Claude | Đạt: tìm chuyến chỉ còn chuyến 21:00 |
| B2 | Trung bình | Khách 2 ghế nhận 2 push "Xe đã tới điểm đón" giống nhau | Gộp theo số điện thoại mỗi trạm, liệt kê ghế | agy (bước A) | Đạt: 1 push "ghế B05, B06" |
| B3 | Trung bình | Gán xe ghi số chỗ thô (29B-123.45 "34 chỗ" dù chạy sơ đồ 22 phòng); bản đồ xe ghi sai tài xế | Số chỗ lấy từ sơ đồ của xe (D147), tài xế lấy từ chuyến xe đang chạy/sắp chạy | agy (bước A) + Claude (sức chứa gửi sang app tài xế) | Đạt: "22 chỗ", "Phạm Quốc Huy" |
| B4 | Trung bình | Màn đặt vé thành công nói "đã gửi qua SMS" nhưng đặt trên app không có SMS nào | Đổi thành "Vé đã lưu trong mục Vé của tôi" | agy (bước B) | Đạt bằng test giao diện (màn này không chạy lại được trên emulator, xem "Còn lại") |
| B5 | Trung bình | Vé của chuyến đã xong vẫn ở "Sắp đi", "Lịch sử" trống; băng báo "mời lên xe" còn sau khi đã lên xe | App chia tab theo server (`past`), nhãn "Đã đi", tải lại khi quay lại app; ẩn băng báo khi vé đã lên xe/đã xong | agy (bước B) | Đạt: "Lịch sử" có 4 vé "Đã đi", băng báo tự ẩn |
| B6 | Thấp | Thời gian có mặt: "trước 10 phút" (chi tiết chuyến) và "trước 15 phút" (vé) | Thống nhất 15 phút | agy (bước B) | Đạt |
| B7 | Trung bình | Tài xế thấy "Đến trạm kế 409 phút": lấy giờ trên lịch trừ giờ hiện tại | Tính theo quãng đường còn lại và tốc độ (tối thiểu 30 km/h) | agy (bước C, sửa 1 vòng vì code bị lặp) | Đạt: "3 phút" tới Nước Ngầm |

## Kiểm tra tự động sau khi sửa

| Phần | Lệnh | Kết quả |
|---|---|---|
| Server | `npm test`, `npm run lint` | 472 test đạt (thêm `test/server/e2e_findings.test.js`, `TC-FR-05b`), lint đạt |
| App khách | `flutter test`, `flutter analyze` | 53 test đạt, không có lỗi analyze mới |
| App tài xế | `flutter test`, `flutter analyze` | 30 test đạt, không có lỗi analyze mới |

## Còn lại, chưa sửa

| Mục | Ghi chú | Đề xuất |
|---|---|---|
| App khách và app tài xế không lưu phiên đăng nhập | Tắt hẳn app là phải nhập OTP/PIN lại (server có lưu phiên) | Lưu token bằng `flutter_secure_storage`, khôi phục khi mở app |
| Ô nhập ở màn "Xác nhận đặt vé" không nhận focus trên emulator-5554 sau khi khởi động lại máy | Xảy ra với cả bản trước khi sửa, lần đầu chạy thì gõ được; có thể do emulator | Kiểm tay trên điện thoại thật |
| Chuỗi nhật ký thao tác của Sao Mai bị đứt tại `aud_1791781584844_6` (12/10) | Có từ trước đợt này, thấy trong log server | Tìm nguyên nhân (dữ liệu dev bị reset) trước khi lên production |
| Tài xế xuất bến sớm 4 giờ không bị cảnh báo | Có thể là chủ ý (chạy ca sớm) | Quyết định: cảnh báo khi xuất bến sớm quá 30 phút |
| Xe giả lập chạy hết tuyến trong khoảng 1 phút | Giới hạn của bản dev, không phải lỗi | Kiểm vị trí thật với `FLEETBUS_DEVICE_GPS=true` |
| Tên tuyến khác nhau giữa các màn ("Hà Nội → Sầm Sơn VIP Limousine" và "Hà Nội → Thanh Hóa") | Dữ liệu mẫu của chuyến và của tuyến khác nhau | Lấy một nguồn tên tuyến |
| Điều độ thấy mục "Đặt chỗ" nhưng mở ra không có quyền | Nên ẩn mục với vai trò không xem được | Ẩn theo vai trò |

## Dữ liệu thử đã tạo

- Vé BG-381318 (A05, B03, chuyến 19:30) và BG-679407 (B05, B06, chuyến tăng cường 21:00): đã đi, số 0987000222.
- Vé BG-187489 (bán nhầm cho chuyến đã xong): đã hủy.
- Chuyến tăng cường `sch_138d0a6a4a_20261014` (21:00 hôm nay, đã kết thúc sớm có lý do "Kiem thu E2E ket thuc som").
- Xe 29B-888.22 giờ chạy sơ đồ Giường nằm 34 chỗ.
