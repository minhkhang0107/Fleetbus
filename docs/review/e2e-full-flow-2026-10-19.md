# Kiểm thử full luồng đặt vé và mã giảm giá (19/10/2026)

**Phạm vi:** đặt vé có mã giảm giá từ đầu đến cuối trên 2 emulator và web điều hành, với code tại `fa2c644` (mã giảm giá do nhà xe tạo D153, giữ đăng nhập, biển số trên vé, tài xế chọn chuyến). Server chạy bằng `make tailscale_server`, 2 app build bằng `make tailscale_apk` (gọi server qua địa chỉ Tailscale).
**Vai:** Claude là hành khách (emulator-5554, số 0987000777). Gemini (agy, Flash) là điều hành (web, Chrome headless) và tài xế (emulator-5556). Claude kiểm lại lời Gemini bằng code, API và ảnh. Đợt này **chỉ kiểm thử, không sửa code**.
**Chuyến:** `trp_hn_th_02_20261019`, 14:00 Bến xe Mỹ Đình → Bến xe Giáp Bát → Bến xe Phía Bắc Thanh Hóa, 180.000 đ, xe 29B-888.22, tài xế TXE2E1.
**Ảnh:** `e2e-2026-10-19/`.

## Luồng test và kết quả

| # | Bước | Vai | Kết quả | Ảnh |
|---|---|---|---|---|
| 1 | Giám đốc tạo mã `THU30`: giảm 30 %, tối đa 100.000 đ, đơn từ 300.000 đ, 5 lượt, 1 lượt/khách → "Đang dùng được", "0 / 5" | Điều hành | Đạt | `mgr-01` |
| 2 | Tạo trùng `THU30` → "Mã này đã có"; giảm 150 % → "Phần trăm giảm từ 1 đến 100" | Điều hành | Đạt | `mgr-02`, `mgr-03` |
| 3 | Tạo mã `SAPTOI` 20.000 đ, bắt đầu 20/10 → "Chưa bắt đầu" | Điều hành | Đạt | `mgr-01` |
| 4 | Điều độ gán xe 29B-888.22 và TXE2E1 cho chuyến 14:00; tài xế đăng nhập, thấy chuyến | Điều hành + Tài xế | Đạt | — |
| 5 | Khách đăng nhập OTP, tắt hẳn app rồi mở lại: vẫn đăng nhập (tab Cá nhân có số điện thoại, giữ ghế không hỏi OTP) | Khách | Đạt. Lỗi H1 | `pax-01` |
| 6 | Đơn 1 ghế A05, 180.000 đ: `BUSGO50K` → "Mã giảm giá không đúng"; `SAPTOI` → "Mã giảm giá chưa đến ngày áp dụng"; `THU30` → "Mã áp dụng cho đơn từ 300.000 đ" | Khách | Đạt | `pax-02`–`pax-04` |
| 7 | Thêm ghế A06 (360.000 đ), gõ `thu30` chữ thường → "Đã áp dụng: giảm 100.000 đ", dòng "Mã THU30 −100.000 đ", tổng 260.000 đ (30 % = 108.000 đ, chặn ở 100.000 đ) | Khách | Đạt | `pax-05` |
| 8 | VietQR 260.000 đ, ngân hàng báo có → BG-554135; màn thành công ghi "Xe 29B-888.22", "khoảng 14:09"; PIN 780 898 cho cả 2 ghế | Khách | Đạt | `pax-07` |
| 9 | Đơn mới cùng số điện thoại, ghế A07, A08, áp `THU30` → "Bạn đã dùng hết lượt của mã này" | Khách | Đạt | `pax-06` |
| 10 | Tạo đơn BG-866563 không mã rồi "Hủy đơn và nhả ghế": A07, A08 trống lại (tầng dưới 15 trống) | Khách | Đạt | — |
| 11 | Điều hành: `THU30` "1 / 5" (đơn đã hủy không tính); tắt `SAPTOI` → "Đang tắt" | Điều hành | Đạt | `mgr-04` |
| 12 | "Đặt chỗ": BG-554135 A05, A06 260.000 đ PAID; BG-866563 không có | Điều hành | Đạt. Lỗi H3 | `mgr-05` |
| 13 | Tài xế xuất bến, Mỹ Đình không có khách, rời trạm, tới Giáp Bát; PIN 780898 → "Đã lên xe 2 ghế: A05, A06" | Tài xế | Đạt | `drv-01` |
| 14 | Khách (app chạy nền) nhận "Xe sắp tới điểm đón", "Xe đã tới điểm đón", "Chào mừng quý khách lên xe!", mỗi loại 1 tin | Khách | Đạt | — |
| 15 | Tới Thanh Hóa, kết thúc ở bến cuối: 2 khách, nộp 0 đ (vé đã trả online); thẻ chuyến "Đã nộp 0 đ · 2 khách lên xe" | Tài xế | Đạt | `drv-02` |
| 16 | Tổng quan: doanh thu thuần tăng 260.000 đ (số thực thu sau giảm giá); nhật ký có tạo mã, tắt mã, gán xe, kết thúc chuyến | Điều hành | Đạt. Lỗi H2 | `mgr-06` |
| 17 | Khách: Lịch sử có BG-554135 "Đã đi · Ghế A05, A06 · Xe 29B-888.22" | Khách | Đạt | `pax-08` |

## Lỗi tìm thấy

| Mã | Mức | Lỗi | Nguyên nhân / vị trí | Người thấy | Kiểm lại |
|---|---|---|---|---|---|
| H1 | Thấp–Trung bình | Mở lại app khi đã đăng nhập, app vẫn hiện màn chào với nút "Đăng nhập bằng số điện thoại" và "Xem chuyến, đăng nhập sau". Phiên vẫn còn (bấm "Xem chuyến" là đã đăng nhập), nhưng khách dễ tưởng phải đăng nhập lại | `PassengerLaunchScreen._start` (`passenger_onboarding_screen.dart`) luôn chuyển sang `PassengerSplashScreen` khi đã chọn nhà xe, không xét đã đăng nhập | Claude | Code, ảnh `pax-01` |
| H2 | Thấp | Nhật ký thao tác hiện mã thô `VOUCHER_CREATE`, `VOUCHER_DEACTIVATE` | `AUDIT_ACTION_LABEL` trong `source/manager/web_dist/index.html` chưa có nhãn cho thao tác mã giảm giá | Gemini | Code, ảnh `mgr-06` |
| H3 | Thấp | "Đặt chỗ" chỉ có số tiền sau giảm (260.000 đ), không cho biết đơn dùng mã nào và giảm bao nhiêu; nhà xe không đối soát được mã giảm giá theo đơn | Đơn trong `managerService.bookings` không lưu mã và tiền giảm | Gemini | API `/ops/bookings` |

## Kiểm tra tự động

Không đổi so với `fa2c644` (đợt này không sửa code).

## Dữ liệu thử đã tạo (dev, Sao Mai)

- Mã `THU30` (đã dùng 1/5), `SAPTOI` (đang tắt).
- Đơn BG-554135 (A05, A06, Pham Thu Ha, 0987000777, 260.000 đ sau mã THU30), đã đi; đơn BG-866563 đã hủy.
- Chuyến `trp_hn_th_02_20261019` đã chạy sớm và kết thúc lúc 11:52, nộp 0 đ.

## Đề xuất sửa

1. H1: khi đã có phiên hợp lệ, màn khởi động vào thẳng trang chủ.
2. H2: thêm nhãn tiếng Việt cho các thao tác mã giảm giá (tạo, sửa, bật, tắt).
3. H3: lưu mã và tiền giảm trên đơn; "Đặt chỗ" hiện cột giảm giá (và giá gốc).

---

# Sửa lỗi và kiểm thử lại (19/10/2026, chiều)

**Cách làm:** Gemini (agy, Flash) sửa cả 3 lỗi trong một bước; Claude đọc diff, gọn lại phần lưu mã trên đơn (bỏ tham số trùng tên kiểu snake/camel và trường giá gốc không cần), chạy test, build lại app khách và kiểm trên emulator; Gemini kiểm lại web điều hành. Quyết định: **D154** trong `decision-log.md`.

| Mã | Sửa | Kiểm lại | Ảnh |
|---|---|---|---|
| H1 | Có phiên đăng nhập hợp lệ thì màn khởi động vào thẳng trang chủ; chưa đăng nhập vẫn qua màn chào | **Đạt**: mở lại app khi đã đăng nhập vào thẳng "Bạn muốn đi đâu?"; sau khi đăng xuất, mở lại hiện màn chào | `sua-01` |
| H2 | Nhãn tiếng Việt cho thao tác mã giảm giá; cột đối tượng hiện mã | **Đạt**: "Tạo mã giảm giá", "Bật mã giảm giá", "Tắt mã giảm giá", không còn `VOUCHER_…` | `sua-03` |
| H3 | Đơn hàng và đơn đặt chỗ lưu `voucher_code`, `discount_vnd`; "Đặt chỗ" hiện dòng giảm giá dưới số tiền | **Đạt**: đơn mới BG-724261 (số 0987000888, chuyến 19:30, 2 ghế 500.000 đ, mã THU30) hiện "400.000 đ · THU30 −100.000 đ"; THU30 "2 / 5"; đơn không mã không có dòng giảm giá. Đơn BG-554135 trả trước khi sửa không có dòng này (dữ liệu cũ) | `sua-02` |

## Kiểm tra tự động sau khi sửa

| Phần | Kết quả |
|---|---|
| Server `npm test`, `npm run lint` | 544 test đạt, lint đạt |
| App khách `flutter test`, `flutter analyze` | 75 test đạt, không lỗi analyze |
