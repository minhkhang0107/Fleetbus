import 'package:flutter/material.dart';

import 'passenger_about_screen.dart';
import 'passenger_login_screen.dart';
import 'passenger_onboarding_screen.dart';
import 'passenger_splash_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-022: account, saved stops and support.
class PassengerProfileScreen extends StatelessWidget {
  const PassengerProfileScreen({super.key});

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    return Column(children: [
      Container(
        color: PTokens.surface,
        width: double.infinity,
        child: SafeArea(bottom: false, child: Padding(padding: const EdgeInsets.fromLTRB(16, 20, 16, 14), child: Text('Cá nhân', style: sans(size: 22, weight: FontWeight.w700)))),
      ),
      const Divider(height: 1, color: PTokens.line),
      Expanded(
        child: PMaxWidth(maxWidth: 720, child: ListView(padding: const EdgeInsets.all(16), children: [
          AppCard(
            child: Row(children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: PTokens.primarySoft,
                child: !store.loggedIn
                    ? Text('?', style: sans(size: 15, weight: FontWeight.w600, color: PTokens.primaryDark))
                    : (store.userName != null && store.userName!.trim().isNotEmpty
                        ? Text(_initials(store.userName!), style: sans(size: 15, weight: FontWeight.w600, color: PTokens.primaryDark))
                        : const Icon(Icons.person, color: PTokens.primaryDark, size: 24)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    !store.loggedIn
                        ? 'Chưa đăng nhập'
                        : (store.userName ?? 'Khách BusGo'),
                    style: sans(size: 16, weight: FontWeight.w600),
                  ),
                  if (store.userPhone != null) Text(store.userPhone!, style: mono(size: 13, weight: FontWeight.w500, color: PTokens.muted)),
                  if (store.isVip) ...[
                    gap(4),
                    const Pill('Tài khoản VIP · mọi vé 0 đ', PillKind.ok),
                  ],
                ]),
              ),
            ]),
          ),
          if (store.loggedIn && store.walletEnabled) ...[
            gap(16),
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(children: [
                const Icon(Icons.account_balance_wallet_outlined, color: PTokens.primary, size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Số dư ví BusGo', style: sans(size: 13, color: PTokens.muted)),
                    gap(2),
                    Text(vnd(store.walletBalanceVnd), style: mono(size: 16, weight: FontWeight.w700)),
                  ]),
                ),
              ]),
            ),
          ],
          gap(16),
          if (store.operator != null) ...[
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Nhà xe', style: sans(size: 13, color: PTokens.muted)),
                gap(4),
                Text(store.operator!.name, style: sans(size: 15, weight: FontWeight.w600)),
                if (store.operator!.hotline.isNotEmpty)
                  GestureDetector(
                    onTap: () => callHotline(context, store.operator!.hotline),
                    child: Text('Tổng đài ${store.operator!.hotline}', style: sans(size: 14, color: PTokens.muted)),
                  ),
                if (store.operator!.supportEmail.isNotEmpty) Text('Email ${store.operator!.supportEmail}', style: sans(size: 14, color: PTokens.muted)),
                if (store.operator!.address.isNotEmpty) Text(store.operator!.address, style: sans(size: 14, color: PTokens.muted)),
              ]),
            ),
            gap(16),
            GhostButton(
              label: 'Đổi nhà xe',
              onPressed: () {
                store.changeOperator();
                Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PassengerSplashScreen()), (_) => false);
              },
            ),
            gap(16),
          ],
          // D146: the feature pages again, any time.
          GhostButton(
            label: 'Xem giới thiệu tính năng',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerOnboardingScreen(replay: true))),
          ),
          gap(16),
          // SH-006: terms of use and licences (D157).
          GhostButton(
            label: 'Giới thiệu và điều khoản',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerAboutScreen())),
          ),
          gap(16),
          GhostButton(
            label: store.loggedIn ? 'Đăng xuất' : 'Đăng nhập',
            onPressed: () {
              if (store.loggedIn) {
                store.logout();
                Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PassengerSplashScreen()), (_) => false);
              } else {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PassengerLoginScreen()));
              }
            },
          ),
          if (store.loggedIn) ...[
            gap(16),
            GhostButton(
              label: 'Xóa tài khoản',
              color: PTokens.danger,
              borderColor: const Color(0xFFFCA5A5),
              onPressed: () => _confirmDeleteAccount(context, store),
            ),
          ],
        ])),
      ),
    ]);
  }

  /// "XÓA" typed on a Vietnamese keyboard may come precomposed or as O + combining acute; "XOA" is accepted too.
  static bool _confirmsDeletion(String input) => {'XÓA', 'XO\u0301A', 'XOA'}.contains(input.toUpperCase());

  Future<void> _confirmDeleteAccount(BuildContext context, PassengerStore store) async {
    String input = '';
    String? errorMessage;
    bool isDeleting = false;

    await showAppSheet<void>(
      context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Xóa tài khoản?', style: sans(size: 18, weight: FontWeight.w700, color: PTokens.danger)),
            gap(12),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Tất cả thông tin cá nhân, phiên đăng nhập và liên kết số điện thoại sẽ bị xóa hoàn toàn khỏi hệ thống.',
                    style: sans(size: 13, color: PTokens.muted, height: 1.4),
                  ),
                  gap(8),
                  Text(
                    'Lịch sử vé đã đi được giữ lại ở dạng ẩn danh theo quy định kế toán.',
                    style: sans(size: 13, weight: FontWeight.w600, color: PTokens.ink, height: 1.4),
                  ),
                ],
              ),
            ),
            gap(14),
            Text(
              'Nhập chữ XÓA để xác nhận xóa vĩnh viễn tài khoản:',
              style: sans(size: 13, color: PTokens.muted),
            ),
            gap(8),
            TextField(
              onTapOutside: dismissKeyboard,
              autofocus: true,
              decoration: InputDecoration(
                hintText: 'Nhập XÓA',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
              onChanged: (val) {
                setSheetState(() {
                  input = val.trim();
                  errorMessage = null;
                });
              },
            ),
            if (errorMessage != null) ...[
              gap(8),
              Text(errorMessage!, style: sans(size: 13, weight: FontWeight.w500, color: PTokens.danger)),
            ],
            gap(16),
            PrimaryButton(
              label: isDeleting ? 'Đang xóa tài khoản…' : 'Xóa tài khoản',
              color: PTokens.danger,
              onPressed: _confirmsDeletion(input) && !isDeleting
                  ? () async {
                      setSheetState(() => isDeleting = true);
                      final r = await store.deleteAccount();
                      if (!ctx.mounted) return;
                      if (!r.ok) {
                        setSheetState(() {
                          isDeleting = false;
                          errorMessage = r.error;
                        });
                        showToast(ctx, r.error ?? 'Không thể xóa tài khoản');
                        return;
                      }
                      final nav = Navigator.of(context);
                      final messenger = ScaffoldMessenger.of(context);
                      Navigator.of(ctx).pop();
                      messenger
                        ..hideCurrentSnackBar()
                        ..showSnackBar(SnackBar(
                          content: Text('Đã xóa tài khoản', style: sans(size: 14, color: Colors.white)),
                          duration: const Duration(seconds: 3),
                        ));
                      nav.pushAndRemoveUntil(
                        MaterialPageRoute(builder: (_) => const PassengerLoginScreen()),
                        (_) => false,
                      );
                    }
                  : null,
            ),
            gap(8),
            GhostButton(
              label: 'Giữ tài khoản',
              onPressed: isDeleting ? null : () => Navigator.of(ctx).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
