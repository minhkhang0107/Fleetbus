import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';

/// Derives COD presets from fare: exact fare first, then next round amounts above it without duplicates.
List<int> codPresets(int fare) {
  final presets = <int>[fare];
  final next100k = ((fare ~/ 100000) + 1) * 100000;
  if (!presets.contains(next100k)) {
    presets.add(next100k);
  }
  var next500k = ((fare ~/ 500000) + 1) * 500000;
  if (next500k <= presets.last) {
    next500k = ((presets.last ~/ 500000) + 1) * 500000;
  }
  if (!presets.contains(next500k)) {
    presets.add(next500k);
  }
  return presets;
}

/// DRI-012: collect the COD fare and board in one step. Change goes back in cash, to the wallet,
/// or as a debt receipt within the trip limit of 1.000.000 đ (BR-COD-005).
Future<void> showCodSheet(BuildContext context, Passenger p) async {
  final store = DriverScope.read(context);
  final result = await showDriverSheet<({int given, String method})>(
    context,
    builder: (ctx) => _CodSheetContent(passenger: p, store: store),
  );
  if (result == null || !context.mounted) return;
  final error = await store.collectCod(p, given: result.given, method: result.method);
  if (!context.mounted) return;
  dToast(context, error ?? 'Đã thu ${vnd(p.cod)}, ghế ${p.seat} đã lên xe');
}

class _CodSheetContent extends StatefulWidget {
  const _CodSheetContent({required this.passenger, required this.store});
  final Passenger passenger;
  final DriverStore store;

  @override
  State<_CodSheetContent> createState() => _CodSheetContentState();
}

class _CodSheetContentState extends State<_CodSheetContent> {
  late final List<int> presets;
  late int given;
  var method = 'CASH';
  late final TextEditingController customController;
  String? customError;

  @override
  void initState() {
    super.initState();
    presets = codPresets(widget.passenger.cod);
    given = widget.passenger.cod;
    customController = TextEditingController();
  }

  @override
  void dispose() {
    customController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.passenger;
    final change = given - p.cod;
    final left = DriverStore.debtLimit - widget.store.debtIssued;
    final debtOk = change <= left;
    if (method == 'DEBT' && !debtOk) method = 'CASH';
    final hint = change <= 0
        ? 'Đủ tiền, không có tiền thừa'
        : switch (method) {
            'CASH' => 'Trả lại khách ${vnd(change)}',
            'WALLET' => 'Cộng ${vnd(change)} vào ví',
            _ => 'In biên lai nợ ${vnd(change)}',
          };
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Thu tiền vé COD', style: dsans(size: 18, weight: FontWeight.w700)),
            Text('Ghế ${p.seat} · ${p.name}', style: dsans(size: 14, color: DTokens.sub)),
          ]),
        ),
        IconButton(tooltip: 'Đóng', onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
      ]),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: DTokens.bg, borderRadius: BorderRadius.circular(10)),
        child: Row(children: [Text('Giá vé', style: dsans(size: 14, color: DTokens.muted)), const Spacer(), Text(vnd(p.cod), style: dmono(size: 26))]),
      ),
      const SizedBox(height: 14),
      Text('Khách đưa', style: dsans(size: 14, weight: FontWeight.w600)),
      const SizedBox(height: 8),
      Row(children: [
        for (final v in presets) ...[
          if (v != presets.first) const SizedBox(width: 8),
          Expanded(child: ChoiceTile(
            label: '${v ~/ 1000}k',
            center: true,
            selected: given == v && customController.text.isEmpty,
            onTap: () => setState(() {
              given = v;
              customController.clear();
              customError = null;
            }),
          )),
        ],
      ]),
      const SizedBox(height: 10),
      TextField(
        controller: customController,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: dmono(size: 15),
        decoration: InputDecoration(
          hintText: 'Nhập số tiền khác (tối thiểu ${vnd(p.cod)})',
          suffixText: 'đ',
          errorText: customError,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        ),
        onChanged: (val) {
          setState(() {
            if (val.trim().isEmpty) {
              customError = null;
              given = p.cod;
              return;
            }
            final parsed = int.tryParse(val.trim());
            if (parsed == null || parsed < p.cod) {
              customError = 'Số tiền phải từ ${vnd(p.cod)} trở lên';
            } else {
              customError = null;
              given = parsed;
            }
          });
        },
      ),
      if (change > 0) ...[
        const SizedBox(height: 14),
        Text.rich(TextSpan(children: [
          TextSpan(text: 'Tiền thừa ', style: dsans(size: 14, weight: FontWeight.w600)),
          TextSpan(text: vnd(change), style: dmono(size: 14, color: DTokens.warnInk)),
          TextSpan(text: ' trả bằng', style: dsans(size: 14, weight: FontWeight.w600)),
        ])),
        const SizedBox(height: 8),
        ChoiceTile(label: 'Trả tiền mặt ngay', hint: 'Đưa lại khách bây giờ', selected: method == 'CASH', onTap: () => setState(() => method = 'CASH')),
        const SizedBox(height: 8),
        ChoiceTile(label: 'Cộng vào ví của khách', hint: 'Theo số điện thoại trên vé', selected: method == 'WALLET', onTap: () => setState(() => method = 'WALLET')),
        const SizedBox(height: 8),
        ChoiceTile(
          label: 'Biên lai nhận tại trạm dừng',
          hint: debtOk ? 'Hạn mức chuyến còn ${vnd(left)}' : 'Vượt hạn mức chuyến (còn ${vnd(left)})',
          selected: method == 'DEBT',
          enabled: debtOk,
          onTap: () => setState(() => method = 'DEBT'),
        ),
      ],
      const SizedBox(height: 16),
      BigButton(
        label: 'Đã nhận ${vnd(given)} · Cho lên xe',
        subtitle: hint,
        color: DTokens.ok,
        height: 72,
        onPressed: (customError == null && given >= p.cod) ? () => Navigator.of(context).pop((given: given, method: method)) : null,
      ),
    ]);
  }
}

/// DRI-007 hail sale: a free seat, the stop where the passenger gets off, the trip fare in cash.
Future<void> showHailSheet(BuildContext context) async {
  final store = DriverScope.read(context);
  await store.loadFreeSeats();
  if (!context.mounted) return;
  if (store.freeSeats.isEmpty) {
    dToast(context, 'Xe đã hết ghế trống');
    return;
  }
  var seat = store.freeSeats.first;
  final after = store.stops.skip(store.stopIndex + 1).toList();
  if (after.isEmpty) {
    dToast(context, 'Xe đã ở bến cuối');
    return;
  }
  var to = after.last.id;
  final ok = await showDriverSheet<bool>(context, builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Khách vẫy dọc đường', style: dsans(size: 18, weight: FontWeight.w700)),
        const SizedBox(height: 12),
        Text('Ghế trống', style: dsans(size: 14, weight: FontWeight.w600)),
        const SizedBox(height: 8),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.2,
          children: [for (final c in store.freeSeats.take(6)) ChoiceTile(label: c, center: true, selected: seat == c, onTap: () => setSheet(() => seat = c))],
        ),
        const SizedBox(height: 12),
        Text('Xuống tại', style: dsans(size: 14, weight: FontWeight.w600)),
        const SizedBox(height: 8),
        for (final s in after) ...[ChoiceTile(label: s.name, selected: to == s.id, onTap: () => setSheet(() => to = s.id)), const SizedBox(height: 8)],
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: DTokens.bg, borderRadius: BorderRadius.circular(10)),
          child: Row(children: [Expanded(child: Text('Giá vé (giá chung của chuyến)', style: dsans(size: 14, color: DTokens.muted))), Text(vnd(store.fare), style: dmono(size: 22))]),
        ),
        const SizedBox(height: 14),
        SheetActions(
          primary: BigButton(label: 'Đã thu ${vnd(store.fare)} · Cho lên xe', color: DTokens.ok, height: 72, onPressed: () => Navigator.of(ctx).pop(true)),
          secondary: BigButton(label: 'Hủy', outline: true, color: const Color(0xFFE2E8F0), height: dWide(ctx) ? 72 : 56, onPressed: () => Navigator.of(ctx).pop(false)),
        ),
      ])));
  if (ok != true || !context.mounted) return;
  final error = await store.sellHail(seat, to);
  if (!context.mounted) return;
  dToast(context, error ?? 'Đã bán ghế $seat cho khách vẫy');
}
