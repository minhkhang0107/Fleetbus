import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class GlobalNavigationSidebar extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  const GlobalNavigationSidebar({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 80,
      decoration: const BoxDecoration(
        color: AppColors.darkSidebar,
        border: Border(
          right: BorderSide(color: AppColors.whisperBorder, width: 1),
        ),
      ),
      child: Column(
        children: [
          const SizedBox(height: 24),
          // App Logo Icon
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.sapphireAccent.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.auto_awesome,
              color: AppColors.sapphireAccent,
              size: 24,
            ),
          ),
          const SizedBox(height: 32),
          // Nav Items
          _NavItem(
            icon: Icons.chat_bubble_outline_rounded,
            activeIcon: Icons.chat_bubble_rounded,
            label: 'Chat',
            isSelected: selectedIndex == 0,
            onTap: () => onDestinationSelected(0),
          ),
          const SizedBox(height: 16),
          _NavItem(
            icon: Icons.dataset_outlined,
            activeIcon: Icons.dataset_rounded,
            label: 'Knowledge',
            isSelected: selectedIndex == 1,
            onTap: () => onDestinationSelected(1),
          ),
          const SizedBox(height: 16),
          _NavItem(
            icon: Icons.tune_rounded,
            activeIcon: Icons.tune_rounded,
            label: 'Channels',
            isSelected: selectedIndex == 2,
            onTap: () => onDestinationSelected(2),
          ),
          const Spacer(),
          // Settings / Avatar at bottom
          Padding(
            padding: const EdgeInsets.only(bottom: 24),
            child: CircleAvatar(
              radius: 18,
              backgroundColor: AppColors.mutedSteel.withValues(alpha: 0.2),
              child: const Icon(
                Icons.person,
                size: 20,
                color: AppColors.canvasWhite,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 64,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.sapphireAccent : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isSelected ? activeIcon : icon,
              color: isSelected ? Colors.white : AppColors.mutedSteel,
              size: 22,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                color: isSelected ? Colors.white : AppColors.mutedSteel,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
