import 'package:flutter/material.dart';

abstract class AppColors {
  // BusGo Driver Tactical Cockpit Design System (DESIGN.md)
  static const Color canvasOps = Color(0xFF0F172A);
  static const Color surfacePanel = Color(0xFF1E293B);
  static const Color surfaceActive = Color(0xFF334155);
  static const Color textHighContrast = Color(0xFFF8FAFC);
  static const Color textMuted = Color(0xFF94A3B8);
  static const Color borderTactical = Color(0xFF334155);
  
  // Tactical Operational Accents
  static const Color primaryAction = Color(0xFF2563EB);
  static const Color emeraldSafe = Color(0xFF16A34A);
  static const Color emeraldSoft = Color(0xFF064E3B);
  static const Color amberWarning = Color(0xFFD97706);
  static const Color amberSoft = Color(0xFF78350F);
  static const Color alertCritical = Color(0xFFDC2626);
  static const Color alertSoft = Color(0xFF7F1D1D);
  static const Color pnrOrange = Color(0xFFFB9821);

  // Backward compatibility aliases
  static const Color canvasWhite = canvasOps;
  static const Color pureSurface = surfacePanel;
  static const Color charcoalInk = textHighContrast;
  static const Color mutedSteel = textMuted;
  static const Color whisperBorder = borderTactical;
  static const Color sapphireAccent = primaryAction;
  static const Color safeEmerald = emeraldSafe;
  static const Color alertCrimson = alertCritical;
  static const Color darkSidebar = canvasOps;
}
