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
    await store.flushPendingBoards();
    if (!context.mounted) return;
    final waiting = store.atStopPassengers.where((p) => p.status == PaxStatus.waiting).toList();
    if (waiting.isNotEmpty) {
      final hotline = waiting.where((p) => p.isHotline).toList();
      final paid = waiting.where((p) => !p.isHotline).toList();
      final messages = <String>[];
      if (hotline.isNotEmpty) {
        messages.add('Ghế ${hotline.map((p) => p.seat).join(', ')} giữ qua tổng đài sẽ được nhả, điều hành được báo.');
      }
      if (paid.isNotEmpty) {
        messages.add('Ghế ${paid.map((p) => p.seat).join(', ')}. Rời trạm thì các khách này vẫn ở trạng thái chưa xử lý; điều hành sẽ gọi cho họ.');
      }
      final yes = await showDriverSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Còn ${waiting.length} khách chưa lên xe', style: dsans(size: 18, weight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(messages.join(' '), style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
            const SizedBox(height: 14),
            SheetActions(
              primary: BigButton(label: 'Vẫn rời trạm', onPressed: () => Navigator.of(ctx).pop(true)),
              secondary: BigButton(label: 'Chờ thêm', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop(false)),
            ),
          ]));
      if (yes != true) return;
    }
    store.leaveStop();
    if (context.mounted) Navigator.of(context).pop();
  }

  /// Spec A9: the bus cannot reach a home pickup. A quick reason, an optional meeting point; the passenger and
  /// the office are told by the server.
  static Future<void> reportInaccessible(BuildContext context, DriverStore store, Passenger p) async {
    const reasons = ['Ngõ quá hẹp, xe không vào được', 'Đường cấm xe khách giờ này', 'Không tìm thấy địa chỉ'];
    var reason = reasons.first;
    final meet = TextEditingController();
    final sent = await showDriverSheet<bool>(context, builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSheet) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Không vào được địa chỉ ghế ${p.seat}', style: dsans(size: 18, weight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(p.homePickup ?? '', style: dsans(size: 15, color: DTokens.sub)),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final r in reasons)
                ChoiceChip(label: Text(r), selected: reason == r, onSelected: (_) => setSheet(() => reason = r)),
            ]),
            const SizedBox(height: 12),
            TextField(controller: meet, maxLength: 200, style: dsans(size: 16), decoration: const InputDecoration(labelText: 'Hẹn khách ở đâu? (không bắt buộc)', hintText: 'VD: đầu ngõ, cổng chợ')),
            const SizedBox(height: 8),
            Text('Khách nhận thông báo; điều hành nhận cảnh báo để sắp xếp.', style: dsans(size: 13, color: DTokens.muted)),
            const SizedBox(height: 14),
            SheetActions(
              primary: BigButton(label: 'Báo khách và điều hành', color: DTokens.warn, foreground: const Color(0xFF1C1917), onPressed: () => Navigator.of(ctx).pop(true)),
              secondary: BigButton(label: 'Thôi', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop(false)),
            ),
          ]),
        ));
    if (sent != true || !context.mounted) return;
    final error = await store.reportInaccessible(p, reason, meet.text.trim());
    if (context.mounted) dToast(context, error ?? 'Đã báo khách ghế ${p.seat}');
  }

  Future<void> _noShow(BuildContext context, DriverStore store, Passenger p) async {
    final yes = await showDriverSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Đánh dấu ghế ${p.seat} vắng mặt?', style: dsans(size: 18, weight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text('${p.name} · ${p.phone}. Vé không được hoàn tiền, ghế được bán lại từ trạm này. Khách nhận thông báo.', style: dsans(size: 15, color: DTokens.sub, height: 1.5)),
          const SizedBox(height: 14),
          SheetActions(
            primary: BigButton(label: 'Vắng mặt', color: DTokens.danger, onPressed: () => Navigator.of(ctx).pop(true)),
            secondary: BigButton(label: 'Chờ thêm', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => Navigator.of(ctx).pop(false)),
          ),
        ]));
    if (yes != true || !context.mounted) return;
    final error = await store.markNoShow(p);
    if (!context.mounted) return;
    dToast(context, error ?? 'Ghế ${p.seat} vắng mặt');
  }

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    // Passengers who waved the bus down here are listed too, so the driver sees the sale went through.
    final list = [...store.atStopPassengers, ...store.hailHere];
    final boarded = list.where((p) => p.status == PaxStatus.boarded).length;
    final opensAt = hhmm(store.noShowFrom());
    Widget row(Passenger p) => PassengerRow(
          p: p,
          noShowOpen: store.noShowOpen,
          opensAt: opensAt,
          onBoard: () => store.boardWithUndo(p, (error) {
            if (context.mounted && error != null) dToast(context, error);
          }),
          onUndo: () => store.undoBoard(p),
          onCod: () => showCodSheet(context, p),
          onNoShow: () => _noShow(context, store, p),
          onInaccessible: () => reportInaccessible(context, store, p),
        );
    final drops = store.dropOffPassengers;
    final allHandled = list.every((p) => p.status != PaxStatus.waiting || store.isBoardPending(p));
    final dropOff = drops.isEmpty
        ? null
        : Panel(
            border: DTokens.line,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Khách xuống ở trạm này · ${drops.length}', style: dsans(size: 15, weight: FontWeight.w700, color: DTokens.warnInk)),
              const SizedBox(height: 8),
              for (final p in drops)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    SizedBox(width: 52, child: Text(p.seat, style: dmono(size: 18))),
                    Expanded(child: Text(p.homeDropoff != null ? '${p.name} · trả tận nhà: ${p.homeDropoff}' : p.name, style: dsans(size: 16, weight: FontWeight.w600))),
                  ]),
                ),
            ]),
          );
    final scan = BigButton(label: 'Quét vé', height: dWide(context) ? 72 : 64, icon: Icons.qr_code_scanner, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverQrScannerScreen())));
    // A walk-up passenger at the stop is sold from here too, without going back to the cockpit.
    final hail = BigButton(label: 'Khách vẫy', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => showHailSheet(context));
    // Once nobody is left waiting, leaving the stop is the main action.
    final leave = allHandled
        ? BigButton(label: 'Rời trạm', color: DTokens.ok, height: 72, onPressed: () => _leave(context, store))
        : BigButton(label: 'Rời trạm', outline: true, color: const Color(0xFFE2E8F0), onPressed: () => _leave(context, store));
    final empty = Panel(child: Text('Không có khách đón ở trạm này.', style: dsans(size: 16, color: DTokens.sub)));
    final header = DHeader(
      title: store.stop.name,
      subtitle: 'Đón ${list.length} · trả ${drops.length} khách · rời trạm ${store.stop.time} · ${store.realClock ? 'bây giờ' : 'giờ chạy thử'} ${hhmm(store.clock)}',
      trailing: Text('$boarded/${list.length}', style: dmono(size: 16, color: DTokens.okInk)),
    );
    if (dWide(context)) {
      // Tablet: stop summary and the two stop actions on the left, passenger cards two per row on the right.
      return Scaffold(
        appBar: header,
        body: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            width: 320,
            padding: const EdgeInsets.all(20),
            decoration: const BoxDecoration(border: Border(right: BorderSide(color: DTokens.lineSoft))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(child: Stat('Đã lên', '$boarded/${list.length}', color: DTokens.okInk, size: 28)),
                const SizedBox(width: 8),
                Expanded(child: Stat('Rời trạm', store.stop.time, size: 28)),
              ]),
              const SizedBox(height: 16),
              scan,
              const SizedBox(height: 10),
              hail,
              const Spacer(),
              leave,
            ]),
          ),
          Expanded(
            child: LayoutBuilder(builder: (context, box) {
              final cols = box.maxWidth >= 760 ? 2 : 1;
              final cardWidth = (box.maxWidth - 40 - 12 * (cols - 1)) / cols;
              return SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (dropOff != null) ...[dropOff, const SizedBox(height: 12)],
                  list.isEmpty ? empty : Wrap(spacing: 12, runSpacing: 12, children: [for (final (i, p) in list.indexed) SizedBox(width: cardWidth, child: FadeSlideIn(index: i, child: row(p)))]),
                ]),
              );
            }),
          ),
        ]),
      );
    }
    return Scaffold(
      appBar: header,
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
        scan,
        const SizedBox(height: 8),
        hail,
        const SizedBox(height: 12),
        if (dropOff != null) ...[dropOff, const SizedBox(height: 12)],
        if (list.isEmpty) empty,
        for (final (i, p) in list.indexed) ...[FadeSlideIn(index: i, child: row(p)), const SizedBox(height: 8)],
      ]),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: DTokens.lineSoft))),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: leave,
        ),
      ),
    );
  }
}

class PassengerRow extends StatelessWidget {
  const PassengerRow({required this.p, required this.noShowOpen, required this.opensAt, required this.onBoard, this.onUndo, required this.onCod, required this.onNoShow, required this.onInaccessible});
  final Passenger p;
  final bool noShowOpen;
  final String opensAt;
  final VoidCallback onBoard;
  final VoidCallback? onUndo;
  final VoidCallback onCod;
  final VoidCallback onNoShow;
  final VoidCallback onInaccessible;

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final boardedAt = store.boardedTime(p);
    final pending = store.isBoardPending(p);
    final (pill, border) = switch (p.status) {
      _ when pending => (const StatusPill('Đang cho lên…', DPill.ok), const Color(0xFF166534)),
      PaxStatus.boarded => (StatusPill(boardedAt == null ? 'Đã lên' : 'Đã lên ${hhmm(boardedAt)}', DPill.ok), const Color(0xFF166534)),
      PaxStatus.noShow => (const StatusPill('Vắng mặt', DPill.mute), DTokens.line),
      PaxStatus.waiting => p.codDue ? (const StatusPill('Chưa trả tiền', DPill.warn), const Color(0xFFA16207)) : (const StatusPill('Chưa lên', DPill.mute), DTokens.line),
    };
    final noShowButton = SizedBox(
      width: 112,
      child: BigButton(
        label: noShowOpen ? 'Vắng mặt' : 'Báo vắng từ $opensAt',
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
                  if (p.phone.isNotEmpty) TextSpan(text: '${p.phone} · ', style: dmono(size: 12, weight: FontWeight.w500, color: DTokens.muted)),
                  TextSpan(text: '${payNote(p)} · xuống ${p.homeDropoff != null ? 'tận nhà' : store.stopById(p.to).short}', style: dsans(size: 12, color: DTokens.muted)),
                ])),
                if (p.homePickup != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    // A passenger who did not come out at home boards here: say so instead of the address.
                    child: p.homeMissed
                        ? Text('Không ra khi xe tới nhà (${p.homePickup}) · lên xe ở bến', style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.sub))
                        : Text('Đón tận nhà${p.pickupWindow != null ? ' ${p.pickupWindow}' : ''}: ${p.homePickup}${p.homeNote.isNotEmpty ? ' · ${p.homeNote}' : ''}', style: dsans(size: 13, weight: FontWeight.w600, color: DTokens.warnInk)),
                  ),
                if (p.homePickup != null && p.inaccessible)
                  Text('Đã báo không vào được${p.meetingPoint != null ? ' · hẹn ở ${p.meetingPoint}' : ''}', style: dsans(size: 13, color: DTokens.sub)),
              ]),
            ),
            pill,
          ]),
          if (pending) ...[
            const SizedBox(height: 8),
            BigButton(label: 'Bấm nhầm? Hoàn tác', outline: true, color: const Color(0xFFE2E8F0), onPressed: onUndo),
          ] else if (p.status == PaxStatus.waiting) ...[
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
            if (p.homePickup != null && !p.inaccessible)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(onPressed: onInaccessible, style: TextButton.styleFrom(minimumSize: const Size(48, 44)), child: Text('Không vào được địa chỉ', style: dsans(size: 14, weight: FontWeight.w600, color: DTokens.warn))),
              ),
          ],
        ]),
      ),
    );
  }
}
