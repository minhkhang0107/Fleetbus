import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'src/presentation/passenger/passenger_splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BusGoPassengerApp());
}

class BusGoPassengerApp extends StatelessWidget {
  const BusGoPassengerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BusGo Passenger — Hệ thống Đặt vé & Telemetry',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const PassengerSplashScreen(),
    );
  }
}
