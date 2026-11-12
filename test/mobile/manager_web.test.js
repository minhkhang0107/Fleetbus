import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase Manager Web: Flutter Web Platform & Dashboard Integrity Test Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const managerDir = path.join(rootDir, 'source/manager');
  const webIndexPath = path.join(managerDir, 'app/web/index.html');
  const webManifestPath = path.join(managerDir, 'app/web/manifest.json');
  const mainDartPath = path.join(managerDir, 'app/lib/main.dart');
  const colorsDartPath = path.join(managerDir, 'resources/lib/src/theme/app_colors.dart');
  const serviceDartPath = path.join(managerDir, 'app/lib/src/service/manager_api_service.dart');
  const presDir = path.join(managerDir, 'app/lib/src/presentation/manager');

  it('TC-MGR-WEB-01: Manager Web index.html and manifest.json must exist with Canvaskit & Geist fonts', () => {
    assert.ok(fs.existsSync(webIndexPath), 'Manager web/index.html must exist');
    assert.ok(fs.existsSync(webManifestPath), 'Manager web/manifest.json must exist');

    const html = fs.readFileSync(webIndexPath, 'utf8');
    assert.ok(html.includes('BusGo Operations Control Center'), 'Title must be BusGo Operations Control Center');
    assert.ok(html.includes('Geist'), 'Must load Geist font');
    assert.ok(html.includes('canvaskit'), 'Must configure canvaskit renderer');
  });

  it('TC-MGR-WEB-02: Manager Flutter Web entry point must instantiate BusGoManagerWebApp with ManagerColors', () => {
    assert.ok(fs.existsSync(mainDartPath), 'Manager main.dart must exist');
    const content = fs.readFileSync(mainDartPath, 'utf8');

    assert.ok(content.includes('BusGoManagerWebApp'), 'Must instantiate BusGoManagerWebApp');
    assert.ok(content.includes('ManagerWebShell'), 'Must contain ManagerWebShell');
  });

  it('TC-MGR-WEB-03: ManagerColors must declare enterprise slate and cyan palette matching DESIGN.md', () => {
    assert.ok(fs.existsSync(colorsDartPath), 'Manager app_colors.dart must exist');
    const content = fs.readFileSync(colorsDartPath, 'utf8');

    assert.ok(content.includes('0xFF0B0F17'), 'Canvas bgDark #0B0F17 must be defined');
    assert.ok(content.includes('0xFF06B6D4'), 'Cyan accent #06B6D4 must be defined');
    assert.ok(content.includes('0xFF10B981'), 'Emerald safe #10B981 must be defined');
  });

  it('TC-MGR-WEB-04: ManagerApiService must implement all operations endpoints (KPIs, Radar, POS, Swap, Reports)', () => {
    assert.ok(fs.existsSync(serviceDartPath), 'manager_api_service.dart must exist');
    const content = fs.readFileSync(serviceDartPath, 'utf8');

    assert.ok(content.includes('/ops/dashboard/kpis'), 'KPI endpoint must be defined');
    // Canonical paths of api-screen-map; the exact set is checked by test/mobile/api_client_contract.test.js
    assert.ok(content.includes('/ops/fleet/live-positions'), 'Radar endpoint must be defined');
    assert.ok(content.includes('/ops/pos/orders'), 'POS booking endpoint must be defined');
    assert.ok(content.includes('/replace-vehicle'), 'Replace vehicle endpoint must be defined');
    assert.ok(content.includes('/ops/reports/yield'), 'Executive reports endpoint must be defined');
  });

  it('TC-MGR-WEB-05: The Manager Web screen files must exist (9 of the 30 MGR screens; the 21 missing are listed in docs/review/phase-B-findings.md)', () => {
    const requiredFiles = [
      'manager_login_screen.dart',
      'manager_dashboard_screen.dart',
      'manager_radar_map_screen.dart',
      'manager_dispatch_screen.dart',
      'manager_pos_booking_screen.dart',
      'manager_emergency_swap_screen.dart',
      'manager_fleet_roster_screen.dart',
      'manager_reports_screen.dart',
      'manager_web_shell.dart'
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(presDir, file);
      assert.ok(fs.existsSync(fullPath), `Manager screen ${file} must exist`);
    }
  });

  it('TC-MGR-WEB-06: Dart syntax hygiene check — No JS triple equals (===) and No async Future in manager app', () => {
    const checkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.dart')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.ok(!content.includes('==='), `File ${entry.name} must not contain JavaScript === operator`);
          assert.ok(!content.includes('async Future'), `File ${entry.name} must not contain invalid async Future declaration`);
        }
      }
    };
    checkDir(path.join(managerDir, 'app/lib'));
  });

  it('TC-MGR-WEB-07: Manager Tactical Design Anti-Pattern check — Zero picture emojis in presentation screens', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const entries = fs.readdirSync(presDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.dart')) {
        const content = fs.readFileSync(path.join(presDir, entry.name), 'utf8');
        assert.ok(
          !emojiRegex.test(content),
          `Screen ${entry.name} violates design guidelines: contains picture emoji characters.`
        );
      }
    }
  });

  it('TC-MGR-WEB-08: Manager Web Distribution must exist and match BusGo Operations Control Center', () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    assert.ok(fs.existsSync(webDistPath), 'source/manager/web_dist/index.html must exist');
    const content = fs.readFileSync(webDistPath, 'utf8');
    assert.ok(content.includes('BusGo Operations') || content.includes('BusGo Manager'), 'Must contain BusGo Operations title');
  });

  it('TC-MGR-WEB-09: Manager Web Distribution must support Company Profile and Platform Operator Editing (MGR-036)', () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    assert.ok(fs.existsSync(webDistPath), 'source/manager/web_dist/index.html must exist');
    const content = fs.readFileSync(webDistPath, 'utf8');

    // HTML contains the company panel
    assert.ok(content.includes('data-panel="company"'), 'HTML must contain the company panel');
    assert.ok(content.includes('data-view="company"'), 'HTML must contain company nav button');

    // PATCH /api/v1/ops/company call
    assert.ok(
      content.includes('/api/v1/ops/company') && content.includes("method: 'PATCH'"),
      'HTML must contain PATCH /api/v1/ops/company call'
    );

    // Platform PATCH call
    assert.ok(
      content.includes('/api/v1/platform/operators/') && content.includes("method: 'PATCH'"),
      'HTML must contain platform operators PATCH call'
    );

    // No longer contains op_saomai: 'admin@busgo.vn'
    assert.ok(
      !content.includes("op_saomai: 'admin@busgo.vn'"),
      'HTML must no longer contain hardcoded op_saomai director email'
    );
  });

  it('TC-MGR-WEB-10: Manager Web Distribution must support Payment Settings & Settlement Cockpit (MGR-037, MGR-038)', () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    assert.ok(fs.existsSync(webDistPath), 'source/manager/web_dist/index.html must exist');
    const content = fs.readFileSync(webDistPath, 'utf8');

    // payments panel and nav button exist
    assert.ok(content.includes('data-panel="payments"'), 'HTML must contain the payments panel');
    assert.ok(content.includes('data-view="payments"'), 'HTML must contain payments nav button');

    // form is built from credential_fields (no hardcoded 'webhook_secret' input in HTML)
    assert.ok(!content.includes('<input name="webhook_secret"'), 'Must not have hardcoded webhook_secret input in HTML');
    assert.ok(content.includes('credential_fields'), 'Form must be generated from credential_fields');

    // calls to /ops/payment-settings
    assert.ok(content.includes('/api/v1/ops/payment-settings'), 'Must call /api/v1/ops/payment-settings');

    // calls to /payment-settings/test
    assert.ok(content.includes('/api/v1/ops/payment-settings/test'), 'Must call /api/v1/ops/payment-settings/test');

    // calls to /ops/pending-payments
    assert.ok(content.includes('/api/v1/ops/pending-payments'), 'Must call /api/v1/ops/pending-payments');

    // confirm-payment
    assert.ok(content.includes('confirm-payment'), 'Must call confirm-payment');

    // bank-transactions assign
    assert.ok(content.includes('/api/v1/ops/bank-transactions') && content.includes('/assign'), 'Must call bank-transactions assign');
  });

  it('TC-MGR-WEB-11: Manager Web Distribution must list and process refund requests in the payments panel (MGR-022)', () => {
    const content = fs.readFileSync(path.join(managerDir, 'web_dist/index.html'), 'utf8');
    assert.ok(content.includes('id="refundsBox"'), 'payments panel must hold the refund list');
    assert.ok(content.includes('/api/v1/ops/refunds?status='), 'Must call GET /api/v1/ops/refunds');
    assert.ok(content.includes('/process`'), 'Must call refunds process');
    assert.ok(content.includes('Sao chép STK'), 'Refund list must include Sao chep STK button');
    assert.ok(content.includes('api.vietqr.io'), 'Refund list must render VietQR image for destination account');
  });

  it('TC-MGR-WEB-12: Manager Web Distribution must support Staff Accounts Management panel (MGR-038)', () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    assert.ok(fs.existsSync(webDistPath), 'source/manager/web_dist/index.html must exist');
    const content = fs.readFileSync(webDistPath, 'utf8');

    // staff panel and nav button exist
    assert.ok(content.includes('data-panel="staff"'), 'HTML must contain the staff panel');
    assert.ok(content.includes('data-view="staff"'), 'HTML must contain staff nav button');

    // Director-only role in NAV_PERMISSIONS
    assert.ok(/staff:\s*\[['"]DIRECTOR['"]\]/.test(content), 'Staff nav view must require DIRECTOR');

    // calls to /api/v1/ops/staff
    assert.ok(content.includes('/api/v1/ops/staff'), 'Must call /api/v1/ops/staff');
    assert.ok(content.includes('/reset-password'), 'Must call reset-password');
  });

  it('TC-MGR-WEB-13: Manager Web Distribution must support Station and Route Builder forms (MGR-011)', () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    assert.ok(fs.existsSync(webDistPath), 'source/manager/web_dist/index.html must exist');
    const content = fs.readFileSync(webDistPath, 'utf8');

    // Forms present
    assert.ok(content.includes('id="stationForm"'), 'HTML must contain stationForm');
    assert.ok(content.includes('id="routeForm"'), 'HTML must contain routeForm');
    assert.ok(content.includes('Thêm bến/điểm đón'), 'HTML must contain "Thêm bến/điểm đón"');
    assert.ok(content.includes('Tạo tuyến mới'), 'HTML must contain "Tạo tuyến mới"');

    // Calls to /api/v1/ops/stations and /api/v1/ops/routes
    assert.ok(content.includes('/api/v1/ops/stations'), 'Must call /api/v1/ops/stations');
    assert.ok(content.includes('/api/v1/ops/routes'), 'Must call /api/v1/ops/routes');
  });

  it('TC-MGR-WEB-14: Manager Web Distribution must support Cash Handover Settlement card (H-02)', () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    assert.ok(fs.existsSync(webDistPath), 'source/manager/web_dist/index.html must exist');
    const content = fs.readFileSync(webDistPath, 'utf8');

    assert.ok(content.includes('id="cardCashHandovers"'), 'HTML must contain cardCashHandovers');
    assert.ok(content.includes('id="cashHandoversBox"'), 'HTML must contain cashHandoversBox');
    assert.ok(content.includes('/api/v1/ops/cash-handovers?'), 'Must call GET /api/v1/ops/cash-handovers');
    assert.ok(content.includes('/api/v1/ops/cash-handovers/') && content.includes('/confirm'), 'Must call cash-handovers confirm');
    assert.ok(content.includes('Nộp tiền cuối chuyến'), 'Must display "Nộp tiền cuối chuyến"');
  });

  it('TC-MGR-WEB-15: Manager Web api() must use AbortController timeout and return unresponsive server message', () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    assert.ok(fs.existsSync(webDistPath), 'source/manager/web_dist/index.html must exist');
    const content = fs.readFileSync(webDistPath, 'utf8');

    const apiFn = content.slice(content.indexOf('async function api('), content.indexOf('async function publicApi('));
    assert.ok(apiFn.includes('AbortController'), 'api() must use AbortController');
    assert.ok(
      apiFn.includes('Máy chủ không phản hồi. Kiểm tra mạng rồi thử lại.'),
      'api() must return unresponsive server message on abort'
    );
  });

  it('TC-MGR-WEB-16: a tab that failed for lack of network loads again when the browser is back online (D178)', () => {
    const content = fs.readFileSync(path.join(managerDir, 'web_dist/index.html'), 'utf8');
    const listener = content.slice(content.indexOf("window.addEventListener('online'"), content.indexOf('function stopTimers()'));
    assert.ok(listener.includes('state.missedLoad'), 'only a tab that missed a load is reloaded');
    assert.ok(listener.includes('show(state.view)'), 'the current tab loads again');
  });

  it('TC-MGR-WEB-17: Manager Web menu has 4 categorized groups and NAV_PERMISSIONS maps views to capability permissions', () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    const content = fs.readFileSync(webDistPath, 'utf8');

    // 4 group titles in navigation
    assert.ok(content.includes('VẬN HÀNH'), 'Menu must contain group VẬN HÀNH');
    assert.ok(content.includes('PHÒNG VÉ & THU NGÂN'), 'Menu must contain group PHÒNG VÉ & THU NGÂN');
    assert.ok(content.includes('ĐỘI XE & TUYẾN'), 'Menu must contain group ĐỘI XE & TUYẾN');
    assert.ok(content.includes('QUẢN TRỊ'), 'Menu must contain group QUẢN TRỊ');

    // NAV_PERMISSIONS: bookings requires BOOKINGS_VIEW, payments requires PAYMENTS or REFUNDS, staff requires DIRECTOR
    assert.ok(
      /bookings:\s*\[[^\]]*'BOOKINGS_VIEW'[^\]]*\]/.test(content),
      'NAV_PERMISSIONS.bookings must include BOOKINGS_VIEW'
    );
    assert.ok(
      /payments:\s*\[[^\]]*'PAYMENTS'[^\]]*\]/.test(content),
      'NAV_PERMISSIONS.payments must include PAYMENTS'
    );
    assert.ok(
      /staff:\s*\[[^\]]*'DIRECTOR'[^\]]*\]/.test(content),
      'NAV_PERMISSIONS.staff must require DIRECTOR'
    );
  });

  it('TC-MGR-WEB-18: Manager Web helper functions fmtDate, fmtDateLong, fmtTime, and roleLabel in Vietnam timezone', async () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    const content = fs.readFileSync(webDistPath, 'utf8');
    const vm = await import('vm');

    // Extract helper functions section from index.html (from VN_WEEKDAYS to api definition)
    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'index.html must have an inline script');

    const helpersCode = scriptMatch[1].slice(
      scriptMatch[1].indexOf('const esc ='),
      scriptMatch[1].indexOf('async function api(')
    );

    const ctx = {
      console,
      crypto,
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    };
    vm.createContext(ctx);
    vm.runInContext(helpersCode, ctx);

    // fmtDate & timezone test
    assert.strictEqual(ctx.fmtDate('2026-11-09T07:00:00+07:00'), '09/11/2026');
    assert.strictEqual(ctx.fmtDate('2026-11-09T00:00:00.000Z'), '09/11/2026');
    assert.strictEqual(ctx.fmtDateLong('2026-11-09T07:00:00+07:00'), 'Thứ Hai, 09/11/2026');
    assert.strictEqual(ctx.fmtTime('2026-11-09T07:00:00+07:00'), '07:00');

    // roleLabel tests: friendly Vietnamese names, no raw role codes
    assert.strictEqual(ctx.roleLabel('FLEET_DIRECTOR'), 'Giám đốc điều hành');
    assert.strictEqual(ctx.roleLabel('DISPATCHER'), 'Điều độ viên');
    assert.strictEqual(ctx.roleLabel('CASHIER'), 'Thu ngân');
    assert.strictEqual(ctx.roleLabel('FINANCIAL_CONTROLLER'), 'Kế toán');
    assert.strictEqual(ctx.roleLabel('PLATFORM_ADMIN'), 'Quản trị nền tảng');
    assert.strictEqual(ctx.roleLabel('UNKNOWN_CODE'), 'Nhân viên');
    assert.notStrictEqual(ctx.roleLabel('FLEET_DIRECTOR'), 'FLEET_DIRECTOR');

    // STATUS_LABELS tests
    const statusLabels = vm.runInContext('STATUS_LABELS', ctx);
    assert.strictEqual(statusLabels.SCHEDULED, 'Chờ chạy');
    assert.strictEqual(statusLabels.DISPATCHED, 'Đã điều');
    assert.strictEqual(statusLabels.READY, 'Sẵn sàng');
    assert.strictEqual(statusLabels.IN_TRANSIT, 'Đang chạy');
    assert.strictEqual(statusLabels.COMPLETED, 'Đã đến');
    assert.strictEqual(statusLabels.CANCELLED, 'Đã hủy');
    assert.strictEqual(statusLabels.PAID, 'Đã thanh toán');
    assert.strictEqual(statusLabels.UNPAID_COD, 'Trả khi lên xe');
    assert.strictEqual(statusLabels.PARTIALLY_CANCELLED, 'Hủy một phần');

    // paymentLabel tests
    assert.strictEqual(ctx.paymentLabel({ payment_status: 'PAID' }), 'Đã thanh toán');
    assert.strictEqual(ctx.paymentLabel({ payment_status: 'UNPAID_COD' }), 'Trả khi lên xe');
    assert.strictEqual(ctx.paymentLabel({ status: 'PARTIALLY_CANCELLED' }), 'Hủy một phần');
    assert.strictEqual(ctx.paymentLabel({ payment_status: 'UNKNOWN' }), 'Khác');
  });

  it('TC-MGR-WEB-19: Dispatch board Step 3 — 4 tabs, getDefaultTripTab, board URL always includes date, and filterTrip', async () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    const content = fs.readFileSync(webDistPath, 'utf8');
    const vm = await import('vm');

    // 1. 4 tab đúng tên
    assert.ok(content.includes('data-tab="manifest">Khách</button>'), 'Tab Khách must be declared');
    assert.ok(content.includes('data-tab="route">Lộ trình & bản đồ</button>'), 'Tab Lộ trình & bản đồ must be declared');
    assert.ok(content.includes('data-tab="sales">Bán vé & tổng đài</button>'), 'Tab Bán vé & tổng đài must be declared');
    assert.ok(content.includes('data-tab="audit">Nhật ký</button>'), 'Tab Nhật ký must be declared');

    // 2. URL board luôn có date=
    assert.ok(
      content.includes('/api/v1/ops/dispatch/board?date=') ||
      /api\/v1\/ops\/dispatch\/board\?date=/.test(content),
      'Dispatch board URL must always include ?date='
    );

    // 3. Extract and evaluate helper functions in vm
    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'index.html must have an inline script');

    const helpersCode = scriptMatch[1].slice(
      scriptMatch[1].indexOf('const esc ='),
      scriptMatch[1].indexOf('async function api(')
    );

    const ctx = {
      console,
      crypto,
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    };
    vm.createContext(ctx);
    vm.runInContext(helpersCode, ctx);

    // getDefaultTripTab follows permissions; covered in TC-MGR-WEB-22.

    // isTripUnassigned(t)
    assert.strictEqual(ctx.isTripUnassigned({ vehicle_plate: null, driver_name: 'Phạm A' }), true);
    assert.strictEqual(ctx.isTripUnassigned({ vehicle_plate: '29B-12345', driver_name: null }), true);
    assert.strictEqual(ctx.isTripUnassigned({ vehicle_plate: '29B-12345', driver_name: 'Phạm A' }), false);

    // filterTrip(t, filterId)
    assert.strictEqual(ctx.filterTrip({ vehicle_plate: null, driver_name: 'Phạm A' }, 'unassigned'), true);
    assert.strictEqual(ctx.filterTrip({ vehicle_plate: '29B-12345', driver_name: 'Phạm A' }, 'unassigned'), false);
    assert.strictEqual(ctx.filterTrip({ status: 'SCHEDULED' }, 'upcoming'), true);
    assert.strictEqual(ctx.filterTrip({ status: 'IN_TRANSIT' }, 'upcoming'), false);
    assert.strictEqual(ctx.filterTrip({ status: 'IN_TRANSIT' }, 'in_transit'), true);
    assert.strictEqual(ctx.filterTrip({ status: 'COMPLETED' }, 'completed'), true);
    assert.strictEqual(ctx.filterTrip({ status: 'CANCELLED' }, 'completed'), true);
    assert.strictEqual(ctx.filterTrip({ status: 'COMPLETED' }, 'all'), true);

    // countTripFilters
    const sampleTrips = [
      { trip_id: 't1', vehicle_plate: null, driver_name: null, status: 'SCHEDULED' },
      { trip_id: 't2', vehicle_plate: '29B-1', driver_name: 'TX 1', status: 'IN_TRANSIT' },
      { trip_id: 't3', vehicle_plate: '29B-2', driver_name: 'TX 2', status: 'COMPLETED' }
    ];
    const counts = ctx.countTripFilters(sampleTrips);
    assert.strictEqual(counts.all, 3);
    assert.strictEqual(counts.unassigned, 1);
    assert.strictEqual(counts.upcoming, 1);
    assert.strictEqual(counts.in_transit, 1);
    assert.strictEqual(counts.completed, 1);
  });

  it('TC-MGR-WEB-20: Overview & Bookings Step 4 — Filter, search diacritics, money format, safe phone & drawer', async () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    const content = fs.readFileSync(webDistPath, 'utf8');
    const vm = await import('vm');

    // 1. UI Elements existence
    assert.ok(content.includes('id="overviewTripsBody"'), 'Overview left column for today trips must exist');
    assert.ok(content.includes('id="overviewTodoActions"'), 'Overview right column for todo actions must exist');
    assert.ok(content.includes('id="bookingSearch"'), 'Bookings search input must exist');
    assert.ok(content.includes('id="bookingDateBtns"'), 'Bookings date filter buttons must exist');
    assert.ok(content.includes('id="bookingStatusFilter"'), 'Bookings status dropdown must exist');
    assert.ok(content.includes('id="bookingsBody"'), 'Bookings table body must exist');
    assert.ok(content.includes('id="bookingDrawer"'), 'Booking detail drawer must exist');
    assert.ok(content.includes('id="bdOpenTripBtn"'), 'Button to jump from booking to dispatch must exist');

    // 2. Extract and evaluate helper functions in vm
    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'index.html must have an inline script');

    const helpersCode = scriptMatch[1].slice(
      scriptMatch[1].indexOf('const esc ='),
      scriptMatch[1].indexOf('async function api(')
    );

    const ctx = {
      console,
      crypto,
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    };
    vm.createContext(ctx);
    vm.runInContext(helpersCode, ctx);

    // 3. renderPhone(phone): Masked phone with * must NOT produce tel: link
    const maskedPhoneHtml = ctx.renderPhone('0912***456');
    assert.ok(!maskedPhoneHtml.includes('tel:'), 'Masked phone must not have tel: link');
    assert.ok(!maskedPhoneHtml.includes('<a '), 'Masked phone must not be wrapped in an <a> tag');
    assert.ok(maskedPhoneHtml.includes('0912***456'), 'Masked phone must display original text');

    const fullPhoneHtml = ctx.renderPhone('0912345678');
    assert.ok(fullPhoneHtml.includes('href="tel:0912345678"'), 'Unmasked phone must produce tel: link');

    const emptyPhoneHtml = ctx.renderPhone(null);
    assert.ok(emptyPhoneHtml.includes('—'), 'Empty phone must show dash');

    // 4. removeVietnameseDiacritics: Normalization & stripping accents
    assert.strictEqual(ctx.removeVietnameseDiacritics('Nguyễn Tiến Dũng'), 'nguyen tien dung');
    assert.strictEqual(ctx.removeVietnameseDiacritics('Đà Lạt'), 'da lat');
    assert.strictEqual(ctx.removeVietnameseDiacritics('Hà Nội — Thanh Hóa'), 'ha noi — thanh hoa');
    assert.strictEqual(ctx.removeVietnameseDiacritics(''), '');

    // 5. formatBookingMoney: Correct total, refund, and COD owed calculations
    const normalBooking = { total_fare_vnd: 250000, payment_status: 'PAID' };
    const m1 = ctx.formatBookingMoney(normalBooking);
    assert.strictEqual(m1.totalVnd, 250000);
    assert.strictEqual(m1.refundedVnd, 0);
    assert.strictEqual(m1.codOwedVnd, 0);

    const refundedBooking = { total_fare_vnd: 500000, refunded_vnd: 250000, payment_status: 'PARTIALLY_CANCELLED' };
    const m2 = ctx.formatBookingMoney(refundedBooking);
    assert.strictEqual(m2.refundedVnd, 250000);
    assert.ok(m2.html.includes('Đã hoàn'), 'Money display must show refunded amount');

    const codBooking = { total_fare_vnd: 250000, payment_status: 'UNPAID_COD', cod_amount_vnd: 250000 };
    const m3 = ctx.formatBookingMoney(codBooking);
    assert.strictEqual(m3.codOwedVnd, 250000);
    assert.ok(m3.html.includes('Phải thu'), 'Money display must show COD owed amount');

    // 6. STATUS_LABELS: Vietnamese labels
    assert.strictEqual(ctx.STATUS_LABELS.PAID, 'Đã thanh toán');
    assert.strictEqual(ctx.STATUS_LABELS.PENDING_PAYMENT, 'Chờ thanh toán');
    assert.strictEqual(ctx.STATUS_LABELS.UNPAID_COD, 'Trả khi lên xe');
    assert.strictEqual(ctx.STATUS_LABELS.REFUNDED, 'Đã hoàn');
    assert.strictEqual(ctx.STATUS_LABELS.PARTIALLY_CANCELLED, 'Hủy một phần');
    assert.strictEqual(ctx.STATUS_LABELS.CANCELLED, 'Đã hủy');

    // 7. bookingMatchesFilter: Search without accents, by PNR, date, and status
    const bSample1 = {
      pnr: 'BG-808788',
      passenger_name: 'Nguyễn Tiến Dũng',
      phone: '0912***456',
      departure_time: '2026-11-09T08:00:00+07:00',
      payment_status: 'UNPAID_COD',
      status: 'CONFIRMED'
    };
    const bSample2 = {
      pnr: 'BG-999111',
      passenger_name: 'Trần Thị Mai',
      phone: '0988***777',
      departure_time: '2026-11-10T14:00:00+07:00',
      payment_status: 'PAID',
      status: 'CONFIRMED'
    };

    // Keyword matching with accent removal
    assert.strictEqual(ctx.bookingMatchesFilter(bSample1, { query: 'dung' }), true);
    assert.strictEqual(ctx.bookingMatchesFilter(bSample1, { query: 'tien' }), true);
    assert.strictEqual(ctx.bookingMatchesFilter(bSample1, { query: '808' }), true);
    assert.strictEqual(ctx.bookingMatchesFilter(bSample1, { query: 'mai' }), false);

    // Status filtering
    assert.strictEqual(ctx.bookingMatchesFilter(bSample1, { statusFilter: 'UNPAID_COD' }), true);
    assert.strictEqual(ctx.bookingMatchesFilter(bSample1, { statusFilter: 'PAID' }), false);
    assert.strictEqual(ctx.bookingMatchesFilter(bSample2, { statusFilter: 'PAID' }), true);

    // 8. compareBookings: Upcoming trips first, then newest
    const now = Date.now();
    const futureTrip1 = { pnr: 'F1', departure_time: new Date(now + 3600000).toISOString() };
    const futureTrip2 = { pnr: 'F2', departure_time: new Date(now + 7200000).toISOString() };
    const pastTrip1 = { pnr: 'P1', departure_time: new Date(now - 7200000).toISOString() };
    const pastTrip2 = { pnr: 'P2', departure_time: new Date(now - 3600000).toISOString() };

    const sorted = [pastTrip1, futureTrip2, pastTrip2, futureTrip1].sort((a, b) => ctx.compareBookings(a, b));
    assert.strictEqual(sorted[0].pnr, 'F1', 'Earliest upcoming trip first');
    assert.strictEqual(sorted[1].pnr, 'F2', 'Later upcoming trip second');
    assert.strictEqual(sorted[2].pnr, 'P2', 'More recent past trip third');
    assert.strictEqual(sorted[3].pnr, 'P1', 'Older past trip fourth');
  });

  it('TC-MGR-WEB-21: Step 5 — Payments modal, Fleet & Drivers today trips, license expiry pill', async () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    const content = fs.readFileSync(webDistPath, 'utf8');
    const vm = await import('vm');

    // 1. UI Elements existence
    assert.ok(content.includes('id="appModalBackdrop"'), 'Common modal backdrop must exist');
    assert.ok(content.includes('id="appModalCloseBtn"'), 'Common modal close button must exist');
    assert.ok(content.includes('id="fleetNewBtn"'), '+ Thêm xe button must exist');
    assert.ok(content.includes('id="driverNewBtn"'), '+ Thêm tài xế button must exist');
    assert.ok(content.includes('Trạng thái & Hạn'), 'Pending payments table must combine status and expiry column');
    assert.ok(content.includes('Chờ xác nhận tiền'), 'Payments must have section Chờ xác nhận tiền');
    assert.ok(content.includes('Tài xế nộp tiền cuối chuyến'), 'Payments must have section Tài xế nộp tiền cuối chuyến');

    // 2. Extract and evaluate helper functions in vm
    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'index.html must have an inline script');

    const helpersCode = scriptMatch[1].slice(
      scriptMatch[1].indexOf('const esc ='),
      scriptMatch[1].indexOf('async function api(')
    );

    const ctx = {
      console,
      crypto,
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    };
    vm.createContext(ctx);
    vm.runInContext(helpersCode, ctx);

    // 3. getVehicleTodayTrip
    const sampleTodayTrips = [
      {
        trip_id: 't_run_01',
        vehicle_id: 'veh_01',
        vehicle_plate: '29B-111.11',
        driver_id: 'drv_01',
        driver_name: 'Phạm A',
        route_name: 'Hà Nội — Sầm Sơn',
        departure_time: '2026-11-09T08:00:00+07:00',
        status: 'IN_TRANSIT'
      },
      {
        trip_id: 't_sched_02',
        vehicle_id: 'veh_02',
        vehicle_plate: '29B-222.22',
        driver_id: 'drv_02',
        driver_name: 'Trần B',
        route_name: 'Hà Nội — Thanh Hóa',
        departure_time: '2026-11-09T14:00:00+07:00',
        status: 'SCHEDULED'
      }
    ];

    // Running trip prioritized
    const v1Trip = ctx.getVehicleTodayTrip('veh_01', sampleTodayTrips);
    assert.ok(v1Trip.includes('08:00'), 'Should contain departure time');
    assert.ok(v1Trip.includes('Hà Nội — Sầm Sơn'), 'Should contain route name');

    // Scheduled trip for vehicle 2
    const v2Trip = ctx.getVehicleTodayTrip('29B-222.22', sampleTodayTrips);
    assert.ok(v2Trip.includes('14:00'));
    assert.ok(v2Trip.includes('Hà Nội — Thanh Hóa'));

    // Vehicle with no trip
    assert.strictEqual(ctx.getVehicleTodayTrip('veh_99', sampleTodayTrips), '—');
    assert.strictEqual(ctx.getVehicleTodayTrip(null, sampleTodayTrips), '—');

    // 4. getDriverTodayTrip
    const d1Trip = ctx.getDriverTodayTrip('drv_01', sampleTodayTrips);
    assert.ok(d1Trip.includes('08:00'));
    assert.ok(d1Trip.includes('Hà Nội — Sầm Sơn'));

    const d2Trip = ctx.getDriverTodayTrip('Trần B', sampleTodayTrips);
    assert.ok(d2Trip.includes('14:00'));
    assert.ok(d2Trip.includes('Hà Nội — Thanh Hóa'));

    assert.strictEqual(ctx.getDriverTodayTrip('drv_unknown', sampleTodayTrips), '—');

    // 5. formatLicenseExpiry: fmtDate & pills
    const fixedNow = new Date('2026-11-09T12:00:00Z');

    // Far future: valid (> 30 days) -> no warning pill
    const farValid = ctx.formatLicenseExpiry('2027-11-09', fixedNow);
    assert.ok(farValid.includes('09/11/2027'));
    assert.ok(!farValid.includes('Sắp hết hạn'));
    assert.ok(!farValid.includes('Hết hạn'));

    // Expiring soon: within 30 days (e.g. 15 days left) -> Sắp hết hạn
    const soonExpiring = ctx.formatLicenseExpiry('2026-11-24', fixedNow);
    assert.ok(soonExpiring.includes('24/11/2026'));
    assert.ok(soonExpiring.includes('Sắp hết hạn'));
    assert.ok(soonExpiring.includes('warn'));

    // Already expired (e.g. 2026-11-01) -> Hết hạn danger pill
    const expired = ctx.formatLicenseExpiry('2026-11-01', fixedNow);
    assert.ok(expired.includes('01/11/2026'));
    assert.ok(expired.includes('Hết hạn'));
    assert.ok(expired.includes('danger'));

    assert.strictEqual(ctx.formatLicenseExpiry(null), '—');

    // 6. Modal functions declaration check
    assert.ok(content.includes('function openModal('), 'openModal function must be declared');
    assert.ok(content.includes('function closeModal('), 'closeModal function must be declared');
  });

  it('TC-MGR-WEB-22: Manager Web permissions Step 2 — NAV_PERMISSIONS visibility for 3 templates & director, diff toast messages, default trip tab, and modal staff submission', async () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    const content = fs.readFileSync(webDistPath, 'utf8');
    const vm = await import('vm');

    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'index.html must have an inline script');

    const helpersCode = scriptMatch[1].slice(
      scriptMatch[1].indexOf('const esc ='),
      scriptMatch[1].indexOf('async function api(')
    );

    const ctx = {
      console,
      crypto,
      state: { user: null },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    };
    vm.createContext(ctx);
    vm.runInContext(helpersCode, ctx);

    // 1. NAV_PERMISSIONS & canView for Director & 3 templates
    // Director
    ctx.state.user = { role: 'FLEET_DIRECTOR', permissions: [] };
    assert.strictEqual(ctx.isDirector(), true);
    assert.strictEqual(ctx.canView('overview'), true);
    assert.strictEqual(ctx.canView('dispatch'), true);
    assert.strictEqual(ctx.canView('bookings'), true);
    assert.strictEqual(ctx.canView('payments'), true);
    assert.strictEqual(ctx.canView('schedules'), true);
    assert.strictEqual(ctx.canView('staff'), true);
    assert.strictEqual(ctx.canView('audit'), true);

    // Dispatcher template
    ctx.state.user = {
      role: 'STAFF',
      permissions: ['DISPATCH', 'TRIP_CANCEL', 'BOOKINGS_VIEW', 'FLEET', 'DRIVERS', 'SCHEDULES', 'AUDIT_VIEW']
    };
    assert.strictEqual(ctx.isDirector(), false);
    assert.strictEqual(ctx.canView('overview'), true); // public
    assert.strictEqual(ctx.canView('dispatch'), true); // public
    assert.strictEqual(ctx.canView('live'), true); // public
    assert.strictEqual(ctx.canView('bookings'), true); // BOOKINGS_VIEW
    assert.strictEqual(ctx.canView('schedules'), true); // SCHEDULES
    assert.strictEqual(ctx.canView('fleet'), true); // FLEET
    assert.strictEqual(ctx.canView('drivers'), true); // DRIVERS
    assert.strictEqual(ctx.canView('homereq'), true); // DISPATCH
    assert.strictEqual(ctx.canView('audit'), true); // AUDIT_VIEW
    assert.strictEqual(ctx.canView('payments'), false); // no PAYMENTS/REFUNDS
    assert.strictEqual(ctx.canView('staff'), false); // DIRECTOR only
    assert.strictEqual(ctx.canView('banners'), false); // no MARKETING

    // Cashier template
    ctx.state.user = {
      role: 'STAFF',
      permissions: ['TICKETING', 'BOOKINGS_VIEW', 'PAYMENTS']
    };
    assert.strictEqual(ctx.canView('bookings'), true); // BOOKINGS_VIEW
    assert.strictEqual(ctx.canView('payments'), true); // PAYMENTS
    assert.strictEqual(ctx.canView('schedules'), false);
    assert.strictEqual(ctx.canView('fleet'), false);
    assert.strictEqual(ctx.canView('staff'), false);

    // Accountant template
    ctx.state.user = {
      role: 'STAFF',
      permissions: ['PAYMENTS', 'REFUNDS', 'BOOKINGS_VIEW', 'AUDIT_VIEW']
    };
    assert.strictEqual(ctx.canView('bookings'), true); // BOOKINGS_VIEW
    assert.strictEqual(ctx.canView('payments'), true); // PAYMENTS, REFUNDS
    assert.strictEqual(ctx.canView('audit'), true); // AUDIT_VIEW
    assert.strictEqual(ctx.canView('schedules'), false);
    assert.strictEqual(ctx.canView('drivers'), false);
    assert.strictEqual(ctx.canView('staff'), false);

    // 2. diffPermissionsMessage: toast text on permission changes
    // Added
    const addedMsg = ctx.diffPermissionsMessage(['DISPATCH'], ['DISPATCH', 'TICKETING']);
    assert.strictEqual(addedMsg, 'Giám đốc vừa đổi quyền của bạn: thêm Bán vé & Giữ chỗ');

    // Removed
    const removedMsg = ctx.diffPermissionsMessage(['DISPATCH', 'TICKETING'], ['DISPATCH']);
    assert.strictEqual(removedMsg, 'Giám đốc vừa đổi quyền của bạn: bỏ Bán vé & Giữ chỗ');

    // Both added and removed
    const bothMsg = ctx.diffPermissionsMessage(['DISPATCH'], ['TICKETING']);
    assert.strictEqual(bothMsg, 'Giám đốc vừa đổi quyền của bạn: thêm Bán vé & Giữ chỗ; bỏ Điều độ chuyến');

    // No change
    assert.strictEqual(ctx.diffPermissionsMessage(['DISPATCH'], ['DISPATCH']), '');

    // 3. getDefaultTripTab by permissions
    // Director -> 'manifest' (Khách)
    ctx.state.user = { role: 'FLEET_DIRECTOR', permissions: [] };
    assert.strictEqual(ctx.getDefaultTripTab(), 'manifest');

    // Dispatcher (has DISPATCH) -> 'manifest'
    ctx.state.user = { role: 'STAFF', permissions: ['DISPATCH'] };
    assert.strictEqual(ctx.getDefaultTripTab(), 'manifest');

    // Cashier (only TICKETING, no DISPATCH) -> 'sales' (Bán vé & tổng đài)
    ctx.state.user = { role: 'STAFF', permissions: ['TICKETING'] };
    assert.strictEqual(ctx.getDefaultTripTab(), 'sales');

    // Staff with neither DISPATCH nor TICKETING (e.g. only FLEET) -> 'route' (Lộ trình & bản đồ)
    ctx.state.user = { role: 'STAFF', permissions: ['FLEET'] };
    assert.strictEqual(ctx.getDefaultTripTab(), 'route');

    // 4. Form nhân viên gửi permissions và không gửi role cũ
    // Check openStaffModal definition and PATCH / POST API calls
    assert.ok(content.includes('openStaffModal('), 'openStaffModal must be defined');
    assert.ok(content.includes('/api/v1/ops/staff/permissions-catalog'), 'Must load permissions catalog');
    assert.ok(content.includes("role: 'STAFF'"), 'Staff creation must use role: STAFF');
    assert.ok(!content.includes('<select id="staffRole"'), 'Legacy select#staffRole must be removed');
    assert.ok(content.includes('name="permissions"'), 'Permissions checkboxes must exist in modal');
    assert.ok(content.includes('totp_required'), 'totp_required checkbox must exist');
    assert.ok(content.includes('Nên bật xác thực 2 bước cho người giữ tiền'), 'Warning for cash handlers must exist');
  });

  it('TC-MGR-WEB-23: Payment security — Bank change warning formatting, manual confirm limit check, and NEEDS_REVIEW label', async () => {
    const webDistPath = path.join(managerDir, 'web_dist/index.html');
    const content = fs.readFileSync(webDistPath, 'utf8');
    const vm = await import('vm');

    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'index.html must have an inline script');

    const helpersCode = scriptMatch[1].slice(
      scriptMatch[1].indexOf('const esc ='),
      scriptMatch[1].indexOf('async function api(')
    );

    const ctx = {
      console,
      crypto,
      state: { user: null },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    };
    vm.createContext(ctx);
    vm.runInContext(helpersCode, ctx);

    // 1. formatBankChangeWarning: Mask account number, keeping only 4 last digits
    const pendingBank1 = {
      bank_name: 'Vietcombank',
      account_number: '1234567890',
      effective_at: '2026-11-10T03:00:00Z' // 10:00 VN time
    };
    const warn1 = ctx.formatBankChangeWarning(pendingBank1);
    assert.ok(warn1.includes('Vietcombank ****7890'), 'Must mask account number keeping only 4 digits');
    assert.ok(!warn1.includes('1234567890'), 'Full account number must not be exposed');
    assert.ok(warn1.includes('lúc 10:00, Thứ Ba, 10/11/2026'), 'Must format time with hhmm and fmtDateLong');
    assert.ok(warn1.includes('Nếu không phải bạn yêu cầu, bấm Hủy và gọi BusGo.'), 'Must include BusGo action instruction');

    // Already masked input
    const pendingBank2 = {
      bank_name: 'MBBank',
      account_number: '****5678',
      effective_at: '2026-11-12T05:00:00Z'
    };
    const warn2 = ctx.formatBankChangeWarning(pendingBank2);
    assert.ok(warn2.includes('MBBank ****5678'), 'Should handle already masked account number');

    // Null or undefined
    assert.strictEqual(ctx.formatBankChangeWarning(null), '');

    // 2. checkManualConfirmLimit: Lock button and show warning when staff confirms above threshold
    // Director can confirm any amount
    ctx.state.user = { role: 'FLEET_DIRECTOR', permissions: [] };
    const dirCheck = ctx.checkManualConfirmLimit(5000000, 2000000);
    assert.strictEqual(dirCheck.allowed, true);

    // Staff within limit (amount <= limit)
    ctx.state.user = { role: 'STAFF', permissions: ['PAYMENTS'] };
    const staffCheckOk = ctx.checkManualConfirmLimit(1500000, 2000000);
    assert.strictEqual(staffCheckOk.allowed, true);

    const staffCheckExact = ctx.checkManualConfirmLimit(2000000, 2000000);
    assert.strictEqual(staffCheckExact.allowed, true);

    // Staff exceeds limit (amount > limit) -> disabled
    const staffCheckExceeded = ctx.checkManualConfirmLimit(2500000, 2000000);
    assert.strictEqual(staffCheckExceeded.allowed, false);
    assert.ok(
      staffCheckExceeded.message.includes('Số tiền trên 2.000.000 đ cần giám đốc xác nhận'),
      'Must display exact director-required message'
    );

    // Default limit fallback (2,000,000 VND)
    const staffCheckDefault = ctx.checkManualConfirmLimit(3000000);
    assert.strictEqual(staffCheckDefault.allowed, false);
    assert.strictEqual(staffCheckDefault.limit, 2000000);

    // 3. formatBankTxOutcome and bankTxOutcomeBadge: Vietnamese label for NEEDS_REVIEW
    assert.strictEqual(ctx.formatBankTxOutcome('NEEDS_REVIEW'), 'Thiếu mã giao dịch, cần kiểm');
    assert.strictEqual(ctx.BANK_TX_OUTCOME_LABELS['NEEDS_REVIEW'], 'Thiếu mã giao dịch, cần kiểm');
    const badge = ctx.bankTxOutcomeBadge('NEEDS_REVIEW');
    assert.ok(badge.includes('Thiếu mã giao dịch, cần kiểm'), 'Badge must have Vietnamese text');
    assert.ok(badge.includes('pill warn'), 'Badge must have warn pill class');

    // 4. HTML Elements & Structural Verification (W1 - W5)
    // W1: Overview manual confirmations
    assert.ok(content.includes('/api/v1/ops/payments/manual-confirmations'), 'Must query manual confirmations endpoint');
    assert.ok(content.includes('Xác nhận tiền bằng tay hôm nay: Không có'), 'Must handle zero manual confirmations state');
    assert.ok(content.includes('overviewManualConfItem'), 'Overview must have manual confirmation item');

    // W2: Fixed top red banner
    assert.ok(content.includes('id="bankChangeBanner"'), 'Must have bank change banner element');
    assert.ok(content.includes('id="bankChangeCancelBtn"'), 'Must have bank change cancel button');
    assert.ok(content.includes('/api/v1/ops/payment-settings/bank-change/cancel'), 'Must call bank change cancel endpoint');

    // W3: Payment Settings manual limit & bank info
    assert.ok(content.includes('id="payManualConfirmLimit"'), 'Must have manual confirm limit input');
    assert.ok(content.includes('Ngưỡng xác nhận tiền bằng tay (đ)'), 'Must have label for manual confirm limit');
    assert.ok(content.includes('id="payBankInfoBox"'), 'Must have bank info box');
    assert.ok(content.includes('Đổi tài khoản ngân hàng phải qua BusGo'), 'Must note bank change via BusGo');

    // W4: Confirm payment modal
    assert.ok(content.includes('id="confirmModalNoteCount"'), 'Must have note counter element');
    assert.ok(content.includes('minlength="10"'), 'Note must require minlength 10');
    assert.ok(content.includes('confirmModalLimitWarn'), 'Must have limit warning element');
    assert.ok(content.includes('MANUAL_CONFIRM_LIMIT'), 'Must handle MANUAL_CONFIRM_LIMIT error');
  });
});
