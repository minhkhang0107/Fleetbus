# Kiểm thử full luồng 3 vai: 2 emulator + web điều hành (16/10/2026)

**Phạm vi:** tạo tài xế mới, điều xe, giữ chỗ tổng đài, đặt vé online, thanh toán VietQR, báo trễ, xuất bến, đón khách, kết thúc chuyến, lịch sử vé. Chạy trên thiết bị thật (emulator) với server thật, chỉ thao tác qua giao diện.
**Người chạy:** Claude đóng vai **hành khách**. Gemini (agy) đóng vai **điều hành** (web) và **tài xế** (app). Claude tự kiểm lại các lỗi Gemini báo bằng code hoặc ảnh chụp. Cột "Kiểm lại" ghi rõ lỗi nào chưa kiểm lại.
**Code:** nhánh `develop` tại `314ca23`, cộng với đợt dọn code thừa chưa commit (16/10). Đợt này **chỉ kiểm thử, không sửa code**.
**Ảnh chụp:** `e2e-2026-10-16/`.

## Môi trường

| Thành phần | Chi tiết |
|---|---|
| Server | `npm start`, DB SQLite mã hóa theo nhà xe, push Firebase bật (`FLEETBUS_FCM_SERVICE_ACCOUNT`) |
| App khách | emulator-5554 (Pixel 5), `vn.busgo.passenger.dev`, build lại debug flavor `develop` |
| App tài xế | emulator-5556 (Pixel 6), `vn.busgo.driver.dev`, build lại debug flavor `develop`, xe chạy giả lập |
| Web điều hành | `http://localhost:3000/manager`, Chrome headless qua CDP; tài khoản giám đốc (2FA), điều độ, thu ngân của Sao Mai |
| Thanh toán | Webhook VietQR IPN gửi tay thay ngân hàng |

## Luồng test và kết quả

| # | Bước | Vai / nơi chạy | Kết quả |
|---|---|---|---|
| 1 | Giám đốc tạo tài xế Tran Van Kiem (TXE2E1, hạng D), nhận PIN tạm hiện một lần | Điều hành / Web > Tài xế | Đạt |
| 2 | Điều độ gán xe 29B-888.22 (giường nằm 34) và TXE2E1 cho chuyến 14:00 Hà Nội → Thanh Hóa (`trp_hn_th_02_20261016`) | Điều hành / Web > Điều độ chuyến | Đạt. Lỗi: F11, F12 |
| 3 | Thu ngân giữ chỗ qua tổng đài cho Le Thi Hoa, ghế A01, trả tiền mặt khi lên xe (BG-RSV-123) | Điều hành / Web > Điều độ chuyến | Đạt. Lỗi: F2, F9, F10 |
| 4 | Tài xế đăng nhập bằng PIN tạm, bị buộc đổi PIN, đặt PIN mới | Tài xế / App | Đạt. Lỗi: F21 |
| 5 | Tài xế thấy chuyến hôm nay: 1 khách, 1 vé COD | Tài xế / App | Đạt. Lỗi: F13 |
| 6 | Khách đăng nhập OTP (mã tự điền ở server dev) | Khách / App | Đạt. Lỗi: F17 |
| 7 | Tìm chuyến hôm nay: thấy chuyến 14:00, còn 33 chỗ (A01 đang được giữ) | Khách / App | Đạt |
| 8 | Chọn điểm đón Giáp Bát. Sơ đồ 2 tầng: A01 hiện "người khác đang giữ". Chọn A05 (tầng dưới) và B04 (tầng trên), giữ ghế 10 phút | Khách / App | Đạt. Lỗi: F4 |
| 9 | Nhập tên, tạo mã VietQR 360.000 đ. Bấm "Tôi đã chuyển tiền" trước khi ngân hàng báo | Khách / App | Đạt (app báo chưa nhận tiền). Lỗi: F16 |
| 10 | Ngân hàng báo đã nhận (IPN). App chuyển sang "Đặt vé thành công", xin quyền thông báo, hiện vé QR và PIN dự phòng | Khách / App + webhook | Đạt. Lỗi: F3, F4 |
| 11 | Gửi link theo dõi xe cho người thân; mở link trên trình duyệt | Khách / App + trình duyệt | Đạt một phần. Lỗi: F15 |
| 12 | Điều hành thấy chuyến 2/34 đã bán, giữ 1; mục Đặt chỗ có BG-829527 đã trả 360.000 đ | Điều hành / Web | Đạt |
| 13 | Điều độ báo trễ chính thức 15 phút | Điều hành / Web | Đạt trên web. Lỗi: F5 |
| 14 | Tài xế kiểm tra xe 6/6, xuất bến | Tài xế / App | Đạt (xuất bến sớm hơn giờ chạy 2 tiếng mà không có cảnh báo, giống lần trước) |
| 15 | Tại Mỹ Đình: thu tiền COD cho A01 để cho lên xe | Tài xế / App | **Lỗi chặn**: F1, F2, F18 |
| 16 | Rời Mỹ Đình, xe chạy tới Giáp Bát. Khách nhận "Xe sắp tới" rồi "Xe đã tới điểm đón" | Tài xế + Khách | Đạt. Lỗi: F6, F7, F8 |
| 17 | Tại Giáp Bát: A05 lên bằng PIN, B04 không lên được bằng cùng PIN nên phải "Cho lên xe" thủ công | Tài xế / App | Đạt một phần. Lỗi: F3 |
| 18 | Bản đồ xe trên web: xe, tài xế Tran Van Kiem, tín hiệu trực tiếp | Điều hành / Web | Đạt. Lỗi: F7 |
| 19 | Khách xem xe trên bản đồ khi xe đang chạy | Khách / App | Đạt. Lỗi: F14 |
| 20 | Tài xế tới Thanh Hóa, trả khách, kết thúc chuyến, nộp 0 đ | Tài xế / App | Đạt |
| 21 | Tài xế đăng xuất, đăng nhập lại bằng PIN mới; PIN tạm cũ bị từ chối | Tài xế / App | Đạt |
| 22 | Điều hành thấy chuyến "Hoàn thành +15p", 2 đã lên xe; tài xế "Đang làm"; doanh thu có 360.000 đ | Điều hành / Web | Đạt. Lỗi: F19 |
| 23 | Khách: vé chuyển sang "Lịch sử", trạng thái "Đã đi" | Khách / App | Đạt. Lỗi: F14, F20 |

## Lỗi tìm thấy

"Kiểm lại" là cách Claude xác nhận lỗi. "Chưa kiểm lại" nghĩa là chỉ có Gemini báo, cần xem lại trước khi sửa.

| Mã | Mức | Lỗi | Nguyên nhân / vị trí | Người thấy | Kiểm lại |
|---|---|---|---|---|---|
| F1 | **Nghiêm trọng** | Thu tiền COD trên app tài xế luôn bị từ chối "Hình thức xử lý tiền thừa không hợp lệ", kể cả khi khách đưa đủ tiền. Khách trả tiền mặt không lên xe qua app được | App gửi `DEBT`/`CASH`/`WALLET` (`driver_cod_dialog.dart`), server chỉ nhận `REST_STOP_DEBT_RECEIPT`/`CASH_RETURNED`/`WALLET_CREDIT` (`driverService.js` `CHANGE_METHODS`) và kiểm cả khi không có tiền thừa. Test Flutter dùng API giả nên không bắt được | Gemini | Code, ảnh `drv-02` |
| F2 | **Cao** | Giữ chỗ tổng đài tính 220.000 đ trong khi chuyến bán 180.000 đ (khách online trả 180.000 đ/ghế) | `managerService.js` lấy `route.base_fare_vnd` (220.000) thay vì giá của chuyến/lịch chạy | Gemini | Code, ảnh `drv-02` |
| F3 | **Cao** | Đơn 2 ghế chỉ hiện **một** mã PIN dự phòng cho "ghế A05, B04", nhưng PIN chỉ đúng với ghế đầu. Tài xế nhập cho B04 bị báo "Mã PIN không đúng" | PIN tính theo từng vé; màn vé gộp hai ghế và hiện `t.pin` của một vé | Gemini | Ảnh `drv-03`, `pax-03` |
| F4 | Trung bình | Giờ đón sai và không thống nhất. Vé và màn thành công ghi "Đón Giáp Bát · 14:00", nhưng 14:00 là giờ xe rời Mỹ Đình. Màn chuyến ghi "khoảng 15:15". App tài xế cũng ghi Giáp Bát 15:15, trong khi Mỹ Đình đến Giáp Bát chỉ khoảng 30 phút | Giờ trạm chia đều theo tổng thời gian tuyến; vé lấy giờ khởi hành của chuyến thay vì giờ của điểm đón | Claude + Gemini | Ảnh `pax-03`, API chuyến |
| F5 | Trung bình | Báo trễ chính thức: không gửi push/SMS (khách chỉ thấy nếu mở app); trong app hiện 2 lần (mỗi ghế một lần); câu chữ có "Radar trực tiếp" (chữ kỹ thuật, trái D101); app tài xế vẫn ghi 14:00 | Loại thông báo trễ không có trong `OUTSIDE_APP_TYPES` (`messaging.js`) | Claude + Gemini | Outbox server, ảnh `pax-04` |
| F6 | Trung bình | "Xe sắp tới điểm đón" gửi 2 push giống nhau cùng một giây cho một số điện thoại; "Chào mừng lên xe" cũng tách theo ghế | Đợt sửa B2 (14/10) chỉ gộp loại "đã tới", chưa gộp "sắp tới" | Claude | Outbox server, ảnh `pax-04` |
| F7 | Trung bình | Tài xế rời trạm nhưng web vẫn ghi "Xe đang ở trạm" cho đến trạm sau | `DriverStore.leaveStop()` chỉ đổi trạng thái trong app, server không có API rời trạm | Gemini | Code |
| F8 | Trung bình | Khách giữ chỗ A01 không lên xe (do F1). Khi xe rời trạm, app tài xế báo "điều hành sẽ gọi cho họ", nhưng server tự nhả ghế (`NO_SHOW_RELEASED`). Khách biến khỏi danh sách và nhật ký chuyến không ghi gì | Câu báo trong app không khớp với `releaseExpiredHotlineHolds`; việc nhả ghế không ghi vào nhật ký | Gemini | Code |
| F9 | Trung bình | Chỗ giữ qua tổng đài không có danh sách để xem hay hủy sau khi thông báo nhanh biến mất; số tiền không hiện | | Gemini | Chưa kiểm lại |
| F10 | Trung bình | Thu ngân thấy và dùng được "Báo trễ chính thức", "Ngừng bán", "Hủy chuyến" | Phân quyền trên web | Gemini | Chưa kiểm lại |
| F11 | Trung bình | Điều độ chuyến lọc "Hôm nay" vẫn lẫn 3 chuyến mẫu ngày 28/08 | | Gemini | Chưa kiểm lại |
| F12 | Trung bình (cần quyết định) | Gán tài xế bằng D cho xe giường nằm 34 chỗ không có cảnh báo (bằng D tối đa 30 chỗ); tài xế đang "Chờ đổi PIN" vẫn gán được | Chưa có luật kiểm hạng bằng | Gemini | Chưa kiểm lại |
| F13 | Trung bình | Tài xế không xem được danh sách khách trước khi xuất bến (DRI-003 không có đường vào, DRI-007 chỉ mở sau xuất bến) | `driver_trip_detail_screen.dart` không được màn nào mở | Gemini | Code (đã thấy khi dọn code thừa) |
| F14 | Trung bình | Màn "Xe đang ở đâu" của khách: khi xe ở điểm cuối thì ghi "đang dừng nghỉ (dự kiến nghỉ 10 phút)"; sau khi kết thúc chuyến thì ghi "Chưa nhận tín hiệu… sẽ hiện khi xe bắt đầu chạy", trạng thái vẫn "Đã lên xe" | | Claude | Ảnh `pax-05`, `pax-07` |
| F15 | Trung bình | Link người thân: trang mở được, chữ đúng, nhưng bản đồ đứng ở Hà Nội và không thấy xe dù xe đã ở Thanh Hóa. Link dùng `10.0.2.2` vì server dev lấy theo host của app | Có thể do chụp bằng Chrome headless một lần; cần mở lại trên trình duyệt thật | Claude | Ảnh `pax-06` |
| F16 | Thấp | Bấm "Tôi đã chuyển tiền" khi tiền chưa về: dòng "Chưa nhận được tiền…" nằm dưới mép màn hình, phải cuộn mới thấy, nên trông như bấm không có tác dụng | `passenger_payment_processing_screen.dart` | Claude | Ảnh `pax-02` |
| F17 | Thấp | Banner ưu đãi đầu tiên ở trang chủ bị cắt chữ bên trái ("um vầy 2027") | | Claude | Ảnh màn trang chủ |
| F18 | Thấp | Bảng thu COD mặc định "khách đưa 500k" và "in biên lai nợ"; nút chọn số tiền cố định 220k/300k/500k, không nhập được số khác | `showCodSheet` | Gemini | Ảnh `drv-02` |
| F19 | Thấp | Nhật ký thao tác: không có dòng kết thúc chuyến; cột thao tác và đối tượng hiện mã kỹ thuật (`DRIVER_CREATE`, `drv_…`); nhật ký chuyến ghi mã trạm (`stp_hn_gb`); vẫn có cảnh báo chuỗi nhật ký bị đứt tại `aud_1791781584844_6` (đã có từ 14/10) | | Gemini | Ảnh `mgr-06` |
| F20 | Thấp | Tab "Sắp đi" gộp hai ghế vào một vé, còn "Lịch sử" tách thành hai thẻ | | Claude | Ảnh `pax-08` |
| F21 | Thấp | Màn đổi PIN bắt nhập lại PIN tạm vừa dùng để đăng nhập | | Gemini | Chưa kiểm lại |

## Đã kiểm, không phải lỗi

- **Không thấy push trên khay hệ thống ở bước 16:** server gửi FCM thành công (`SENT`). Lúc đó app đang mở nên thông báo hiện thành băng trong app, đúng thiết kế.
- **A01 bị nhả khi xe qua Mỹ Đình:** server chủ ý nhả chỗ giữ khi khách không lên xe. Lỗi thật là F1 (không thu được tiền) và F8 (câu báo, nhật ký).

## Chưa kiểm được trong đợt này

| Mục | Lý do |
|---|---|
| Thông báo đẩy lên khay khi app khách chạy nền | Sau khi đưa app ra nền, không còn sự kiện nào thuộc loại gửi ra ngoài app (xuống xe và kết thúc chuyến chỉ báo trong app). Lần 14/10 đã kiểm được |
| Thu COD thành công, tiền thừa, biên lai nợ, đối soát tiền mặt | Bị F1 chặn |
| Quét QR bằng camera | Emulator không có camera thật; đã dùng PIN |
| Khách vẫy, đổi xe khẩn cấp, đón tận nhà, GPS thật | Ngoài phạm vi lượt này |

## Kiểm tra tự động (trước khi chạy)

| Phần | Lệnh | Kết quả |
|---|---|---|
| Server | `npm test`, `npm run lint` | 495 test đạt, lint đạt |
| App khách | `flutter test`, `flutter analyze` | 57 test đạt, không có lỗi analyze |
| App tài xế | `flutter test`, `flutter analyze` | 38 test đạt, không có lỗi analyze |

## Dữ liệu thử đã tạo (dev DB của Sao Mai)

- Tài xế `TXE2E1` Tran Van Kiem (0912000155, bằng D hạn 31/12/2027), PIN `246810`, trạng thái "Đang làm".
- Chuyến `trp_hn_th_02_20261016` (14:00): gán xe 29B-888.22 và TXE2E1, báo trễ 15 phút, đã chạy sớm và kết thúc lúc 12:12.
- Vé BG-829527 (A05, B04, Nguyen Van An, 0987000444), đã trả 360.000 đ, trạng thái "Đã đi".
- Giữ chỗ BG-RSV-123 (A01, Le Thi Hoa, 0987000333) đã bị nhả (`NO_SHOW_RELEASED`).

## Đề xuất thứ tự sửa

1. F1, F2, F3: tiền và lên xe. Thêm test hợp đồng giữa app tài xế và server cho `change_settlement_method`.
2. F4, F5, F6, F7, F8, F14: giờ đón, thông báo, đồng bộ trạng thái.
3. Kiểm lại F9 đến F13 và F21 (Gemini báo) rồi sửa; F12 cần quyết định luật hạng bằng.
4. Các lỗi thấp còn lại.

---

# Sửa lỗi và kiểm thử lại (16/10/2026, chiều tối)

**Cách làm:** Claude chia việc, viết đề bài, đọc từng dòng diff và chạy test. Gemini (agy, model Flash) viết code theo 6 bước. Khi diff có chỗ thừa, chép lặp hay đi quá phạm vi (gán tài xế mẫu khi giữ chỗ, giá mã cứng, luật bằng lái viết hai nơi…), Claude trả về cho Gemini sửa. Quyết định nghiệp vụ ghi ở **D151** trong `decision-log.md`.
**Kiểm thử lại:** chuyến 19:30 `trp_hn_th_03_20261016` (giá 250.000 đ, khác giá tuyến 220.000 đ). Gemini đóng vai điều hành và tài xế, Claude đóng vai hành khách, trên 2 emulator với server và 2 app đã build lại.

| Mã | Sửa | Kiểm lại trên thiết bị | Ảnh |
|---|---|---|---|
| F1 | App gửi đúng mã hình thức trả tiền thừa của server; khách đưa đủ tiền thì không cần hình thức; test hợp đồng `TC-CLIENT-08` | **Đạt**: thu 250.000 đ, A01 lên xe | `sua-08` |
| F2 | Giá ghế lấy từ giá của chuyến (một nguồn); giữ chỗ, bán quầy, tiền COD đều theo đó | **Đạt**: giữ chỗ và COD đều 250.000 đ | `sua-02`, `sua-08` |
| F3 | Một PIN cho cả đơn; nhập một lần thì cả đơn lên xe | **Đạt**: "Đã lên xe 2 ghế: A05, B04" | `sua-05`, `sua-09` |
| F4 | Giờ trạm ước tính theo khoảng cách; vé hiện giờ tại điểm đón ("khoảng" khi ước tính) | Đạt bằng test (chuyến kiểm lại chỉ có 2 trạm) | — |
| F5 | Báo trễ gửi cả ra ngoài app, mỗi số một tin, có giờ mới; app tài xế hiện giờ trễ | **Đạt**: push lên khay khi app chạy nền, 1 tin; tài xế thấy "19:30 → 19:40 (trễ 10 phút)" | `sua-06`, `sua-07` |
| F6 | "Xe sắp tới", "Chào mừng lên xe" mỗi số một tin | Đạt ("Chào mừng" 1 tin cho A05, B04); "sắp tới" đạt bằng test (không có trạm giữa) | — |
| F7 | API rời trạm `/stops/{id}/depart`; web hiện "Đã rời HH:MM" | **Đạt**: "Bến xe Giáp Bát · Đã rời 18:02" | `sua-10` |
| F8 | Nhả chỗ giữ khi khách không lên: ghi nhật ký chuyến và nhật ký thao tác; cảnh báo trên app nói đúng | Đạt bằng test | — |
| F9 | Danh sách "Đang giữ qua tổng đài", hủy giữ chỗ, thông báo có số tiền | **Đạt** | `sua-02` |
| F10 | Thu ngân không thấy báo trễ, ngừng bán, hủy chuyến | **Đạt** | — |
| F11 | Không sửa: chuyến mẫu 28/08 cố ý hiện ở bản dev | — | — |
| F12 | Luật hạng bằng (D151) ở một chỗ trên server; web đánh dấu tài xế không hợp lệ | **Đạt**: "Bằng D chỉ lái xe tối đa 30 chỗ; xe 29B-888.22 có 35 chỗ (gồm lái)" | `sua-01` |
| F13 | Nút "Danh sách khách" xem trước khi xuất bến | **Đạt** | `sua-03` |
| F14 | Trạm của tuyến không bị coi là trạm nghỉ; chuyến xong hiện "Chuyến đã kết thúc", "Đã đi" | **Đạt** | `sua-12` |
| F15 | Trang người thân đặt xe và điểm đón lên bản đồ ngay khi mở; chuyến xong hiện trạng thái cuối | Đạt bằng test | — |
| F16 | "Chưa nhận được tiền" hiện ngay trên nút | **Đạt** | `sua-04` |
| F17 | Banner ưu đãi đầu tiên hiện đủ | **Đạt** | — |
| F18 | Bảng thu COD mặc định đúng giá vé, gợi ý theo giá, nhập được số khác | **Đạt** | `sua-08` |
| F19 | Nhật ký thao tác tiếng Việt, có dòng tài xế kết thúc chuyến kèm tiền nộp; nhật ký chuyến ghi tên trạm | **Đạt** | `sua-11` |
| F20 | Lịch sử gộp ghế theo đơn | **Đạt** | `sua-13` |
| F21 | Màn đổi PIN điền sẵn PIN tạm | Đạt bằng test | — |
| F22 (mới) | Vé nhiều ghế dùng mã QR nhóm của đơn (trước đây chỉ là QR của ghế đầu); đổi mã QR đổi cả nhóm | Đạt bằng test (emulator không quét/giải mã được QR) | — |
| F23 (mới, do bản sửa F7 gây ra, Gemini phát hiện khi kiểm lại) | Rời trạm không chuyển `current_stop_index` nên app tài xế quay lại trạm cũ; server nay chuyển sang trạm kế | Đạt bằng test; chưa chạy lại trên thiết bị vì hết chuyến trong ngày (lượt kiểm lại phải kết thúc sớm ở Sầm Sơn) | — |

## Kiểm tra tự động sau khi sửa

| Phần | Trước | Sau |
|---|---|---|
| Server `npm test`, `npm run lint` | 495 test | 516 test đạt, lint đạt |
| App khách `flutter test`, `flutter analyze` | 57 test | 66 test đạt, không có lỗi analyze |
| App tài xế `flutter test`, `flutter analyze` | 38 test | 46 test đạt, không có lỗi analyze |

## Còn lại

- Chạy lại cả chuyến nhiều trạm trên thiết bị để xác nhận F23, F4, F6 "xe sắp tới" (cần một chuyến có trạm giữa vào ngày mai).
- Thông báo sự cố (khác báo trễ) vẫn tách theo ghế và có mã chuyến trong câu chữ.
- Vé đã báo trễ vẫn ghi giờ đón cũ (19:30) ở màn vé khi mở lại app; thẻ tài xế và thông báo đã đúng giờ mới.
- Tên tuyến khác nhau giữa các màn ("Hà Nội — Thanh Hóa (Cao tốc)" trên web và "Hà Nội → Sầm Sơn VIP Limousine" trên app), đã ghi từ 14/10.
- Dữ liệu dev: sơ đồ ghế của các chuyến tạo trước bản sửa F2 vẫn giữ giá cũ 220.000 đ.
