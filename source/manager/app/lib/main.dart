import 'package:flutter/material.dart';
import '../../resources/lib/src/theme/app_colors.dart';
import 'src/presentation/manager/manager_login_screen.dart';
import 'src/presentation/manager/manager_web_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BusGoManagerWebApp());
}

class BusGoManagerWebApp extends StatefulWidget {
  const BusGoManagerWebApp({super.key});

  @override
  State<BusGoManagerWebApp> createState() => _BusGoManagerWebAppState();
}

class _BusGoManagerWebAppState extends State<BusGoManagerWebApp> {
  bool _isAuthenticated = true; // Auto-logged in for rapid ops workflow

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BusGo Operations Control Center',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: ManagerColors.bgDark,
        colorScheme: const ColorScheme.dark(
          primary: ManagerColors.cyanAccent,
          surface: ManagerColors.surfaceCard,
        ),
        fontFamily: 'Geist',
      ),
      home: _isAuthenticated
          ? ManagerWebShell(onLogout: () => setState(() => _isAuthenticated = false))
          : ManagerLoginScreen(onLoginSuccess: () => setState(() => _isAuthenticated = true)),
    );
  }
}
