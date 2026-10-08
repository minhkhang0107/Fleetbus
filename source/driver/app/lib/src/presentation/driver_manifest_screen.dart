import 'package:flutter/material.dart';

import 'driver_cod_dialog.dart';
import 'driver_qr_scanner_screen.dart';
import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-007 / DRI-008: passengers of the current stop. A boarding changes the row in place;
/// an unpaid COD ticket has one action, "Thu ... và cho lên xe" (BR-COD-006); "Vắng mặt" opens
/// 10 minutes after the bus reached the stop (BR-NOSHOW-004).
class DriverManifestScreen extends StatelessWidget {
  const DriverManifestScreen({super.key});

  Future<void> _leave(BuildContext context, DriverStore store) async {
    final waiting = store.atStopPassengers.where((p) => p.status == PaxStatus.waiting).toList();
    if (waiting.isNotEmpty) {
      final yes = await showDriverSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Còn ${waiting.length} khách chưa lên xe', style: dsans(size: 18, weight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Ghế ${waiting.map((p) => p.seat).join(', ')}. Rời trạm thì các khách này vẫn ở trạng thái chưa xử lý; điều hành sẽ gọi cho họ.', style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
            const SizedBox(height: 14),
            BigButton(label: 'Vẫn rời trạm', onPressed: () => Navigator.of(ctx).pop(true)),
            const SizedBox(height: 8),
            BigButton(label: 'Chờ thêm', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop(false)),
          ]));
      if (yes != true) return;
    }
    store.leaveStop();
    if (context.mounted) Navigator.of(context).pop();
  }

  Future<void> _noShow(BuildContext context, DriverStore store, Passenger p) async {
    final yes = await showDriverSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Đánh dấu ghế ${p.seat} vắng mặt?', style: dsans(size: 18, weight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text('${p.name} · ${p.phone}. Vé không được hoàn tiền, ghế được bán lại từ trạm này. Khách nhận thông báo.', style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
          const SizedBox(height: 14),
          BigButton(label: 'Vắng mặt', color: DTokens.danger, onPressed: () => Navigator.of(ctx).pop(true)),
          const SizedBox(height: 8),
          BigButton(label: 'Chờ thêm', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop(false)),
        ]));
    if (yes != true || !context.mounted) return;
    final error = await store.markNoShow(p);
    if (!context.mounted) return;
    dToast(context, error ?? 'Ghế ${p.seat} vắng mặt');
  }

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final list = store.atStopPassengers;
    final boarded = list.where((p) => p.status == PaxStatus.boarded).length;
    final opensAt = hhmm(store.noShowFrom());
    return Scaffold(
      appBar: DHeader(
        title: store.stop.name,
        subtitle: 'Đón ${list.length} khách · rời trạm ${store.stop.time} · bây giờ ${hhmm(store.clock)}',
        trailing: Text('$boarded/${list.length}', style: dmono(size: 16, color: DTokens.okInk)),
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
        BigButton(label: 'Quét vé', height: 64, icon: Icons.qr_code_scanner, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverQrScannerScreen()))),
        const SizedBox(height: 12),
        if (list.isEmpty) Text('Không có khách đón ở trạm này.', style: dsans(size: 14, color: DTokens.muted)),
        for (final p in list) ...[
          _PassengerRow(
            p: p,
            noShowOpen: store.noShowOpen,
            opensAt: opensAt,
            onBoard: () async {
              final error = await store.board(p);
              if (context.mounted) dToast(context, error ?? 'Ghế ${p.seat} đã lên xe');
            },
            onCod: () => showCodSheet(context, p),
            onNoShow: () => _noShow(context, store, p),
          ),
          const SizedBox(height: 8),
        ],
      ]),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: DTokens.lineSoft))),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: BigButton(label: 'Rời trạm', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => _leave(context, store)),
        ),
      ),
    );
  }
}

class _PassengerRow extends StatelessWidget {
  const _PassengerRow({required this.p, required this.noShowOpen, required this.opensAt, required this.onBoard, required this.onCod, required this.onNoShow});
  final Passenger p;
  final bool noShowOpen;
  final String opensAt;
  final VoidCallback onBoard;
  final VoidCallback onCod;
  final VoidCallback onNoShow;

  @override
  Widget build(BuildContext context) {
    final (pill, border) = switch (p.status) {
      PaxStatus.boarded => (StatusPill('Đã lên ${hhmm(p.boardedAt ?? 0)}', DPill.ok), const Color(0xFF166534)),
      PaxStatus.noShow => (const StatusPill('Vắng mặt', DPill.mute), DTokens.line),
      PaxStatus.waiting => p.codDue ? (const StatusPill('Chờ thu COD', DPill.warn), const Color(0xFFA16207)) : (const StatusPill('Chưa lên', DPill.mute), DTokens.line),
    };
    final noShowButton = SizedBox(
      width: 112,
      child: BigButton(
        label: noShowOpen ? 'Vắng mặt' : 'Vắng · $opensAt',
        outline: true,
        color: const Color(0xFFE2E8F0),
        onPressed: noShowOpen ? onNoShow : null,
      ),
    );
    return Opacity(
      opacity: p.status == PaxStatus.noShow ? 0.7 : 1,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(color: DTokens.panel, borderRadius: BorderRadius.circular(10), border: Border.all(color: border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            SizedBox(width: 44, child: Text(p.seat, style: dmono(size: 16))),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p.name, style: dsans(size: 15, weight: FontWeight.w600)),
                Text.rich(TextSpan(children: [
                  TextSpan(text: p.phone, style: dmono(size: 12, weight: FontWeight.w500, color: DTokens.muted)),
                  TextSpan(text: ' · ${p.pay} · xuống ${DriverScope.of(context).stopById(p.to).short}', style: dsans(size: 12, color: DTokens.muted)),
                ])),
              ]),
            ),
            pill,
          ]),
          if (p.status == PaxStatus.waiting) ...[
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: p.codDue
                    ? BigButton(label: 'Thu ${vnd(p.cod)} và cho lên xe', color: DTokens.warn, foreground: const Color(0xFF1C1917), onPressed: onCod)
                    : BigButton(label: 'Cho lên xe', color: DTokens.ok, onPressed: onBoard),
              ),
              const SizedBox(width: 8),
              noShowButton,
            ]),
          ],
        ]),
      ),
    );
  }
}
