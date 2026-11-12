# Lượt thử tay trước khi cài lên máy thật (09/11/2026)

APK khách và APK tài xế trỏ tới server qua Tailscale (`http://100.96.225.81:3000`, `make tailscale_apk`), cài trên hai máy ảo Android; web điều hành mở trên Chrome. Server chạy code nhánh `fix/manual-round-d194`, dữ liệu mẫu.

Kịch bản: tài xế TX8821 vào ca; điều độ viên gán xe 29B-444.11 và TX8821 cho chuyến 19:30 Hà Nội → Sầm Sơn; khách 0912 345 678 đặt 2 ghế A03, B03 trả tiền mặt, xem vé, hủy B03; tài xế kiểm tra xe, thử xuất bến sớm; khách đặt ghế chuyến 07:00 ngày mai bằng VietQR với mã BUSGO50K; thu ngân xác nhận đã nhận tiền; khách nhận vé.

## Thấy gì, đã sửa gì (D194)

| # | Thấy | Đã sửa |
|---|---|---|
| 1 | Tài xế đăng nhập đầu ngày chỉ thấy chuyến mẫu 28/08; chuyến 07:00 hôm nay của lịch chạy chỉ xuất hiện sau khi điều hành mở bảng điều độ | Danh sách chuyến của tài xế tự tạo trước chuyến hôm nay và ngày mai |
| 2 | Tab Lịch của tài xế: "Tháng này bạn chưa có chuyến nào" | Lịch tháng lấy tài xế mặc định của lịch chạy: 22 chuyến 07:00 trong tháng 11 |
| 3 | Đã có chuyến 19:30 với 2 khách, khung lớn vẫn là chuyến 28/08 vì app tự chọn nó lúc đăng nhập | Khung lớn chỉ giữ chuyến tài xế tự bấm chọn |
| 4 | Khách hủy B03, tài xế vẫn thấy B03 với "Thu 250.000 đ khi lên", số khách vẫn là 2 | Ghế đã hủy không còn trong danh sách và số khách |
| 5 | "Vé của tôi": đơn 2 ghế 500.000 đ ghi "trả 250.000 đ tiền mặt khi lên xe" | Ghi tổng của cả đơn |
| 6 | Hủy vé tiền mặt chưa trả còn 7 giờ nữa mới chạy: "Đã hủy vé, không hoàn tiền theo chính sách" | "Đã hủy vé. Vé chưa thanh toán nên không có tiền hoàn" |
| 7 | Màn đặt vé: chạm ô mã giảm giá hay họ tên, bàn phím hiện lên rồi tắt ngay, không gõ được | Bản đồ (flutter_map) không còn tự giành focus |
| 8 | Ghế đã hủy (đã hoàn tiền) vẫn soát lên xe được bằng QR lẻ, và bằng QR nhóm phát trước lúc hủy | Từ chối "Vé ghế B03 đã hủy, không cho lên xe."; QR nhóm cho các ghế còn lại lên |
| 9 | Mất mạng: app tài xế nhận mọi chuỗi có dạng mã vé BusGo kèm mã đặt chỗ (kể cả mã giả, mã cũ đã đổi) và tự tìm theo mã đặt chỗ | App kiểm chữ ký, phiên bản và PIN bằng dữ liệu server gửi sẵn |
| 10 | Từ chối hiện mã tiếng Anh, ví dụ "Mã QR không hợp lệ (INVALID_SIGNATURE)" | Câu tiếng Việt |

Đúng, không cần sửa: điểm đi/đến cố định theo cấu hình nhà xe (D136); chuyến 14:00 đón ở Giáp Bát lúc 14:09 vì xuất phát ở Mỹ Đình; giữ ghế 10 phút; kiểm tra xe lưu lại, "Chưa tới giờ xuất bến" giải thích từ 18:30; điều độ viên không thấy trang Thanh toán, thu ngân thấy; mã BUSGO50K trừ đúng 50.000 đ; thu ngân xác nhận 170.000 đ thì app khách chuyển ngay sang "Đặt vé thành công"; bảng điều độ đếm 1/22 sau khi hủy một ghế.

## Còn lại

- Tìm chuyến: chuyến 07:00 đã qua giờ nhưng chưa chạy vẫn ghi "Đã xuất bến · Chuyến xe đã chạy". Server dùng chung mã `TRIP_DEPARTED` cho xe đã chạy và đã qua giờ; khách đằng nào cũng không đặt được.
- Khung lớn của tài xế: ô "Thu tiền mặt" ghi số khách trả tiền mặt ("2"), dễ đọc nhầm là số tiền.
- Web điều hành ở cửa sổ hẹp (khoảng 770 px): thanh menu chiếm gần một phần ba màn hình, bảng tràn ngang nên nút ở cột cuối bị che một phần.
- Chuyến 14:00 hôm nay chưa gán xe, còn 2 giờ nữa chạy, nhưng Tổng quan không cảnh báo.
