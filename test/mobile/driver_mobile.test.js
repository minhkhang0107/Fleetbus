import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase Driver Mobile: Android & iOS Platform Integrity Test Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const driverManifestPath = path.join(rootDir, 'source/driver/app/android/app/src/main/AndroidManifest.xml');
  const driverBuildGradlePath = path.join(rootDir, 'source/driver/app/android/app/build.gradle');
  const driverMainActivityPath = path.join(rootDir, 'source/driver/app/android/app/src/main/kotlin/vn/busgo/driver/MainActivity.kt');
  const driverInfoPlistPath = path.join(rootDir, 'source/driver/app/ios/Runner/Info.plist');
  const driverPbxprojPath = path.join(rootDir, 'source/driver/app/ios/Runner.xcodeproj/project.pbxproj');
  const driverPubspecPath = path.join(rootDir, 'source/driver/app/pubspec.yaml');
  const driverMainDartPath = path.join(rootDir, 'source/driver/app/lib/main.dart');
  const driverAppColorsDartPath = path.join(rootDir, 'source/driver/resources/lib/src/theme/app_colors.dart');
  const driverAppThemeDartPath = path.join(rootDir, 'source/driver/resources/lib/src/theme/app_theme.dart');
  const driverPresDir = path.join(rootDir, 'source/driver/app/lib/src/presentation');
  const driverServicePath = path.join(rootDir, 'source/driver/app/lib/src/service/driver_api_service.dart');

  it('TC-DRV-MOB-01: Driver Android Manifest must declare foreground telemetry service and camera', () => {
    assert.ok(fs.existsSync(driverManifestPath), 'Driver AndroidManifest.xml must exist');
    const content = fs.readFileSync(driverManifestPath, 'utf8');

    assert.ok(content.includes('package="vn.busgo.driver"'), 'Package name must be vn.busgo.driver');
    assert.ok(content.includes('android.permission.FOREGROUND_SERVICE'), 'FOREGROUND_SERVICE permission required');
    assert.ok(content.includes('android.permission.ACCESS_FINE_LOCATION'), 'FINE_LOCATION required');
    assert.ok(content.includes('android.permission.CAMERA'), 'CAMERA permission required');
    assert.ok(content.includes('android:label="BusGo Driver"'), 'Label must be BusGo Driver');
    assert.ok(content.includes('android:usesCleartextTraffic="true"'), 'Cleartext traffic must be enabled for dev APIs');
  });

  it('TC-DRV-MOB-02: Driver iOS Info.plist must have BusGo Driver bundle identity and privacy usage strings', () => {
    assert.ok(fs.existsSync(driverInfoPlistPath), 'Driver Info.plist must exist');
    const content = fs.readFileSync(driverInfoPlistPath, 'utf8');

    assert.ok(content.includes('<string>BusGo Driver</string>'), 'CFBundleDisplayName must be BusGo Driver');
    assert.ok(content.includes('<string>vn.busgo.driver</string>'), 'CFBundleIdentifier must be vn.busgo.driver');
    assert.ok(content.includes('NSLocationWhenInUseUsageDescription'), 'NSLocationWhenInUseUsageDescription must be set');
    assert.ok(content.includes('NSLocationAlwaysAndWhenInUseUsageDescription'), 'NSLocationAlwaysAndWhenInUseUsageDescription must be set');
    assert.ok(content.includes('NSCameraUsageDescription'), 'NSCameraUsageDescription must be set');
    assert.ok(content.includes('<string>location</string>'), 'UIBackgroundModes location must be set');
  });

  it('TC-DRV-MOB-03: Driver Flutter entry point must instantiate BusGoDriverApp with Dark Cockpit theme', () => {
    assert.ok(fs.existsSync(driverMainDartPath), 'Driver main.dart must exist');
    const content = fs.readFileSync(driverMainDartPath, 'utf8');

    assert.ok(content.includes('BusGoDriverApp'), 'Must instantiate BusGoDriverApp');
    assert.ok(content.includes('DriverCockpitDashboard'), 'Must launch DriverCockpitDashboard');
  });

  it('TC-DRV-MOB-04: Driver AppColors must declare tactical dark palette matching DESIGN.md', () => {
    assert.ok(fs.existsSync(driverAppColorsDartPath), 'Driver app_colors.dart must exist');
    const content = fs.readFileSync(driverAppColorsDartPath, 'utf8');

    assert.ok(content.includes('0xFF0F172A'), 'Canvas ops #0F172A must be defined');
    assert.ok(content.includes('0xFF1E293B'), 'Surface panel #1E293B must be defined');
    assert.ok(content.includes('0xFF16A34A'), 'Emerald safe #16A34A must be defined');
    assert.ok(content.includes('0xFFDC2626'), 'Alert critical #DC2626 must be defined');
    assert.ok(content.includes('0xFF2563EB'), 'Primary action #2563EB must be defined');
    assert.ok(content.includes('0xFFD97706'), 'Amber warning #D97706 must be defined');

    const themeContent = fs.readFileSync(driverAppThemeDartPath, 'utf8');
    assert.ok(themeContent.includes("fontFamily: 'Geist'"), 'Theme font family must be Geist');
  });

  it('TC-DRV-MOB-05: All required Driver screens & API service must exist and cover DRI-001 to DRI-019', () => {
    const requiredFiles = [
      'driver_login_screen.dart',
      'driver_today_trips_screen.dart',
      'driver_trip_detail_screen.dart',
      'driver_readiness_screen.dart',
      'driver_cockpit_dashboard.dart',
      'driver_manifest_screen.dart',
      'driver_qr_scanner_screen.dart',
      'driver_navigation_screen.dart',
      'driver_offline_sync_screen.dart',
      'driver_incident_dialog.dart',
      'driver_cod_dialog.dart',
      'main_shell_screen.dart'
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(driverPresDir, file);
      assert.ok(fs.existsSync(fullPath), `Driver screen ${file} must exist`);
    }

    assert.ok(fs.existsSync(driverServicePath), 'driver_api_service.dart must exist');
  });

  it('TC-DRV-MOB-06: Dart syntax hygiene check — No JS triple equals (===) and No async Future in driver', () => {
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

    checkDir(path.join(rootDir, 'source/driver/app/lib'));
    checkDir(path.join(rootDir, 'source/driver/resources/lib'));
  });

  it('TC-DRV-MOB-07: Driver Tactical Design Anti-Pattern check — Zero picture emojis in presentation screens', () => {
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const files = fs.readdirSync(driverPresDir).filter(f => f.endsWith('.dart'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(driverPresDir, file), 'utf8');
      // Ignore typographical arrows ➔ (U+2794)
      const sanitized = content.replace(/➔/g, '');
      const match = sanitized.match(emojiRegex);
      assert.strictEqual(match, null, `Driver screen ${file} must not contain banned emojis: ${match ? match[0] : ''}`);
    }
  });

  it('TC-DRV-MOB-08: DriverApiClientService must implement complete spec API contract', () => {
    assert.ok(fs.existsSync(driverServicePath), 'driver_api_service.dart must exist');
    const content = fs.readFileSync(driverServicePath, 'utf8');

    const expectedMethods = [
      'login',
      'getTodayTrips',
      'submitReadinessCheck',
      'startTrip',
      'sendTelemetry',
      'getManifest',
      'boardWithQr',
      'collectCod',
      'replayOfflineTelemetry',
      'endTrip',
      'reportIncident'
    ];

    for (const method of expectedMethods) {
      assert.ok(content.includes(method), `DriverApiClientService must implement ${method}()`);
    }
  });

  it('TC-DRV-MOB-09: Driver Android Gradle & Kotlin Activity configuration must be aligned to vn.busgo.driver', () => {
    assert.ok(fs.existsSync(driverBuildGradlePath), 'driver build.gradle must exist');
    const gradleContent = fs.readFileSync(driverBuildGradlePath, 'utf8');
    assert.ok(gradleContent.includes('namespace "vn.busgo.driver"'), 'Namespace must be vn.busgo.driver');
    assert.ok(gradleContent.includes('applicationId "vn.busgo.driver"'), 'Default applicationId must be vn.busgo.driver');

    assert.ok(fs.existsSync(driverMainActivityPath), 'MainActivity.kt must exist in vn/busgo/driver/');
    const ktContent = fs.readFileSync(driverMainActivityPath, 'utf8');
    assert.ok(ktContent.includes('package vn.busgo.driver'), 'MainActivity package must be vn.busgo.driver');
  });

  it('TC-DRV-MOB-10: Driver iOS Xcode project.pbxproj & Info.plist must be configured for vn.busgo.driver and ATS', () => {
    assert.ok(fs.existsSync(driverPbxprojPath), 'driver project.pbxproj must exist');
    const pbxprojContent = fs.readFileSync(driverPbxprojPath, 'utf8');
    assert.ok(pbxprojContent.includes('PRODUCT_BUNDLE_IDENTIFIER = vn.busgo.driver;'), 'iOS Bundle ID must be vn.busgo.driver');
    assert.ok(!pbxprojContent.includes('PRODUCT_BUNDLE_IDENTIFIER = com.mkd.mestudy;'), 'Legacy template ID must not exist');

    const infoPlistContent = fs.readFileSync(driverInfoPlistPath, 'utf8');
    assert.ok(infoPlistContent.includes('<key>NSAppTransportSecurity</key>'), 'NSAppTransportSecurity must be configured');
    assert.ok(infoPlistContent.includes('<key>NSAllowsLocalNetworking</key>'), 'NSAllowsLocalNetworking must be enabled');
  });

  it('TC-DRV-MOB-11: Driver Pubspec dependencies and adaptive baseUrl cross-platform configuration', () => {
    assert.ok(fs.existsSync(driverPubspecPath), 'pubspec.yaml must exist');
    const pubspecContent = fs.readFileSync(driverPubspecPath, 'utf8');
    assert.ok(pubspecContent.includes('data:\n    path: ../data'), 'driver app pubspec must depend on data package');

    const serviceContent = fs.readFileSync(driverServicePath, 'utf8');
    assert.ok(serviceContent.includes('resolveDriverBaseUrl'), 'Must implement resolveDriverBaseUrl');
    assert.ok(serviceContent.includes('http://10.0.2.2:3000'), 'Must handle Android emulator host alias 10.0.2.2:3000');
    assert.ok(serviceContent.includes('http://localhost:3000'), 'Must handle iOS simulator / default host localhost:3000');
  });

  it('TC-DRV-MOB-12: Driver local.properties and web_dist production distribution integrity', () => {
    const localPropPath = path.join(rootDir, 'source/driver/app/android/local.properties');
    assert.ok(fs.existsSync(localPropPath), 'Driver local.properties must exist');
    const localPropContent = fs.readFileSync(localPropPath, 'utf8');
    assert.ok(localPropContent.includes('sdk.dir='), 'sdk.dir must be configured in local.properties');

    const webDistPath = path.join(rootDir, 'source/driver/web_dist/index.html');
    assert.ok(fs.existsSync(webDistPath), 'Driver web_dist/index.html must exist');
    const webContent = fs.readFileSync(webDistPath, 'utf8');
    assert.ok(webContent.includes('BusGo Driver') || webContent.includes('Driver Cockpit'), 'Must contain Driver Cockpit');
  });
});
