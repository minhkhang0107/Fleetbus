import 'package:flutter/material.dart';

import 'passenger_main_shell.dart';
import 'passenger_splash_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// D146: the launch screen. The brand on its colour while the app restores the company the passenger chose; then
/// the feature pages as long as no company is chosen, else the welcome screen.
class PassengerLaunchScreen extends StatefulWidget {
  const PassengerLaunchScreen({super.key, required this.restore});

  /// Restores the saved company (and anything else the first screen needs).
  final Future<void> Function() restore;

  @override
  State<PassengerLaunchScreen> createState() => _PassengerLaunchScreenState();
}

class _PassengerLaunchScreenState extends State<PassengerLaunchScreen> {
  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    // At least a short moment on the brand, never longer than the restore takes.
    await Future.wait([widget.restore().catchError((_) {}), Future<void>.delayed(const Duration(milliseconds: 900))]);
    if (!mounted) return;
    // With a company already chosen the passenger goes straight in; without one, the app introduces itself first.
    final store = PassengerScope.read(context);
    final seen = store.operator != null;
    final loggedIn = store.loggedIn;
    Navigator.of(context).pushReplacement(PageRouteBuilder(
      transitionDuration: const Duration(milliseconds: 400),
      pageBuilder: (_, __, ___) => !seen
          ? const PassengerOnboardingScreen()
          : (loggedIn ? const PassengerMainShell() : const PassengerSplashScreen()),
      transitionsBuilder: (_, a, __, child) => FadeTransition(opacity: a, child: child),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF3B82F6), Color(0xFF1D4ED8)]),
        ),
        // The logo stays exactly where the system launch screen drew it (the middle), so nothing jumps.
        child: Stack(children: [
          Center(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.92, end: 1),
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeOutBack,
              builder: (_, v, child) => Transform.scale(scale: v, child: child),
              child: Image.asset('assets/brand/mark.png', width: 104, height: 104),
            ),
          ),
          Align(
            alignment: const Alignment(0, 0.32),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: const Duration(milliseconds: 500),
              builder: (_, v, child) => Opacity(opacity: v, child: child),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('BusGo', style: sans(size: 34, weight: FontWeight.w700, color: Colors.white)),
                gap(6),
                Text('Đặt vé, theo dõi xe tới đón bạn', style: sans(size: 15, color: const Color(0xFFDBEAFE))),
              ]),
            ),
          ),
          const Align(
            alignment: Alignment(0, 0.86),
            child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)),
          ),
        ]),
      ),
    );
  }
}

class _Feature {
  const _Feature({required this.icon, required this.color, required this.soft, required this.title, required this.body, required this.chips});
  final IconData icon;
  final Color color;
  final Color soft;
  final String title;
  final String body;
  final List<(IconData, String)> chips;
}

const _features = [
  _Feature(
    icon: Icons.event_seat_rounded,
    color: Color(0xFF2563EB),
    soft: Color(0xFFDBEAFE),
    title: 'Đặt vé trong một phút',
    body: 'Chọn chuyến, chọn ghế trên sơ đồ xe. Ghế được giữ 10 phút cho bạn thanh toán bằng chuyển khoản QR.',
    chips: [(Icons.timer_outlined, 'Giữ ghế 10 phút'), (Icons.qr_code_2, 'Vé QR trên máy')],
  ),
  _Feature(
    icon: Icons.home_rounded,
    color: Color(0xFFD97706),
    soft: Color(0xFFFEF3C7),
    title: 'Đón tận nhà, biết lượt của mình',
    body: 'Nhà xe đón bạn tại nhà. Bạn có giờ hẹn riêng và biết mình là điểm đón thứ mấy, không phải ra đứng chờ sớm.',
    chips: [(Icons.schedule, 'Hẹn 18:50'), (Icons.format_list_numbered, 'Điểm đón thứ 2/3')],
  ),
  _Feature(
    icon: Icons.map_rounded,
    color: Color(0xFF059669),
    soft: Color(0xFFD1FAE5),
    title: 'Theo dõi xe trên bản đồ',
    body: 'Xem xe đang ở đâu, còn mấy trạm tới bạn, xe tới lúc mấy giờ và có trễ không.',
    chips: [(Icons.directions_bus, 'Xe còn 8 phút'), (Icons.place_outlined, 'Vừa qua Phủ Lý')],
  ),
  _Feature(
    icon: Icons.notifications_active_rounded,
    color: Color(0xFF7C3AED),
    soft: Color(0xFFEDE9FE),
    title: 'Báo bạn khi xe sắp tới',
    body: 'Nhận thông báo khi tài xế lên đường và khi xe sắp tới. Bấm "Sẵn sàng" hoặc "+5 phút", không cần nghe điện thoại.',
    chips: [(Icons.check_circle_outline, 'Sẵn sàng'), (Icons.more_time, '+5 phút')],
  ),
];

/// D146: what the app does, in four pages, each launch until a company is chosen (and from the profile).
class PassengerOnboardingScreen extends StatefulWidget {
  const PassengerOnboardingScreen({super.key, this.replay = false});

  /// Opened again from the profile: finishing goes back where the passenger was.
  final bool replay;

  @override
  State<PassengerOnboardingScreen> createState() => _PassengerOnboardingScreenState();
}

class _PassengerOnboardingScreenState extends State<PassengerOnboardingScreen> {
  final _pages = PageController();
  int _page = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _finish() {
    if (widget.replay) {
      Navigator.of(context).pop();
      return;
    }
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const PassengerSplashScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final last = _page == _features.length - 1;
    final f = _features[_page];
    return Scaffold(
      backgroundColor: PTokens.surface,
      body: SafeArea(
        child: PMaxWidth(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
              child: Row(children: [
                Image.asset('assets/brand/logo.png', width: 32, height: 32),
                const SizedBox(width: 8),
                Text('BusGo', style: sans(size: 17, weight: FontWeight.w700)),
                const Spacer(),
                AnimatedOpacity(
                  opacity: last ? 0 : 1,
                  duration: const Duration(milliseconds: 200),
                  child: TextButton(onPressed: last ? null : _finish, child: Text('Bỏ qua', style: sans(size: 15, weight: FontWeight.w600, color: PTokens.muted))),
                ),
              ]),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pages,
                itemCount: _features.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (_, i) => _FeaturePage(feature: _features[i]),
              ),
            ),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 0; i < _features.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: i == _page ? 24 : 8,
                  height: 8,
                  decoration: BoxDecoration(color: i == _page ? f.color : PTokens.line, borderRadius: BorderRadius.circular(4)),
                ),
            ]),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: f.color, shape: const StadiumBorder()),
                  onPressed: last ? _finish : () => _pages.nextPage(duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic),
                  child: Text(last ? 'Bắt đầu' : 'Tiếp', style: sans(size: 16, weight: FontWeight.w700, color: Colors.white)),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _FeaturePage extends StatelessWidget {
  const _FeaturePage({required this.feature});
  final _Feature feature;

  @override
  Widget build(BuildContext context) {
    final f = feature;
    return LayoutBuilder(builder: (context, box) {
      final art = (box.maxHeight * 0.48).clamp(180.0, 300.0);
      return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 28),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: box.maxHeight),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            SizedBox(
              width: art + 60,
              height: art,
              child: Stack(alignment: Alignment.center, children: [
                Container(width: art, height: art, decoration: BoxDecoration(color: f.soft, shape: BoxShape.circle)),
                Container(
                  width: art * 0.5,
                  height: art * 0.5,
                  decoration: BoxDecoration(
                    color: f.color,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: f.color.withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 10))],
                  ),
                  child: Icon(f.icon, color: Colors.white, size: art * 0.24),
                ),
                Positioned(top: art * 0.08, right: 0, child: _Chip(icon: f.chips[0].$1, label: f.chips[0].$2, color: f.color)),
                Positioned(bottom: art * 0.1, left: 0, child: _Chip(icon: f.chips[1].$1, label: f.chips[1].$2, color: f.color)),
              ]),
            ),
            gap(32),
            Text(f.title, textAlign: TextAlign.center, style: sans(size: 24, weight: FontWeight.w700, color: PTokens.ink)),
            gap(12),
            Text(f.body, textAlign: TextAlign.center, style: sans(size: 15, color: PTokens.muted, height: 1.5)),
          ]),
        ),
      );
    });
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label, required this.color});
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          boxShadow: const [BoxShadow(color: Color(0x1F0F172A), blurRadius: 16, offset: Offset(0, 6))],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 6),
          Text(label, style: sans(size: 13, weight: FontWeight.w600, color: PTokens.ink)),
        ]),
      );
}
