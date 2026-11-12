# Rà soát chính sách Google Play — 29/10/2026

Gemini rà soát app khách và app tài xế theo chính sách Google Play 2026. Claude kiểm chứng từng mục trong code, sửa phần sai và triển khai các bản sửa (D175).

## 1. Điều khoản, chính sách quyền riêng tư, giấy phép đặt ở đâu

Không cần một màn "Cài đặt" riêng. Google Play chỉ yêu cầu chính sách quyền riêng tư **có trong app** và **có ở một URL công khai** (điền vào Play Console).

| Nơi | App khách | App tài xế |
|---|---|---|
| Màn đăng nhập | "Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư" (bấm mở được, không cần đăng nhập) | Như app khách |
| Cá nhân/Hồ sơ > Giới thiệu và điều khoản | Điều khoản sử dụng · **Chính sách quyền riêng tư** · Giấy phép mã nguồn mở · Giấy phép mô hình và dữ liệu | Như app khách |
| Cá nhân > Xóa tài khoản | Có (D169) | Không áp dụng: tài khoản do nhà xe tạo |
| Web công khai | `/legal/passenger/terms`, `/legal/passenger/privacy`, `/xoa-tai-khoan` | `/legal/driver/terms`, `/legal/driver/privacy` |

Giấy phép mã nguồn mở không bắt buộc theo Google, nhưng bắt buộc theo giấy phép của các thư viện (OFL, BSD, MIT…). Bản đồ đã ghi công OpenStreetMap trên bản đồ (ODbL).

## 2. Phát hiện và trạng thái

| ID | App | Mức | Vấn đề | Trạng thái |
|---|---|---|---|---|
| GP-01 | Khách | VI PHẠM | Xin `ACCESS_BACKGROUND_LOCATION`, iOS "Always", nhưng không dùng | **Đã sửa**: bỏ |
| GP-02 | Khách | VI PHẠM | Xin `CAMERA` (Android, iOS), không có tính năng dùng camera | **Đã sửa**: bỏ |
| GP-03 | Khách | NÊN | `ACCESS_WIFI_STATE` thừa | **Đã sửa**: bỏ |
| GP-04 | Cả hai | CẦN SỬA | Không có chính sách quyền riêng tư riêng, không có URL công khai (chỉ một đoạn trong điều khoản) | **Đã sửa**: chính sách cho từng app (dữ liệu thu thập, mục đích, bên nhận, lưu trữ, quyền theo NĐ 13/2023, xóa tài khoản, liên hệ), có trong app và ở URL công khai |
| GP-05 | Khách | CẦN SỬA | Không có trang web để yêu cầu xóa tài khoản khi đã gỡ app | **Đã sửa**: `/xoa-tai-khoan` (chọn nhà xe, SĐT, OTP, gõ XÓA) |
| GP-06 | Cả hai | CẦN SỬA | Màn đăng nhập không có dòng đồng ý điều khoản và chính sách | **Đã sửa** |
| GP-07 | Tài xế | VI PHẠM | Thông báo trước khi xin vị trí nền không nói "kể cả khi ứng dụng đóng hoặc không được sử dụng", không nói gửi cho ai, nút "Tiếp tục" | **Đã sửa**: đoạn công bố theo mẫu Play, nút Đồng ý / Không đồng ý; chuỗi iOS đồng bộ, bỏ chữ "telemetry, ETA" |
| GP-08 | Tài xế | CẦN SỬA | Thiếu `POST_NOTIFICATIONS`: Android 13+ ẩn thông báo của dịch vụ gửi vị trí | **Đã sửa**: khai báo và xin quyền trước khi chạy chuyến, từ chối không chặn chuyến |
| GP-09 | Tài xế | CẦN SỬA | Camera khai báo `required="true"`, máy không có camera không cài được dù có PIN dự phòng | **Đã sửa**: `required="false"` |
| GP-10 | Tài xế | CẦN LÀM Ở PLAY CONSOLE | Khai báo vị trí nền + video, khai báo dịch vụ chạy nền loại `location`, tài khoản thử cho người duyệt (App access) | Việc khi nộp |
| GP-11 | Tài xế | NÊN | App chỉ cho nhân viên: nên phát hành **riêng tư qua Managed Google Play**; nếu công khai thì ghi rõ "chỉ dành cho tài xế của nhà xe đối tác" và cấp tài khoản thử | Quyết định khi phát hành |
| GP-12 | Cả hai (iOS) | LỖI iOS | `Podfile` không bật macro nào của permission_handler, nên trên iOS camera, vị trí luôn bật và thông báo luôn trả "từ chối" mà không hỏi | **Đã sửa** (D176) |

Đã biết, để sau (cấu hình release): khóa ký bản release, `usesCleartextTraffic`/`NSAllowsArbitraryLoads`, tên biến địa chỉ server, GPS thật, dữ liệu và tài khoản demo. Người duyệt của Google có thể từ chối app nếu thấy nhà xe hoặc tài khoản ngân hàng mẫu (chính sách hành vi lừa dối), nên phải dọn trước khi nộp.

**Gemini sai:** bản nháp An toàn dữ liệu ghi app tài xế thu "Android ID" và "nhật ký crash". Code không có, nên đã bỏ khỏi bản dưới.

**Không vi phạm:**
- Vé xe là dịch vụ thực, phải thanh toán ngoài Google Play Billing (chuyển khoản, tiền mặt là đúng).
- `targetSdk` 36 (yêu cầu ≥ 35).
- Không có quyền SMS hay gọi điện; gọi tổng đài và 112 qua `tel:`.
- Không có nội dung do người dùng đăng công khai.
- Không quảng cáo, không AI.

## 3. Nháp khai báo An toàn dữ liệu (Data safety)

Chung: dữ liệu mã hóa khi truyền (cần bật HTTPS khi phát hành), không bán, không quảng cáo. Khách xóa được tài khoản (trong app và URL `/xoa-tai-khoan`).

**App khách:**

| Loại (Play) | Thu thập / Chia sẻ | Mục đích | Bắt buộc |
|---|---|---|---|
| Số điện thoại | Thu thập; chia sẻ với nhà xe, nhà cung cấp SMS | Tài khoản, chức năng, liên lạc | Có |
| Tên | Thu thập; chia sẻ với nhà xe | Chức năng (vé) | Có khi đặt vé |
| Địa chỉ | Thu thập; chia sẻ với nhà xe, tài xế | Chức năng (đón/trả tận nhà) | Không |
| Vị trí chính xác | Thu thập (khi app mở) | Chức năng (gợi ý điểm đón, ghim địa chỉ) | Không |
| Lịch sử mua hàng | Thu thập; chia sẻ với nhà xe | Chức năng, kế toán | Có khi đặt vé |
| Thông tin tài chính khác (STK nhận hoàn) | Thu thập; chia sẻ với nhà xe | Hoàn tiền | Không |
| Mã thiết bị (mã push FCM) | Thu thập; chia sẻ với Google FCM | Thông báo | Không |
| Tương tác trong app / nhật ký (IP, thời điểm) | Thu thập | Bảo mật, chống gian lận | Có |
| Ảnh | Không thu thập (ảnh QR chỉ lưu vào máy) | — | — |

**App tài xế:**

| Loại | Thu thập / Chia sẻ | Mục đích | Bắt buộc |
|---|---|---|---|
| Tên, số điện thoại, mã nhân viên | Thu thập (nhà xe nhập) | Tài khoản | Có |
| Vị trí chính xác, cả khi chạy nền | Thu thập; chia sẻ với nhà xe và hành khách của chuyến | Chức năng cốt lõi | Có trong ca |
| Tương tác trong app (quét vé, thu tiền, sự cố) | Thu thập | Chức năng, đối soát | Có |
| Camera | Không thu thập (QR xử lý trên máy) | — | — |

## 4. Trước khi nộp

- [ ] Điền URL chính sách (`https://<tên miền>/legal/passenger/privacy`, `/legal/driver/privacy`) và URL xóa tài khoản (`/xoa-tai-khoan`) vào Play Console. Đặt `FLEETBUS_PUBLIC_URL` đúng tên miền HTTPS.
- [x] Email liên hệ dữ liệu cá nhân: `mjnhkhang1@gmail.com` (đổi được bằng `FLEETBUS_PRIVACY_EMAIL`).
- [ ] Chốt nơi đặt máy chủ. Nếu ở ngoài Việt Nam, bổ sung đoạn chuyển dữ liệu ra nước ngoài theo NĐ 13/2023.
- [ ] App tài xế: khai báo vị trí nền + video ~30 giây (đi đón khách, khóa màn hình, vị trí vẫn cập nhật trên web điều hành), khai báo dịch vụ chạy nền `location`, tài khoản thử.
- [ ] Độ tuổi mục tiêu ≥ 16/18, không chọn trẻ em.
- [ ] Xong các mục cấu hình release và dọn dữ liệu demo.

## 5. Rà soát lại sau khi sửa iOS (D176)

Gemini rà lần 2 theo góc nhìn người duyệt Google Play và Apple (8 phát hiện). Claude kiểm chứng trong code và trong mã nguồn plugin (`~/.pub-cache`).

| ID | Vấn đề | Kết quả |
|---|---|---|
| RR-01 | App khách nhận iPad (`TARGETED_DEVICE_FAMILY = 1,2`) nhưng iPad chỉ xoay dọc, không có `UIRequiresFullScreen`: App Store chặn ngay lúc tải bản build lên | **Đã sửa**: `UIRequiresFullScreen` |
| RR-03 | Chính sách ghi "số điện thoại được che với tài xế", nhưng tài xế mở được số đầy đủ khi gọi đón tận nhà (D144, có ghi nhật ký) | **Đã sửa** câu trong chính sách (do Claude viết sai) |
| RR-04 | App tài xế thiếu `<queries>` cho `https` (Android 11+), mở link ngoài có thể không chạy | **Đã sửa** |
| RR-05 | `geolocator` vẫn biên dịch lệnh xin vị trí "luôn luôn" trong khi app khách đã bỏ chuỗi mô tả: Apple quét file nhị phân và cảnh báo hoặc từ chối | **Đã sửa**: `BYPASS_PERMISSION_LOCATION_ALWAYS=1` |
| RR-06 | App tài xế để ngôn ngữ phát triển là tiếng Anh | **Đã sửa**: `vi` |
| RR-08 | iOS tối thiểu 12.0: `gal` cần quyền đọc ảnh trên iOS < 14, và `firebase_messaging` của app khách cần iOS 15 nên bản cũ không qua được `pod install` | **Đã sửa**: app khách iOS 15.0, app tài xế iOS 14.0 (Podfile, Xcode, Flutter) |
| RR-02 | Thiếu `PrivacyInfo.xcprivacy` | **Không bắt buộc**: các plugin tự mang (firebase, shared_preferences…), code riêng của app không gọi API cần khai báo. Vẫn phải điền "App Privacy" trên App Store Connect, giống bảng mục 3 |
| RR-07 | App tài xế chỉ cho nhân viên: Apple có thể từ chối | Việc khi nộp: tài khoản demo trong App Review Notes, hoặc phát hành riêng (Apple Business Manager / Custom App) |

Thêm `test/mobile/ios_permissions.test.js`:
- Mỗi `Permission.xxx` dùng trong Dart phải có macro trong Podfile và chuỗi mô tả trong `Info.plist`.
- Không được có macro, chuỗi mô tả hay chế độ chạy nền thừa.
- Podfile, Xcode và Flutter phải cùng một phiên bản iOS tối thiểu.

Còn mở về iOS:
- Thông báo đẩy trên iPhone chưa cấu hình (`GoogleService-Info.plist`, entitlement `aps-environment`, khóa APNs trên Firebase). Không phải lý do bị từ chối: khách vẫn nhận SMS.
- Chưa build được trên máy Mac. Cần chạy `pod install`, build, thử từng hộp thoại xin quyền trên iPhone thật.
