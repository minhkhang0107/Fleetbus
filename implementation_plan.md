# Kế Hoạch Triển Khai: Cải Tiến Cơ Chế Đón Khách Tận Nhà & Theo Dõi Xe (SPEC-HOME-PICKUP-TRACKING-V2)

Bản kế hoạch bẻ khóa các công việc nâng cấp cơ chế đón tận nhà, tính ETA động đa điểm và trực quan hóa bản đồ theo quyết định D159 và cuộc thảo luận kỹ thuật giữa Gemini & Claude.

> **MANDATORY RULE (.agents/AGENTS.md)**:
> Mỗi phase chỉ chứa tối đa 2–3 Atomic Tasks nhỏ. Không gom việc lớn vào 1 bước để tránh context drift. Chạy test và tạo Atomic Git Commit sau mỗi phase.

---

## Danh Sách Các Phase Triển Khai

### Phase 1: Backend ETA Engine & Threshold Refinement (2 Tasks)
- **Task 1.1: Tách biệt ngưỡng tiếp cận và ngưỡng tại cửa**
  - Files: [`source/server/core/homeRun.js`](file:///home/david/Documents/workspace/scripts/AI_tools/tools/FleetBus/source/server/core/homeRun.js), [`source/server/services/passenger/modules/tracking.js`](file:///home/david/Documents/workspace/scripts/AI_tools/tools/FleetBus/source/server/services/passenger/modules/tracking.js)
  - Nội dung: Tách biệt `HOME_NEAR_METERS = 300` (xe tiếp cận ngõ) và `HOME_AT_DOOR_METERS = 50` (xe thực sự trước cửa). Bổ sung cờ `near_door` và `at_door` vào payload trả về của `homeEta` và radar tracking.
  - Verification: Chạy `node --test test/server/tenant_driver.test.js` đảm bảo không breaking change.
- **Task 1.2: Nâng cấp Dynamic Queue ETA Engine & Hysteresis**
  - Files: [`source/server/core/homeRun.js`](file:///home/david/Documents/workspace/scripts/AI_tools/tools/FleetBus/source/server/core/homeRun.js)
  - Nội dung: Tính toán dồn thời gian theo hàng đợi `homeQueue`: cộng dồn thời gian di chuyển giữa các điểm + dwell time (3 phút/nhà) + thời gian khách trước xin thêm (`NEED_2`, `NEED_5`). Thêm cơ chế Hysteresis chống giật lùi ETA.
  - Verification: Viết test case độc lập kiểm tra phép tính dồn hàng đợi khi khách trước xin thêm 5 phút.

### Phase 2: Milestone Notification Engine (2 Tasks)
- **Task 2.1: Triển khai 4 mốc thông báo đón tận nhà (M1 $\to$ M4)**
  - Files: [`source/server/core/fleetBusEventBridge.js`](file:///home/david/Documents/workspace/scripts/AI_tools/tools/FleetBus/source/server/core/fleetBusEventBridge.js)
  - Nội dung: Tự động kích hoạt thông báo push/in-app cho từng khách theo 4 mốc:
    - M1 (T-30m / Xe khởi hành đi đón): Thông báo vị trí số thứ tự trong hàng đợi.
    - M2 (T-15m / Cự ly $\le 3\text{km}$): Nhắc chuẩn bị hành lý.
    - M3 (T-5m / Cự ly $\le 300\text{m}$): Báo xe sắp tới, mời ra cửa/điểm hẹn.
    - M4 (Tại cửa $\le 50\text{m}$): Xe đã tới, kích hoạt đếm ngược 5 phút chờ.
  - Verification: Giữ tính năng `sendNotificationOnce` tránh spam lặp lại cùng một mốc.
- **Task 2.2: Suite kiểm thử tự động Backend Home Pickup ETA & Milestones**
  - Files: `test/server/home_pickup_eta.test.js`
  - Nội dung: Tạo test suite mới kiểm thử trọn vẹn: tính ETA hàng đợi, cộng dồn dwell time khi khách xin thêm phút, bắn đúng các mốc thông báo M1–M4.
  - Verification: `npm test` pass 100%.

### Phase 3: Passenger App Smooth Movement & Live Countdown (2 Tasks)
- **Task 3.1: Client-Side Polyline Snap-to-Route & Smooth Interpolation**
  - Files: [`source/passenger/app/lib/src/presentation/passenger/passenger_route_map.dart`](file:///home/david/Documents/workspace/scripts/AI_tools/tools/FleetBus/source/passenger/app/lib/src/presentation/passenger/passenger_route_map.dart)
  - Nội dung: Bổ sung thuật toán chiếu vuông góc GPS lên tim đường (snap-to-polyline); nội suy chuyển động marker (AnimationController 8–10 FPS) dọc theo polyline; giữ nguyên góc bearing khi tốc độ $< 3\text{ km/h}$; dead-reckoning tối đa 15s khi rớt ping.
  - Verification: `flutter test` kiểm thử chuyển động marker và không xảy ra regression test bản đồ.
- **Task 3.2: Live Countdown Card & Visual Queue Indicator**
  - Files: [`source/passenger/app/lib/src/presentation/passenger/passenger_live_radar_screen.dart`](file:///home/david/Documents/workspace/scripts/AI_tools/tools/FleetBus/source/passenger/app/lib/src/presentation/passenger/passenger_live_radar_screen.dart)
  - Nội dung: Cải tiến widget `_Coming`: hiển thị thanh tiến trình trực quan ("Bạn là điểm đón 2/4 · 1 điểm trước bạn"), đồng hồ đếm ngược thời gian xe tới hoặc thời gian xe chờ tại cửa (5:00 $\to$ đỏ khi còn 1:00).
  - Verification: Chạy kiểm thử Flutter widget tests cho màn hình `passenger_live_radar_screen.dart`.

### Phase 4: Full Verification, Review & State Update (2 Tasks)
- **Task 4.1: Kiểm thử hồi quy toàn diện**
  - Commands: `npm test`, `npm run lint`, `cd source/passenger/app && flutter test`
  - Verification: Toàn bộ test suites xanh 100%, 0 lint errors.
- **Task 4.2: Cập nhật STATE.md & Báo cáo hoàn thành**
  - Files: [`STATE.md`](file:///home/david/Documents/workspace/scripts/AI_tools/tools/FleetBus/STATE.md)
  - Nội dung: Ghi nhận tiến độ hoàn thành SPEC-HOME-PICKUP-TRACKING-V2 và quyết định D159.
