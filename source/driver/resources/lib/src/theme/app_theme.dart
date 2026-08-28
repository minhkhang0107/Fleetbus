import 'package:flutter/material.dart';
import 'app_colors.dart';

class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.canvasWhite,
      colorScheme: const ColorScheme.light(
        surface: AppColors.pureSurface,
        primary: AppColors.sapphireAccent,
        onPrimary: Colors.white,
        onSurface: AppColors.charcoalInk,
        error: AppColors.alertCrimson,
      ),
      dividerColor: AppColors.whisperBorder,
      cardTheme: CardTheme(
        color: AppColors.pureSurface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          side: const BorderSide(color: AppColors.whisperBorder, width: 1),
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.pureSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.whisperBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.whisperBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.sapphireAccent, width: 2),
        ),
        labelStyle: const TextStyle(color: AppColors.mutedSteel, fontSize: 13),
      ),
    );
  }
}
