import 'package:flutter/material.dart';

import 'passenger_checkout_screen.dart';
import 'passenger_login_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-009: two decks, every seat state has a text label (never colour alone), at most 5 seats.
/// "Giữ ghế" asks for an account first when there is none, keeping the selection (D106).
class PassengerSeatMapScreen extends StatefulWidget {
  const PassengerSeatMapScreen({super.key});

  /// Deck label for phone tabs and wide-screen card titles.
  static String deckTitle(List<int> decks, int deck, int free) {
    if (decks.length <= 1) return '$free ghế trống';
    if (decks.length == 2) {
      return '${deck == decks.first ? 'Tầng dưới' : 'Tầng trên'} · $free trống';
    }
    return 'Tầng $deck · $free trống';
  }

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

  /// Rows of one deck built as a grid from row/column.
  List<Widget> _deckRows(PassengerStore store, int deck) {
    final deckSeats = store.seatMap.where((s) => s.deck == deck).toList();
    final seatByRowCol = <(int, int), Seat>{
      for (final s in deckSeats) (s.row, s.column): s,
    };
    final seatCols = deckSeats.map((s) => s.column).toSet();
    final maxRow = deckSeats.fold<int>(0, (m, s) => s.row > m ? s.row : m);
    final totalCols = store.seatColumns;

    return [
      Row(children: [const Icon(Icons.adjust, size: 18, color: PTokens.muted), const SizedBox(width: 8), Text('Đầu xe', style: sans(size: 12, color: PTokens.muted))]),
      gap(10),
      for (var r = 1; r <= maxRow; r++) ...[
        Row(children: [
          for (var c = 1; c <= totalCols; c++)
            if (!seatCols.contains(c))
              const SizedBox(width: 20)
            else if (seatByRowCol.containsKey((r, c)))
              Expanded(
                child: _SeatButton(
                  code: seatByRowCol[(r, c)]!.code,
                  state: seatByRowCol[(r, c)]!.state,
                  onLimit: () => setState(() => _limitHit = true),
                ),
              )
            else
              const Expanded(child: SizedBox()),
        ]),
        gap(10),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final wide = pWide(context);
    final decks = store.decks.isEmpty ? [1] : store.decks;
    final p = store.stop(store.pickup);
    final d = store.stop(store.dropoff);
    return Scaffold(
      appBar: TopBar(title: 'Chọn ghế', subtitle: '${p.short} → ${d.short} · tối đa ${PassengerStore.maxSeats} ghế'),
      body: Column(children: [
        Container(
          width: double.infinity,
          color: PTokens.surface,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(children: [
            // Wide screens show every deck at once, so the deck switch is only for phones with multiple decks.
            if (!wide && decks.length > 1) Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
              child: Row(children: [
                for (final d in decks)
                  _DeckTab(label: PassengerSeatMapScreen.deckTitle(decks, d, store.freeOnDeck(d)), selected: store.deck == d, onTap: () => store.setDeck(d)),
              ]),
            ),
            if (!wide && decks.length > 1) gap(10),
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
              : wide
              ? SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Column(children: [
                    Row(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                      for (final d in decks) ...[
                        if (d != decks.first) const SizedBox(width: 24),
                        Flexible(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 380),
                            // Each deck in its own card so the two seat plans don't read as one.
                            child: AppCard(padding: const EdgeInsets.fromLTRB(16, 14, 16, 6), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                            Text(PassengerSeatMapScreen.deckTitle(decks, d, store.freeOnDeck(d)), style: sans(size: 15, weight: FontWeight.w600)),
                            gap(10),
                            ..._deckRows(store, d),
                          ])),
                          ),
                        ),
                      ],
                    ]),
                    if (_limitHit) Text('Mỗi lần đặt tối đa ${PassengerStore.maxSeats} ghế.', style: sans(size: 13, color: PTokens.danger)),
                  ]),
                )
              : ListView(padding: const EdgeInsets.fromLTRB(32, 16, 32, 16), children: [
                  ..._deckRows(store, decks.contains(store.deck) ? store.deck : decks.first),
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
            SeatState.free => (PTokens.surface, const Color(0xFF94A3B8), PTokens.ink, '${(store.trip != null ? store.fareOf(store.trip!) : 0) ~/ 1000}k', true),
          };
    final semantic = selected ? 'bạn đang chọn' : switch (state) { SeatState.held => 'người khác đang giữ', SeatState.booked => 'đã bán', SeatState.blocked => 'khóa kỹ thuật', SeatState.free => 'trống' };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Semantics(
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
            padding: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(color: bg, border: Border.all(color: border, width: 1.5), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              FittedBox(fit: BoxFit.scaleDown, child: Text(code, style: mono(size: 15, color: fg))),
              FittedBox(fit: BoxFit.scaleDown, child: Text(sub, style: sans(size: 11, weight: FontWeight.w500, color: fg))),
            ]),
          ),
        ),
      ),
    );
  }
}
