import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// Opens the camera or the photo library and returns the photo already shrunk for an avatar; tests replace it.
Future<Uint8List?> Function(ImageSource source) pickAvatarImage = (source) async {
  final file = await ImagePicker().pickImage(source: source, maxWidth: 512, maxHeight: 512, imageQuality: 80, requestFullMetadata: false);
  return file?.readAsBytes();
};

/// Round photo of the passenger, or their initials, or a person icon.
class ProfileAvatar extends StatelessWidget {
  const ProfileAvatar({super.key, required this.size, this.photo, this.name});
  final double size;
  final Uint8List? photo;
  final String? name;

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final letters = name == null ? '' : initials(name!);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: PTokens.primarySoft,
        border: Border.all(color: PTokens.surface, width: 2),
        // A damaged saved photo leaves the tinted circle instead of an error.
        image: photo == null ? null : DecorationImage(image: MemoryImage(photo!), fit: BoxFit.cover, onError: (_, __) {}),
      ),
      alignment: Alignment.center,
      child: photo != null
          ? null
          : (letters.isNotEmpty
              ? Text(letters, style: sans(size: size * 0.36, weight: FontWeight.w700, color: PTokens.primaryDark))
              : Icon(Icons.person, size: size * 0.5, color: PTokens.primaryDark)),
    );
  }
}

/// PAX-022 (D186): change the name and the photo. The phone number is the login and is shown, never edited.
class PassengerEditProfileScreen extends StatefulWidget {
  const PassengerEditProfileScreen({super.key});

  @override
  State<PassengerEditProfileScreen> createState() => _PassengerEditProfileScreenState();
}

enum _PhotoAction { camera, library, remove }

class _PassengerEditProfileScreenState extends State<PassengerEditProfileScreen> {
  late final TextEditingController _name;
  late final String _savedName;
  Uint8List? _photo;
  bool _photoChanged = false;
  String? _nameError;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final store = PassengerScope.read(context);
    _savedName = store.userName ?? '';
    _name = TextEditingController(text: _savedName)..addListener(() => setState(() => _nameError = null));
    _photo = store.userAvatar;
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _nameChanged => normalizeName(_name.text) != normalizeName(_savedName);
  bool get _dirty => _photoChanged || _nameChanged;

  Future<void> _changePhoto() async {
    final action = await showAppSheet<_PhotoAction>(
      context,
      builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Ảnh đại diện', style: sans(size: 18, weight: FontWeight.w700)),
        gap(12),
        _SheetOption(icon: Icons.photo_camera_outlined, label: 'Chụp ảnh', onTap: () => Navigator.of(ctx).pop(_PhotoAction.camera)),
        _SheetOption(icon: Icons.photo_library_outlined, label: 'Chọn từ thư viện', onTap: () => Navigator.of(ctx).pop(_PhotoAction.library)),
        if (_photo != null) _SheetOption(icon: Icons.delete_outline, label: 'Xóa ảnh', color: PTokens.danger, onTap: () => Navigator.of(ctx).pop(_PhotoAction.remove)),
        gap(8),
        GhostButton(label: 'Đóng', onPressed: () => Navigator.of(ctx).pop()),
      ]),
    );
    if (action == null || !mounted) return;
    if (action == _PhotoAction.remove) {
      setState(() {
        _photo = null;
        _photoChanged = true;
      });
      return;
    }
    Uint8List? picked;
    try {
      picked = await pickAvatarImage(action == _PhotoAction.camera ? ImageSource.camera : ImageSource.gallery);
    } catch (_) {
      if (mounted) showToast(context, action == _PhotoAction.camera ? 'Không mở được camera. Cho phép BusGo dùng camera trong Cài đặt.' : 'Không mở được thư viện ảnh');
      return;
    }
    if (picked == null || !mounted) return;
    if (PassengerStore.avatarMime(picked) == null) {
      showToast(context, 'Chọn ảnh JPEG hoặc PNG');
      return;
    }
    setState(() {
      _photo = picked;
      _photoChanged = true;
    });
  }

  Future<void> _save() async {
    final error = _nameChanged ? nameError(_name.text) : null;
    if (error != null) {
      setState(() => _nameError = error);
      return;
    }
    setState(() => _saving = true);
    final failed = await PassengerScope.read(context).updateProfile(
      name: _nameChanged ? _name.text : null,
      avatar: _photoChanged ? _photo : null,
      removeAvatar: _photoChanged && _photo == null,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (failed != null) {
      showToast(context, failed);
      return;
    }
    showToast(context, 'Đã lưu hồ sơ');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    return Scaffold(
      appBar: const TopBar(title: 'Sửa hồ sơ'),
      body: PMaxWidth(
        maxWidth: 560,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 24), children: [
          Center(
            child: Semantics(
              button: true,
              label: 'Đổi ảnh đại diện',
              excludeSemantics: true,
              child: Pressable(
                child: GestureDetector(
                  onTap: _saving ? null : _changePhoto,
                  child: Stack(clipBehavior: Clip.none, children: [
                    ProfileAvatar(size: 104, photo: _photo, name: _name.text),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(color: PTokens.primary, shape: BoxShape.circle, border: Border.all(color: PTokens.surface, width: 2)),
                        child: const Icon(Icons.photo_camera, size: 17, color: Colors.white),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
          ),
          gap(8),
          Center(child: TextButton(onPressed: _saving ? null : _changePhoto, child: Text(_photo == null ? 'Thêm ảnh đại diện' : 'Đổi ảnh đại diện', style: sans(size: 14, weight: FontWeight.w600, color: PTokens.primary)))),
          gap(16),
          LabeledField(
            label: 'Họ và tên',
            controller: _name,
            hint: 'VD: Nguyễn Văn An',
            maxLength: 60,
            errorText: _nameError,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.name],
            textInputAction: TextInputAction.done,
          ),
          gap(16),
          Text('Số điện thoại', style: sans(size: 13, color: const Color(0xFF334155))),
          const SizedBox(height: 4),
          Container(
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(color: PTokens.canvas, borderRadius: BorderRadius.circular(PTokens.radiusControl), border: Border.all(color: PTokens.line)),
            child: Row(children: [
              Expanded(child: Text(store.userPhone ?? '', style: mono(size: 15, weight: FontWeight.w500, color: PTokens.muted))),
              const Icon(Icons.lock_outline, size: 18, color: PTokens.muted),
            ]),
          ),
          gap(6),
          Text('Số điện thoại dùng để đăng nhập và nhận vé nên không đổi được. Muốn dùng số khác, hãy đăng xuất rồi đăng nhập bằng số mới.', style: sans(size: 12, color: PTokens.muted, height: 1.4)),
        ]),
      ),
      bottomNavigationBar: BottomAction(children: [
        Expanded(child: PrimaryButton(label: _saving ? 'Đang lưu…' : 'Lưu thay đổi', onPressed: _dirty && !_saving ? _save : null)),
      ]),
    );
  }
}

class _SheetOption extends StatelessWidget {
  const _SheetOption({required this.icon, required this.label, required this.onTap, this.color = PTokens.ink});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(PTokens.radiusControl),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 14),
          child: Row(children: [
            Icon(icon, color: color),
            const SizedBox(width: 14),
            Text(label, style: sans(size: 16, weight: FontWeight.w500, color: color)),
          ]),
        ),
      );
}
