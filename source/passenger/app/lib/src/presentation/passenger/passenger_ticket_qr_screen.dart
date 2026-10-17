import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  Timer? _poll;

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
      if (widget.ticket.status == TicketStatus.active) {
        // FLOW-06: the passenger app asks again every 10 seconds.
        _poll = Timer.periodic(const Duration(seconds: 10), (_) async {
          if (widget.ticket.status != TicketStatus.active) {
            _poll?.cancel();
            return;
          }
          await PassengerScope.read(context).loadPass(widget.ticket);
          if (widget.ticket.status != TicketStatus.active) {
            _poll?.cancel();
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _withdraw(PassengerStore store, {required bool pickupSide}) async {
    final t = widget.ticket;
    final r = await store.withdrawHome(t, pickupSide: pickupSide);
    if (!mounted) return;
    showToast(context, r.ok ? 'Đã hủy yêu cầu. Phụ phí sẽ được hoàn; bạn ${pickupSide ? 'lên xe tại ${t.pickup}' : 'xuống xe tại ${t.dropoff}'}' : r.error!);
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
            LabeledField(
              label: 'Số điện thoại người nhận',
              controller: phone,
              keyboardType: TextInputType.phone,
              isMono: true,
              errorText: error,
              maxLength: 15,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d\s+.-]'))],
              autofillHints: const [AutofillHints.telephoneNumber],
            ),
            gap(14),
            PrimaryButton(
              label: 'Gửi vé',
              onPressed: () async {
                if (!validPhone(phone.text)) {
                  setSheet(() => error = 'Số điện thoại không hợp lệ (VD: 0912 345 678)');
                  return;
                }
                final normalized = normalizePhone(phone.text);
                final e = await store.shareTicket(widget.ticket, normalized);
                if (e != null) {
                  setSheet(() => error = e);
                  return;
                }
                if (ctx.mounted) Navigator.of(ctx).pop(normalized);
              },
            ),
          ]),
        ));
    if (sent != null && mounted) showToast(context, 'Đã gửi vé tới ${maskPhone(sent)}');
  }

  /// Relatives open the link in a browser and see the bus coming, without the passenger's details.
  Future<void> _shareTracking(PassengerStore store) async {
    final r = await store.shareTracking(widget.ticket);
    if (!mounted) return;
    if (!r.ok) {
      showToast(context, r.error!);
      return;
    }
    await Clipboard.setData(ClipboardData(text: r.value!));
    if (!mounted) return;
    await showAppSheet<void>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Link theo dõi xe', style: sans(size: 18, weight: FontWeight.w700)),
          gap(8),
          Text('Đã sao chép. Gửi link này qua Zalo hoặc tin nhắn; người nhận mở bằng trình duyệt để xem xe đang ở đâu. Link hết hạn sau chuyến đi.', style: sans(size: 14, color: PTokens.muted, height: 1.5)),
          gap(12),
          SelectableText(r.value!, style: mono(size: 14)),
          gap(14),
          PrimaryButton(label: 'Xong', onPressed: () => Navigator.of(ctx).pop()),
        ]));
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final t = widget.ticket;
    final walletTicket = store.tickets.where((o) => o.id == t.id).firstOrNull;
    final isFinished = t.past || walletTicket?.past == true || store.isTripEnded(t.tripId);
    final usable = t.status == TicketStatus.active && !isFinished;
    final pill = switch (t.status) {
      TicketStatus.active => const Pill('Hợp lệ', PillKind.ok),
      TicketStatus.boarded => isFinished ? const Pill('Đã đi', PillKind.mute) : const Pill('Đã lên xe', PillKind.ok),
      TicketStatus.noShow => const Pill('Vắng mặt', PillKind.mute),
      TicketStatus.refunding => const Pill('Đang hoàn tiền', PillKind.info),
      TicketStatus.cancelled => const Pill('Đã hủy', PillKind.mute),
    };
    return Scaffold(
      appBar: TopBar(title: 'Vé lên xe', trailing: pill),
      body: PSplit(left: [
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
                    Text(
                      t.seat.contains(',')
                          ? 'Đọc mã này cho tài xế nếu không quét được. Mã dùng cho cả ghế ${t.seat}.'
                          : 'Đọc mã này cho tài xế nếu không quét được.',
                      textAlign: TextAlign.center,
                      style: sans(size: 12, color: const Color(0xFF1E3A8A)),
                    ),
                  ]),
                ),
              ],
            ]),
          )
        else if (t.status == TicketStatus.boarded)
          AppCard(child: Text('Bạn đã lên xe. Vé không còn mã QR để dùng lại hay chia sẻ.', style: sans(size: 14, color: PTokens.muted))),
      ], right: [
        if (!pWide(context)) gap(14),
        AppCard(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            Row(children: [
              Expanded(child: KeyValue('Mã đặt chỗ', t.pnr, isMono: true, valueColor: PTokens.pnr)),
              Expanded(child: KeyValue('Ghế', t.seat, isMono: true)),
            ]),
            gap(12),
            Row(children: [
              Expanded(child: KeyValue('Đón', '${t.pickup} · ${t.pickupTimeLabel}')),
              Expanded(child: KeyValue('Ngày', t.date)),
            ]),
            if (t.homePickup != null) ...[
              gap(12),
              _HomeService(
                pickupSide: true,
                address: t.homePickup!,
                status: t.homePickupStatus,
                reason: t.homePickupReason,
                window: t.pickupWindow,
                stop: t.pickup,
                onWithdraw: usable && t.homePickupStatus == 'PENDING_REVIEW' ? () => _withdraw(store, pickupSide: true) : null,
              ),
            ],
            if (t.pickupNotice != null) ...[
              gap(12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: PTokens.warnSoft, borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                child: Semantics(liveRegion: true, child: Text(t.pickupNotice!, style: sans(size: 14, weight: FontWeight.w600, color: PTokens.warnInk))),
              ),
            ],
            if (t.homeDropoff != null) ...[
              gap(12),
              _HomeService(
                pickupSide: false,
                address: t.homeDropoff!,
                status: t.homeDropoffStatus,
                reason: t.homeDropoffReason,
                stop: t.dropoff,
                onWithdraw: usable && t.homeDropoffStatus == 'PENDING_REVIEW' ? () => _withdraw(store, pickupSide: false) : null,
              ),
            ],
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
          LinkButton(label: 'Gửi link theo dõi xe cho người thân', onPressed: () => _shareTracking(store)),
          LinkButton(label: 'Hủy vé', color: PTokens.danger, onPressed: () => confirmCancelTicket(context, t)),
        ],
      ]),
    );
  }
}

/// A home pickup or drop-off on the ticket with the company's answer (D130): a request under review is never
/// shown as confirmed, and a refused one says where the bus serves the passenger instead.
class _HomeService extends StatelessWidget {
  const _HomeService({required this.pickupSide, required this.address, required this.status, required this.stop, this.reason, this.window, this.onWithdraw});
  final bool pickupSide;
  final String address;
  final String? status;
  final String? reason;
  final String? window;
  final String stop;
  final VoidCallback? onWithdraw;

  @override
  Widget build(BuildContext context) {
    final label = pickupSide ? 'Đón tận nhà' : 'Trả tận nhà';
    final state = Ticket.homeStatusLabel[status] ?? '';
    if (status == 'REJECTED' || status == 'WITHDRAWN') {
      final where = pickupSide ? 'Bạn lên xe tại $stop.' : 'Bạn xuống xe tại $stop.';
      final text = status == 'REJECTED'
          ? '$label: $state${reason != null ? ' ($reason)' : ''}. $where Phụ phí được hoàn; bạn có thể hủy vé được hoàn đủ tiền trước giờ xuất bến.'
          : '$label: $state. $where Phụ phí được hoàn.';
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: PTokens.warnSoft, borderRadius: BorderRadius.circular(PTokens.radiusControl)),
        child: Semantics(liveRegion: true, child: Text(text, style: sans(size: 14, weight: FontWeight.w600, color: PTokens.warnInk))),
      );
    }
    final pending = status == 'PENDING_REVIEW';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      KeyValue('$label · $state${!pending && window != null ? ' · $window' : ''}', address),
      if (pending) ...[
        gap(6),
        Text('Nhà xe chưa xác nhận địa chỉ này. Khi chưa xác nhận, ${pickupSide ? 'bạn lên xe tại $stop' : 'bạn xuống xe tại $stop'}. Bạn sẽ nhận thông báo khi nhà xe trả lời.',
            style: sans(size: 13, color: PTokens.muted, height: 1.4)),
        if (onWithdraw != null) LinkButton(label: 'Hủy yêu cầu ${pickupSide ? 'đón' : 'trả'} tận nhà', color: PTokens.danger, onPressed: onWithdraw),
      ],
    ]);
  }
}
