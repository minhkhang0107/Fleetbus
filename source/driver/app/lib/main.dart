import 'package:flutter/material.dart';

import 'src/presentation/driver_login_screen.dart';
import 'src/presentation/driver_store.dart';
import 'src/presentation/driver_widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(BusGoDriverApp(store: DriverStore()));
}

class BusGoDriverApp extends StatelessWidget {
  const BusGoDriverApp({super.key, required this.store});
  final DriverStore store;

  @override
  Widget build(BuildContext context) {
    return DriverScope(
      store: store,
      child: MaterialApp(
        title: 'BusGo Driver',
        debugShowCheckedModeBanner: false,
        theme: driverTheme(),
        home: const DriverLoginScreen(),
      ),
    );
  }
}
