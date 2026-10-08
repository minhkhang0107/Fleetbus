import 'package:flutter/material.dart';

import 'src/presentation/passenger/passenger_splash_screen.dart';
import 'src/presentation/passenger/passenger_store.dart';
import 'src/presentation/passenger/passenger_widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(BusGoPassengerApp(store: PassengerStore()));
}

class BusGoPassengerApp extends StatefulWidget {
  const BusGoPassengerApp({super.key, required this.store});
  final PassengerStore store;

  @override
  State<BusGoPassengerApp> createState() => _BusGoPassengerAppState();
}

class _BusGoPassengerAppState extends State<BusGoPassengerApp> {
  final _navigator = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    // BR-HOLD-004: when the hold or the payment window runs out, go back to the seat map and say why.
    widget.store.onHoldExpired = () {
      final nav = _navigator.currentState;
      if (nav == null) return;
      final wasPayment = widget.store.holdPhase == null;
      nav.popUntil((r) => r.settings.name == 'seats' || r.isFirst);
      final ctx = _navigator.currentContext;
      if (ctx == null) return;
      showAppSheet<void>(ctx, dismissible: false, builder: (sheet) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Hết thời gian giữ ghế', style: sans(size: 18, weight: FontWeight.w700)),
            gap(8),
            Text(
              'Ghế đã được nhả cho người khác. ${wasPayment ? 'Nếu bạn đã chuyển tiền sau giờ này, nhà xe sẽ hoàn lại tiền. ' : ''}Bạn có thể chọn lại ghế.',
              style: sans(size: 14, color: PTokens.muted, height: 1.5),
            ),
            gap(14),
            PrimaryButton(label: 'Chọn lại ghế', onPressed: () => Navigator.of(sheet).pop()),
          ]));
    };
  }

  @override
  void dispose() {
    widget.store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PassengerScope(
      store: widget.store,
      child: MaterialApp(
        navigatorKey: _navigator,
        title: 'BusGo',
        debugShowCheckedModeBanner: false,
        theme: passengerTheme(),
        home: const PassengerSplashScreen(),
      ),
    );
  }
}
