import 'package:flutter/material.dart';
import 'dart:async';

import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'passenger_main_shell.dart';
import 'passenger_store.dart';
import 'passenger_ticket_qr_screen.dart';
import 'passenger_widgets.dart';

/// PAX-013: VietQR transfer. "Tôi đã chuyển tiền" asks for a check; the ticket is issued when the
/// bank confirms (BR-PAY-004). There is no simulation button on this screen (D101).
class PassengerPaymentProcessingScreen extends StatefulWidget {
  const PassengerPaymentProcessingScreen({super.key, required this.name, required this.phone});
  final String name;
  final String phone;

  @override
  State<PassengerPaymentProcessingScreen> createState() => _PassengerPaymentProcessingScreenState();
}

class _PassengerPaymentProcessingScreenState extends State<PassengerPaymentProcessingScreen> {
  bool _checking = false;
  String? _notYet;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // BR-PAY-003: ask the server every 3 seconds; the bank webhook is what settles the order.
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _check(manual: false));
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _check({required bool manual}) async {
    if (_checking) return;
    final store = PassengerScope.read(context);
    setState(() => _checking = manual);
    final paid = await store.checkPayment(manual: manual);
    if (!mounted) return;
    setState(() {
      _checking = false;
      if (manual && !paid) _notYet = 'Chưa nhận được tiền. Hệ thống vẫn kiểm tra mỗi 3 giây; kiểm tra lại nội dung chuyển khoản.';
    });
    if (!paid || store.lastTicket == null) return;
    _poll?.cancel();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => PassengerBookingSuccessScreen(ticket: store.lastTicket!, phone: widget.phone)),
      (_) => false,
    );
  }

  void _copy(String value) {
    Clipboard.setData(ClipboardData(text: value));
    showToast(context, 'Đã sao chép $value');
  }

  Future<void> _cancel(PassengerStore store) async {
    final yes = await showAppSheet<bool>(context, builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Hủy đơn ${store.orderPnr}?', style: sans(size: 18, weight: FontWeight.w700)),
          gap(8),
          Text('Ghế ${store.seats.join(', ')} sẽ được nhả ngay. Nếu bạn đã chuyển tiền, đừng hủy: vé sẽ được xuất khi ngân hàng báo tiền về.', style: sans(size: 14, color: PTokens.muted, height: 1.5)),
          gap(14),
          PrimaryButton(label: 'Hủy đơn và nhả ghế', color: PTokens.danger, onPressed: () => Navigator.of(ctx).pop(true)),
          gap(8),
          GhostButton(label: 'Tiếp tục thanh toán', onPressed: () => Navigator.of(ctx).pop(false)),
        ]));
    if (yes != true || !mounted) return;
    _poll?.cancel();
    await store.cancelOrder();
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.settings.name == 'seats' || r.isFirst);
    showToast(context, 'Đã hủy đơn và nhả ghế');
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final pnr = store.orderPnr ?? '';
    final memo = store.transferMemo;
    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: TopBar(title: 'Chuyển khoản', showBack: false, trailing: pnr.isEmpty ? null : PnrTag(pnr)),
        body: Column(children: [
          const HoldBanner(),
          Expanded(
            child: ListView(padding: const EdgeInsets.all(16), children: [
              AppCard(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  Semantics(
                    label: 'Mã VietQR cho đơn $pnr, số tiền ${vnd(store.orderAmount)}',
                    image: true,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(border: Border.all(color: PTokens.line), borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                      child: QrImageView(data: store.vietQrPayload, size: 188, backgroundColor: Colors.white),
                    ),
                  ),
                  gap(10),
                  Text('Quét bằng app ngân hàng bất kỳ', style: sans(size: 13, color: PTokens.muted)),
                  gap(10),
                  SizedBox(width: 180, child: GhostButton(label: 'Lưu ảnh mã QR', onPressed: () => showToast(context, 'Đã lưu ảnh mã QR vào thư viện'))),
                ]),
              ),
              gap(14),
              AppCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Column(children: [
                  _row('Ngân hàng', store.bankName),
                  _row('Số tài khoản', store.accountNumber, copy: store.accountNumber, isMono: true),
                  _row('Số tiền', vnd(store.orderAmount), copy: '${store.orderAmount}', isMono: true),
                  _row('Nội dung', memo, copy: memo, isMono: true, color: PTokens.pnr, last: true),
                ]),
              ),
              gap(14),
              Text('Chuyển đúng số tiền và nội dung. Vé được xuất tự động khi ngân hàng báo tiền về, thường dưới 1 phút.', style: sans(size: 13, color: const Color(0xFF334155), height: 1.5)),
              gap(10),
              Row(children: [
                Container(width: 8, height: 8, decoration: const BoxDecoration(color: PTokens.primary, shape: BoxShape.circle)),
                const SizedBox(width: 8),
                Expanded(child: Text(_checking ? 'Đang kiểm tra với ngân hàng…' : (_notYet ?? 'Đang chờ ngân hàng xác nhận'), style: sans(size: 13, color: _notYet != null && !_checking ? PTokens.warnInk : PTokens.muted))),
              ]),
            ]),
          ),
        ]),
        bottomNavigationBar: BottomAction(column: true, children: [
          PrimaryButton(label: _checking ? 'Đang kiểm tra…' : 'Tôi đã chuyển tiền, kiểm tra ngay', onPressed: _checking ? null : () => _check(manual: true)),
          LinkButton(label: 'Hủy đơn và nhả ghế', color: PTokens.danger, onPressed: () => _cancel(store)),
        ]),
      ),
    );
  }

  Widget _row(String label, String value, {String? copy, bool isMono = false, Color color = PTokens.ink, bool last = false}) => Container(
        constraints: const BoxConstraints(minHeight: 48),
        decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: Color(0xFFF1F5F9)))),
        child: Row(children: [
          SizedBox(width: 96, child: Text(label, style: sans(size: 13, color: PTokens.muted))),
          Expanded(child: Text(value, style: isMono ? mono(size: 15, weight: FontWeight.w700, color: color) : sans(size: 14, weight: FontWeight.w600))),
          if (copy != null)
            TextButton(
              onPressed: () => _copy(copy),
              style: TextButton.styleFrom(backgroundColor: PTokens.primarySoft, foregroundColor: PTokens.primaryDark, minimumSize: const Size(44, 36), textStyle: sans(size: 13, weight: FontWeight.w600)),
              child: const Text('Sao chép'),
            ),
        ]),
      );
}

/// PAX-015: success; going back from here never returns to checkout (BR-SUCCESS-001).
class PassengerBookingSuccessScreen extends StatelessWidget {
  const PassengerBookingSuccessScreen({super.key, required this.ticket, required this.phone});
  final Ticket ticket;
  final String phone;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Align(
            alignment: Alignment.centerRight,
            child: IconButton(tooltip: 'Đóng và về trang chủ', onPressed: () => PassengerMainShell.openTab(context, 0), icon: const Icon(Icons.close)),
          ),
          Expanded(
            child: ListView(padding: const EdgeInsets.symmetric(horizontal: 24), children: [
              Center(
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: const BoxDecoration(color: Color(0xFFDCFCE7), shape: BoxShape.circle),
                  child: const Icon(Icons.check, size: 36, color: PTokens.success),
                ),
              ),
              gap(20),
              Text('Đặt vé thành công', textAlign: TextAlign.center, style: sans(size: 24, weight: FontWeight.w700)),
              gap(6),
              Text('Đã nhận ${vnd(ticket.paid)}. Vé và mã đặt chỗ đã gửi qua SMS tới ${maskPhone(phone)}.', textAlign: TextAlign.center, style: sans(size: 14, color: PTokens.muted, height: 1.5)),
              gap(20),
              AppCard(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(children: [Text('Mã đặt chỗ', style: sans(size: 13, color: PTokens.muted)), const Spacer(), Text(ticket.pnr, style: mono(size: 18, weight: FontWeight.w700, color: PTokens.pnr))]),
                  ),
                  const Divider(height: 1, color: PTokens.lineStrong),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      childAspectRatio: 3.2,
                      mainAxisSpacing: 8,
                      children: [
                        KeyValue('Chuyến', ticket.route),
                        KeyValue('Khởi hành', '${ticket.dep} · ${ticket.date.split(' ').last}', isMono: true),
                        KeyValue('Điểm đón', ticket.pickup),
                        KeyValue('Ghế', ticket.seat, isMono: true),
                        KeyValue('Xe', ticket.plate, isMono: true),
                        KeyValue('Hành khách', ticket.name),
                      ],
                    ),
                  ),
                ]),
              ),
              gap(20),
              Text('Có mặt ở điểm đón trước 15 phút. Vé dùng được cả khi mất mạng; bạn có thể lưu ảnh hoặc in vé. Mỗi vé chỉ lên xe một lần.', textAlign: TextAlign.center, style: sans(size: 13, color: PTokens.muted, height: 1.5)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              PrimaryButton(
                label: 'Xem vé lên xe',
                onPressed: () {
                  PassengerMainShell.openTab(context, 1);
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => PassengerTicketQrScreen(ticket: ticket)));
                },
              ),
              gap(8),
              GhostButton(label: 'Về trang chủ', onPressed: () => PassengerMainShell.openTab(context, 0)),
            ]),
          ),
        ]),
      ),
    );
  }
}
