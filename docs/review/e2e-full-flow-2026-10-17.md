# Kiểm thử full luồng 3 vai trên chuyến nhiều trạm (17/10/2026)

**Phạm vi:** web điều hành, app tài xế, app hành khách trên emulator, chạy một chuyến 3 trạm từ đầu đến cuối với code tại `3ac1f81` (sau D151). Mục tiêu thêm: xác nhận trên thiết bị những bản sửa ngày 16/10 mới chỉ được kiểm bằng test (F4, F6, F23).
**Vai:** Claude là hành khách (emulator-5554). Gemini (agy, Flash) là điều hành (web, Chrome headless) và tài xế (emulator-5556). Claude kiểm lại lời Gemini bằng API, outbox và code.
**Chuyến:** `trp_hn_th_02_20261017`, 14:00 Bến xe Mỹ Đình → Bến xe Giáp Bát → Bến xe Phía Bắc Thanh Hóa, giá 180.000 đ, xe 29B-888.22 (giường nằm 34), tài xế TXE2E1 (bằng E). Đợt này **chỉ kiểm thử, không sửa code**.
**Ảnh:** `e2e-2026-10-17/`.

## Luồng test và kết quả

| # | Bước | Vai | Kết quả | Ảnh |
|---|---|---|---|---|
| 1 | Điều độ gán xe 29B-888.22 và tài xế TXE2E1; bảng trạm ghi Giáp Bát 14:09 (ước tính theo khoảng cách) | Điều hành | Đạt | `mgr-01` |
| 2 | Thu ngân giữ A01 cho Le Thi Hoa, trả tiền mặt khi lên xe, đón ở Mỹ Đình: thông báo "BG-RSV-125 · A01 · 180.000 đ · hạn 13:30", có trong danh sách giữ chỗ | Điều hành | Đạt | `mgr-02` |
| 3 | Tài xế đăng nhập, xem "Danh sách khách" trước khi xuất bến: A01, COD 180.000 đ | Tài xế | Đạt. Lỗi G1 | `drv-01`, `drv-02` |
| 4 | Khách xem chuyến khi chưa đăng nhập; danh sách ghi "14:09 Giáp Bát"; chọn A05 (tầng dưới), B04 (tầng trên); bấm giữ ghế thì app mới hỏi đăng nhập OTP, ghế vẫn được giữ | Khách | Đạt | `pax-01` |
| 5 | Màn xác nhận ghi "Đón khoảng 14:09 Giáp Bát"; mã giảm giá sai báo "Mã không hợp lệ hoặc đã hết hạn."; bật bảo hiểm +20.000 đ, tổng 380.000 đ | Khách | Đạt | `pax-02` |
| 6 | VietQR 380.000 đ, ngân hàng báo có (IPN); đặt vé thành công BG-651293; vé ghi "Giáp Bát · khoảng 14:09", PIN 448 125 "dùng cho cả ghế A05, B04" | Khách | Đạt. Lỗi G2 | `pax-03` |
| 7 | Tài xế kiểm tra xe 6/6, xuất bến | Tài xế | Đạt | — |
| 8 | Tại Mỹ Đình: thu COD A01, khách đưa 200.000 đ, trả lại 20.000 đ tiền mặt; A01 lên xe | Tài xế | Đạt | `drv-03` |
| 9 | Khách vẫy tại Mỹ Đình: bán ghế A02, thu 180.000 đ, đơn `BG-HAIL-246` kênh `DRIVER_HAIL` | Tài xế | Đạt một phần. Lỗi G3 | `drv-04` |
| 10 | Rời Mỹ Đình: app chạy tiếp tới trạm 2/3 Giáp Bát, không quay lại trạm cũ; web ghi "Đã rời 11:27" | Tài xế + Điều hành | **Đạt (F23 đã xác nhận trên thiết bị)** | `mgr-03` |
| 11 | App khách ở chế độ nền: nhận đúng 1 push "Xe sắp tới điểm đón… ghế A05, B04", rồi đúng 1 push "Xe đã tới điểm đón" | Khách | **Đạt (F6 đã xác nhận trên thiết bị)** | — |
| 12 | Tại Giáp Bát: nhập PIN 448125 cho A05 → "Đã lên xe 2 ghế: A05, B04" | Tài xế | Đạt | `drv-05` |
| 13 | Rời Giáp Bát; bản đồ xe trên web: 29B-888.22, Tran Van Kiem, trực tiếp; điều độ ghi 4 đã bán, 4 đã lên; nhật ký chuyến ghi tên trạm | Điều hành | Đạt | `mgr-04` |
| 14 | Tới Thanh Hóa, trả 4 khách, kết thúc chuyến: COD 180.000 đ + khách vẫy 180.000 đ = nộp 360.000 đ | Tài xế | Đạt. Lỗi G4 | `drv-06` |
| 15 | Nhật ký thao tác: "Kết thúc chuyến · 14:00 17-10 · nộp 360.000 đ"; Tổng quan: doanh thu thuần tăng 560.000 đ | Điều hành | Đạt một phần. Lỗi G5 | `mgr-05` |
| 16 | Khách: "Xe đang ở đâu?" ghi "Chuyến đã kết thúc", trạng thái "Đã đi"; Lịch sử có BG-651293 gộp "Ghế A05, B04"; thông báo trong app mỗi loại 1 tin | Khách | Đạt. Lỗi G6 | `pax-04`, `pax-05` |

## Bản sửa 16/10 được xác nhận thêm trên thiết bị

| Mã | Trước (chỉ kiểm bằng test) | Hôm nay |
|---|---|---|
| F4 | Giờ trạm ước tính theo khoảng cách | Giáp Bát 14:09 trên danh sách chuyến, màn xác nhận, vé, web |
| F6 | "Xe sắp tới" mỗi số một tin | 1 push "sắp tới", 1 push "đã tới" (outbox server và khay thông báo) |
| F23 | Rời trạm chuyển sang trạm kế | Rời Mỹ Đình → chạy tới Giáp Bát → Thanh Hóa, không quay lại |
| F1 nhánh tiền thừa | Thu đủ tiền | Khách đưa 200.000 đ, trả lại 20.000 đ tiền mặt: đạt |

## Lỗi tìm thấy

| Mã | Mức | Lỗi | Nguyên nhân / vị trí | Người thấy | Kiểm lại |
|---|---|---|---|---|---|
| G5 | **Trung bình** (tiền) | Ghế giữ qua tổng đài đã thu tiền mặt trên xe (BG-RSV-125, 180.000 đ) không thành đơn, nên không vào "Đặt chỗ" và doanh thu (tổng quan chỉ tăng 560.000 đ = 380.000 online + 180.000 khách vẫy). Tiền nộp về bến thì đúng 360.000 đ, nên báo cáo doanh thu lệch tiền thu thực | Thu COD cho chỗ giữ tổng đài chỉ đánh dấu lên xe; khách vẫy thì tạo đơn `DRIVER_HAIL` | Claude | API `/ops/bookings` |
| G3 | Thấp–Trung bình | Bảng "Khách vẫy" không có ô "khách đưa" và tiền thối (spec FLOW-04 có "đưa tiền thối nếu có"); nút cố định "Đã thu 180.000 đ"; chỉ hiện 6 ghế trống đầu tiên. Tên và số điện thoại không bắt buộc theo spec nên không tính là lỗi | `driver_cod_dialog.dart` (`freeSeats.take(6)`) | Gemini | Code |
| G1 | Thấp | Thẻ chuyến mới trên "Chuyến hôm nay" ghi "Đã nộp 250.000 đ · 0 khách lên xe", là tiền của chuyến hôm qua | `endedCash` trong `DriverStore` không được xóa khi mở chuyến khác | Gemini | Code, ảnh `drv-02` |
| G4 | Thấp | Màn kết thúc chuyến hiện cảnh báo "Kết thúc trước bến cuối. Lý do: Den Ben xe Sam Son" (lý do của lượt chạy hôm qua) dù xe đã tới bến cuối | `earlyEndReason` trong `DriverStore` không được xóa | Gemini | Code |
| G2 | Thấp | Màn "Đặt vé thành công" ghi "Xe: Nhà xe sẽ báo" dù chuyến đã có xe 29B-888.22 | App dùng dữ liệu chuyến lấy lúc tìm kiếm, trước khi điều độ gán xe | Claude | — |
| G6 | Thấp | Mở lại vé sau khi chuyến kết thúc: nhãn ở góc vẫn "Đã lên xe" (màn theo dõi thì đúng "Đã đi") | Màn vé không đọc trạng thái chuyến | Claude | — |

## Kiểm tra tự động

Không đổi so với `3ac1f81`: server 516 test, app khách 66, app tài xế 46, lint và analyze không lỗi.

## Dữ liệu thử đã tạo (dev, Sao Mai)

- Chuyến `trp_hn_th_02_20261017` đã chạy sớm và kết thúc lúc 11:32, nộp 360.000 đ.
- BG-651293 (A05, B04, Nguyen Van An, 0987000444, 380.000 đ có bảo hiểm), đã đi.
- BG-RSV-125 (A01, Le Thi Hoa, 0987000333) đã thu tiền mặt và lên xe; BG-HAIL-246 (A02, khách vẫy).

## Đề xuất sửa

1. G5: khi thu tiền chỗ giữ tổng đài, tạo đơn (kênh tổng đài, đã thu tiền mặt) để vào doanh thu và đối soát.
2. G3: bảng khách vẫy dùng chung phần "khách đưa / tiền thối" với bảng thu COD; hiện đủ ghế trống.
3. G1, G4: xóa trạng thái của chuyến cũ khi tài xế mở chuyến khác. G2, G6: đọc lại chuyến hoặc vé từ server trước khi hiện.

---

# Sửa lỗi và kiểm thử lại (17/10/2026, chiều)

**Cách làm:** Gemini (agy, Flash) sửa theo 2 bước, Claude đọc diff và chạy test. Claude tự viết lại hàm `COD_COLLECTED` (bản của Gemini làm mất việc ghi "đã thanh toán" cho đơn COD có sẵn) và gộp phần tìm biển số xe đang bị viết hai nơi.
**Kiểm lại:** chuyến 19:30 `trp_hn_th_03_20261017` (Giáp Bát → Sầm Sơn, 250.000 đ). Gemini đóng vai điều hành và tài xế, Claude đóng vai khách, trên emulator với server và app đã build lại.

| Mã | Sửa | Kiểm lại trên thiết bị | Ảnh |
|---|---|---|---|
| G5 | Thu tiền chỗ giữ tổng đài thì tạo đơn kênh `POS_HOTLINE` (đã trả, theo giá ghế), không cộng hai lần; đơn COD có sẵn vẫn ghi đã trả | **Đạt**: "Đặt chỗ" có BG-RSV-440 A01 250.000 đ PAID; doanh thu tăng 500.000 đ trong chuyến (250.000 tổng đài + 250.000 khách vẫy), khớp tiền tài xế nộp | `sua-07` |
| G3 | Bảng khách vẫy dùng chung phần "Khách đưa / tiền thừa" với bảng thu COD; hiện đủ ghế trống | **Đạt**: 31 ghế trống, bán B10, khách đưa 500.000 đ, trả lại 250.000 đ | `sua-03`, `sua-04` |
| G1 | Số tiền "Đã nộp" chỉ hiện trên chuyến đã kết thúc | **Đạt**: thẻ chuyến 19:30 chưa chạy không có "Đã nộp"; sau khi kết thúc: "Đã nộp 500.000 đ · 4 khách lên xe" | `sua-01`, `sua-06` |
| G4 | Xóa lý do kết thúc sớm khi mở chuyến khác; không cảnh báo khi đã ở bến cuối | **Đạt** | `sua-05` |
| G2 | Vé đã thanh toán mang biển số xe của chuyến lúc thanh toán | **Đạt**: khách tìm chuyến khi chưa có xe, đặt sau khi gán xe, màn thành công ghi "Xe: 29B-888.22" | `sua-02` |
| G6 | Vé của chuyến đã xong ghi "Đã đi" | **Đạt** | `sua-08` |

Cũng kiểm lại trong lượt này: thu COD có tiền thừa bằng biên lai nợ (`DR-…-50K`, 50.000 đ) và một PIN cho 2 ghế A05, A06, đều đạt.

## Kiểm tra tự động sau khi sửa

| Phần | Trước | Sau |
|---|---|---|
| Server `npm test`, `npm run lint` | 516 | 519 đạt, lint đạt |
| App khách `flutter test`, `flutter analyze` | 66 | 68 đạt, không lỗi analyze |
| App tài xế `flutter test`, `flutter analyze` | 46 | 49 đạt, không lỗi analyze |
