/**
 * iOS permissions of both apps stay consistent: every permission_handler permission the Dart code asks for is
 * compiled in by the Podfile (a permission left out always answers "denied" without asking), has its usage text
 * in Info.plist, and no usage text or background mode is declared for something the app does not do (App Review
 * and Google Play both refuse unused permissions).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dartFiles = (dir) => fs.readdirSync(path.join(root, dir), { recursive: true }).filter(f => f.endsWith('.dart')).map(f => read(path.join(dir, f))).join('\n');

// permission_handler permission -> Podfile macro and the Info.plist usage texts it needs.
const NEEDS = {
  camera: { macro: 'PERMISSION_CAMERA', plist: ['NSCameraUsageDescription'] },
  location: { macro: 'PERMISSION_LOCATION', plist: ['NSLocationWhenInUseUsageDescription'] },
  locationWhenInUse: { macro: 'PERMISSION_LOCATION', plist: ['NSLocationWhenInUseUsageDescription'] },
  locationAlways: { macro: 'PERMISSION_LOCATION', plist: ['NSLocationAlwaysAndWhenInUseUsageDescription'] },
  notification: { macro: 'PERMISSION_NOTIFICATIONS', plist: [] }
};

const APPS = {
  passenger: { plistAllowed: ['NSLocationWhenInUseUsageDescription', 'NSPhotoLibraryAddUsageDescription'], backgroundModes: [] },
  driver: { plistAllowed: ['NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSLocationAlwaysUsageDescription', 'NSCameraUsageDescription'], backgroundModes: ['location'] }
};

describe('iOS permissions match what each app uses', () => {
  for (const [app, rules] of Object.entries(APPS)) {
    const dart = dartFiles(`source/${app}/app/lib`);
    const podfile = read(`source/${app}/app/ios/Podfile`);
    const plist = read(`source/${app}/app/ios/Runner/Info.plist`);
    const used = [...new Set([...dart.matchAll(/\bPermission\.(\w+)/g)].map(m => m[1]))].filter(p => NEEDS[p]);
    const enabled = new Set([...podfile.matchAll(/'(PERMISSION_[A-Z_]+)=1'/g)].map(m => m[1]));

    it(`${app}: each permission asked in Dart is compiled in and explained`, () => {
      for (const p of used) {
        assert.ok(enabled.has(NEEDS[p].macro), `${app} asks Permission.${p}: Podfile needs '${NEEDS[p].macro}=1'`);
        for (const key of NEEDS[p].plist) assert.ok(plist.includes(`<key>${key}</key>`), `${app} asks Permission.${p}: Info.plist needs ${key}`);
      }
    });

    it(`${app}: no permission is compiled in or explained for nothing`, () => {
      const needed = new Set(used.map(p => NEEDS[p].macro));
      for (const macro of enabled) assert.ok(needed.has(macro), `${app}: Podfile enables ${macro} but the app never asks for it`);
      const declared = [...plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map(m => m[1]);
      for (const key of declared) assert.ok(rules.plistAllowed.includes(key), `${app}: Info.plist explains ${key}, which the app does not use`);
      const modes = (plist.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] || '').match(/<string>([^<]+)<\/string>/g)?.map(s => s.slice(8, -9)) || [];
      assert.deepStrictEqual(modes.sort(), [...rules.backgroundModes].sort(), `${app}: background modes`);
    });
  }
});

describe('iOS deployment target covers every plugin', () => {
  // The lowest iOS each app's plugins accept (firebase_messaging needs 15); pod install fails below it.
  for (const [app, minimum] of Object.entries({ passenger: 15, driver: 14 })) {
    it(`${app}: Podfile, Xcode project and Flutter framework agree on iOS ${minimum}`, () => {
      assert.match(read(`source/${app}/app/ios/Podfile`), new RegExp(`^platform :ios, '${minimum}\\.0'`, 'm'));
      const targets = [...read(`source/${app}/app/ios/Runner.xcodeproj/project.pbxproj`).matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map(m => m[1]);
      assert.ok(targets.length > 0 && targets.every(t => t === `${minimum}.0`), `project targets ${targets}`);
      assert.match(read(`source/${app}/app/ios/Flutter/AppFrameworkInfo.plist`), new RegExp(`<string>${minimum}\\.0</string>`));
    });
  }
});
