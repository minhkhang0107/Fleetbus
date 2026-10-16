# Đặc tả đón / trả khách và theo dõi xe — bản áp dụng cho BusGo

| | |
|---|---|
| Nguồn | `docs/specs/intercity_pickup_dropoff_spec_v1_source.md` (bản gốc tiếng Anh, giữ nguyên văn) |
| Phạm vi | App hành khách, app tài xế, web điều hành, API server |
| Trạng thái | Đã triển khai MVP (2026-10-11) — xem mục 14 "Trạng thái triển khai" |
| Ngày | 2026-10-10 |

Tài liệu này là bản spec gốc **sau khi đối chiếu với sản phẩm đang có**. Chỗ nào spec gốc không hợp với sản phẩm hoặc với thực tế xe khách liên tỉnh ở Việt Nam thì đã được điều chỉnh, kèm lý do ở mục 2. Khi hai bản khác nhau, **bản này là bản được thực hiện**.

## 1. Mục tiêu

BusGo là phần mềm bán cho **từng nhà xe** (multi-tenant, dữ liệu mỗi nhà xe tách biệt). Mỗi nhà xe:

- cho khách đặt chỗ, chọn điểm đón và điểm trả, theo dõi xe đang ở đâu và bao lâu nữa tới đón mình;
- cho tài xế biết ai đón ở đâu, bao nhiêu khách ở mỗi điểm, và ghi nhận lên/xuống xe;
- cho văn phòng điều hành cấu hình tuyến, điểm dừng, vùng đón tận nhà, giữ chỗ qua tổng đài và theo dõi xe trên bản đồ;
- tự cấu hình các hình thức đón/trả mình hỗ trợ, không phải sửa code.

## 2. Các điểm điều chỉnh so với spec gốc

| # | Spec gốc | Điều chỉnh cho BusGo | Lý do |
|---|---|---|---|
| A1 | §13: hoãn thanh toán online | **Giữ** thanh toán VietQR theo tài khoản riêng của từng nhà xe (đã chạy). Trạng thái thanh toán tách khỏi trạng thái đặt chỗ đúng như §4.2 | Đã làm và đã kiểm trên máy thật; bỏ đi là lùi tính năng |
| A2 | §13: hoãn chọn ghế, dùng lại ghế theo chặng | **Giữ** chọn ghế và bán lại ghế theo chặng (đã chạy) | Khách xe giường nằm/cabin cần chọn chỗ; đã có |
| A3 | §6.2: chỉ hành khách của vé được xem xe | Chủ vé xem được; **người nhà xem qua link chia sẻ có mã bí mật riêng của từng vé**. Không có vé/mã thì chỉ thấy lộ trình và trạm, không thấy vị trí xe | Chủ sản phẩm muốn người nhà theo dõi được (quyết định 2026-10-10); link có mã bảo đảm không ai dò được vị trí xe |
| A4 | §3.1 HOME_PICKUP: đón tại địa chỉ khách | Đón tận nhà là **lượt đón trước giờ xuất bến trong vùng phục vụ của thành phố đi** (xe trung chuyển hoặc chính xe limousine). Mỗi địa chỉ được **gắn vào điểm dừng gần nhất phía trước trên tuyến** để tính chặng ghế; khách nhận **khung giờ đón** chứ không phải giờ chính xác. Trả tận nhà tương tự ở thành phố đến | Xe khách lớn không vào từng ngõ; nhà xe Việt Nam thường dùng xe trung chuyển. Tối ưu lộ trình đón nhiều nhà vẫn để sau như spec gốc |
| A5 | §5.1 trạng thái chuyến SCHEDULED/BOARDING/IN_PROGRESS/… | **Ánh xạ** trạng thái hiện có sang chuẩn mới ở API (trường `lifecycle_status`), **không đổi tên** trường đang dùng | Đổi tên sẽ làm app tài xế/khách đang chạy hiểu sai |
| A6 | §4.2 trạng thái đặt chỗ | Ánh xạ: chờ chuyển khoản → `PENDING`; đã thanh toán/đã xuất vé → `CONFIRMED`; đã hủy → `CANCELLED`; khách đã xuống xe hoặc chuyến xong → `COMPLETED`; vắng mặt → `NO_SHOW` | Như A5 |
| A7 | §10: WebSocket/SSE | MVP dùng **polling có backoff** (5–10 giây); SSE là bước sau | Hạ tầng hiện tại là một tiến trình Node; polling đủ cho xe khách và chạy tốt trên mạng yếu |
| A8 | §9: mô hình dữ liệu quan hệ, RouteVersion | Dữ liệu hiện ở bộ nhớ; **mỗi chuyến giữ bản chụp lộ trình riêng** (danh sách điểm dừng + giờ) nên sửa tuyến không làm đổi chuyến đã bán. Chuyển sang PostgreSQL/PostGIS khi lên production (spec v3) | Tránh viết lại toàn bộ lưu trữ trong MVP |
| A9 | §3.3: không coi khoảng cách đường chim bay là bằng chứng tới được | Thêm: nằm trong vùng phục vụ **cũng không** bảo đảm xe vào được; tài xế có thao tác **"Không vào được địa chỉ"** để báo điều hành | Thực tế ngõ hẹp, cấm giờ |
| A10 | §11: thời hạn lưu dữ liệu | Lịch sử GPS giữ **30 ngày**; địa chỉ nhà của khách **ẩn đi 7 ngày sau chuyến**; tài xế chỉ thấy địa chỉ/số điện thoại của khách thuộc chuyến mình, số điện thoại luôn che một phần | Cụ thể hóa yêu cầu "định nghĩa chính sách lưu" |
| A11 | §2.3 Platform Admin | Tài khoản quản trị nền tảng có **xác thực 2 bước**; khi xem dữ liệu một nhà xe phải chọn rõ nhà xe đó và **mọi thao tác đều được ghi nhật ký** | "Explicitly authorized and audited" |

## 3. Vai trò và quyền

| Vai trò | Được làm | Không được làm |
|---|---|---|
| Hành khách | Đăng nhập bằng mã nhà xe + số điện thoại; tìm chuyến; chọn đón tại bến hoặc tận nhà, trả tại bến hoặc tận nhà; đặt/hủy theo chính sách; xem vé, xe, ETA; nhận thông báo; chia sẻ link theo dõi | Xem thông tin, địa chỉ, số điện thoại của khách khác |
| Tài xế | Đăng nhập bằng mã nhà xe + mã NV + PIN; xem chuyến được giao, danh sách đón/trả theo điểm, địa chỉ đón tận nhà; xuất bến, tới trạm, cho lên xe, thu COD, báo vắng mặt, báo không vào được địa chỉ, báo sự cố; kết thúc chuyến | Xem chuyến không được giao |
| Điều hành viên (DISPATCHER) | Bảng điều độ, bản đồ xe, báo trễ, đổi xe, giữ chỗ qua tổng đài, cấu hình đón trả và vùng phục vụ, xem nhật ký của nhà xe mình | Bán vé quầy, duyệt hoàn tiền (thu ngân/giám đốc) |
| Thu ngân, Giám đốc vận hành | Như hiện có (bán vé quầy, hoàn tiền, báo cáo) | Dữ liệu nhà xe khác |
| Quản trị nền tảng | Tạo, sửa, tạm ngừng, kích hoạt nhà xe; lấy link + QR giới thiệu nhà xe; xem dữ liệu một nhà xe khi chọn rõ (có ghi nhật ký) | Thao tác không ghi nhật ký |

Mọi kiểm tra quyền thực hiện ở server. Bản ghi của nhà xe khác luôn trả **404** như không tồn tại.

## 4. Cấu hình dịch vụ của nhà xe

Mỗi nhà xe có `service_config`:

| Trường | Ý nghĩa |
|---|---|
| `pickup_modes` | Tập con của `FIXED_STOP` (đón tại điểm cố định), `HOME_PICKUP` (đón tận nhà) |
| `dropoff_modes` | Tập con của `FIXED_LOCATION` (trả tại điểm cố định), `HOME_DROPOFF` (trả tận nhà) |
| `allow_home_to_home` | Có cho phép vừa đón tận nhà vừa trả tận nhà trong cùng một vé |
| `approaching_threshold_minutes` | Báo khách khi ETA tới điểm đón còn ≤ N phút (mặc định 10) |
| `service_areas[]` | Vùng phục vụ: tên, loại (`PICKUP`/`DROPOFF`), đa giác toạ độ, phụ phí, thời gian đặt trước tối thiểu, giờ phục vụ, bật/tắt |

Quy tắc:
- Các chế độ bật/tắt độc lập. Phải còn ít nhất một chế độ đón và một chế độ trả.
- Địa chỉ đón/trả tận nhà phải nằm trong một vùng đang bật đúng loại; nếu nhiều vùng chứa điểm đó thì lấy vùng phụ phí thấp nhất.
- Kiểm tra thời gian đặt trước và giờ phục vụ dựa trên giờ xuất bến của chuyến, theo giờ Việt Nam.
- Mọi thay đổi cấu hình được kiểm tra hợp lệ và ghi nhật ký (trước/sau). Thay đổi **không** làm đổi các vé đã bán.

Mã lỗi trả về cho app: `MODE_DISABLED`, `OUTSIDE_SERVICE_AREA`, `LEAD_TIME_TOO_SHORT`, `OUTSIDE_SERVICE_HOURS`, `STOP_NOT_SERVED`.

## 5. Đặt chỗ

Luồng: tìm chuyến → chọn chuyến → chọn hình thức đón và trả (điểm cố định hoặc địa chỉ + ghim bản đồ) → server kiểm tra (còn chỗ, vùng phục vụ, điểm dừng thuộc chuyến, thời gian đặt trước) → giữ ghế 10 phút → chuyển khoản VietQR → xác nhận → vé xuất hiện trong danh sách của tài xế.

- Vé lưu **bản chụp** điểm đón/trả: hình thức, tên điểm hoặc địa chỉ, toạ độ, phụ phí, khung giờ đón.
- Đón tận nhà được gắn với điểm dừng cố định gần nhất phía trước trên tuyến để tính chặng ghế; trả tận nhà gắn với điểm dừng gần nhất phía sau.
- Phụ phí đón/trả tận nhà cộng vào tổng tiền đơn hàng.
- Giữ ghế, khóa ghế khi thanh toán và xác nhận là thao tác nguyên tử trên kho ghế, nên không bán trùng.
- Giữ chỗ qua tổng đài tạo **khách COD** trong danh sách của tài xế. Khi chuyến chưa chạy, chỗ giữ hết hạn theo thời gian. Khi chuyến đã chạy, chỗ được giữ tới khi xe rời điểm đón của khách; quá điểm đón mà khách không lên thì tự nhả ghế.

## 6. Vận hành của tài xế

### 6.1 Trạng thái

| Chuyến (hiện có → chuẩn) | Điểm dừng (hiện có → chuẩn) |
|---|---|
| `READY` → `SCHEDULED` | `PENDING` → `UPCOMING` |
| sau khi kiểm tra xe, trước xuất bến → `BOARDING` | xe còn ≤ ngưỡng ETA → `APPROACHING` |
| `IN_TRANSIT` → `IN_PROGRESS` | `ARRIVED` → `ARRIVED` |
| `COMPLETED` → `COMPLETED` | đã rời trạm → `COMPLETED` |
| hủy chuyến → `CANCELLED` | rời trạm mà không ghé → `SKIPPED` |

Server từ chối chuyển trạng thái sai thứ tự, ví dụ tới trạm khi chưa xuất bến, kết thúc khi chưa tới bến cuối mà không có lý do, hay cho lên xe hai lần.

### 6.2 Danh sách đón theo điểm

Mỗi điểm hiển thị: tên điểm, giờ dự kiến, ETA hiện tại, số khách xác nhận, đã lên, đã loại (hủy hoặc vắng), số khách xuống, và các địa chỉ đón tận nhà gắn với điểm đó. Mở một điểm thì chỉ thấy đúng thông tin cần để đón: ghế, tên, số điện thoại đã che, địa chỉ nếu đón tận nhà.

### 6.3 Lên / xuống xe

- Mỗi sự kiện lên xe, xuống xe, vắng mặt, sửa tay đều ghi: mã tài xế, thời điểm, chuyến, vé. Sửa tay được ghi nhật ký.
- Lên xe hai lần bị từ chối (`ALREADY_BOARDED`).
- Vắng mặt chỉ được đánh dấu sau thời gian chờ nhà xe quy định (mặc định 10 phút sau khi xe tới điểm).
- Tới điểm trả thì các khách xuống ở đó được ghi `alighted_at`; số khách còn trên xe giảm tương ứng.

## 7. Theo dõi xe

### 7.1 Gửi vị trí

Mỗi lần gửi gồm: chuyến, xe, toạ độ, thời điểm trên thiết bị, độ chính xác, tốc độ, hướng, **số thứ tự tăng dần**.
- Server bỏ qua bản tin cũ hơn bản đang có (theo số thứ tự hoặc thời điểm), nên dữ liệu gửi bù khi mất mạng không ghi đè vị trí mới.
- Gửi bù theo lô được sắp xếp và chỉ dùng để lưu lịch sử, không hiện như vị trí hiện tại.
- Tối đa 1 bản tin/giây/chuyến.

### 7.2 Ai được xem

- Chủ vé: xem xe của chuyến mình, từ lúc chuyến bắt đầu tới khi kết thúc.
- Người nhà: qua link chia sẻ có mã bí mật của vé (điều chỉnh A3).
- Tài xế: chuyến được giao. Điều hành: các chuyến của nhà xe mình.
- Chuyến đã kết thúc hoặc đã hủy thì ngừng trả vị trí.

### 7.3 ETA

API trả: thời điểm dự kiến tới, thời điểm tính, thời điểm vị trí cuối, độ tươi (`LIVE` < 60 s, `STALE` < 180 s, `OFFLINE`, `NO_SIGNAL`), cách tính (theo đường bộ hay đường chim bay). ETA tính theo quãng đường dọc lộ trình đã lưu. Khi tín hiệu cũ, app phải ghi rõ "vị trí có thể đã cũ, giờ đến chỉ là ước tính", không hiển thị như số liệu hiện tại.

## 8. Bản đồ

| Màn | Lớp mặc định | Ghi chú |
|---|---|---|
| Khách | Xe, điểm đón của mình, lộ trình, điểm trả | Không tải khách hay xe khác |
| Tài xế | Vị trí xe, lộ trình, các điểm còn lại kèm số khách mỗi điểm | Luôn có danh sách thay thế khi bản đồ không tải được |
| Điều hành | Xe của nhà xe, gom cụm khi nhiều xe, lọc theo trạng thái; bấm vào chuyến mới tải chi tiết | Không vẽ marker từng khách |

Kỹ thuật: nền OSM (máy chủ osm.fr vì tile.openstreetmap.org bị chặn ở Việt Nam), lộ trình lưu sẵn (không gọi API dẫn đường mỗi lần nhận vị trí), chỉ cập nhật marker khi có vị trí mới, có trạng thái đang tải/lỗi/mất mạng/tín hiệu cũ, ghi nguồn bản đồ theo giấy phép OSM.

## 9. Thông báo

Sự kiện: xác nhận hoặc hủy đặt chỗ; đổi tài xế hoặc đổi xe; xe sắp tới điểm đón (theo ETA còn tươi và ngưỡng của nhà xe, không chỉ theo khoảng cách); xe đã tới điểm đón; trễ giờ đáng kể; đổi điểm đón/trả; chuyến hủy hoặc hoàn thành. Mỗi loại gửi **một lần cho mỗi vé** (idempotent).

## 10. Dữ liệu

Mỗi bản ghi thuộc một nhà xe (`operator_id`). Thực thể chính: Nhà xe (kèm cấu hình dịch vụ và vùng phục vụ), Xe, Tài xế, Tuyến, Chuyến (bản chụp điểm dừng và giờ), Điểm dừng của chuyến, Đơn hàng/Vé (bản chụp đón/trả), Sự kiện lên/xuống xe, Vị trí xe, Thông báo, Sự cố, Nhật ký thao tác. Dữ liệu hiện ở bộ nhớ (điều chỉnh A8).

## 11. API chính

| Nhóm | Endpoint |
|---|---|
| Cấu hình công khai | `GET /api/v1/app/config?operator=CODE`, `GET /api/v1/service-config`, `POST /api/v1/service-areas/check` |
| Đặt chỗ | giữ ghế, tạo đơn với `pickup` / `dropoff` (hình thức, điểm hoặc địa chỉ + toạ độ) |
| Theo dõi | `GET /api/v1/trips/:id/tracking?ticket_id=…&share=…` |
| Tài xế | đăng nhập (`X-Operator-Code`), chuyến hôm nay, tới trạm, cho lên xe, thu COD, vắng mặt, báo sự cố, gửi vị trí (kèm số thứ tự) |
| Điều hành | `/api/v1/ops/...` (bảng điều độ, bản đồ, chuyến, kho ghế, giữ chỗ tổng đài, báo trễ, nhật ký, cấu hình đón trả, vùng phục vụ) |
| Nền tảng | `/api/v1/platform/operators` (tạo, sửa, kích hoạt, tạm ngừng), trang `/o/CODE` (link + QR) |

## 12. Bảo mật và riêng tư

Xác thực mọi endpoint có dữ liệu riêng; kiểm tra quyền và nhà xe ở server; giới hạn tần suất đăng nhập, đặt chỗ, gửi vị trí; che số điện thoại; địa chỉ nhà chỉ chủ vé và tài xế chuyến đó thấy; ghi nhật ký thao tác quản trị; thời hạn lưu theo điều chỉnh A10.

## 13. Phạm vi MVP

Như spec gốc §13, cộng thêm các phần đã có (A1, A2). Để sau: tối ưu lộ trình đón nhiều nhà, dự báo kẹt xe, ETA học máy, đánh giá/khách hàng thân thiết, chuyến nhiều chặng, phân tích đội xe nâng cao, kênh SSE/WebSocket.

## 14. Trạng thái triển khai

Cập nhật 2026-10-11. Kiểm chứng bằng test tự động (`npm test`: 361 test; app tài xế 19, app hành khách 27) và chạy thử trên tablet tài xế, server thật, web điều hành.

| Tiêu chí nghiệm thu (spec gốc §14) | Trạng thái | Kiểm chứng |
|---|---|---|
| 1. Bật đón tận nhà / điểm cố định độc lập | Xong | `test/server/service_areas.test.js`; màn "Cấu hình đón trả" trên web |
| 2. Không đặt được đón ngoài vùng phục vụ | Xong | `service_areas.test.js`, `home_booking.test.js` (422 `OUTSIDE_SERVICE_AREA`) |
| 3. Không đặt được điểm không thuộc chuyến | Xong (có từ trước) | test kho ghế |
| 4. Không bán quá chỗ khi đặt đồng thời | Xong (có từ trước) | `spec_conformance_inventory.test.js` |
| 5. Vé đã xác nhận nằm đúng danh sách của tài xế | Xong, kể cả vé giữ qua tổng đài và đón tận nhà | `ops_fixes.test.js`, `home_booking.test.js`; tablet tài xế hiện "Đón tận nhà 05:45–06:30: địa chỉ · ghi chú" |
| 6. Tài xế thấy số khách theo điểm đón | Xong (đón, đã lên, đã loại, đón tận nhà, trả) | `trip_operations.test.js` |
| 7. Chỉ người có quyền thấy xe | Xong | `tracking_privacy.test.js`, `tracking_route.test.js` |
| 8. Vị trí mới hiện lên không cần tải lại màn | Xong (polling) | web điều hành, app hành khách, trang `/t/` |
| 9. Phân biệt tín hiệu cũ với trực tiếp | Xong (`freshness`: LIVE/STALE/OFFLINE/NO_SIGNAL) | `tracking_privacy.test.js` |
| 10. Từ chối lên xe trùng và chuyển trạng thái sai | Xong (`ALREADY_BOARDED`, `STOP_OUT_OF_ORDER`, xuất bến cần kiểm tra xe, kết thúc giữa đường cần lý do) | `trip_operations.test.js` |
| 11. Mất mạng không ghi đè dữ liệu mới bằng dữ liệu cũ | Xong (số thứ tự GPS, bản tin quá 120 s chỉ lưu lịch sử) | `tracking_privacy.test.js`; app tài xế gửi `seq` |
| 12. Thay đổi quản trị đúng phạm vi nhà xe | Xong | `service_areas.test.js`, `platform_admin.test.js` |
| 13. Bật/tắt lớp bản đồ độc lập | Xong trên web điều hành | ảnh chụp màn "Bản đồ xe" |
| 14. Danh sách thay thế khi bản đồ lỗi | Xong (web điều hành, app tài xế) | `app_test.dart` (tài xế) |
| 15. Không lộ thông tin khách cho người không có quyền | Xong (số điện thoại che, địa chỉ nhà chỉ chủ vé và tài xế chuyến thấy, link chia sẻ không có tên/số) | `tracking_privacy.test.js` |
| 16. Ghi nhật ký các chuyển trạng thái quan trọng | Xong (nhật ký chuyến: xuất bến, tới trạm, bỏ qua trạm, lên xe, vắng mặt, xuống xe, kết thúc; nhật ký thao tác quản trị) | `trip_operations.test.js`; web "Nhật ký chuyến" |

Đã làm thêm: thao tác "Không vào được địa chỉ" của tài xế (A9: báo khách kèm điểm hẹn, cảnh báo điều hành, ghi nhật ký chuyến); gán xe và tài xế cho chuyến theo ngày; giờ từng điểm dừng do nhà xe nhập hoặc ước tính theo lộ trình.

Chưa làm (để sau, đúng phạm vi §13): tối ưu lộ trình đón nhiều nhà và xe trung chuyển riêng; thông báo đổi tài xế/đổi xe đã có từ trước nhưng thông báo "đổi điểm đón" chưa có; trạng thái trạm `APPROACHING` mới dùng cho thông báo, chưa hiện trong danh sách trạm; lưu trữ PostgreSQL và xóa dữ liệu theo thời hạn A10.
