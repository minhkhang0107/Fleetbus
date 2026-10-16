import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import 'package:url_launcher/url_launcher.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-004 zone 2: the bus company's promotions, one slide per page. Hidden when the server sends none (D124).
class PromoSlider extends StatefulWidget {
  const PromoSlider({super.key, required this.banners});
  final List<PromoBanner> banners;

  @override
  State<PromoSlider> createState() => _PromoSliderState();
}

class _PromoSliderState extends State<PromoSlider> {
  static const _autoAdvance = Duration(seconds: 5);
  final _controller = PageController();
  Timer? _timer;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _restartTimer();
  }

  @override
  void didUpdateWidget(PromoSlider old) {
    super.didUpdateWidget(old);
    if (_page >= widget.banners.length) _page = 0;
    _restartTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _restartTimer() {
    _timer?.cancel();
    if (widget.banners.length < 2) return;
    _timer = Timer.periodic(_autoAdvance, (_) {
      if (!_controller.hasClients) return;
      _controller.animateToPage((_page + 1) % widget.banners.length, duration: const Duration(milliseconds: 400), curve: Curves.easeInOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    final banners = widget.banners;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Ưu đãi từ nhà xe', style: sans(size: 15, weight: FontWeight.w600)),
      gap(10),
      SizedBox(
        height: 148,
        child: PageView.builder(
          controller: _controller,
          padEnds: false,
          itemCount: banners.length,
          onPageChanged: (i) {
            setState(() => _page = i);
            _restartTimer(); // a swipe restarts the countdown instead of jumping right after it
          },
          itemBuilder: (_, i) => _Slide(banner: banners[i]),
        ),
      ),
      if (banners.length > 1) ...[
        gap(10),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          for (var i = 0; i < banners.length; i++)
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == _page ? 18 : 6,
              height: 6,
              decoration: BoxDecoration(color: i == _page ? PTokens.primary : PTokens.lineStrong, borderRadius: BorderRadius.circular(3)),
            ),
        ]),
      ],
    ]);
  }
}

class _Slide extends StatelessWidget {
  const _Slide({required this.banner});
  final PromoBanner banner;

  @override
  Widget build(BuildContext context) {
    final color = banner.color ?? PTokens.primary;
    final drawn = Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [color, Color.lerp(color, Colors.black, 0.25)!], begin: Alignment.topLeft, end: Alignment.bottomRight),
      ),
      child: Stack(children: [
        Positioned(right: -8, bottom: -12, child: Icon(Icons.local_offer_outlined, size: 96, color: Colors.white.withValues(alpha: 0.14))),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(banner.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: sans(size: 18, weight: FontWeight.w700, color: Colors.white)),
          if (banner.subtitle.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(banner.subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: sans(size: 13, color: Colors.white.withValues(alpha: 0.9))),
          ],
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
            child: Text('Xem chi tiết', style: sans(size: 13, weight: FontWeight.w600, color: color)),
          ),
        ]),
      ]),
    );
    final image = banner.imageUrl;
    return Semantics(
      button: true,
      label: banner.title,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(PTokens.radius),
          child: Material(
            color: color,
            child: InkWell(
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerPromoScreen(banner: banner))),
              // A company that uploads artwork shows it as is; a broken image falls back to the drawn slide.
              child: image == null
                  ? drawn
                  : Image.network(image, fit: BoxFit.cover, width: double.infinity, height: double.infinity, errorBuilder: (_, __, ___) => drawn),
            ),
          ),
        ),
      ),
    );
  }
}

/// The HTML page of one promotion, as sent by the server. Rendered as widgets: no JavaScript runs.
class PassengerPromoScreen extends StatefulWidget {
  const PassengerPromoScreen({super.key, required this.banner});
  final PromoBanner banner;

  @override
  State<PassengerPromoScreen> createState() => _PassengerPromoScreenState();
}

class _PassengerPromoScreenState extends State<PassengerPromoScreen> {
  late Future<ApiResult<String>> _page;

  @override
  void initState() {
    super.initState();
    _page = PassengerScope.read(context).loadBannerPage(widget.banner.id);
  }

  void _retry() => setState(() => _page = PassengerScope.read(context).loadBannerPage(widget.banner.id));

  Future<bool> _openLink(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !(uri.scheme == 'https' || uri.scheme == 'http' || uri.scheme == 'tel')) return true;
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) showToast(context, 'Không mở được liên kết.');
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: PTokens.canvas,
      appBar: TopBar(title: widget.banner.title),
      body: FutureBuilder<ApiResult<String>>(
        future: _page,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          final r = snap.data!;
          if (!r.ok) {
            final gone = r.code == 'BANNER_NOT_FOUND';
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(gone ? 'Chương trình này đã kết thúc.' : r.error!, textAlign: TextAlign.center, style: sans(size: 15, color: PTokens.muted)),
                  if (!gone) ...[gap(16), GhostButton(label: 'Thử lại', onPressed: _retry)],
                ]),
              ),
            );
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: PMaxWidth(
              maxWidth: 720,
              child: AppCard(
                padding: const EdgeInsets.all(16),
                child: HtmlWidget(r.value!, textStyle: sans(size: 15), onTapUrl: _openLink),
              ),
            ),
          );
        },
      ),
    );
  }
}
