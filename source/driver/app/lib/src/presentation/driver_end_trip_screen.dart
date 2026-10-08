import 'package:flutter/material.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';
import 'main_shell_screen.dart';

/// DRI-017: end report computed from the manifest: passengers, cash to hand over, debt receipts,
/// unsynced actions; unresolved passengers are passed to the depot (BR-END-004), an early end shows its reason.
class DriverEndTripScreen extends StatefulWidget {
  const DriverEndTripScreen({super.key});

  @override
  State<DriverEndTripScreen> createState() => _DriverEndTripScreenState();
}

class _DriverEndTripScreenState extends State<DriverEndTripScreen> {
  final _odo = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _odo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final boarded = store.boardedCount;
    final noShow = store.manifest.where((p) => p.status == PaxStatus.noShow).length;
    final open = store.manifest.where((p) => p.status == PaxStatus.waiting).toList();
    final cash = store.codCash + store.hailCash;
    final codTickets = store.manifest.where((p) => p.cod > 0 && p.paid).length;
    return Scaffold(
      appBar: DHeader(title: 'Kết thúc chuyến', subtitle: '${store.lastStop ? 'Về ${store.stop.short}' : 'Kết thúc tại ${store.stop.short}'} ${hhmm(store.clock)} · ${store.plate}'),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (store.earlyEndReason != null) ...[
          Panel(color: DTokens.dangerBg, child: Text('Kết thúc trước bến cuối. Lý do: ${store.earlyEndReason}', style: dsans(size: 14, color: DTokens.dangerInk))),
          const SizedBox(height: 12),
        ],
        if (open.isNotEmpty) ...[
          Panel(
            color: DTokens.warnBg,
            border: const Color(0xFFA16207),
            child: Text('${open.length} khách chưa xử lý (ghế ${open.map((p) => p.seat).join(', ')}). Nên đánh dấu lên xe hoặc vắng mặt trước khi kết thúc; nếu không, bến sẽ theo dõi.', style: dsans(size: 14, color: const Color(0xFFFDE68A), height: 1.4)),
          ),
          const SizedBox(height: 12),
        ],
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Hành khách', style: dsans(size: 13, color: DTokens.muted)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _count('$boarded', 'Đã lên xe', DTokens.okInk)),
              Expanded(child: _count('$noShow', 'Vắng mặt', DTokens.ink)),
              Expanded(child: _count('${open.length}', 'Chưa xử lý', open.isEmpty ? DTokens.ink : DTokens.warnInk)),
            ]),
          ]),
        ),
        const SizedBox(height: 12),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Tiền mặt nộp về bến', style: dsans(size: 13, color: DTokens.muted)),
            const SizedBox(height: 8),
            _line('Vé COD ($codTickets vé)', vnd(store.codCash)),
            _line('Khách vẫy (${store.hailCount} vé)', vnd(store.hailCash)),
            const Divider(color: DTokens.line, height: 16),
            Row(children: [Text('Tổng phải nộp', style: dsans(size: 15, weight: FontWeight.w600)), const Spacer(), Text(vnd(cash), style: dmono(size: 22, color: DTokens.okInk))]),
          ]),
        ),
        const SizedBox(height: 12),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Biên lai nợ tiền thừa đã phát', style: dsans(size: 13, color: DTokens.muted)),
            const SizedBox(height: 6),
            if (store.debts.isEmpty) Text('Không có', style: dsans(size: 14, color: DTokens.muted)),
            for (final d in store.debts) _line(d.code, '${vnd(d.amount)} · chưa trả', mono: true),
          ]),
        ),
        if (store.queue.isNotEmpty) ...[
          const SizedBox(height: 12),
          Panel(border: DTokens.line, child: Text('Đang có ${store.queue.length} thao tác chưa đồng bộ. Sẽ tự gửi khi có mạng.', style: dsans(size: 14))),
        ],
        const SizedBox(height: 16),
        Text('SỐ KM ĐỒNG HỒ CUỐI CHUYẾN', style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.sub)),
        const SizedBox(height: 6),
        TextField(controller: _odo, keyboardType: TextInputType.number, style: dmono(size: 18, weight: FontWeight.w600), decoration: InputDecoration(hintText: 'Ví dụ 143015', errorText: _error)),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: BigButton(
            label: 'Kết thúc và nộp ${vnd(cash)}',
            subtitle: open.isEmpty ? null : 'Khách chưa xử lý chuyển cho bến theo dõi',
            height: 72,
            onPressed: () async {
              if (!RegExp(r'^\d{4,7}$').hasMatch(_odo.text.trim())) {
                setState(() => _error = 'Nhập số km trên đồng hồ xe.');
                return;
              }
              final error = await store.endTrip();
              if (!context.mounted) return;
              if (error != null) {
                setState(() => _error = error);
                return;
              }
              Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const MainShellScreen()), (_) => false);
              dToast(context, 'Chuyến đã kết thúc · nộp ${vnd(store.endedCash ?? cash)} tại quầy bến');
            },
          ),
        ),
      ),
    );
  }

  Widget _count(String value, String label, Color color) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(value, style: dmono(size: 22, color: color)),
        Text(label, style: dsans(size: 12, color: DTokens.sub)),
      ]);

  Widget _line(String label, String value, {bool mono = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Expanded(child: Text(label, style: mono ? dmono(size: 14, weight: FontWeight.w500) : dsans(size: 14, color: DTokens.sub))),
          Text(value, style: dmono(size: 14, weight: FontWeight.w500)),
        ]),
      );
}
