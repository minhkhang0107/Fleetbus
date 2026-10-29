import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';

const driverAppVersion = '3.0.0';

/// The fonts come from google_fonts at run time, so their licence is added to the app's licence list here.
void registerDriverFontLicenses() {
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(['Geist'], await rootBundle.loadString('assets/licenses/Geist-OFL.txt'));
    yield LicenseEntryWithLineBreaks(['JetBrains Mono'], await rootBundle.loadString('assets/licenses/JetBrainsMono-OFL.txt'));
  });
}

/// '2026-10-20' -> '20/10/2026'.
String legalDate(String day) => day.length == 10 ? '${day.substring(8)}/${day.substring(5, 7)}/${day.substring(0, 4)}' : day;

/// SH-006: app version, terms of use, open-source licences, and the model and data notice (D157).
class DriverAboutScreen extends StatefulWidget {
  const DriverAboutScreen({super.key});

  @override
  State<DriverAboutScreen> createState() => _DriverAboutScreenState();
}

class _DriverAboutScreenState extends State<DriverAboutScreen> {
  ({LegalInfo? info, String? error})? _legal;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _legal = null);
    final r = await DriverScope.read(context).loadLegal();
    if (mounted) setState(() => _legal = r);
  }

  @override
  Widget build(BuildContext context) {
    final legal = _legal?.info;
    final legalHint = _legal == null ? 'Đang tải…' : legal == null ? 'Chưa tải được' : 'Phiên bản ${legal.version} · hiệu lực từ ${legalDate(legal.effectiveDate)}';
    void openDoc(LegalDoc doc) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => DriverLegalDocScreen(doc: doc, info: legal!)));
    return Scaffold(
      appBar: const DHeader(title: 'Giới thiệu'),
      body: DMaxWidth(child: ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [
          Image.asset('assets/brand/logo.png', width: 56, height: 56),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('BusGo Driver', style: dsans(size: 20, weight: FontWeight.w700)),
              Text('Ứng dụng cho tài xế và phụ xe', style: dsans(size: 14, color: DTokens.muted)),
              Text('Phiên bản $driverAppVersion', style: dmono(size: 13, color: DTokens.muted)),
            ]),
          ),
        ]),
        const SizedBox(height: 20),
        Panel(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Column(children: [
            _row('Điều khoản sử dụng', legalHint, legal == null ? null : () => openDoc(legal.terms)),
            const Divider(height: 1, color: DTokens.line),
            _row('Chính sách quyền riêng tư', legalHint, legal == null ? null : () => openDoc(legal.privacy)),
            const Divider(height: 1, color: DTokens.line),
            _row('Giấy phép mã nguồn mở', 'Thư viện và phông chữ dùng trong app', () => showLicensePage(
                  context: context,
                  applicationName: 'BusGo Driver',
                  applicationVersion: driverAppVersion,
                  applicationIcon: Padding(padding: const EdgeInsets.all(8), child: Image.asset('assets/brand/logo.png', width: 48, height: 48)),
                )),
            const Divider(height: 1, color: DTokens.line),
            _row('Giấy phép mô hình và dữ liệu', legal == null ? legalHint : 'Mô hình AI, bản đồ, phông chữ', legal == null ? null : () => openDoc(legal.modelNotice)),
          ]),
        ),
        if (_legal != null && legal == null) ...[
          const SizedBox(height: 12),
          Text(_legal!.error ?? 'Có lỗi, thử lại sau.', textAlign: TextAlign.center, style: dsans(size: 14, color: DTokens.dangerInk)),
          const SizedBox(height: 8),
          BigButton(label: 'Thử lại', outline: true, color: DTokens.sub, onPressed: _load),
        ],
      ])),
    );
  }

  Widget _row(String title, String hint, VoidCallback? onTap) => InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: dsans(size: 16, weight: FontWeight.w600, color: onTap == null ? DTokens.muted : DTokens.ink)),
                Text(hint, style: dsans(size: 13, color: DTokens.muted)),
              ]),
            ),
            Icon(Icons.chevron_right, color: onTap == null ? DTokens.line : DTokens.muted),
          ]),
        ),
      );
}

/// One legal text: its sections in order, with the version it belongs to.
class DriverLegalDocScreen extends StatelessWidget {
  const DriverLegalDocScreen({super.key, required this.doc, required this.info});
  final LegalDoc doc;
  final LegalInfo info;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: DHeader(title: doc.title, subtitle: 'Phiên bản ${info.version} · hiệu lực từ ${legalDate(info.effectiveDate)}'),
      body: DMaxWidth(child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
        for (final (i, s) in doc.sections.indexed) ...[
          if (i > 0) const SizedBox(height: 18),
          Text('${i + 1}. ${s.heading}', style: dsans(size: 17, weight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(s.body, style: dsans(size: 15, color: DTokens.sub, height: 1.55)),
          for (final l in s.links)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(48, 44)),
                onPressed: () async {
                  if (!await launchUrl(Uri.parse(l.url), mode: LaunchMode.externalApplication) && context.mounted) dToast(context, 'Không mở được liên kết.');
                },
                child: Text(l.label, style: dsans(size: 14, weight: FontWeight.w600, color: DTokens.primaryInk)),
              ),
            ),
        ],
      ])),
    );
  }
}
