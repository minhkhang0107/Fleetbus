import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase Driver Mobile: Android Platform & Cockpit Theme Integrity Test Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const driverManifestPath = path.join(rootDir, 'source/driver/app/android/app/src/main/AndroidManifest.xml');
  const driverMainDartPath = path.join(rootDir, 'source/driver/app/lib/main.dart');
  const driverAppColorsDartPath = path.join(rootDir, 'source/driver/resources/lib/src/theme/app_colors.dart');

  it('TC-DRV-MOB-01: Driver Android Manifest must declare foreground telemetry service and camera', () => {
    assert.ok(fs.existsSync(driverManifestPath), 'Driver AndroidManifest.xml must exist');
    const content = fs.readFileSync(driverManifestPath, 'utf8');

    assert.ok(content.includes('package="vn.busgo.driver"'), 'Package name must be vn.busgo.driver');
    assert.ok(content.includes('android.permission.FOREGROUND_SERVICE'), 'FOREGROUND_SERVICE permission required');
    assert.ok(content.includes('android.permission.ACCESS_FINE_LOCATION'), 'FINE_LOCATION required');
    assert.ok(content.includes('android.permission.CAMERA'), 'CAMERA permission required');
    assert.ok(content.includes('android:label="BusGo Driver"'), 'Label must be BusGo Driver');
  });

  it('TC-DRV-MOB-02: Driver Flutter entry point must instantiate BusGoDriverApp with Dark Cockpit theme', () => {
    assert.ok(fs.existsSync(driverMainDartPath), 'Driver main.dart must exist');
    const content = fs.readFileSync(driverMainDartPath, 'utf8');

    assert.ok(content.includes('BusGoDriverApp'), 'Must instantiate BusGoDriverApp');
    assert.ok(content.includes('DriverCockpitDashboard'), 'Must launch DriverCockpitDashboard');
  });

  it('TC-DRV-MOB-03: Driver AppColors must declare tactical dark palette matching DESIGN.md', () => {
    assert.ok(fs.existsSync(driverAppColorsDartPath), 'Driver app_colors.dart must exist');
    const content = fs.readFileSync(driverAppColorsDartPath, 'utf8');

    assert.ok(content.includes('0xFF0F172A'), 'Canvas ops #0F172A must be defined');
    assert.ok(content.includes('0xFF1E293B'), 'Surface panel #1E293B must be defined');
    assert.ok(content.includes('0xFF16A34A'), 'Emerald safe #16A34A must be defined');
    assert.ok(content.includes('0xFFDC2626'), 'Alert critical #DC2626 must be defined');
  });
});
