import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';

class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: AppColors.primarySapphire,
      scaffoldBackgroundColor: AppColors.canvasPassenger,
      fontFamily: 'Geist',
      
      colorScheme: const ColorScheme.light(
        primary: AppColors.primarySapphire,
        surface: AppColors.surfaceCard,
        error: AppColors.alertCrimson,
        onPrimary: Colors.white,
        onSurface: AppColors.charcoalInk,
      ),

      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surfaceCard,
        foregroundColor: AppColors.charcoalInk,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontFamily: 'Geist',
          fontSize: 16,
          fontWeight: FontWeight.bold,
          color: AppColors.charcoalInk,
        ),
        systemOverlayStyle: SystemUiOverlayStyle.dark,
      ),

      cardTheme: CardTheme(
        color: AppColors.surfaceCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.whisperBorder, width: 1),
        ),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primarySapphire,
          foregroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size(double.infinity, 54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Geist',
            fontSize: 15,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }
}
