import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'passenger_about_screen.dart';
import 'passenger_edit_profile_screen.dart';
import 'passenger_login_screen.dart';
import 'passenger_onboarding_screen.dart';
import 'passenger_splash_screen.dart';
import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-022: account, the bus company and the app, as grouped settings lists (D186). The passenger edits
/// their name and photo on the next screen; the phone number is the login and is not edited.
class PassengerProfileScreen extends StatelessWidget {
  const PassengerProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final op = store.operator;
    void push(Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    return Column(children: [
      Container(
        color: PTokens.surface,
        width: double.infinity,
        child: SafeArea(bottom: false, child: Padding(padding: const EdgeInsets.fromLTRB(16, 20, 16, 14), child: Text('Cá nhân', style: sans(size: 22, weight: FontWeight.w700)))),
      ),
      const Divider(height: 1, color: PTokens.line),
      Expanded(
        child: PMaxWidth(maxWidth: 720, child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
          store.loggedIn ? _AccountCard(store: store, onEdit: () => push(const PassengerEditProfileScreen())) : _GuestCard(onLogin: () => push(const PassengerLoginScreen())),
          if (store.loggedIn && store.walletEnabled) ...[
            gap(12),
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(children: [
                const _TileIcon(Icons.account_balance_wallet_outlined),
                const SizedBox(width: 12),
                Expanded(child: Text('Số dư ví BusGo', style: sans(size: 15, weight: FontWeight.w500))),
                Text(vnd(store.walletBalanceVnd), style: mono(size: 16, weight: FontWeight.w700)),
              ]),
            ),
          ],
          if (op != null)
            _Group(title: 'Nhà xe', children: [
              _Tile(icon: Icons.directions_bus_outlined, label: op.name, detail: op.address.isEmpty ? null : op.address),
              if (op.hotline.isNotEmpty) _Tile(icon: Icons.call_outlined, label: 'Gọi tổng đài', value: op.hotline, onTap: () => callHotline(context, op.hotline)),
              if (op.supportEmail.isNotEmpty)
                _Tile(icon: Icons.mail_outline, label: 'Email hỗ trợ', value: op.supportEmail, onTap: () => launchUrl(Uri(scheme: 'mailto', path: op.supportEmail))),
              _Tile(
                icon: Icons.swap_horiz,
                label: 'Đổi nhà xe',
                onTap: () {
                  store.changeOperator();
                  Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PassengerSplashScreen()), (_) => false);
                },
              ),
            ]),
          _Group(title: 'Ứng dụng', children: [
            // D146: the feature pages again, any time.
            _Tile(icon: Icons.auto_awesome_outlined, label: 'Xem giới thiệu tính năng', onTap: () => push(const PassengerOnboardingScreen(replay: true))),
            // SH-006: terms of use and licences (D157).
            _Tile(icon: Icons.info_outline, label: 'Giới thiệu và điều khoản', onTap: () => push(const PassengerAboutScreen())),
          ]),
          if (store.loggedIn)
            _Group(title: 'Tài khoản', children: [
              _Tile(
                icon: Icons.logout,
                label: 'Đăng xuất',
                onTap: () {
                  store.logout();
                  Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PassengerSplashScreen()), (_) => false);
                },
              ),
              _Tile(icon: Icons.delete_outline, label: 'Xóa tài khoản', color: PTokens.danger, onTap: () => _confirmDeleteAccount(context, store)),
            ]),
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

/// The signed-in passenger: photo, name and phone; the whole card opens the profile editor.
class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.store, required this.onEdit});
  final PassengerStore store;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(16),
        onTap: onEdit,
        child: Row(children: [
          ProfileAvatar(size: 64, photo: store.userAvatar, name: store.userName),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(store.userName ?? 'Khách BusGo', maxLines: 2, overflow: TextOverflow.ellipsis, style: sans(size: 18, weight: FontWeight.w700)),
              gap(2),
              if (store.userPhone != null) Text(store.userPhone!, style: mono(size: 14, weight: FontWeight.w500, color: PTokens.muted)),
              if (store.isVip) ...[
                gap(6),
                const Pill('Tài khoản VIP · mọi vé 0 đ', PillKind.ok),
              ],
              gap(6),
              Text('Sửa tên và ảnh đại diện', style: sans(size: 13, weight: FontWeight.w600, color: PTokens.primary)),
            ]),
          ),
          const Icon(Icons.chevron_right, color: PTokens.lineStrong),
        ]),
      );
}

class _GuestCard extends StatelessWidget {
  const _GuestCard({required this.onLogin});
  final VoidCallback onLogin;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const ProfileAvatar(size: 56),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Chưa đăng nhập', style: sans(size: 17, weight: FontWeight.w700)),
                gap(2),
                Text('Đăng nhập bằng số điện thoại để xem vé và tự điền thông tin khi đặt.', style: sans(size: 13, color: PTokens.muted, height: 1.4)),
              ]),
            ),
          ]),
          gap(14),
          PrimaryButton(label: 'Đăng nhập', onPressed: onLogin),
        ]),
      );
}

/// A titled block of rows on one white card, like the grouped lists of iOS Settings.
class _Group extends StatelessWidget {
  const _Group({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(padding: const EdgeInsets.only(left: 4, bottom: 8), child: Text(title.toUpperCase(), style: sans(size: 12, weight: FontWeight.w600, color: PTokens.muted))),
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(color: PTokens.surface, borderRadius: BorderRadius.circular(PTokens.radius), border: Border.all(color: PTokens.line)),
            child: Column(children: [
              for (final (i, child) in children.indexed) ...[
                if (i > 0) const Divider(height: 1, indent: 60, color: PTokens.line),
                child,
              ],
            ]),
          ),
        ]),
      );
}

class _TileIcon extends StatelessWidget {
  const _TileIcon(this.icon, {this.color = PTokens.primary});
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(color: color == PTokens.danger ? PTokens.dangerSoft : PTokens.primarySoft, borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, size: 18, color: color),
      );
}

/// One row: icon, label, an optional value on the right and a chevron when it opens something.
class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, this.value, this.detail, this.onTap, this.color = PTokens.ink});
  final IconData icon;
  final String label;
  final String? value;
  final String? detail;
  final VoidCallback? onTap;
  final Color color;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 54),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(children: [
              _TileIcon(icon, color: color == PTokens.danger ? PTokens.danger : PTokens.primary),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text(label, style: sans(size: 15, weight: FontWeight.w500, color: color)),
                  if (detail != null) Text(detail!, style: sans(size: 13, color: PTokens.muted, height: 1.35)),
                ]),
              ),
              if (value != null) ...[
                const SizedBox(width: 8),
                // Sized to its text, so the chevron stays at the right edge like on the other rows.
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 190),
                  child: Text(value!, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.right, style: sans(size: 14, color: PTokens.muted)),
                ),
              ],
              if (onTap != null) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.chevron_right, color: PTokens.lineStrong)),
            ]),
          ),
        ),
      );
}
