import 'package:flutter/material.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-019: incident type and estimated delay; the operator decides the official delay (BR-DELAY-002).
class DriverIncidentScreen extends StatefulWidget {
  const DriverIncidentScreen({super.key});

  @override
  State<DriverIncidentScreen> createState() => _DriverIncidentScreenState();
}

class _DriverIncidentScreenState extends State<DriverIncidentScreen> {
  String _type = 'Kẹt xe';
  int _delay = 30;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: DHeader(
        title: 'Báo sự cố',
        close: true,
        trailing: FilledButton(
          onPressed: () => dToast(context, 'Đang gọi 112'),
          style: FilledButton.styleFrom(backgroundColor: DTokens.danger, minimumSize: const Size(64, 44), shape: const StadiumBorder()),
          child: Text('Gọi 112', style: dsans(size: 14, weight: FontWeight.w700, color: Colors.white)),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Chuyện gì xảy ra?', style: dsans(size: 15, weight: FontWeight.w600)),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 2.4,
          children: [
            for (final t in ['Kẹt xe', 'Xe hỏng', 'Tai nạn', 'Khác']) ChoiceTile(label: t, danger: true, center: true, height: 72, selected: _type == t, onTap: () => setState(() => _type = t)),
          ],
        ),
        const SizedBox(height: 20),
        Text('Ước tính chậm bao lâu?', style: dsans(size: 15, weight: FontWeight.w600)),
        const SizedBox(height: 10),
        Row(children: [
          for (final d in [15, 30, 45, 60]) ...[
            if (d != 15) const SizedBox(width: 8),
            Expanded(child: ChoiceTile(label: d == 60 ? '60+' : '$d', danger: true, center: true, selected: _delay == d, onTap: () => setState(() => _delay = d))),
          ],
        ]),
        const SizedBox(height: 20),
        TextField(controller: _note, maxLines: 3, style: dsans(size: 15), decoration: const InputDecoration(labelText: 'Ghi chú (không bắt buộc)')),
        const SizedBox(height: 16),
        Text('Điều hành nhận ngay cùng vị trí xe. Khách trên chuyến chỉ thấy giờ mới khi điều hành công bố.', style: dsans(size: 13, color: DTokens.muted, height: 1.5)),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: BigButton(
            label: 'Gửi cho điều hành',
            color: DTokens.danger,
            height: 72,
            onPressed: () async {
              final error = await DriverScope.read(context).reportIncident(_type, _delay);
              if (!context.mounted) return;
              if (error != null) {
                dToast(context, error);
                return;
              }
              Navigator.of(context).pop();
              dToast(context, DriverScope.read(context).offline ? 'Mất mạng · sẽ gửi khi có sóng' : 'Đã gửi cho điều hành');
            },
          ),
        ),
      ),
    );
  }
}
