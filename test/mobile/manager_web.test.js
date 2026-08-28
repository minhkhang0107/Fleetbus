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
    assert.ok(content.includes('/ops/radar'), 'Radar endpoint must be defined');
    assert.ok(content.includes('/ops/pos/bookings'), 'POS booking endpoint must be defined');
    assert.ok(content.includes('/swap-vehicle'), 'Swap vehicle endpoint must be defined');
    assert.ok(content.includes('/ops/reports/executive'), 'Executive reports endpoint must be defined');
  });

  it('TC-MGR-WEB-05: All required Manager Web screens must exist and cover MGR-001 to MGR-030', () => {
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
});
