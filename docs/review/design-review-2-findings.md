# Review spec và design lần 2

Ngày: 2026-10-08
Cách làm: đọc lại spec (PAX-017, DRI-006, DRI-009 đến DRI-011, DRI-017, FLOW-02, FLOW-03, open-questions) và đối chiếu với server, design trên Claude Design và prototype, bằng góc nhìn BA và người dùng: hành khách ở bến sóng yếu, người già không dùng app, tài xế đang lái, máy tài xế bị mất.
Kết quả: sửa spec (D104 đến D109), sửa server bằng TDD (228 test), cập nhật design và prototype.

## Phát hiện

| # | Mức | Phát hiện | Xử lý |
|---|---|---|---|
| DR2-01 | Cao | Mã QR lên xe đổi mỗi 30 giây và do server ký, nên khách phải có mạng đúng lúc lên xe; bến xe và điểm đón ven đường thường sóng yếu | D104: QR tĩnh có phiên bản |
| DR2-02 | Cao | Bản dự phòng khi mất mạng là JSON ký sẵn, hợp lệ cả ngày, nên lý do để xoay mã (chống chụp màn hình) mất tác dụng đúng lúc cần | D104: bỏ JSON offline, QR tĩnh tự dùng được offline |
| DR2-03 | Cao | Để kiểm vé offline, DRI-009 cho máy tài xế giữ khóa bí mật chung từ lúc đăng nhập. Mất một máy là giả được mọi vé của cả hệ thống | D104: manifest mang `boarding_check` (phiên bản, chữ ký mong đợi, băm PIN) cho từng vé của chuyến; máy không giữ khóa |
| DR2-04 | Trung bình | OQ-010 và OQ-012 từng giải quyết bằng cách nới cửa sổ lệch đồng hồ và thêm JSON cả ngày, chữa triệu chứng và làm mâu thuẫn sâu hơn | D104 thay cả hai |
| DR2-05 | Trung bình | Khách lỡ gửi ảnh vé không có cách thu hồi; mã PIN dùng vĩnh viễn | D104: "Đổi mã QR" tạo phiên bản mới, mã cũ và PIN cũ hết hiệu lực; khóa đổi mã sau khi xuất bến |
| DR2-06 | Trung bình | Link chia sẻ vé chứa mã vé và PIN trên URL (`?t=...&pin=...`), lọt vào log, lịch sử trình duyệt, ứng dụng xem trước link | D104: link là token ngẫu nhiên, PIN chỉ nằm trong nội dung SMS |
| DR2-07 | Trung bình | Màn vé hiện đồng hồ đếm ngược "Mã tự đổi sau 18 giây", khiến khách tưởng vé sắp hết hạn | D104: bỏ đếm ngược |
| DR2-08 | Thấp | `validateAndBoardTicket` trong module thanh toán là đường cho lên xe thứ hai, bỏ qua quy tắc COD và kiểm tra chuyến; chỉ test gọi | Xóa; mọi lần lên xe qua dịch vụ tài xế |
| DR2-09 | Cao | Thời gian chờ vắng mặt tính từ giờ xuất bến của chuyến, nên khách đón ở Ninh Bình có thể bị đánh dấu vắng mặt khi xe còn ở Hà Nội, mất vé và mất tiền | D105: tính tại điểm đón của khách |
| DR2-10 | Trung bình | Design và prototype cho khách chưa đăng nhập đi tới thanh toán, trong khi giữ ghế bắt buộc đăng nhập (Bearer) | D106: hỏi OTP tại bước "Giữ ghế", giữ nguyên ghế đã chọn |
| DR2-11 | Cao | Cockpit cho bấm quét vé, bán vé vẫy, kết thúc chuyến khi xe đang chạy 62 km/h | D107: khóa thao tác khi tốc độ trên 5 km/h, chỉ còn "Báo sự cố" |
| DR2-12 | Trung bình | "Kết thúc chuyến" nằm cạnh "Báo sự cố" và server cho kết thúc ở bất kỳ đâu, bấm nhầm là đóng chuyến giữa đường | D108: chỉ ở bến cuối; kết thúc sớm phải ghi lý do |
| DR2-13 | Thấp | Ô "Số khách" ở trang chủ không ràng buộc gì với số ghế chọn | D109: bỏ ô này |

## Giữ nguyên, có lý do

- Hoàn tiền vẫn do người duyệt (MGR-022), kể cả khi mức hoàn do chính sách tính: đây là chốt kiểm soát tài chính, không phải lỗi luồng.
- Giá theo chặng vẫn mở (`OQ-032`): là quyết định giá của chủ dự án.
