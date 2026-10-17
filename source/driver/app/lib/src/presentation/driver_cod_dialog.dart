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

/// Shared cash given presets, custom input, and change settlement choices for COD and Hail passengers.
class DriverCashPaymentSection extends StatefulWidget {
  const DriverCashPaymentSection({
    super.key,
    required this.fare,
    required this.store,
    this.phone,
    this.phoneHint,
    required this.onChanged,
  });

  final int fare;
  final DriverStore store;
  final String? phone;
  final String? phoneHint;
  final void Function({
    required int given,
    required String method,
    required int change,
    required String hint,
    required bool isValid,
  }) onChanged;

  @override
  State<DriverCashPaymentSection> createState() => _DriverCashPaymentSectionState();
}

class _DriverCashPaymentSectionState extends State<DriverCashPaymentSection> {
  late List<int> presets;
  late int given;
  var method = 'CASH';
  late final TextEditingController customController;
  String? customError;

  @override
  void initState() {
    super.initState();
    presets = codPresets(widget.fare);
    given = widget.fare;
    customController = TextEditingController();
  }

  @override
  void didUpdateWidget(covariant DriverCashPaymentSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.fare != oldWidget.fare) {
      presets = codPresets(widget.fare);
      if (customController.text.isEmpty) {
        given = widget.fare;
      }
    }
    final hasPhone = widget.phone != null && widget.phone!.trim().isNotEmpty;
    if (method == 'WALLET' && !hasPhone) {
      method = 'CASH';
      WidgetsBinding.instance.addPostFrameCallback((_) => _notify());
    }
  }

  @override
  void dispose() {
    customController.dispose();
    super.dispose();
  }

  int get change => given - widget.fare;
  bool get hasPhone => widget.phone != null && widget.phone!.trim().isNotEmpty;
  bool get isValid => customError == null && given >= widget.fare;
  String get hint => change <= 0
      ? 'Đủ tiền, không có tiền thừa'
      : switch (method) {
          'CASH' => 'Trả lại khách ${vnd(change)}',
          'WALLET' => 'Cộng ${vnd(change)} vào ví',
          _ => 'In biên lai nợ ${vnd(change)}',
        };

  void _notify() {
    if (!mounted) return;
    widget.onChanged(
      given: given,
      method: method,
      change: change,
      hint: hint,
      isValid: isValid,
    );
  }

  @override
  Widget build(BuildContext context) {
    final left = DriverStore.debtLimit - widget.store.debtIssued;
    final debtOk = change <= left;
    if (method == 'DEBT' && !debtOk) method = 'CASH';
    if (method == 'WALLET' && !hasPhone) method = 'CASH';

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Khách đưa', style: dsans(size: 14, weight: FontWeight.w600)),
      const SizedBox(height: 8),
      Row(children: [
        for (final v in presets) ...[
          if (v != presets.first) const SizedBox(width: 8),
          Expanded(child: ChoiceTile(
            label: '${v ~/ 1000}k',
            center: true,
            selected: given == v && customController.text.isEmpty,
            onTap: () {
              setState(() {
                given = v;
                customController.clear();
                customError = null;
              });
              _notify();
            },
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
          hintText: 'Nhập số tiền khác (tối thiểu ${vnd(widget.fare)})',
          suffixText: 'đ',
          errorText: customError,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        ),
        onChanged: (val) {
          setState(() {
            if (val.trim().isEmpty) {
              customError = null;
              given = widget.fare;
            } else {
              final parsed = int.tryParse(val.trim());
              if (parsed == null || parsed < widget.fare) {
                customError = 'Số tiền phải từ ${vnd(widget.fare)} trở lên';
              } else {
                customError = null;
                given = parsed;
              }
            }
          });
          _notify();
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
        ChoiceTile(
          label: 'Trả tiền mặt ngay',
          hint: 'Đưa lại khách bây giờ',
          selected: method == 'CASH',
          onTap: () {
            setState(() => method = 'CASH');
            _notify();
          },
        ),
        const SizedBox(height: 8),
        ChoiceTile(
          label: 'Cộng vào ví của khách',
          hint: hasPhone
              ? (widget.phoneHint ?? 'Theo số điện thoại: ${widget.phone!.trim()}')
              : 'Cần số điện thoại để cộng vào ví',
          selected: method == 'WALLET',
          enabled: hasPhone,
          onTap: () {
            setState(() => method = 'WALLET');
            _notify();
          },
        ),
        const SizedBox(height: 8),
        ChoiceTile(
          label: 'Biên lai nhận tại trạm dừng',
          hint: debtOk ? 'Hạn mức chuyến còn ${vnd(left)}' : 'Vượt hạn mức chuyến (còn ${vnd(left)})',
          selected: method == 'DEBT',
          enabled: debtOk,
          onTap: () {
            setState(() => method = 'DEBT');
            _notify();
          },
        ),
      ],
    ]);
  }
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
  late int given;
  var method = 'CASH';
  late String hint;
  var isValid = true;

  @override
  void initState() {
    super.initState();
    given = widget.passenger.cod;
    hint = 'Đủ tiền, không có tiền thừa';
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.passenger;
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
      DriverCashPaymentSection(
        fare: p.cod,
        store: widget.store,
        phone: p.phone,
        phoneHint: 'Theo số điện thoại trên vé',
        onChanged: ({required given, required method, required change, required hint, required isValid}) {
          setState(() {
            this.given = given;
            this.method = method;
            this.hint = hint;
            this.isValid = isValid;
          });
        },
      ),
      const SizedBox(height: 16),
      BigButton(
        label: 'Đã nhận ${vnd(given)} · Cho lên xe',
        subtitle: hint,
        color: DTokens.ok,
        height: 72,
        onPressed: (isValid && given >= p.cod) ? () => Navigator.of(context).pop((given: given, method: method)) : null,
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
  final after = store.stops.skip(store.stopIndex + 1).toList();
  if (after.isEmpty) {
    dToast(context, 'Xe đã ở bến cuối');
    return;
  }
  final result = await showDriverSheet<({String seat, String to, int given, String method, String? phone})>(
    context,
    builder: (ctx) => _HailSheetContent(store: store, after: after),
  );
  if (result == null || !context.mounted) return;
  final error = await store.sellHail(
    result.seat,
    result.to,
    given: result.given,
    method: result.method,
    phone: result.phone,
  );
  if (!context.mounted) return;
  dToast(context, error ?? 'Đã bán ghế ${result.seat} cho khách vẫy');
}

class _HailSheetContent extends StatefulWidget {
  const _HailSheetContent({required this.store, required this.after});
  final DriverStore store;
  final List<DriverStop> after;

  @override
  State<_HailSheetContent> createState() => _HailSheetContentState();
}

class _HailSheetContentState extends State<_HailSheetContent> {
  late String seat;
  late String to;
  late final TextEditingController phoneController;
  late int given;
  var method = 'CASH';
  late String hint;
  var isValid = true;

  @override
  void initState() {
    super.initState();
    seat = widget.store.freeSeats.first;
    to = widget.after.last.id;
    phoneController = TextEditingController();
    given = widget.store.fare;
    hint = 'Đủ tiền, không có tiền thừa';
  }

  @override
  void dispose() {
    phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fare = widget.store.fare;
    final phone = phoneController.text.trim();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Khách vẫy dọc đường', style: dsans(size: 18, weight: FontWeight.w700)),
          ]),
        ),
        IconButton(tooltip: 'Đóng', onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
      ]),
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
        children: [
          for (final c in widget.store.freeSeats)
            ChoiceTile(label: c, center: true, selected: seat == c, onTap: () => setState(() => seat = c)),
        ],
      ),
      const SizedBox(height: 12),
      Text('Xuống tại', style: dsans(size: 14, weight: FontWeight.w600)),
      const SizedBox(height: 8),
      for (final s in widget.after) ...[
        ChoiceTile(label: s.name, selected: to == s.id, onTap: () => setState(() => to = s.id)),
        const SizedBox(height: 8),
      ],
      Text('Số điện thoại (không bắt buộc)', style: dsans(size: 14, weight: FontWeight.w600)),
      const SizedBox(height: 8),
      TextField(
        controller: phoneController,
        keyboardType: TextInputType.phone,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: dmono(size: 15),
        decoration: const InputDecoration(
          hintText: 'Nhập số điện thoại nếu cần cộng tiền thừa vào ví',
          contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        ),
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: DTokens.bg, borderRadius: BorderRadius.circular(10)),
        child: Row(children: [
          Expanded(child: Text('Giá vé (giá chung của chuyến)', style: dsans(size: 14, color: DTokens.muted))),
          Text(vnd(fare), style: dmono(size: 22)),
        ]),
      ),
      const SizedBox(height: 14),
      DriverCashPaymentSection(
        fare: fare,
        store: widget.store,
        phone: phone,
        phoneHint: phone.isNotEmpty ? 'Theo số điện thoại: $phone' : null,
        onChanged: ({required given, required method, required change, required hint, required isValid}) {
          setState(() {
            this.given = given;
            this.method = method;
            this.hint = hint;
            this.isValid = isValid;
          });
        },
      ),
      const SizedBox(height: 16),
      BigButton(
        label: 'Đã nhận ${vnd(given)} · Cho lên xe',
        subtitle: hint,
        color: DTokens.ok,
        height: 72,
        onPressed: (isValid && given >= fare)
            ? () => Navigator.of(context).pop((
                  seat: seat,
                  to: to,
                  given: given,
                  method: method,
                  phone: phone.isNotEmpty ? phone : null,
                ))
            : null,
      ),
    ]);
  }
}
