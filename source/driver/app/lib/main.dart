import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'src/presentation/driver_cockpit_dashboard.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BusGoDriverApp());
}

class BusGoDriverApp extends StatelessWidget {
  const BusGoDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BusGo Driver — Tactical Cockpit',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkCockpitTheme,
      home: const DriverCockpitDashboard(),
    );
  }
}
