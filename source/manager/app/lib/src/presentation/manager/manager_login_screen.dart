import 'package:flutter/material.dart';
import '../../../../resources/lib/src/theme/app_colors.dart';

class ManagerLoginScreen extends StatefulWidget {
  final VoidCallback onLoginSuccess;
  const ManagerLoginScreen({super.key, required this.onLoginSuccess});

  @override
  State<ManagerLoginScreen> createState() => _ManagerLoginScreenState();
}

class _ManagerLoginScreenState extends State<ManagerLoginScreen> {
  final _usernameController = TextEditingController(text: 'admin@busgo.vn');
  final _passwordController = TextEditingController(text: 'admin123');
  bool _isLoading = false;

  void _handleLogin() {
    setState(() => _isLoading = true);
    Future.delayed(const Duration(milliseconds: 600), () {
      if (mounted) {
        setState(() => _isLoading = false);
        widget.onLoginSuccess();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ManagerColors.bgDark,
      body: Center(
        child: Container(
          width: 440,
          padding: const EdgeInsets.all(36),
          decoration: BoxDecoration(
            color: ManagerColors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: ManagerColors.borderSubtle),
            boxShadow: const [
              BoxShadow(color: Colors.black54, blurRadius: 32, offset: Offset(0, 12))
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: ManagerColors.cyanAccent.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.hub_rounded, color: ManagerColors.cyanAccent, size: 26),
                  ),
                  const SizedBox(width: 14),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'BUSGO OPS CENTER',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: ManagerColors.textPrimary,
                          letterSpacing: 0.5,
                        ),
                      ),
                      Text(
                        'Cổng Điều Hành Doanh Nghiệp',
                        style: TextStyle(fontSize: 12, color: ManagerColors.textMuted),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _usernameController,
                style: const TextStyle(color: ManagerColors.textPrimary),
                decoration: InputDecoration(
                  labelText: 'Email / Mã Quản Trị Viên',
                  labelStyle: const TextStyle(color: ManagerColors.textSecondary),
                  prefixIcon: const Icon(Icons.account_circle_outlined, color: ManagerColors.cyanAccent),
                  filled: true,
                  fillColor: ManagerColors.surfaceElevated,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passwordController,
                obscureText: true,
                style: const TextStyle(color: ManagerColors.textPrimary),
                decoration: InputDecoration(
                  labelText: 'Mật Khẩu Phân Quyền (RBAC)',
                  labelStyle: const TextStyle(color: ManagerColors.textSecondary),
                  prefixIcon: const Icon(Icons.lock_outline_rounded, color: ManagerColors.cyanAccent),
                  filled: true,
                  fillColor: ManagerColors.surfaceElevated,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 28),
              ElevatedButton(
                onPressed: _isLoading ? null : _handleLogin,
                style: ElevatedButton.styleFrom(
                  backgroundColor: ManagerColors.cyanAccent,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: _isLoading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('ĐĂNG NHẬP ĐIỀU HÀNH', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
