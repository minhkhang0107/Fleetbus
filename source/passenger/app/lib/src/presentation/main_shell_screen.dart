import 'package:flutter/material.dart';
import 'package:shared/shared.dart';

import 'channels/channel_integration_screen.dart';
import 'chat/chat_dashboard_screen.dart';
import 'knowledge/knowledge_base_screen.dart';

class MainShellScreen extends StatefulWidget {
  const MainShellScreen({super.key});

  @override
  State<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends State<MainShellScreen> {
  int _selectedIndex = 0;

  final List<Widget> _pages = const [
    ChatDashboardScreen(),
    KnowledgeBaseScreen(),
    ChannelIntegrationScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          // Fixed 80px Global Navigation Sidebar
          GlobalNavigationSidebar(
            selectedIndex: _selectedIndex,
            onDestinationSelected: (index) {
              setState(() {
                _selectedIndex = index;
              });
            },
          ),
          // Active Page Content
          Expanded(
            child: IndexedStack(
              index: _selectedIndex,
              children: _pages,
            ),
          ),
        ],
      ),
    );
  }
}
