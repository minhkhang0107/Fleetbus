# Push notifications (Firebase Cloud Messaging), D145 + D192

Both apps get pushes through Firebase project **busgo-fleetbus** (sender `1080641813109`). Without Firebase settings an app still runs: no push. The passenger then gets the in-app list, plus SMS for the moments that make them go out to the bus. The driver's trip list reloads as before.

## What is pushed

| App | When | Tap opens |
|---|---|---|
| Passenger | every notice, while the phone has a push token (payment, bus coming, delay, change of bus or driver, cancellation, refund…) | the bus on the map while it is coming, else the ticket (or its delay screen) |
| Driver | the office gives a trip (`TRIP_ASSIGNED`), gives it to another driver (`TRIP_UNASSIGNED`), changes its bus (`TRIP_VEHICLE_CHANGED`), cancels it (`TRIP_CANCELLED`) | the trip list, that trip on the big card (not while a trip is on the road) |

- **App open:** the passenger app shows the notice as its own heads-up card (D191), and the driver app shows a toast and reloads the trips. The system does not show a second banner.
- **Android:** both apps create the **busgo_trip** channel, which shows notices on top with sound. The server names this channel in every push.
- **Dead tokens:** a token FCM reports as uninstalled (`UNREGISTERED`) is dropped. The next "bus is coming" goes by SMS.
- **Signing out:** the app tells the server to stop pushing to that phone.

## 1. Firebase console (once)

In project busgo-fleetbus, under **Project settings → Your apps**, add the apps that are missing:

| App | Android package | iOS bundle id |
|---|---|---|
| Passenger | already there: `vn.busgo.passenger` (+ `.dev`, `.qa`, `.stg`) | `vn.busgo.passenger` |
| Driver | `vn.busgo.driver` (+ `.dev`, `.qa`, `.stg` if those flavors are built) | `vn.busgo.driver` |

## 2. Give each app its settings

Choose **one** of these two ways for each app and platform.

**A. Firebase files**
- Android: put `google-services.json` in `source/<app>/app/android/app/`. The Gradle plugin is applied only when the file is there. The passenger file is already in the repo.
- iOS: drag `GoogleService-Info.plist` into **Runner** in Xcode, with "Copy items if needed" checked and target Runner selected, so it ends up in *Copy Bundle Resources*.

**B. `--dart-define` (no file in the project)**
1. Create `source/<app>/app/firebase.<flavor>.json`. This path is gitignored.
2. Fill it with the values from the Firebase console:

   ```json
   {
     "FIREBASE_ANDROID_APP_ID": "1:1080641813109:android:…",
     "FIREBASE_ANDROID_API_KEY": "AIza…",
     "FIREBASE_IOS_APP_ID": "1:1080641813109:ios:…",
     "FIREBASE_IOS_API_KEY": "AIza…",
     "FIREBASE_IOS_BUNDLE_ID": "vn.busgo.driver"
   }
   ```

3. Build with the file:

   ```
   flutter build ipa --dart-define-from-file=firebase.production.json
   flutter run --flavor develop --dart-define-from-file=firebase.develop.json
   ```

`FIREBASE_PROJECT_ID` and `FIREBASE_SENDER_ID` default to busgo-fleetbus. An app tries the Firebase files first, then these values.

## 3. iOS: Apple Developer + APNs

1. In Apple Developer → Identifiers, turn on **Push Notifications** for `vn.busgo.passenger` and `vn.busgo.driver`.
2. In Keys, create an **APNs Auth Key** (.p8). Note its Key ID and the Team ID.
3. Upload the key in Firebase console → Project settings → Cloud Messaging → *Apple app configuration*. One key serves both apps.

The repo already carries the rest:
- `ios/Runner/Runner.entitlements` with `aps-environment` (Xcode switches it to production on archive), set as `CODE_SIGN_ENTITLEMENTS`.
- `UIBackgroundModes: remote-notification`.
- Podfile at iOS 15.

In Xcode the **Push Notifications** capability then shows as on; open *Signing & Capabilities* once so the provisioning profile picks it up.

Pushes need a real iPhone: the simulator gets no APNs token.

## 4. Server

1. Download a service account key: Firebase console → Project settings → Service accounts → *Generate new private key*.
2. Keep it out of the repo. Point the server at it:

   ```
   FLEETBUS_FCM_SERVICE_ACCOUNT=/etc/busgo/fcm-service-account.json node source/server/apiServer.js
   ```

   (Or `FLEETBUS_PUSH_WEBHOOK_URL` for a relay that sends the push itself.)

Every message lands in the office's outbox with channel PUSH/SMS and SENT/FAILED, so a failing key shows there.

## 5. Check it

1. Run an app in debug. It prints `BusGo push token: …` (passenger) or `BusGo driver push token: …` (driver).
2. Firebase console → Messaging → *Send test message* to that token. The notice should show with the app closed. Tapping it opens the app.
3. With the server key set, end to end:
   - Have the office change the bus of a trip with tickets. The passenger gets "Nhà xe đổi xe hoặc tài xế" on the lock screen, and tapping it opens the ticket.
   - Have the office assign a trip to a driver. The driver gets "Bạn có chuyến mới", and tapping it puts that trip on the big card.
