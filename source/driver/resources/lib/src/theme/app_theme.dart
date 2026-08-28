import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';

class AppTheme {
  static ThemeData get darkCockpitTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: AppColors.primaryAction,
      scaffoldBackgroundColor: AppColors.canvasOps,
      fontFamily: 'Geist',

      colorScheme: const ColorScheme.dark(
        primary: AppColors.primaryAction,
        surface: AppColors.surfacePanel,
        error: AppColors.alertCritical,
        onPrimary: Colors.white,
        onSurface: AppColors.textHighContrast,
      ),

      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.canvasOps,
        foregroundColor: AppColors.textHighContrast,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontFamily: 'Geist',
          fontSize: 16,
          fontWeight: FontWeight.bold,
          color: AppColors.textHighContrast,
        ),
        systemOverlayStyle: SystemUiOverlayStyle.light,
      ),

      cardTheme: CardTheme(
        color: AppColors.surfacePanel,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.borderTactical, width: 1),
        ),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryAction,
          foregroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size(double.infinity, 64),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Geist',
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  static ThemeData get lightTheme => darkCockpitTheme;
}
