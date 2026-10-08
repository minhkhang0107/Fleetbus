import 'package:flutter/material.dart';

import 'passenger_main_shell.dart';
import 'passenger_store.dart';
import 'passenger_ticket_qr_screen.dart';
import 'passenger_widgets.dart';

/// PAX-021: confirm a cancellation with the refund the policy gives (tiers, or 100 % after an
/// official delay over 30 minutes).
Future<void> confirmCancelTicket(BuildContext context, Ticket t) async {
  final store = PassengerScope.read(context);
  final r = store.refundFor(t);
  final known = r.percent >= 0;
  final amount = known ? t.paid * r.percent ~/ 100 : 0;
  final yes = await showAppSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Hủy vé ${t.pnr}?', style: sans(size: 18, weight: FontWeight.w700)),
        gap(12),
        AppCard(
          child: Column(children: [
            Row(children: [Text('Đã trả', style: sans(size: 14, color: PTokens.muted)), const Spacer(), Text(vnd(t.paid), style: mono(size: 14))]),
            if (known) ...[
              gap(4),
              Row(children: [Text('Được hoàn', style: sans(size: 14, color: PTokens.muted)), const Spacer(), Text(vnd(amount), style: mono(size: 14, weight: FontWeight.w700))]),
            ],
            gap(6),
            Align(alignment: Alignment.centerLeft, child: Text(r.tier, style: sans(size: 13, color: PTokens.muted, height: 1.4))),
          ]),
        ),
        gap(10),
        Text('Ghế ${t.seat} được nhả ngay cho người khác và không lấy lại được.', style: sans(size: 13, color: PTokens.muted, height: 1.5)),
        gap(14),
        PrimaryButton(label: known && amount > 0 ? 'Hủy vé, hoàn ${vnd(amount)}' : 'Hủy vé', color: PTokens.danger, onPressed: () => Navigator.of(ctx).pop(true)),
        gap(8),
        GhostButton(label: 'Giữ vé', onPressed: () => Navigator.of(ctx).pop(false)),
      ]));
  if (yes != true || !context.mounted) return;
  final result = await store.cancelTicket(t);
  if (!context.mounted) return;
  if (!result.ok) {
    showToast(context, result.error!);
    return;
  }
  PassengerMainShell.openTab(context, 1);
  showToast(context, (result.value ?? 0) > 0 ? 'Đã gửi yêu cầu hoàn ${vnd(result.value!)}' : 'Đã hủy vé, không hoàn tiền theo chính sách');
}

/// PAX-025: an official delay with the choice to keep the ticket or cancel free of charge.
class PassengerDelayNoticeScreen extends StatelessWidget {
  const PassengerDelayNoticeScreen({super.key, required this.ticket});
  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    final t = ticket;
    return Scaffold(
      appBar: const TopBar(title: 'Thông báo chuyến'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 16), children: [
        const Align(alignment: Alignment.centerLeft, child: Pill('Nhà xe công bố lúc 06:35', PillKind.warn)),
        gap(8),
        Text('Chuyến của bạn khởi hành chậm ${t.delay} phút', style: sans(size: 24, weight: FontWeight.w700, height: 1.25)),
        gap(8),
        Text('Lý do: ùn tắc kéo dài ở nút giao Pháp Vân. Ghế và mã vé của bạn giữ nguyên.', style: sans(size: 14, color: PTokens.muted, height: 1.5)),
        gap(18),
        AppCard(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            Row(children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Giờ cũ', style: sans(size: 12, color: PTokens.muted)),
                Text(t.dep, style: mono(size: 22, weight: FontWeight.w700, color: const Color(0xFF64748B), decoration: TextDecoration.lineThrough)),
              ]),
              const Expanded(child: Icon(Icons.arrow_forward, color: PTokens.muted)),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('Giờ mới', style: sans(size: 12, color: PTokens.muted)),
                Text(t.departure, style: mono(size: 22, weight: FontWeight.w700)),
              ]),
            ]),
            const Divider(height: 20, color: Color(0xFFF1F5F9)),
            Align(alignment: Alignment.centerLeft, child: Text('${t.pnr} · Ghế ${t.seat} · Đón tại ${t.pickup}', style: sans(size: 13, color: PTokens.muted))),
          ]),
        ),
        gap(18),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: PTokens.primarySoft, border: Border.all(color: const Color(0xFFBFDBFE)), borderRadius: BorderRadius.circular(PTokens.radius)),
          child: Text.rich(TextSpan(children: [
            TextSpan(text: 'Bạn được hủy vé miễn phí. ', style: sans(size: 13, weight: FontWeight.w700, color: const Color(0xFF1E3A8A))),
            TextSpan(text: 'Chuyến chậm hơn 30 phút nên hủy lúc này được hoàn đủ ${vnd(t.paid)} về tài khoản đã chuyển, không mất phí.', style: sans(size: 13, color: const Color(0xFF1E40AF), height: 1.5)),
          ])),
        ),
      ]),
      bottomNavigationBar: BottomAction(column: true, children: [
        PrimaryButton(label: 'Giữ vé, đi lúc ${t.departure}', onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => PassengerTicketQrScreen(ticket: t)))),
        GhostButton(label: 'Hủy vé, hoàn ${vnd(t.paid)}', color: PTokens.danger, borderColor: const Color(0xFFFCA5A5), onPressed: () => confirmCancelTicket(context, t)),
      ]),
    );
  }
}
