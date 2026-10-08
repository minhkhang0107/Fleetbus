import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Dark tactical tokens of the driver app (design-system.md, D95, D101). Large targets: 56 to 72 dp.
abstract class DTokens {
  static const bg = Color(0xFF0F172A);
  static const panel = Color(0xFF1E293B);
  static const panel2 = Color(0xFF0B1220);
  static const line = Color(0xFF334155);
  static const lineSoft = Color(0xFF1E293B);
  static const ink = Color(0xFFF1F5F9);
  static const muted = Color(0xFF94A3B8);
  static const sub = Color(0xFFCBD5E1);
  static const primary = Color(0xFF2563EB);
  static const primaryInk = Color(0xFF93C5FD);
  static const ok = Color(0xFF16A34A);
  static const okInk = Color(0xFF86EFAC);
  static const okBg = Color(0xFF14532D);
  static const warn = Color(0xFFCA8A04);
  static const warnInk = Color(0xFFFCD34D);
  static const warnBg = Color(0xFF422006);
  static const danger = Color(0xFFDC2626);
  static const dangerInk = Color(0xFFFCA5A5);
  static const dangerBg = Color(0xFF450A0A);
  static const plate = Color(0xFFFDBA74);
}

TextStyle dsans({double size = 15, FontWeight weight = FontWeight.w400, Color color = DTokens.ink, double? height}) =>
    GoogleFonts.geist(fontSize: size, fontWeight: weight, color: color, height: height);

TextStyle dmono({double size = 15, FontWeight weight = FontWeight.w700, Color color = DTokens.ink}) =>
    GoogleFonts.jetBrainsMono(fontSize: size, fontWeight: weight, color: color);

ThemeData driverTheme() {
  final base = ThemeData(useMaterial3: true, brightness: Brightness.dark, colorScheme: ColorScheme.fromSeed(seedColor: DTokens.primary, brightness: Brightness.dark, primary: DTokens.primary, surface: DTokens.panel));
  return base.copyWith(
    scaffoldBackgroundColor: DTokens.bg,
    textTheme: base.textTheme.apply(fontFamily: GoogleFonts.geist().fontFamily, bodyColor: DTokens.ink, displayColor: DTokens.ink),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: DTokens.panel,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: DTokens.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: DTokens.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFEF4444))),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFEF4444), width: 2)),
      errorStyle: dsans(size: 14, color: DTokens.dangerInk),
    ),
    snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, backgroundColor: DTokens.ink, contentTextStyle: dsans(size: 15, weight: FontWeight.w500, color: DTokens.bg)),
  );
}

/// Tall action button; [subtitle] adds a second line (72 dp primary actions).
class BigButton extends StatelessWidget {
  const BigButton({super.key, required this.label, required this.onPressed, this.color = DTokens.primary, this.foreground = Colors.white, this.subtitle, this.height = 56, this.outline = false, this.icon});
  final String label;
  final VoidCallback? onPressed;
  final Color color;
  final Color foreground;
  final String? subtitle;
  final double height;
  final bool outline;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final child = Column(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
      Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 22), const SizedBox(width: 10)],
        Flexible(child: Text(label, textAlign: TextAlign.center, style: dsans(size: height >= 72 ? 18 : 16, weight: FontWeight.w700, color: onPressed == null ? DTokens.muted : (outline ? color : foreground)))),
      ]),
      if (subtitle != null) Text(subtitle!, textAlign: TextAlign.center, style: dsans(size: 13, weight: FontWeight.w500, color: onPressed == null ? DTokens.muted : (outline ? color : foreground))),
    ]);
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(height >= 72 ? 12 : 10));
    return SizedBox(
      height: height,
      width: double.infinity,
      child: outline
          ? OutlinedButton(onPressed: onPressed, style: OutlinedButton.styleFrom(foregroundColor: color, side: BorderSide(color: onPressed == null ? DTokens.line : color, width: 1.5), shape: shape), child: child)
          : FilledButton(
              onPressed: onPressed,
              style: FilledButton.styleFrom(backgroundColor: color, foregroundColor: foreground, disabledBackgroundColor: DTokens.panel, shape: shape.copyWith(side: onPressed == null ? const BorderSide(color: Color(0xFF475569)) : BorderSide.none)),
              child: child,
            ),
    );
  }
}

enum DPill { ok, warn, mute, danger, info }

class StatusPill extends StatelessWidget {
  const StatusPill(this.text, this.kind, {super.key});
  final String text;
  final DPill kind;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (kind) {
      DPill.ok => (DTokens.okBg, DTokens.okInk),
      DPill.warn => (DTokens.warnBg, DTokens.warnInk),
      DPill.mute => (DTokens.line, const Color(0xFFE2E8F0)),
      DPill.danger => (DTokens.dangerBg, DTokens.dangerInk),
      DPill.info => (const Color(0xFF172554), const Color(0xFFBFDBFE)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text, style: dsans(size: 12, weight: FontWeight.w600, color: fg)),
    );
  }
}

class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.color = DTokens.panel, this.border});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;
  final Color? border;

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12), border: border == null ? null : Border.all(color: border!)),
        child: child,
      );
}

class Stat extends StatelessWidget {
  const Stat(this.label, this.value, {super.key, this.color = DTokens.ink});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(color: DTokens.bg, borderRadius: BorderRadius.circular(8)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: dsans(size: 12, color: color == DTokens.ink ? DTokens.muted : color)),
          Text(value, style: dmono(size: 20, color: color)),
        ]),
      );
}

class DHeader extends StatelessWidget implements PreferredSizeWidget {
  const DHeader({super.key, required this.title, this.subtitle, this.trailing, this.close = false});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final bool close;

  @override
  Size get preferredSize => const Size.fromHeight(72);

  @override
  Widget build(BuildContext context) => Material(
        color: DTokens.bg,
        child: SafeArea(
          bottom: false,
          child: Container(
            height: 72,
            padding: const EdgeInsets.symmetric(horizontal: 6),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DTokens.lineSoft))),
            child: Row(children: [
              IconButton(iconSize: 26, tooltip: close ? 'Đóng' : 'Quay lại', onPressed: () => Navigator.of(context).maybePop(), icon: Icon(close ? Icons.close : Icons.chevron_left)),
              Expanded(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: dsans(size: 18, weight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                  if (subtitle != null) Text(subtitle!, style: dsans(size: 13, color: DTokens.muted), overflow: TextOverflow.ellipsis),
                ]),
              ),
              if (trailing != null) Padding(padding: const EdgeInsets.only(right: 10), child: trailing!),
            ]),
          ),
        ),
      );
}

Future<T?> showDriverSheet<T>(BuildContext context, {required Widget Function(BuildContext) builder}) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      backgroundColor: DTokens.panel,
      barrierColor: const Color(0xB8020617),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: const Color(0xFF475569), borderRadius: BorderRadius.circular(999)))),
              const SizedBox(height: 14),
              builder(ctx),
            ]),
          ),
        ),
      ),
    );

void dToast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 3)));
}

/// Selectable tile used for choices in sheets (amount given, change method, incident type).
class ChoiceTile extends StatelessWidget {
  const ChoiceTile({super.key, required this.label, required this.selected, required this.onTap, this.hint, this.danger = false, this.enabled = true, this.center = false, this.height = 56});
  final String label;
  final String? hint;
  final bool selected;
  final VoidCallback onTap;
  final bool danger;
  final bool enabled;
  final bool center;
  final double height;

  @override
  Widget build(BuildContext context) {
    final accent = danger ? const Color(0xFFEF4444) : const Color(0xFF3B82F6);
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Semantics(
        selected: selected,
        button: true,
        enabled: enabled,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            constraints: BoxConstraints(minHeight: height),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            alignment: center ? Alignment.center : Alignment.centerLeft,
            decoration: BoxDecoration(
              color: selected ? (danger ? DTokens.dangerBg : const Color(0xFF172554)) : DTokens.bg,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: selected ? accent : DTokens.line, width: selected ? 2 : 1),
            ),
            child: Column(crossAxisAlignment: center ? CrossAxisAlignment.center : CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text(label, style: center ? dmono(size: 15) : dsans(size: 15, weight: FontWeight.w600)),
              if (hint != null) Text(hint!, style: dsans(size: 12, color: DTokens.sub)),
            ]),
          ),
        ),
      ),
    );
  }
}
