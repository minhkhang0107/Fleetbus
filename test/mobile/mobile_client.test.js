import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase Mobile: Android & iOS Platform Integrity Test Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const androidManifestPath = path.join(rootDir, 'source/passenger/app/android/app/src/main/AndroidManifest.xml');
  const androidBuildGradlePath = path.join(rootDir, 'source/passenger/app/android/app/build.gradle');
  const androidMainActivityPath = path.join(rootDir, 'source/passenger/app/android/app/src/main/kotlin/vn/busgo/passenger/MainActivity.kt');
  const iosInfoPlistPath = path.join(rootDir, 'source/passenger/app/ios/Runner/Info.plist');
  const iosPbxprojPath = path.join(rootDir, 'source/passenger/app/ios/Runner.xcodeproj/project.pbxproj');
  const pubspecPath = path.join(rootDir, 'source/passenger/app/pubspec.yaml');
  const mainDartPath = path.join(rootDir, 'source/passenger/app/lib/main.dart');
  const appColorsDartPath = path.join(rootDir, 'source/passenger/resources/lib/src/theme/app_colors.dart');
  const appThemeDartPath = path.join(rootDir, 'source/passenger/resources/lib/src/theme/app_theme.dart');
  const passengerPresDir = path.join(rootDir, 'source/passenger/app/lib/src/presentation/passenger');
  const passengerServicePath = path.join(rootDir, 'source/passenger/data/lib/src/service/passenger_api_service.dart');

  it('TC-MOB-01: Android Manifest must have correct package name and required permissions', () => {
    assert.ok(fs.existsSync(androidManifestPath), 'AndroidManifest.xml must exist');
    const content = fs.readFileSync(androidManifestPath, 'utf8');

    assert.ok(content.includes('package="vn.busgo.passenger"'), 'Package name must be vn.busgo.passenger');
    assert.ok(content.includes('android.permission.INTERNET'), 'INTERNET permission required');
    assert.ok(content.includes('android.permission.ACCESS_FINE_LOCATION'), 'FINE_LOCATION required for GPS telemetry');
    assert.ok(content.includes('android.permission.ACCESS_COARSE_LOCATION'), 'COARSE_LOCATION required');
    assert.ok(content.includes('android.permission.CAMERA'), 'CAMERA required for QR ticket scanning');
    assert.ok(content.includes('android:label="BusGo"'), 'Label must be BusGo');
    assert.ok(content.includes('android:scheme="busgo"'), 'Deep link scheme busgo must be configured');
    assert.ok(content.includes('android:usesCleartextTraffic="true"'), 'Cleartext traffic must be enabled for dev APIs');
  });

  it('TC-MOB-02: iOS Info.plist must have BusGo bundle identity and privacy usage strings', () => {
    assert.ok(fs.existsSync(iosInfoPlistPath), 'Info.plist must exist');
    const content = fs.readFileSync(iosInfoPlistPath, 'utf8');

    assert.ok(content.includes('<string>BusGo</string>'), 'CFBundleDisplayName must be BusGo');
    assert.ok(content.includes('<string>vn.busgo.passenger</string>'), 'CFBundleIdentifier must be vn.busgo.passenger');
    assert.ok(content.includes('NSLocationWhenInUseUsageDescription'), 'NSLocationWhenInUseUsageDescription must be set');
    assert.ok(content.includes('NSCameraUsageDescription'), 'NSCameraUsageDescription must be set');
    assert.ok(content.includes('NSPhotoLibraryUsageDescription'), 'NSPhotoLibraryUsageDescription must be set');
  });

  it('TC-MOB-03: Flutter Dart App entry point must instantiate BusGoPassengerApp with Splash', () => {
    assert.ok(fs.existsSync(mainDartPath), 'main.dart must exist');
    const content = fs.readFileSync(mainDartPath, 'utf8');

    assert.ok(content.includes('BusGoPassengerApp'), 'Must instantiate BusGoPassengerApp');
    assert.ok(content.includes('PassengerSplashScreen'), 'Must launch PassengerSplashScreen');
  });

  it('TC-MOB-04: Flutter AppColors must define BusGo Passenger design tokens matching DESIGN.md', () => {
    assert.ok(fs.existsSync(appColorsDartPath), 'app_colors.dart must exist');
    const content = fs.readFileSync(appColorsDartPath, 'utf8');

    assert.ok(content.includes('0xFF2563EB'), 'Primary sapphire #2563EB must be defined');
    assert.ok(content.includes('0xFFF8FAFC'), 'Canvas passenger #F8FAFC must be defined');
    assert.ok(content.includes('0xFF0F172A'), 'Charcoal ink #0F172A must be defined');
    assert.ok(content.includes('0xFFFB9821'), 'PNR orange #FB9821 must be defined');
    assert.ok(content.includes('0xFF16A34A'), 'Emerald safe #16A34A must be defined');
    assert.ok(content.includes('0xFFD97706'), 'Amber hold #D97706 must be defined');
    assert.ok(content.includes('0xFFDC2626'), 'Alert crimson #DC2626 must be defined');

    const themeContent = fs.readFileSync(appThemeDartPath, 'utf8');
    assert.ok(themeContent.includes("fontFamily: 'Geist'"), 'Theme font family must be Geist');
  });

  it('TC-MOB-05: All required Passenger mobile screens must exist and cover PAX-001 to PAX-025', () => {
    const requiredFiles = [
      'passenger_splash_screen.dart',
      'passenger_login_screen.dart',
      'passenger_home_screen.dart',
      'passenger_location_picker_screen.dart',
      'passenger_search_results_screen.dart',
      'passenger_trip_detail_screen.dart',
      'passenger_seat_map_screen.dart',
      'passenger_checkout_screen.dart',
      'passenger_payment_processing_screen.dart',
      'passenger_cancel_refund_screen.dart',
      'passenger_ticket_qr_screen.dart',
      'passenger_wallet_screen.dart',
      'passenger_live_radar_screen.dart',
      'passenger_notifications_screen.dart',
      'passenger_main_shell.dart'
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(passengerPresDir, file);
      assert.ok(fs.existsSync(fullPath), `Screen ${file} must exist`);
    }
  });

  it('TC-MOB-06: Dart syntax hygiene check — No JS triple equals (===) and No async Future in client', () => {
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

    checkDir(path.join(rootDir, 'source/passenger/app/lib'));
    checkDir(path.join(rootDir, 'source/passenger/data/lib'));
    checkDir(path.join(rootDir, 'source/passenger/resources/lib'));
  });

  it('TC-MOB-07: Design System Anti-Pattern check — Zero picture emojis in presentation screens', () => {
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const files = fs.readdirSync(passengerPresDir).filter(f => f.endsWith('.dart'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(passengerPresDir, file), 'utf8');
      // Ignore typographical arrows ➔ (U+2794)
      const sanitized = content.replace(/➔/g, '');
      const match = sanitized.match(emojiRegex);
      assert.strictEqual(match, null, `Screen ${file} must not contain banned emojis: ${match ? match[0] : ''}`);
    }
  });

  it('TC-MOB-08: PassengerApiClientService must implement complete spec API contract', () => {
    assert.ok(fs.existsSync(passengerServicePath), 'passenger_api_service.dart must exist');
    const content = fs.readFileSync(passengerServicePath, 'utf8');

    const expectedMethods = [
      'getAppConfig',
      'requestOtp',
      'verifyOtp',
      'getHomeFeed',
      'searchStations',
      'searchTrips',
      'getTripDetail',
      'getSeatMap',
      'holdSeats',
      'createBookingOrder',
      'getTicketWallet',
      'getTicketQR',
      'getLiveRadarHUD',
      'getNotifications',
      'cancelTicket'
    ];

    for (const method of expectedMethods) {
      assert.ok(content.includes(method), `PassengerApiClientService must implement ${method}()`);
    }
  });

  it('TC-MOB-09: Android Gradle & Kotlin Activity configuration must be aligned to vn.busgo.passenger', () => {
    assert.ok(fs.existsSync(androidBuildGradlePath), 'build.gradle must exist');
    const gradleContent = fs.readFileSync(androidBuildGradlePath, 'utf8');
    assert.ok(gradleContent.includes('namespace "vn.busgo.passenger"'), 'Namespace must be vn.busgo.passenger');
    assert.ok(gradleContent.includes('applicationId "vn.busgo.passenger"'), 'Default applicationId must be vn.busgo.passenger');

    assert.ok(fs.existsSync(androidMainActivityPath), 'MainActivity.kt must exist in vn/busgo/passenger/');
    const ktContent = fs.readFileSync(androidMainActivityPath, 'utf8');
    assert.ok(ktContent.includes('package vn.busgo.passenger'), 'MainActivity package must be vn.busgo.passenger');
  });

  it('TC-MOB-10: iOS Xcode project.pbxproj & Info.plist must be configured for vn.busgo.passenger and ATS', () => {
    assert.ok(fs.existsSync(iosPbxprojPath), 'project.pbxproj must exist');
    const pbxprojContent = fs.readFileSync(iosPbxprojPath, 'utf8');
    assert.ok(pbxprojContent.includes('PRODUCT_BUNDLE_IDENTIFIER = vn.busgo.passenger;'), 'iOS Bundle ID must be vn.busgo.passenger');
    assert.ok(!pbxprojContent.includes('PRODUCT_BUNDLE_IDENTIFIER = com.mkd.mestudy;'), 'Legacy template ID must not exist');

    const infoPlistContent = fs.readFileSync(iosInfoPlistPath, 'utf8');
    assert.ok(infoPlistContent.includes('<key>NSAppTransportSecurity</key>'), 'NSAppTransportSecurity must be configured');
    assert.ok(infoPlistContent.includes('<key>NSAllowsLocalNetworking</key>'), 'NSAllowsLocalNetworking must be enabled');
  });

  it('TC-MOB-11: Pubspec dependencies and adaptive baseUrl cross-platform configuration', () => {
    assert.ok(fs.existsSync(pubspecPath), 'pubspec.yaml must exist');
    const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
    assert.ok(pubspecContent.includes('data:\n    path: ../data'), 'app pubspec must depend on data package');

    const serviceContent = fs.readFileSync(passengerServicePath, 'utf8');
    assert.ok(serviceContent.includes('resolvePassengerBaseUrl'), 'Must implement resolvePassengerBaseUrl');
    assert.ok(serviceContent.includes('http://10.0.2.2:3000'), 'Must handle Android emulator host alias 10.0.2.2:3000');
    assert.ok(serviceContent.includes('http://localhost:3000'), 'Must handle iOS simulator / default host localhost:3000');
  });
});
