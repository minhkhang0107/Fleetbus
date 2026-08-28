import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

import 'src/presentation/main_shell_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SocialQAApp());
}

class SocialQAApp extends StatelessWidget {
  const SocialQAApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Social QA Auto-Responder (Tourism Edition)',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const MainShellScreen(),
    );
  }
}
