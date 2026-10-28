import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import 'passenger_store.dart';

/// Design tokens of the passenger app (design-system.md, D95 and D101).
abstract class PTokens {
  static const canvas = Color(0xFFF8FAFC);
  static const surface = Color(0xFFFFFFFF);
  static const ink = Color(0xFF0F172A);
  static const muted = Color(0xFF475569);
  static const line = Color(0xFFE2E8F0);
  static const lineStrong = Color(0xFFCBD5E1);
  static const primary = Color(0xFF2563EB);
  static const primaryDark = Color(0xFF1D4ED8);
  static const primarySoft = Color(0xFFEFF6FF);
  static const success = Color(0xFF15803D);
  static const successSoft = Color(0xFFF0FDF4);
  static const warn = Color(0xFFD97706);
  static const warnInk = Color(0xFF78350F);
  static const warnSoft = Color(0xFFFEF3C7);
  static const danger = Color(0xFFB91C1C);
  static const dangerSoft = Color(0xFFFEE2E2);
  static const pnr = Color(0xFFC2410C);
  static const pnrSoft = Color(0xFFFFF7ED);
  static const radius = 12.0;
  static const radiusControl = 8.0;
}

TextStyle sans({double size = 15, FontWeight weight = FontWeight.w400, Color color = PTokens.ink, double? height}) =>
    GoogleFonts.geist(fontSize: size, fontWeight: weight, color: color, height: height);

TextStyle mono({double size = 15, FontWeight weight = FontWeight.w600, Color color = PTokens.ink, TextDecoration? decoration}) =>
    GoogleFonts.jetBrainsMono(fontSize: size, fontWeight: weight, color: color, decoration: decoration);

ThemeData passengerTheme() {
  final base = ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: PTokens.primary, primary: PTokens.primary, surface: PTokens.surface));
  return base.copyWith(
    scaffoldBackgroundColor: PTokens.canvas,
    textTheme: base.textTheme.apply(fontFamily: GoogleFonts.geist().fontFamily, bodyColor: PTokens.ink, displayColor: PTokens.ink),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: PTokens.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl), borderSide: const BorderSide(color: PTokens.lineStrong)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl), borderSide: const BorderSide(color: PTokens.lineStrong)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl), borderSide: const BorderSide(color: PTokens.primary, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl), borderSide: const BorderSide(color: PTokens.danger)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl), borderSide: const BorderSide(color: PTokens.danger, width: 2)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating, backgroundColor: PTokens.ink),
  );
}

/// Tablets (portrait from 720 dp) and desktops: screens put their blocks side by side instead of one long column.
bool pWide(BuildContext context) => MediaQuery.sizeOf(context).width >= 720;

/// Caps the width of [child] and centers it, for forms and single lists on wide screens.
class PMaxWidth extends StatelessWidget {
  const PMaxWidth({super.key, required this.child, this.maxWidth = 600});
  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        heightFactor: 1,
        child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: child),
      );
}

/// Scrolling body made of two groups of blocks: one column on phones ([left] then [right]),
/// two columns side by side on wide screens.
class PSplit extends StatelessWidget {
  const PSplit({super.key, required this.left, required this.right, this.padding = const EdgeInsets.all(16), this.leftFlex = 1, this.rightFlex = 1});
  final List<Widget> left;
  final List<Widget> right;
  final EdgeInsets padding;
  final int leftFlex;
  final int rightFlex;

  @override
  Widget build(BuildContext context) {
    if (!pWide(context)) return ListView(padding: padding, children: [...left, ...right]);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: leftFlex, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: left)),
        const SizedBox(width: 24),
        Expanded(flex: rightFlex, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: right)),
      ]),
    );
  }
}

/// White app bar with a back arrow, a title and an optional subtitle (no fake status bar).
class TopBar extends StatelessWidget implements PreferredSizeWidget {
  const TopBar({super.key, required this.title, this.subtitle, this.trailing, this.showBack = true, this.onBack, this.large = false});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final bool showBack;
  final VoidCallback? onBack;
  final bool large;

  @override
  Size get preferredSize => Size.fromHeight(subtitle == null ? 64 : 72);

  @override
  Widget build(BuildContext context) {
    return Material(
      color: PTokens.surface,
      child: SafeArea(
        bottom: false,
        child: Container(
          height: preferredSize.height,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: PTokens.line))),
          child: Row(children: [
            if (showBack)
              IconButton(
                tooltip: 'Quay lại',
                onPressed: onBack ?? () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.chevron_left, size: 28),
              )
            else
              const SizedBox(width: 10),
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: sans(size: large ? 22 : 17, weight: large ? FontWeight.w700 : FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                if (subtitle != null) Text(subtitle!, style: sans(size: 13, color: PTokens.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
              ]),
            ),
            if (trailing != null) Padding(padding: const EdgeInsets.only(right: 10), child: trailing!),
          ]),
        ),
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.color = PTokens.primary, this.icon});
  final String label;
  final VoidCallback? onPressed;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: color,
          disabledBackgroundColor: PTokens.line,
          disabledForegroundColor: const Color(0xFF64748B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
          textStyle: sans(size: 15, weight: FontWeight.w600),
          padding: const EdgeInsets.symmetric(horizontal: 20),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
        ]),
      ),
    );
  }
}

class GhostButton extends StatelessWidget {
  const GhostButton({super.key, required this.label, required this.onPressed, this.color = PTokens.ink, this.borderColor = PTokens.lineStrong});
  final String label;
  final VoidCallback? onPressed;
  final Color color;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          backgroundColor: PTokens.surface,
          side: BorderSide(color: borderColor),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
          textStyle: sans(size: 15, weight: FontWeight.w600),
        ),
        child: Text(label, textAlign: TextAlign.center),
      ),
    );
  }
}

class LinkButton extends StatelessWidget {
  const LinkButton({super.key, required this.label, required this.onPressed, this.color = PTokens.primaryDark});
  final String label;
  final VoidCallback? onPressed;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(foregroundColor: color, minimumSize: const Size(44, 44), textStyle: sans(size: 14, weight: FontWeight.w600)),
      child: Text(label, textAlign: TextAlign.center),
    );
  }
}

enum PillKind { ok, warn, info, mute, danger }

class Pill extends StatelessWidget {
  const Pill(this.text, this.kind, {super.key});
  final String text;
  final PillKind kind;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (kind) {
      PillKind.ok => (PTokens.successSoft, PTokens.success),
      PillKind.warn => (PTokens.warnSoft, const Color(0xFF92400E)),
      PillKind.info => (PTokens.primarySoft, PTokens.primaryDark),
      PillKind.mute => (const Color(0xFFF1F5F9), const Color(0xFF334155)),
      PillKind.danger => (PTokens.dangerSoft, PTokens.danger),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text, style: sans(size: 12, weight: FontWeight.w600, color: fg)),
    );
  }
}

class PnrTag extends StatelessWidget {
  const PnrTag(this.pnr, {super.key});
  final String pnr;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: PTokens.pnrSoft, borderRadius: BorderRadius.circular(4)),
        child: Text(pnr, style: mono(size: 13, color: PTokens.pnr)),
      );
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 14), this.color = PTokens.surface, this.borderColor = PTokens.line, this.onTap});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;
  final Color borderColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(PTokens.radius), border: Border.all(color: borderColor)),
      child: child,
    );
    if (onTap == null) return box;
    return Material(color: Colors.transparent, child: InkWell(borderRadius: BorderRadius.circular(PTokens.radius), onTap: onTap, child: box));
  }
}

class KeyValue extends StatelessWidget {
  const KeyValue(this.label, this.value, {super.key, this.isMono = false, this.valueColor = PTokens.ink});
  final String label;
  final String value;
  final bool isMono;
  final Color valueColor;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: sans(size: 12, color: PTokens.muted)),
        const SizedBox(height: 2),
        Text(value, style: isMono ? mono(size: 14, color: valueColor) : sans(size: 14, weight: FontWeight.w600, color: valueColor)),
      ]);
}

/// Sticky bottom action area of the booking funnel.
class BottomAction extends StatelessWidget {
  const BottomAction({super.key, required this.children, this.column = false});
  final List<Widget> children;
  final bool column;

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(color: PTokens.surface, border: Border(top: BorderSide(color: PTokens.line))),
        padding: EdgeInsets.fromLTRB(pWide(context) ? 24 : 16, 12, pWide(context) ? 24 : 16, 12),
        child: SafeArea(
          top: false,
          child: column
              // Stacked buttons keep a button width on wide screens instead of spanning the screen.
              ? PMaxWidth(maxWidth: 480, child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: _gap(children)))
              : Row(children: _gap(children)),
        ),
      );

  List<Widget> _gap(List<Widget> items) => [for (var i = 0; i < items.length; i++) ...[if (i > 0) SizedBox(width: column ? 0 : 12, height: column ? 8 : 0), items[i]]];
}

/// Amber countdown of the seat hold or payment window, red under 2 minutes (BR-HOLD-003).
class HoldBanner extends StatelessWidget {
  const HoldBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    if (store.holdPhase == null) return const SizedBox.shrink();
    final left = store.holdLeft.clamp(0, 9999);
    final urgent = left <= 120;
    final label = store.holdPhase == 'pay' ? 'Hoàn tất chuyển khoản trong' : 'Đang giữ ghế ${store.seats.join(', ')} cho bạn';
    final mmss = '${(left ~/ 60).toString().padLeft(2, '0')}:${(left % 60).toString().padLeft(2, '0')}';
    return Semantics(
      liveRegion: true,
      child: Container(
        color: urgent ? PTokens.dangerSoft : PTokens.warnSoft,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(children: [
          Icon(Icons.timer_outlined, size: 18, color: urgent ? const Color(0xFF7F1D1D) : PTokens.warnInk),
          const SizedBox(width: 10),
          Expanded(child: Text('${urgent ? 'Sắp hết giờ. ' : ''}$label', style: sans(size: 13, color: urgent ? const Color(0xFF7F1D1D) : PTokens.warnInk))),
          Text(mmss, style: mono(size: 15, weight: FontWeight.w700, color: urgent ? const Color(0xFF7F1D1D) : PTokens.warnInk)),
        ]),
      ),
    );
  }
}

/// Illustration of a QR code; the real payload comes from the server (PAX-013, PAX-017).
class QrView extends StatelessWidget {
  const QrView({super.key, required this.seed, this.size = 232, this.cells = 25, this.label});
  final int seed;
  final double size;
  final int cells;
  final String? label;

  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        image: true,
        child: Container(
          width: size,
          height: size,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.white, border: Border.all(color: PTokens.line), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
          child: CustomPaint(painter: _QrPainter(seed, cells)),
        ),
      );
}

class _QrPainter extends CustomPainter {
  _QrPainter(this.seed, this.n);
  final int seed;
  final int n;

  bool? _finder(int r, int c) {
    List<int>? box;
    if (r < 7 && c < 7) box = [0, 0];
    if (r < 7 && c >= n - 7) box = [0, n - 7];
    if (r >= n - 7 && c < 7) box = [n - 7, 0];
    if (box == null) return null;
    final rr = r - box[0], cc = c - box[1];
    return rr == 0 || rr == 6 || cc == 0 || cc == 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.width / n;
    final paint = Paint()..color = PTokens.ink;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        final f = _finder(r, c);
        final on = f ?? ((r * 7 + c * 13 + r * c * (seed % 5 + 1) + seed) % 5 < 2);
        if (on) canvas.drawRect(Rect.fromLTWH(c * cell, r * cell, cell + 0.5, cell + 0.5), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_QrPainter old) => old.seed != seed || old.n != n;
}

/// Bottom sheet with the grab handle of the design.
Future<T?> showAppSheet<T>(BuildContext context, {required Widget Function(BuildContext) builder, bool dismissible = true}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    isDismissible: dismissible,
    enableDrag: dismissible,
    backgroundColor: PTokens.surface,
    constraints: const BoxConstraints(maxWidth: 600),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: PTokens.lineStrong, borderRadius: BorderRadius.circular(999)))),
            const SizedBox(height: 14),
            builder(ctx),
          ]),
        ),
      ),
    ),
  );
}

void showToast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message, style: sans(size: 14, color: Colors.white)), duration: const Duration(seconds: 3)));
}

/// Dials the company's hotline from the server profile; never a number baked into the app.
Future<void> callHotline(BuildContext context, String hotline) async {
  final digits = hotline.replaceAll(RegExp(r'[^0-9+]'), '');
  if (digits.isEmpty || !await launchUrl(Uri(scheme: 'tel', path: digits))) {
    if (context.mounted) showToast(context, 'Không gọi được tổng đài ${hotline.isEmpty ? 'nhà xe' : hotline}.');
  }
}

Widget gap(double h) => SizedBox(height: h);

/// Text field with its label above (design: label above input).
class LabeledField extends StatelessWidget {
  const LabeledField({
    super.key,
    required this.label,
    required this.controller,
    this.keyboardType,
    this.errorText,
    this.isMono = false,
    this.hint,
    this.maxLength,
    this.autofocus = false,
    this.inputFormatters,
    this.textInputAction,
    this.onSubmitted,
    this.autofillHints,
    this.textCapitalization = TextCapitalization.none,
    this.showCounter = false,
  });

  final String label;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final String? errorText;
  final bool isMono;
  final String? hint;
  final int? maxLength;
  final bool autofocus;
  final List<TextInputFormatter>? inputFormatters;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String>? autofillHints;
  final TextCapitalization textCapitalization;
  final bool showCounter;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: sans(size: 13, color: const Color(0xFF334155))),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          autofocus: autofocus,
          maxLength: maxLength,
          inputFormatters: inputFormatters,
          textInputAction: textInputAction,
          onSubmitted: onSubmitted,
          autofillHints: autofillHints,
          textCapitalization: textCapitalization,
          style: isMono ? mono(size: 15) : sans(size: 15, weight: FontWeight.w500),
          decoration: InputDecoration(
            hintText: hint,
            errorText: errorText,
            counterText: showCounter ? null : '',
          ),
        ),
      ]);
}

bool validPhone(String raw) {
  final cleaned = raw.replaceAll(RegExp(r'[\s.-]'), '');
  return RegExp(r'^(?:\+84|84|0)(3|5|7|8|9)\d{8}$').hasMatch(cleaned);
}

String normalizePhone(String raw) {
  final cleaned = raw.replaceAll(RegExp(r'[\s.-]'), '');
  if (cleaned.startsWith('+84')) return '0${cleaned.substring(3)}';
  if (cleaned.startsWith('84')) return '0${cleaned.substring(2)}';
  return cleaned;
}

String normalizeName(String raw) => raw.trim().replaceAll(RegExp(r'\s+'), ' ');

String? nameError(String raw) {
  final normalized = normalizeName(raw);
  if (normalized.length < 2 || normalized.length > 60) {
    return 'Họ tên cần 2-60 ký tự.';
  }
  final forbiddenPattern = RegExp(r'[\d<>{}[\]@#$%^*=_|\\/~]');
  final letterPattern = RegExp(r'\p{L}', unicode: true);
  if (forbiddenPattern.hasMatch(normalized) || !letterPattern.hasMatch(normalized)) {
    return 'Họ tên không được chứa số hoặc ký tự đặc biệt.';
  }
  return null;
}

/// Material empty state: a tonal circle with the icon, a title, what will show here, and the next step.
/// Inside a scroll view so a pull still refreshes the list ([onRefresh]).
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.message, this.actionLabel, this.actionIcon, this.onAction, this.onRefresh});
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final IconData? actionIcon;
  final VoidCallback? onAction;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final content = LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: box.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(32, 24, 32, 48),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 112,
                    height: 112,
                    decoration: const BoxDecoration(color: PTokens.primarySoft, shape: BoxShape.circle),
                    child: Icon(icon, size: 52, color: PTokens.primary),
                  ),
                  const SizedBox(height: 24),
                  Text(title, textAlign: TextAlign.center, style: sans(size: 20, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(message, textAlign: TextAlign.center, style: sans(size: 14, color: PTokens.muted, height: 1.5)),
                  if (actionLabel != null && onAction != null) ...[
                    const SizedBox(height: 24),
                    SizedBox(
                      height: 48,
                      child: FilledButton.icon(
                        onPressed: onAction,
                        icon: Icon(actionIcon ?? Icons.arrow_forward, size: 20),
                        label: Text(actionLabel!),
                        style: FilledButton.styleFrom(
                          backgroundColor: PTokens.primary,
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          shape: const StadiumBorder(),
                          textStyle: sans(size: 15, weight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ],
                ]),
              ),
            ),
          ),
        ),
      ),
    );
    return onRefresh == null ? content : RefreshIndicator(onRefresh: onRefresh!, child: content);
  }
}
