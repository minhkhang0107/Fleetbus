import 'package:flutter/material.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// PAX-005: pick a city or station; the search ignores Vietnamese accents ("thanh hoa" finds Thanh Hóa).
class PassengerLocationPickerScreen extends StatefulWidget {
  const PassengerLocationPickerScreen({super.key, required this.isOrigin});
  final bool isOrigin;

  @override
  State<PassengerLocationPickerScreen> createState() => _PassengerLocationPickerScreenState();
}

String foldVietnamese(String input) {
  const groups = {
    'a': 'àáạảãâầấậẩẫăằắặẳẵ',
    'e': 'èéẹẻẽêềếệểễ',
    'i': 'ìíịỉĩ',
    'o': 'òóọỏõôồốộổỗơờớợởỡ',
    'u': 'ùúụủũưừứựửữ',
    'y': 'ỳýỵỷỹ',
    'd': 'đ',
  };
  final lower = input.toLowerCase();
  final out = StringBuffer();
  for (final ch in lower.split('')) {
    var mapped = ch;
    groups.forEach((base, chars) {
      if (chars.contains(ch)) mapped = base;
    });
    out.write(mapped);
  }
  return out.toString();
}

class _PassengerLocationPickerScreenState extends State<PassengerLocationPickerScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = foldVietnamese(_query.trim());
    final items = PassengerStore.places.values.where((p) => q.isEmpty || foldVietnamese('${p.city} ${p.station} ${p.altStations.join(' ')}').contains(q)).toList();
    return Scaffold(
      appBar: TopBar(title: widget.isOrigin ? 'Chọn điểm đi' : 'Chọn điểm đến'),
      body: Column(children: [
        Container(
          color: PTokens.surface,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: TextField(
            autofocus: true,
            onChanged: (v) => setState(() => _query = v),
            style: sans(size: 15),
            decoration: const InputDecoration(hintText: 'Tỉnh, thành phố hoặc bến xe', prefixIcon: Icon(Icons.search)),
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? Padding(padding: const EdgeInsets.all(16), child: Text('Không tìm thấy địa điểm. Thử gõ tên tỉnh, ví dụ "Thanh Hoa".', style: sans(size: 14, color: PTokens.muted)))
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1, color: PTokens.line),
                  itemBuilder: (_, i) {
                    final p = items[i];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      minVerticalPadding: 12,
                      title: Text(p.city, style: sans(size: 15, weight: FontWeight.w600)),
                      subtitle: Text([p.station, ...p.altStations].join(' · '), style: sans(size: 13, color: PTokens.muted)),
                      onTap: () {
                        PassengerScope.read(context).setPlace(isOrigin: widget.isOrigin, code: p.code);
                        Navigator.of(context).pop();
                      },
                    );
                  },
                ),
        ),
      ]),
    );
  }
}
