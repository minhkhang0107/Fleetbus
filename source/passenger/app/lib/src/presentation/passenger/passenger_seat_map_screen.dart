import 'package:flutter/material.dart';

import 'passenger_checkout_screen.dart';
import 'passenger_login_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-009: two decks, every seat state has a text label (never colour alone), at most 5 seats.
/// "Giữ ghế" asks for an account first when there is none, keeping the selection (D106).
class PassengerSeatMapScreen extends StatefulWidget {
  const PassengerSeatMapScreen({super.key});

  @override
  State<PassengerSeatMapScreen> createState() => _PassengerSeatMapScreenState();
}

class _PassengerSeatMapScreenState extends State<PassengerSeatMapScreen> {
  bool _limitHit = false;
  bool _holding = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final error = await PassengerScope.read(context).loadSeatMap();
      if (mounted) setState(() => _error = error);
    });
  }

  Future<void> _hold() async {
    final store = PassengerScope.read(context);
    if (!store.loggedIn) {
      final ok = await showLoginSheet(context, seats: store.seats.join(', '));
      if (!ok || !mounted) return;
    }
    setState(() => _holding = true);
    final error = await store.holdSeats();
    if (!mounted) return;
    setState(() => _holding = false);
    if (error != null) {
      showToast(context, error);
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerCheckoutScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final seats = store.deckSeats(store.deck);
    final left = seats.keys.where((c) => c.startsWith('A')).toList();
    final right = seats.keys.where((c) => c.startsWith('B')).toList();
    final rows = left.length > right.length ? left.length : right.length;
    final p = store.stop(store.pickup);
    final d = store.stop(store.dropoff);
    return Scaffold(
      appBar: TopBar(title: 'Chọn ghế', subtitle: '${p.short} → ${d.short} · tối đa ${PassengerStore.maxSeats} ghế'),
      body: Column(children: [
        Container(
          color: PTokens.surface,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(children: [
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
              child: Row(children: [
                for (final d in store.decks.isEmpty ? [1] : store.decks)
                  _DeckTab(label: '${d == 1 ? 'Tầng dưới' : 'Tầng trên'} · ${store.freeOnDeck(d)} trống', selected: store.deck == d, onTap: () => store.setDeck(d)),
              ]),
            ),
            gap(10),
            Wrap(spacing: 12, runSpacing: 6, children: const [
              _Legend(fill: PTokens.surface, border: Color(0xFF94A3B8), label: 'Trống'),
              _Legend(fill: PTokens.primary, border: PTokens.primary, label: 'Bạn chọn'),
              _Legend(fill: PTokens.warnSoft, border: PTokens.warn, label: 'Người khác giữ'),
              _Legend(fill: PTokens.line, border: PTokens.line, label: 'Đã bán'),
            ]),
          ]),
        ),
        const Divider(height: 1, color: PTokens.line),
        Expanded(
          child: store.loadingSeats
              ? const Center(child: CircularProgressIndicator())
              : _error != null
              ? Padding(padding: const EdgeInsets.all(16), child: Text(_error!, style: sans(size: 15, color: PTokens.danger)))
              : ListView(padding: const EdgeInsets.fromLTRB(32, 16, 32, 16), children: [
            Row(children: [const Icon(Icons.adjust, size: 18, color: PTokens.muted), const SizedBox(width: 8), Text('Đầu xe', style: sans(size: 12, color: PTokens.muted))]),
            gap(10),
            for (var i = 0; i < rows; i++) ...[
              Row(children: [
                Expanded(child: i < left.length ? _SeatButton(code: left[i], state: seats[left[i]]!, onLimit: () => setState(() => _limitHit = true)) : const SizedBox()),
                const SizedBox(width: 68),
                Expanded(child: i < right.length ? _SeatButton(code: right[i], state: seats[right[i]]!, onLimit: () => setState(() => _limitHit = true)) : const SizedBox()),
              ]),
              gap(10),
            ],
            if (_limitHit) Text('Mỗi lần đặt tối đa ${PassengerStore.maxSeats} ghế.', style: sans(size: 13, color: PTokens.danger)),
          ]),
        ),
      ]),
      bottomNavigationBar: BottomAction(children: [
        Expanded(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(store.seats.isEmpty ? 'Chưa chọn ghế' : 'Ghế ${store.seats.join(', ')}', style: sans(size: 12, color: PTokens.muted), overflow: TextOverflow.ellipsis),
            Text(vnd(store.baseFare), style: mono(size: 17, weight: FontWeight.w700)),
          ]),
        ),
        PrimaryButton(label: _holding ? 'Đang giữ ghế…' : (store.seats.isEmpty ? 'Chọn ít nhất 1 ghế' : 'Giữ ghế 10 phút'), onPressed: store.seats.isEmpty || _holding ? null : _hold),
      ]),
    );
  }
}

class _DeckTab extends StatelessWidget {
  const _DeckTab({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Semantics(
          selected: selected,
          button: true,
          child: GestureDetector(
            onTap: onTap,
            child: Container(
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? PTokens.surface : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                boxShadow: selected ? const [BoxShadow(color: Color(0x140F172A), blurRadius: 2, offset: Offset(0, 1))] : null,
              ),
              child: Text(label, style: sans(size: 14, weight: FontWeight.w600, color: selected ? PTokens.primaryDark : PTokens.muted)),
            ),
          ),
        ),
      );
}

class _Legend extends StatelessWidget {
  const _Legend({required this.fill, required this.border, required this.label});
  final Color fill;
  final Color border;
  final String label;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 14, height: 14, decoration: BoxDecoration(color: fill, border: Border.all(color: border, width: 1.5), borderRadius: BorderRadius.circular(4))),
        const SizedBox(width: 6),
        Text(label, style: sans(size: 12, color: const Color(0xFF334155))),
      ]);
}

class _SeatButton extends StatelessWidget {
  const _SeatButton({required this.code, required this.state, required this.onLimit});
  final String code;
  final SeatState state;
  final VoidCallback onLimit;

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final selected = store.seats.contains(code);
    final (bg, border, fg, sub, enabled) = selected
        ? (PTokens.primary, PTokens.primaryDark, Colors.white, 'Bạn chọn', true)
        : switch (state) {
            SeatState.held => (PTokens.warnSoft, PTokens.warn, const Color(0xFF92400E), 'Đang giữ', false),
            SeatState.booked => (PTokens.line, PTokens.line, const Color(0xFF64748B), 'Đã bán', false),
            SeatState.blocked => (PTokens.dangerSoft, const Color(0xFFFCA5A5), const Color(0xFF991B1B), 'Khóa', false),
            SeatState.free => (PTokens.surface, const Color(0xFF94A3B8), PTokens.ink, '${(store.trip?.price ?? 0) ~/ 1000}k', true),
          };
    final semantic = selected ? 'bạn đang chọn' : switch (state) { SeatState.held => 'người khác đang giữ', SeatState.booked => 'đã bán', SeatState.blocked => 'khóa kỹ thuật', SeatState.free => 'trống' };
    return Semantics(
      button: true,
      enabled: enabled,
      selected: selected,
      label: 'Ghế $code, $semantic',
      excludeSemantics: true,
      child: InkWell(
        onTap: enabled
            ? () {
                if (!store.toggleSeat(code)) onLimit();
              }
            : null,
        borderRadius: BorderRadius.circular(PTokens.radiusControl),
        child: Container(
          height: 60,
          decoration: BoxDecoration(color: bg, border: Border.all(color: border, width: 1.5), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(code, style: mono(size: 15, color: fg)),
            Text(sub, style: sans(size: 11, weight: FontWeight.w500, color: fg)),
          ]),
        ),
      ),
    );
  }
}
