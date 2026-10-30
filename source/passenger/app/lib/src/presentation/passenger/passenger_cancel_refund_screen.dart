import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'passenger_main_shell.dart';
import 'passenger_store.dart';
import 'passenger_ticket_qr_screen.dart';
import 'passenger_widgets.dart';

class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    return TextEditingValue(
      text: newValue.text.toUpperCase(),
      selection: newValue.selection,
    );
  }
}

/// PAX-021: confirm a cancellation with the refund the policy gives (tiers, or 100 % after an
/// official delay over 30 minutes).
Future<void> confirmCancelTicket(BuildContext context, Ticket t) async {
  final store = PassengerScope.read(context);
  final r = store.refundFor(t);
  final known = r.percent >= 0;
  final amount = known ? t.paid * r.percent ~/ 100 : 0;
  final needsRefundAccount = !t.unpaidCash && t.paymentMethod != 'CASH' && (amount > 0 || r.percent > 0 || r.percent == -1);

  final savedAccount = needsRefundAccount ? await store.getLastRefundAccount() : null;

  String selectedBin = savedAccount?.bankBin.isNotEmpty == true ? savedAccount!.bankBin : vietQrBanks.first.bin;
  final accNumCtrl = TextEditingController(text: savedAccount?.accountNumber ?? '');
  final accNameCtrl = TextEditingController(text: savedAccount?.accountName ?? '');
  String? validationError;
  bool cancelling = false;

  if (!context.mounted) return;
  final yes = await showAppSheet<bool>(
    context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSheetState) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Hủy vé ${t.pnr}?', style: sans(size: 18, weight: FontWeight.w700)),
          gap(12),
          AppCard(
            child: t.unpaidCash
                ? Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Vé tiền mặt chưa thanh toán nên không phát sinh hoàn tiền.', style: sans(size: 13, color: PTokens.muted, height: 1.4)),
                  )
                : Column(children: [
                    Row(children: [Text('Đã trả', style: sans(size: 14, color: PTokens.muted)), const Spacer(), Text(vnd(t.paid), style: mono(size: 14))]),
                    if (known) ...[
                      gap(4),
                      Row(children: [Text('Được hoàn', style: sans(size: 14, color: PTokens.muted)), const Spacer(), Text(vnd(amount), style: mono(size: 14, weight: FontWeight.w700))]),
                    ],
                    gap(6),
                    Align(alignment: Alignment.centerLeft, child: Text(r.tier, style: sans(size: 13, color: PTokens.muted, height: 1.4))),
                  ]),
          ),
          if (needsRefundAccount) ...[
            gap(14),
            Text('Tài khoản nhận tiền hoàn', style: sans(size: 14, weight: FontWeight.w700)),
            gap(8),
            DropdownButtonFormField<String>(
              key: const Key('cancel_bank_picker'),
              isExpanded: true,
              initialValue: selectedBin,
              decoration: InputDecoration(
                labelText: 'Ngân hàng',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              items: [
                for (final b in vietQrBanks)
                  DropdownMenuItem(
                    value: b.bin,
                    child: Text(b.shortName, style: sans(size: 14)),
                  ),
              ],
              onChanged: (val) {
                if (val != null) {
                  setSheetState(() {
                    selectedBin = val;
                    validationError = null;
                  });
                }
              },
            ),
            gap(10),
            TextField(
              onTapOutside: dismissKeyboard,
              key: const Key('cancel_account_number'),
              controller: accNumCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: 'Số tài khoản',
                hintText: 'Nhập số tài khoản (6-19 số)',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              onChanged: (_) {
                if (validationError != null) setSheetState(() => validationError = null);
              },
            ),
            gap(10),
            TextField(
              onTapOutside: dismissKeyboard,
              key: const Key('cancel_account_name'),
              controller: accNameCtrl,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [UpperCaseTextFormatter()],
              decoration: InputDecoration(
                labelText: 'Tên chủ tài khoản',
                hintText: 'NGUYEN VAN A',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              onChanged: (_) {
                if (validationError != null) setSheetState(() => validationError = null);
              },
            ),
          ],
          if (validationError != null) ...[
            gap(8),
            Text(validationError!, style: sans(size: 13, weight: FontWeight.w500, color: PTokens.danger)),
          ],
          gap(10),
          Text('Ghế ${t.seat} được nhả ngay cho người khác và không lấy lại được.', style: sans(size: 13, color: PTokens.muted, height: 1.5)),
          gap(14),
          PrimaryButton(
            label: cancelling
                ? 'Đang hủy vé…'
                : (!t.unpaidCash && known && amount > 0 ? 'Hủy vé, hoàn ${vnd(amount)}' : 'Hủy vé'),
            color: PTokens.danger,
            onPressed: cancelling
                ? null
                : () async {
                    Map<String, dynamic>? refundAccount;
                    if (needsRefundAccount) {
                      final accNum = accNumCtrl.text.trim();
                      final accName = accNameCtrl.text.trim().toUpperCase();
                      if (selectedBin.isEmpty) {
                        setSheetState(() => validationError = 'Vui lòng chọn ngân hàng');
                        return;
                      }
                      if (!RegExp(r'^\d{6,19}$').hasMatch(accNum)) {
                        setSheetState(() => validationError = 'Số tài khoản chỉ gồm 6-19 chữ số');
                        return;
                      }
                      if (accName.length < 2) {
                        setSheetState(() => validationError = 'Chủ tài khoản không được để trống');
                        return;
                      }
                      refundAccount = {
                        'bank_bin': selectedBin,
                        'account_number': accNum,
                        'account_name': accName,
                      };
                    }

                    setSheetState(() => cancelling = true);
                    final result = await store.cancelTicket(t, refundAccount: refundAccount);
                    if (!ctx.mounted) return;
                    if (!result.ok) {
                      setSheetState(() {
                        cancelling = false;
                        validationError = result.error;
                      });
                      showToast(ctx, result.error!);
                      return;
                    }
                    Navigator.of(ctx).pop(true);
                    if (!context.mounted) return;
                    PassengerMainShell.openTab(context, 1);
                    showToast(context, (result.value ?? 0) > 0 ? 'Đã gửi yêu cầu hoàn ${vnd(result.value!)}' : 'Đã hủy vé, không hoàn tiền theo chính sách');
                  },
          ),
          gap(8),
          GhostButton(label: 'Giữ vé', onPressed: cancelling ? null : () => Navigator.of(ctx).pop(false)),
        ],
      ),
    ),
  );
  if (yes != true) return;
}

Future<void> showEditRefundAccountSheet(BuildContext context, Ticket ticket) async {
  final store = PassengerScope.read(context);
  final saved = await store.getLastRefundAccount();
  final currentAccount = ticket.refundInfo?.account ?? saved;

  String selectedBin = currentAccount?.bankBin.isNotEmpty == true ? currentAccount!.bankBin : vietQrBanks.first.bin;
  final accNumCtrl = TextEditingController(text: currentAccount?.accountNumber.replaceAll('*', '') ?? '');
  final accNameCtrl = TextEditingController(text: currentAccount?.accountName ?? '');
  String? error;
  bool saving = false;

  if (!context.mounted) return;
  await showAppSheet<void>(
    context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSheetState) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Sửa tài khoản nhận hoàn', style: sans(size: 18, weight: FontWeight.w700)),
          gap(12),
          DropdownButtonFormField<String>(
            key: const Key('edit_refund_bank_picker'),
            isExpanded: true,
            initialValue: selectedBin,
            decoration: InputDecoration(
              labelText: 'Ngân hàng',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            items: [
              for (final b in vietQrBanks)
                DropdownMenuItem(
                  value: b.bin,
                  child: Text(b.shortName, style: sans(size: 14)),
                ),
            ],
            onChanged: (val) {
              if (val != null) {
                setSheetState(() {
                  selectedBin = val;
                  error = null;
                });
              }
            },
          ),
          gap(10),
          TextField(
            onTapOutside: dismissKeyboard,
            key: const Key('edit_refund_account_number'),
            controller: accNumCtrl,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: 'Số tài khoản',
              hintText: 'Nhập số tài khoản (6-19 số)',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            onChanged: (_) {
              if (error != null) setSheetState(() => error = null);
            },
          ),
          gap(10),
          TextField(
            onTapOutside: dismissKeyboard,
            key: const Key('edit_refund_account_name'),
            controller: accNameCtrl,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [UpperCaseTextFormatter()],
            decoration: InputDecoration(
              labelText: 'Tên chủ tài khoản',
              hintText: 'NGUYEN VAN A',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            onChanged: (_) {
              if (error != null) setSheetState(() => error = null);
            },
          ),
          if (error != null) ...[
            gap(8),
            Text(error!, style: sans(size: 13, weight: FontWeight.w500, color: PTokens.danger)),
          ],
          gap(16),
          PrimaryButton(
            label: saving ? 'Đang lưu…' : 'Cập nhật tài khoản',
            onPressed: saving
                ? null
                : () async {
                    final accNum = accNumCtrl.text.trim();
                    final accName = accNameCtrl.text.trim().toUpperCase();
                    if (selectedBin.isEmpty) {
                      setSheetState(() => error = 'Vui lòng chọn ngân hàng');
                      return;
                    }
                    if (!RegExp(r'^\d{6,19}$').hasMatch(accNum)) {
                      setSheetState(() => error = 'Số tài khoản chỉ gồm 6-19 chữ số');
                      return;
                    }
                    if (accName.length < 2) {
                      setSheetState(() => error = 'Chủ tài khoản không được để trống');
                      return;
                    }

                    setSheetState(() => saving = true);
                    final r = await store.updateRefundAccount(ticket, {
                      'bank_bin': selectedBin,
                      'account_number': accNum,
                      'account_name': accName,
                    });
                    if (!ctx.mounted) return;
                    if (!r.ok) {
                      setSheetState(() {
                        saving = false;
                        error = r.error;
                      });
                      showToast(ctx, r.error!);
                      return;
                    }
                    Navigator.of(ctx).pop();
                    if (!context.mounted) return;
                    showToast(context, 'Đã cập nhật tài khoản nhận hoàn');
                  },
          ),
          gap(8),
          GhostButton(label: 'Đóng', onPressed: saving ? null : () => Navigator.of(ctx).pop()),
        ],
      ),
    ),
  );
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
      body: PMaxWidth(maxWidth: 720, child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 16), children: [
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
            TextSpan(
              text: t.unpaidCash
                  ? 'Vé tiền mặt chưa thanh toán nên không phát sinh hoàn tiền.'
                  : 'Chuyến chậm hơn 30 phút nên hủy lúc này được hoàn đủ ${vnd(t.paid)} về tài khoản đã chuyển, không mất phí.',
              style: sans(size: 13, color: const Color(0xFF1E40AF), height: 1.5),
            ),
          ])),
        ),
      ])),
      bottomNavigationBar: BottomAction(column: true, children: [
        PrimaryButton(label: 'Giữ vé, đi lúc ${t.departure}', onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => PassengerTicketQrScreen(ticket: t)))),
        GhostButton(label: t.unpaidCash ? 'Hủy vé' : 'Hủy vé, hoàn ${vnd(t.paid)}', color: PTokens.danger, borderColor: const Color(0xFFFCA5A5), onPressed: () => confirmCancelTicket(context, t)),
      ]),
    );
  }
}
