import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// The fonts come from google_fonts at run time, so their licence is added to the app's licence list here.
void registerPassengerFontLicenses() {
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(['Geist'], await rootBundle.loadString('assets/licenses/Geist-OFL.txt'));
    yield LicenseEntryWithLineBreaks(['JetBrains Mono'], await rootBundle.loadString('assets/licenses/JetBrainsMono-OFL.txt'));
  });
}

/// '2026-10-20' -> '20/10/2026'.
String legalDate(String day) => day.length == 10 ? '${day.substring(8)}/${day.substring(5, 7)}/${day.substring(0, 4)}' : day;

/// SH-006: app version, terms of use, open-source licences, and the model and data notice (D157).
class PassengerAboutScreen extends StatefulWidget {
  const PassengerAboutScreen({super.key});

  @override
  State<PassengerAboutScreen> createState() => _PassengerAboutScreenState();
}

class _PassengerAboutScreenState extends State<PassengerAboutScreen> {
  ApiResult<LegalInfo>? _legal;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _legal = null);
    final r = await PassengerScope.read(context).loadLegal();
    if (mounted) setState(() => _legal = r);
  }

  @override
  Widget build(BuildContext context) {
    final legal = _legal?.value;
    final legalHint = _legal == null ? 'Đang tải…' : legal == null ? 'Chưa tải được' : 'Phiên bản ${legal.version} · hiệu lực từ ${legalDate(legal.effectiveDate)}';
    void openDoc(LegalDoc doc) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => LegalDocScreen(doc: doc, info: legal!)));
    return Scaffold(
      appBar: const TopBar(title: 'Giới thiệu'),
      body: PMaxWidth(maxWidth: 720, child: ListView(padding: const EdgeInsets.all(16), children: [
        gap(8),
        Center(child: Image.asset('assets/brand/logo.png', width: 64, height: 64)),
        gap(10),
        Text('BusGo', textAlign: TextAlign.center, style: sans(size: 22, weight: FontWeight.w700)),
        Text('Ứng dụng đặt vé xe khách', textAlign: TextAlign.center, style: sans(size: 14, color: PTokens.muted)),
        gap(2),
        Text('Phiên bản ${PassengerStore.appVersion}', textAlign: TextAlign.center, style: mono(size: 13, color: PTokens.muted)),
        gap(20),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Column(children: [
            _row('Điều khoản sử dụng', legalHint, legal == null ? null : () => openDoc(legal.terms)),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),
            _row('Chính sách quyền riêng tư', legalHint, legal == null ? null : () => openDoc(legal.privacy)),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),
            _row('Giấy phép mã nguồn mở', 'Thư viện và phông chữ dùng trong app', () => showLicensePage(
                  context: context,
                  applicationName: 'BusGo',
                  applicationVersion: PassengerStore.appVersion,
                  applicationIcon: Padding(padding: const EdgeInsets.all(8), child: Image.asset('assets/brand/logo.png', width: 48, height: 48)),
                )),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),
            _row('Giấy phép mô hình và dữ liệu', legal == null ? legalHint : 'Mô hình AI, bản đồ, phông chữ', legal == null ? null : () => openDoc(legal.modelNotice)),
          ]),
        ),
        if (_legal != null && legal == null) ...[
          gap(12),
          Text(_legal!.error ?? 'Có lỗi, thử lại sau.', textAlign: TextAlign.center, style: sans(size: 13, color: PTokens.danger)),
          LinkButton(label: 'Thử lại', onPressed: _load),
        ],
      ])),
    );
  }

  Widget _row(String title, String hint, VoidCallback? onTap) => InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 60),
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: sans(size: 15, weight: FontWeight.w600, color: onTap == null ? PTokens.muted : PTokens.ink)),
                Text(hint, style: sans(size: 13, color: PTokens.muted)),
              ]),
            ),
            Icon(Icons.chevron_right, color: onTap == null ? PTokens.line : PTokens.muted),
          ]),
        ),
      );
}

/// One legal text: its sections in order, with the version it belongs to.
class LegalDocScreen extends StatelessWidget {
  const LegalDocScreen({super.key, required this.doc, required this.info});
  final LegalDoc doc;
  final LegalInfo info;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: TopBar(title: doc.title, subtitle: 'Phiên bản ${info.version} · hiệu lực từ ${legalDate(info.effectiveDate)}'),
      body: PMaxWidth(maxWidth: 720, child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
        for (final (i, s) in doc.sections.indexed) ...[
          if (i > 0) gap(18),
          Text('${i + 1}. ${s.heading}', style: sans(size: 16, weight: FontWeight.w700)),
          gap(6),
          Text(s.body, style: sans(size: 14, color: const Color(0xFF334155), height: 1.55)),
          for (final l in s.links)
            Align(
              alignment: Alignment.centerLeft,
              child: LinkButton(
                label: l.label,
                onPressed: () async {
                  if (!await launchUrl(Uri.parse(l.url), mode: LaunchMode.externalApplication) && context.mounted) showToast(context, 'Không mở được liên kết.');
                },
              ),
            ),
        ],
      ])),
    );
  }
}
