# Implementation Plan: Mobile Review & Cross-Platform Alignment (Android & iOS)

Review and harden the FleetBus Passenger and Driver mobile apps to guarantee reliable execution on both Android and iOS platforms.

## User Review Required

> [!NOTE]
> All changes align existing scaffolding (`source/passenger` and `source/driver`) with the official bundle identifiers (`vn.busgo.passenger` and `vn.busgo.driver`) and resolve real-world runtime crash hazards on Android and network blocks on iOS.

## Proposed Changes

### Phase 1: Android Platform Build & Runtime Alignment
Align Gradle build scripts and Kotlin activity sources with Android package conventions:
- Fix Android namespace and applicationId from legacy template `com.mkd.mestudy` to `vn.busgo.passenger` and `vn.busgo.driver`.
- Relocate `MainActivity.kt` to matching package directory `src/main/kotlin/vn/busgo/passenger/MainActivity.kt` and `src/main/kotlin/vn/busgo/driver/MainActivity.kt`.
- Enable cleartext traffic for local development in `AndroidManifest.xml` (`android:usesCleartextTraffic="true"`).

### Phase 2: iOS Platform Build & Runtime Alignment
Align Xcode project settings and security permissions for iOS devices and simulators:
- Update `PRODUCT_BUNDLE_IDENTIFIER` in `Runner.xcodeproj/project.pbxproj` to `vn.busgo.passenger` (Passenger) and `vn.busgo.driver` (Driver).
- Configure `NSAppTransportSecurity` in `Info.plist` with `NSAllowsArbitraryLoads` and `NSAllowsLocalNetworking` so the app can communicate with local development API servers on iOS.

### Phase 3: Cross-Platform Network Adaptability & Dependencies
- Add `data: path: ../data` to `dependencies` in `pubspec.yaml` for both apps.
- Implement platform-adaptive `defaultBaseUrl` in `passenger_api_service.dart` and `driver_api_service.dart`:
  - Android Emulator: `http://10.0.2.2:3000`
  - iOS Simulator & Web: `http://localhost:3000`
  - Overridable via constructor / environment.

### Phase 4: Automated Verification & Test Suite
- Expand `test/mobile/mobile_client.test.js` and `test/mobile/driver_mobile.test.js` to verify:
  - Android namespace, applicationId, and Kotlin MainActivity package matching
  - iOS Xcode `project.pbxproj` bundle identifier matching
  - iOS `Info.plist` App Transport Security configuration
  - Pubspec dependencies linking `package:data`
  - BaseUrl cross-platform resolution
- Run `npm test`, `npm run lint`, and `node test/e2e_live_flow.js`.

## Verification Plan

### Automated Tests
- `npm test`: Run all 14 test suites including expanded mobile platform suites.
- `npm run lint`: Verify 0 syntax errors across all JS/test files.
- `node test/e2e_live_flow.js`: Verify complete end-to-end flow.

### Manual / Structural Inspection
- Inspect `git diff` for exact alignment.
- Verify directory trees for Android Kotlin activities.
