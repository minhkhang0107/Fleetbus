# Review design và luồng (trải nghiệm 3 app)

Ngày: 2026-10-07
Cách làm: chạy `npm start`, mở `/passenger`, `/driver`, `/manager` bằng Chrome headless, bấm theo đúng luồng của người dùng thật (script CDP, ảnh chụp từng bước), rồi đối chiếu với `screen-spec/` (FLOW-01 đến 07, `navigation-map`, `design-system`, các màn hình liên quan).
Kết quả: spec đã sửa (D95 đến D102), một lỗ hổng luồng ở server đã sửa bằng TDD (D100), và design mới dựng trên Claude Design.

## Phát hiện

| # | App | Mức | Phát hiện | Xử lý |
|---|---|---|---|---|
| DSG-01 | Khách | Cao | Bấm "Điểm đi", "Điểm đến" và thẻ tuyến phổ biến ở trang chủ báo lỗi `ReferenceError` (`openLocationPicker`, `quickSelectRoute` không tồn tại) | Đã sửa trong prototype mới (D103) |
| DSG-02 | Khách | Cao | Checkout tự cộng "Bảo hiểm chuyến đi 10.000 đ", trái `BR-CHECKOUT-003` | Design: bảo hiểm là công tắc tắt sẵn |
| DSG-03 | Khách | Cao | Màn thanh toán có nút "GIẢ LẬP ĐÃ THANH TOÁN (WEBHOOK SUCCESS)", không có "Tôi đã chuyển tiền", nhảy thẳng sang vé, bỏ qua PAX-014 và PAX-015 | D99, D101; design có PAX-013 và PAX-015 |
| DSG-04 | Khách | Trung bình | Thanh tab hiện ở splash, đăng nhập, sơ đồ ghế, checkout, thanh toán: hai thanh dưới chồng nhau, dễ bỏ dở phiên giữ ghế | D96 |
| DSG-05 | Khách | Trung bình | Không có bước chọn điểm đón/trả (PAX-008) trước sơ đồ ghế, trong khi chặng quyết định ghế nào còn trống (`BR-SEAT-001`) | D96 |
| DSG-06 | Khách | Trung bình | Đồng hồ giữ ghế chỉ hiện từ checkout, sơ đồ ghế không có nút "Giữ ghế" rõ ràng | D96 |
| DSG-07 | Khách | Trung bình | Nội dung trang chủ và các màn sau bị lệch ngang, cắt mép trái trong khung máy | Đã sửa trong prototype mới (D103) |
| DSG-08 | Khách | Thấp | Màn đăng nhập in sẵn "Mã thử nghiệm mặc định: 882199" | D101 |
| DSG-09 | Khách | Thấp | "Tìm thấy 3 chuyến" nhưng chỉ có 2 thẻ | Design dùng số khớp danh sách |
| DSG-10 | Khách | Thấp | Mã PNR màu `#FB9821` trên nền trắng không đạt độ tương phản 4.5:1 | D95 |
| DSG-11 | Khách | Trung bình | Vé hiện chuỗi "HMAC: ..." cho khách; theo dõi xe không có trạng thái mất tín hiệu (`STALE`, `OFFLINE`, FLOW-06) | Design PAX-017, PAX-018 |
| DSG-12 | Tài xế | Cao | Vé COD có hai nút riêng "Thu tiền COD" và "Cho lên xe"; server cho vé COD chưa thu tiền lên xe bằng tay, PIN hoặc QR, nên có thể không bao giờ thu tiền | D100, đã sửa server |
| DSG-13 | Tài xế | Cao | Bấm "Cho lên xe" hay "Thu tiền" xong, manifest vẫn ghi "CHƯA LÊN XE" | Design: hàng đổi trạng thái tại chỗ (D99) |
| DSG-14 | Tài xế | Trung bình | Checklist an toàn tích sẵn cả 6 mục, nút xuất bến luôn bấm được | D98 |
| DSG-15 | Tài xế | Trung bình | Kết thúc chuyến bằng một `alert()`, không có màn tổng kết DRI-017 (tiền phải nộp, biên lai nợ, khách chưa xử lý) | D99; design DRI-017 |
| DSG-16 | Tài xế | Trung bình | "Báo sự cố" gửi ngay, không chọn loại sự cố và thời gian chậm (DRI-019) | Design DRI-019 |
| DSG-17 | Tài xế | Trung bình | Không có thao tác vắng mặt (DRI-011) và không có góc nhìn theo trạm (DRI-008) | Design DRI-008 |
| DSG-18 | Tài xế | Thấp | Emoji trong cockpit, manifest, hộp thoại; nhãn kỹ thuật "72dp", "60Hz", "MQTT" ngay trên nút | D101 |
| DSG-19 | Quản lý | Cao | "Phê duyệt hoàn tiền" 100% ngay trên một giao dịch đã khớp, không có yêu cầu hoàn, mức hoàn hay lý do | Design MGR-022 theo hàng đợi yêu cầu |
| DSG-20 | Quản lý | Cao | Đổi xe khẩn cấp một nút, xe thay cố định, không kiểm sức chứa, tài xế, lý do (MGR-023, `BR-REPLACE-001` đến `003`) | Design MGR-023 dạng các bước |
| DSG-21 | Quản lý | Trung bình | Bán vé tại quầy nhập số ghế bằng tay, không có sơ đồ ghế, chặng, phương thức thu tiền, giữ chỗ hotline (MGR-020, FLOW-05) | Design MGR-020 |
| DSG-22 | Quản lý | Trung bình | Emoji trong cảnh báo; chữ "60 FPS", "14 beacon", "độ trễ 12ms" không giúp điều hành ra quyết định | D101 |
| DSG-23 | Quản lý | Thấp | Cảnh báo ở dashboard không dẫn tới hành động (mở chuyến, đổi xe, công bố chậm) | Design MGR-002 |
| DSG-24 | Chung | Trung bình | Màu chính mâu thuẫn: `design-system.md` ghi `#0F52BA`, `passenger/DESIGN.md` và code Flutter dùng `#2563EB`; bo góc 12px và 16px | D95, D101 |
| DSG-25 | Chung | Trung bình | Checkout liệt kê VNPAY, MoMo, COD nhưng server chỉ thanh toán VietQR | D97, `OQ-033` |

## Giới hạn

- Trải nghiệm trên bản prototype HTML mà server phục vụ ở `/passenger`, `/driver`, `/manager`. App Flutter không chạy được vì máy chưa có Flutter SDK (`OQ-029`).
- Prototype HTML đã viết lại theo design mới (D103), sửa luôn DSG-01 và DSG-07. App Flutter chưa cập nhật vì máy chưa có Flutter SDK (`OQ-029`).

## Design mới

Canvas Claude Design "FleetBus — Thiết kế lại 3 app": https://claude.ai/artifact/Ai5drXHQWjV2oAvyY41PSY (riêng tư cho đến khi chia sẻ).
23 màn theo 4 hàng: hành khách đặt vé (PAX-004, 006, 008, 009, 011/012, 013, 015), hành khách sau đặt vé (PAX-016, 017, 018, 025), tài xế (DRI-002, 004, 006, 007/008, 012, 019, 017), điều hành (MGR-002, 003, 020, 023, 022). Các nút chính nối các màn với nhau để bấm thử theo luồng.
