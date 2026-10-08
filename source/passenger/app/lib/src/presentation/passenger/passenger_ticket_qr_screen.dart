import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'passenger_cancel_refund_screen.dart';
import 'passenger_live_radar_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-017: the static boarding QR and backup PIN from the server (D104). No countdown; "Đổi mã QR"
/// revokes a leaked copy until the trip leaves (409 BOARDING_STARTED). A boarded ticket shows no QR.
class PassengerTicketQrScreen extends StatefulWidget {
  const PassengerTicketQrScreen({super.key, required this.ticket});
  final Ticket ticket;

  @override
  State<PassengerTicketQrScreen> createState() => _PassengerTicketQrScreenState();
}

class _PassengerTicketQrScreenState extends State<PassengerTicketQrScreen> {
  bool _showPin = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final error = await PassengerScope.read(context).loadPass(widget.ticket);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error;
      });
    });
  }

  Future<void> _reissue(PassengerStore store) async {
    final t = widget.ticket;
    final yes = await showAppSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Đổi mã QR của vé ${t.pnr}?', style: sans(size: 18, weight: FontWeight.w700)),
          gap(8),
          Text('Dùng khi bạn lỡ gửi ảnh vé cho người khác. Mã QR cũ, mã PIN cũ và các link đã chia sẻ sẽ hết hiệu lực. Ghế và giờ đi giữ nguyên.', style: sans(size: 14, color: PTokens.muted, height: 1.5)),
          gap(14),
          PrimaryButton(label: 'Đổi mã QR', onPressed: () => Navigator.of(ctx).pop(true)),
          gap(8),
          GhostButton(label: 'Giữ mã hiện tại', onPressed: () => Navigator.of(ctx).pop(false)),
        ]));
    if (yes != true || !mounted) return;
    final r = await store.reissueQr(t);
    if (!mounted) return;
    if (r.code == 'BOARDING_STARTED') {
      await showAppSheet<void>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Không đổi được mã lúc này', style: sans(size: 18, weight: FontWeight.w700)),
            gap(8),
            Text('Chuyến đã xuất bến. Nếu có người dùng mã của bạn, báo tài xế kiểm tra bằng tên và số ghế ${t.seat}, hoặc gọi 1900 6868.', style: sans(size: 14, color: PTokens.muted, height: 1.5)),
            gap(14),
            PrimaryButton(label: 'Đã hiểu', onPressed: () => Navigator.of(ctx).pop()),
          ]));
      return;
    }
    if (!r.ok) {
      showToast(context, r.error!);
      return;
    }
    setState(() => _showPin = false);
    showToast(context, 'Đã đổi mã QR. Mã cũ không còn dùng được');
  }

  Future<void> _share(PassengerStore store) async {
    final phone = TextEditingController();
    String? error;
    final sent = await showAppSheet<String>(context, builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSheet) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Chia sẻ vé cho người đi cùng', style: sans(size: 18, weight: FontWeight.w700)),
            gap(8),
            Text('Người nhận có link xem vé và mã PIN dự phòng trong tin nhắn. Bạn vẫn quản lý được vé.', style: sans(size: 14, color: PTokens.muted, height: 1.5)),
            gap(12),
            LabeledField(label: 'Số điện thoại người nhận', controller: phone, keyboardType: TextInputType.phone, isMono: true, errorText: error),
            gap(14),
            PrimaryButton(
              label: 'Gửi vé',
              onPressed: () async {
                final p = phone.text.replaceAll(' ', '');
                if (!validPhone(p)) {
                  setSheet(() => error = 'Số điện thoại cần 10 chữ số.');
                  return;
                }
                final e = await store.shareTicket(widget.ticket, p);
                if (e != null) {
                  setSheet(() => error = e);
                  return;
                }
                if (ctx.mounted) Navigator.of(ctx).pop(p);
              },
            ),
          ]),
        ));
    if (sent != null && mounted) showToast(context, 'Đã gửi vé tới ${maskPhone(sent)}');
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final t = widget.ticket;
    final usable = t.status == TicketStatus.active;
    final pill = switch (t.status) {
      TicketStatus.active => const Pill('Hợp lệ', PillKind.ok),
      TicketStatus.boarded => const Pill('Đã lên xe', PillKind.ok),
      TicketStatus.noShow => const Pill('Vắng mặt', PillKind.mute),
      TicketStatus.refunding => const Pill('Đang hoàn tiền', PillKind.info),
      TicketStatus.cancelled => const Pill('Đã hủy', PillKind.mute),
    };
    return Scaffold(
      appBar: TopBar(title: 'Vé lên xe', trailing: pill),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (t.delay > 0 && usable) ...[
          Material(
            color: PTokens.warnSoft,
            borderRadius: BorderRadius.circular(PTokens.radius),
            child: InkWell(
              borderRadius: BorderRadius.circular(PTokens.radius),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerDelayNoticeScreen(ticket: t))),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  Expanded(child: Text('Chậm ${t.delay} phút', style: sans(size: 13, weight: FontWeight.w600, color: PTokens.warnInk))),
                  const Icon(Icons.chevron_right, color: PTokens.warnInk),
                ]),
              ),
            ),
          ),
          gap(14),
        ],
        if (_loading)
          const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
        else if (_error != null)
          AppCard(child: Text(_error!, style: sans(size: 14, color: PTokens.danger)))
        else if (usable && t.qrValue != null)
          AppCard(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
            child: Column(children: [
              Semantics(
                label: 'Mã QR lên xe của vé ${t.pnr}, ghế ${t.seat}',
                image: true,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(border: Border.all(color: PTokens.line), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                  child: QrImageView(data: t.qrValue!, size: 232, backgroundColor: Colors.white),
                ),
              ),
              gap(12),
              Text('Dùng được khi mất mạng, khi lưu ảnh hoặc in. Mỗi vé chỉ lên xe một lần · màn hình đã tăng độ sáng', textAlign: TextAlign.center, style: sans(size: 12, color: PTokens.muted, height: 1.5)),
              if (_showPin && t.pin != null) ...[
                gap(12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: PTokens.primarySoft, borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                  child: Column(children: [
                    Text('Mã PIN dự phòng', style: sans(size: 13, color: const Color(0xFF1E3A8A))),
                    Text('${t.pin!.substring(0, 3)} ${t.pin!.substring(3)}', style: mono(size: 20, weight: FontWeight.w700, color: const Color(0xFF1E3A8A))),
                    Text('Đọc mã này cho tài xế nếu không quét được.', style: sans(size: 12, color: const Color(0xFF1E3A8A))),
                  ]),
                ),
              ],
            ]),
          )
        else if (t.status == TicketStatus.boarded)
          AppCard(child: Text('Bạn đã lên xe. Vé không còn mã QR để dùng lại hay chia sẻ.', style: sans(size: 14, color: PTokens.muted))),
        gap(14),
        AppCard(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            Row(children: [
              Expanded(child: KeyValue('Mã đặt chỗ', t.pnr, isMono: true, valueColor: PTokens.pnr)),
              Expanded(child: KeyValue('Ghế', t.seat, isMono: true)),
            ]),
            gap(12),
            Row(children: [
              Expanded(child: KeyValue('Đón', '${t.pickup} · ${t.departure}')),
              Expanded(child: KeyValue('Ngày', t.date)),
            ]),
            gap(12),
            Align(alignment: Alignment.centerLeft, child: KeyValue('Hành khách', t.name)),
          ]),
        ),
        if (t.active) ...[
          gap(14),
          Row(children: [
            Expanded(child: PrimaryButton(label: 'Xe đang ở đâu?', onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerLiveRadarScreen(ticket: t))))),
            if (usable) ...[
              const SizedBox(width: 8),
              Expanded(child: GhostButton(label: 'Chia sẻ vé', onPressed: () => _share(store))),
            ],
          ]),
        ],
        if (usable) ...[
          gap(4),
          Row(children: [
            Expanded(child: LinkButton(label: _showPin ? 'Ẩn mã PIN' : 'Hiện mã PIN dự phòng', onPressed: t.pin == null ? null : () => setState(() => _showPin = !_showPin))),
            Expanded(child: LinkButton(label: 'Đổi mã QR', onPressed: () => _reissue(store))),
          ]),
          LinkButton(label: 'Hủy vé', color: PTokens.danger, onPressed: () => confirmCancelTicket(context, t)),
        ],
      ]),
    );
  }
}
