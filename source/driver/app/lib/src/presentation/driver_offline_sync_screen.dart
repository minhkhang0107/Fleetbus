import 'package:flutter/material.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-015: actions kept on the device while there is no network, sent when it comes back.
class DriverOfflineSyncScreen extends StatelessWidget {
  const DriverOfflineSyncScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    return SafeArea(
      child: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Đồng bộ', style: dsans(size: 22, weight: FontWeight.w700)),
        const SizedBox(height: 16),
        Panel(
          border: DTokens.line,
          child: Row(children: [
            Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: store.offline ? const Color(0xFFF59E0B) : const Color(0xFF22C55E))),
            const SizedBox(width: 10),
            Expanded(child: Text(store.offline ? 'Mất mạng · thao tác được lưu trên máy' : 'Đang kết nối', style: dsans(size: 15))),
            Text('${store.queue.length} chờ gửi', style: dmono(size: 14, weight: FontWeight.w600)),
          ]),
        ),
        const SizedBox(height: 12),
        if (store.queue.isEmpty)
          Text('Không có thao tác nào chờ gửi.', style: dsans(size: 14, color: DTokens.muted))
        else
          Panel(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(children: [
              for (final q in store.queue)
                SizedBox(
                  height: 48,
                  child: Row(children: [Expanded(child: Text(q.label, style: dsans(size: 14))), Text(hhmm(q.at), style: dmono(size: 13, weight: FontWeight.w500, color: DTokens.muted))]),
                ),
            ]),
          ),
        const SizedBox(height: 16),
        BigButton(
          label: 'Gửi ngay',
          onPressed: store.queue.isEmpty
              ? null
              : () async {
                  final n = await store.flushQueue();
                  if (context.mounted) dToast(context, n > 0 ? 'Đã kết nối lại · $n thao tác đã xử lý' : 'Vẫn chưa có mạng');
                },
        ),
      ]),
    );
  }
}
