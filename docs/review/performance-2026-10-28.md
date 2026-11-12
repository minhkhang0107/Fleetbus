# Đánh giá hiệu năng — 28/10/2026

Đo trên server thật (một tiến trình Node, CSDL SQLite mã hóa trên đĩa, nhánh `fix/market-readiness`). Máy khách giả chạy ở tiến trình riêng. Tài xế gửi vị trí 2 giây/lần qua `POST /driver/trips/{id}/telemetry`. Khách theo dõi xe bằng link chia sẻ (view `TICKET`: điểm đón, ETA riêng từng người).

## 1. 100 máy khách cùng theo dõi một xe

| Kịch bản | CPU server | Trễ từ lúc xe gửi vị trí tới máy khách | Gửi vị trí (tài xế) | Ghi chú |
|---|---|---|---|---|
| 100 SSE, dữ liệu gần trống | ~0,5 % | p50 1,0 s, p95 1,0 s | p50 17 ms | 1 giây là thời gian gộp cố ý (`STREAM_COALESCE_MS`) |
| 1.000 SSE, dữ liệu gần trống | ~3,5 % | p50 1,0 s, p95 1,04 s | p50 20 ms | ~0,9 MB/s ra ngoài (mỗi sự kiện ~1,6 KB, gửi lại cả danh sách trạm) |
| 100 SSE, 40.000 bản ghi | ~11 % | p50 1,0 s, p95 2,1 s | p50 175 ms | SSE không bị ảnh hưởng nhiều |
| 100 máy hỏi 10 s/lần (dự phòng khi mất SSE), gần trống | ~1,5 % | — | p50 17 ms | hỏi p50 1,6 ms |
| 100 máy hỏi 10 s/lần, 40.000 bản ghi | **~100 % (quá tải)** | — | **p50 11 s, p95 24 s** | hỏi p50 1,7 s, p95 18 s |

**Kết luận phần theo dõi:** cơ chế SSE (D141) tốt. 100 hay 1.000 người xem một xe không thành vấn đề khi server không bận việc khác. Vấn đề nằm ở chỗ khác (mục 2).

## 2. Điểm nghẽn: mỗi request lưu lại toàn bộ dữ liệu trong RAM

`apiServer.js` gọi `store.flush()` trước khi trả **mọi** câu trả lời, kể cả GET và `/health`. `StateStore.flush()` (`core/stateStore.js:91`) duyệt **mọi bản ghi của mọi nhà xe**, rồi `JSON.stringify` và băm SHA-256 từng bản ghi để tìm bản ghi đã đổi. Chi phí tăng tuyến tính theo tổng dữ liệu của cả nền tảng:

| Bản ghi (cả nền tảng) | 1 request bất kỳ | Trần thông lượng | RAM |
|---|---|---|---|
| ~0 | 1,3 ms | ~700 req/s | ~100 MB |
| 10.000 | 33 ms | ~30 req/s | — |
| 40.000 | 136 ms | ~7 req/s | ~450 MB |
| 100.000 | 367 ms | ~3 req/s | ~1 GB |

Mỗi thứ sau là một bản ghi: chuyến chạy của từng ngày (mỗi lịch × mỗi ngày, ở 3 nơi: catalog, điều hành, tài xế), vé, đơn, dòng nhật ký thao tác (không giới hạn), khóa idempotency (24 giờ), tin nhắn đi (tối đa 5.000). Một nhà xe nhỏ (10 lịch, ~100 vé/ngày) chạm **40.000 bản ghi trong vài tháng**. Nhiều nhà xe thì cộng dồn, vì `flush` quét chung.

**Trần ước tính ở 40.000 bản ghi (~7 req/s):** 20 xe đang chạy (0,2 req/s/xe vì app tài xế gửi vị trí 5 s/lần) cộng 100 app khách đang mở (hỏi lại 30 s/lần; màn vé QR 10 s/lần) đã vượt trần. Khi đó mọi thứ xếp hàng: gửi vị trí trễ hàng chục giây, nên khách thấy xe đứng yên dù SSE vẫn mở.

## 3. Cân bằng tải

- **Chỉ chạy được 1 tiến trình** (khóa `data/.lock`, mọi dữ liệu nằm trong RAM của tiến trình). Không thêm máy hay thêm tiến trình sau load balancer được, và `cluster` của Node cũng không dùng được.
- SSE dựa trên `EventEmitter` trong tiến trình (`trackingService.positionEvents`). Nếu chạy nhiều tiến trình, khách nối vào tiến trình khác với tiến trình nhận vị trí sẽ không nhận được gì. Khi đó cần pub/sub chung (Redis) hoặc định tuyến cố định theo chuyến.
- Hướng mở rộng sẵn có: CSDL đã tách theo nhà xe và `tenants.json` cho mỗi nhà xe một file riêng. Có thể chạy **mỗi nhóm nhà xe một tiến trình**, proxy định tuyến theo `X-Operator-Code` hoặc tên miền con. Phải tách dữ liệu dùng chung trước (danh sách nhà xe, tài khoản nhân viên, bến dùng chung trong CSDL nền tảng).
- Reverse proxy cho SSE: tắt buffering (server đã gửi `X-Accel-Buffering: no`), `proxy_read_timeout` > 20 s (server đẩy lại 20 s/lần), nên dùng HTTP/2 để trình duyệt không bị giới hạn 6 kết nối mỗi tên miền.
- **Giới hạn theo IP (D165) và NAT của nhà mạng:** điện thoại 4G ở Việt Nam đi sau CGNAT, nhiều khách dùng chung một IP. Giới hạn 10 lần xin OTP mỗi 10 phút mỗi IP có thể chặn khách thật giờ cao điểm. Nên tính theo IP + số điện thoại, và nâng ngưỡng theo IP.

## 4. Không đáng lo

- Sao lưu `VACUUM INTO`: 74 ms cho CSDL 23 MB (40.000 bản ghi). Có khóa tiến trình nhưng ngắn.
- Dựng view theo dõi cho từng khách: rẻ, 1.000 khách chỉ tốn ~3,5 % CPU.

## 5. Đề xuất, theo thứ tự

1. **Ngắn hạn (vài ngày), bắt buộc trước khi dữ liệu lớn:**
   - Không `flush` cho request chỉ đọc. Các GET có tạo dữ liệu (dựng chuyến trong ngày) thì đánh dấu cần lưu.
   - Gộp `flush` theo nhịp (ví dụ ≤ 2 lần/giây, câu trả lời chờ lần lưu kế tiếp, vẫn đảm bảo đã lưu trước khi trả lời).
   - Đánh dấu "bẩn" theo bộ sưu tập để không băm lại những bộ không đổi.
2. **Giữ dữ liệu nóng nhỏ:** chuyển chuyến đã kết thúc quá N ngày, vé và đơn cũ, nhật ký cũ ra khỏi RAM (vẫn trong SQLite, đọc khi cần).
3. **Trung hạn:** ghi thẳng theo bản ghi khi đổi (write-through), không quét toàn bộ. Về lâu dài truy vấn thẳng SQLite thay vì giữ mọi thứ trong RAM.
4. Giới hạn OTP theo IP + SĐT (CGNAT). Sự kiện SSE chỉ gửi phần thay đổi thay vì cả danh sách trạm (giảm băng thông ~3-5 lần).
5. Mở rộng ngang: tiến trình theo nhóm nhà xe (mục 3) hoặc chuyển dữ liệu dùng chung sang CSDL có máy chủ.

## Cách đo lại

Script ở thư mục tạm của phiên (không nằm trong repo): `server.mjs` (server thật + nạp N đơn/vé giả + 100 vé có link chia sẻ), `client.mjs <base> <pid> sse|poll <số máy> <giây>`, `steady.mjs` (đo 1 request ở trạng thái ổn định).

## 6. Sau khi sửa (D174)

Thay đổi:
- Request đọc (GET/HEAD) và gói GPS không còn ghi CSDL trước khi trả lời. Server đánh dấu "cần lưu", nhịp nền ghi 1 lần/giây. Dừng server (đóng, SIGINT/SIGTERM) và trước mỗi lần sao lưu đều ghi nốt phần còn lại.
- Request ghi (đặt vé, thanh toán, đổi dữ liệu) vẫn ghi xong mới trả lời.
- Giới hạn OTP: 60 lần/10 phút mỗi IP (khách sau NAT nhà mạng dùng chung IP), cộng 5 lần/10 phút mỗi số điện thoại.

| Bản ghi | 1 request đọc, trước → sau | 100 máy hỏi 10 s/lần | 100 máy SSE |
|---|---|---|---|
| 40.000 | 136 ms → **0,9 ms** | CPU 100 % → **18 %**; gửi vị trí 11 s → **0,9 ms**; hỏi p95 18 s → **24 ms** | CPU 12 %, trễ p95 1,07 s |
| 100.000 | 367 ms → **3,4 ms** | CPU **43 %**; hỏi p95 **257 ms** | CPU 28 %, trễ p95 1,56 s |

**Còn lại:**
- Nhịp ghi nền vẫn quét toàn bộ, mất ~350 ms mỗi giây ở 100.000 bản ghi, chặn tiến trình trong lúc đó (p95 257 ms).
- Request ghi vẫn tốn một lần quét toàn bộ.
- RAM ~650 MB ở 100.000 bản ghi.

Bước tiếp theo khi dữ liệu vượt ~50.000 bản ghi: đánh dấu thay đổi theo bản ghi (write-through) hoặc đưa dữ liệu cũ ra khỏi RAM (mục 5.2, 5.3).
