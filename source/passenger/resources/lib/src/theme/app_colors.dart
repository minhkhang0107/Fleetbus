import 'package:flutter/material.dart';

abstract class AppColors {
  // BusGo Passenger Design System (DESIGN.md)
  static const Color canvasPassenger = Color(0xFFF8FAFC);
  static const Color surfaceCard = Color(0xFFFFFFFF);
  static const Color charcoalInk = Color(0xFF0F172A);
  static const Color mutedSteel = Color(0xFF64748B);
  static const Color whisperBorder = Color(0xB3E2E8F0); // 70% opacity whisper border
  
  // Brand & Action Colors
  static const Color primarySapphire = Color(0xFF2563EB);
  static const Color primarySapphireSoft = Color(0xFFEFF6FF);
  static const Color emeraldSafe = Color(0xFF16A34A);
  static const Color emeraldSoft = Color(0xFFF0FDF4);
  static const Color amberHold = Color(0xFFD97706);
  static const Color amberSoft = Color(0xFFFEF3C7);
  static const Color alertCrimson = Color(0xFFDC2626);
  static const Color alertCrimsonSoft = Color(0xFFFEE2E2);
  static const Color pnrOrange = Color(0xFFFB9821);
  static const Color pnrOrangeSoft = Color(0xFFFFF7ED);

  // Seat States
  static const Color seatAvailable = Color(0xFFFFFFFF);
  static const Color seatSelected = Color(0xFF2563EB);
  static const Color seatHeld = Color(0xFFFEF3C7);
  static const Color seatBooked = Color(0xFFE2E8F0);
  static const Color seatBookedBorder = Color(0xFFCBD5E1);
  static const Color seatBookedText = Color(0xFF94A3B8);

  // Backwards compatibility aliases
  static const Color canvasWhite = canvasPassenger;
  static const Color pureSurface = surfaceCard;
  static const Color sapphireAccent = primarySapphire;
  static const Color safeEmerald = emeraldSafe;
  static const Color darkSidebar = charcoalInk;
}
