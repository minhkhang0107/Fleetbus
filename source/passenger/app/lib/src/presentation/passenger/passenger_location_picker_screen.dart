import 'package:flutter/material.dart';
import 'package:resources/resources.dart';

class PassengerLocationPickerScreen extends StatefulWidget {
  final String title;
  final String initialValue;

  const PassengerLocationPickerScreen({
    super.key,
    required this.title,
    this.initialValue = '',
  });

  @override
  State<PassengerLocationPickerScreen> createState() => _PassengerLocationPickerScreenState();
}

class _PassengerLocationPickerScreenState extends State<PassengerLocationPickerScreen> {
  final TextEditingController _searchController = TextEditingController();
  late List<Map<String, String>> _filteredLocations;

  final List<Map<String, String>> _allLocations = const [
    {
      'name': 'Hà Nội (Bến xe Giáp Bát)',
      'address': 'Km6 Giải Phóng, Giáp Bát, Hoàng Mai, Hà Nội',
      'city': 'Hà Nội',
    },
    {
      'name': 'Hà Nội (Bến xe Mỹ Đình)',
      'address': 'Số 20 Phạm Hùng, Mỹ Đình 2, Nam Từ Liêm, Hà Nội',
      'city': 'Hà Nội',
    },
    {
      'name': 'Hà Nội (Bến xe Nước Ngầm)',
      'address': 'Số 1 Ngọc Hồi, Hoàng Liệt, Hoàng Mai, Hà Nội',
      'city': 'Hà Nội',
    },
    {
      'name': 'Thanh Hóa (Bến xe Phía Bắc)',
      'address': 'Khu quy hoạch phía Bắc, TP. Thanh Hóa',
      'city': 'Thanh Hóa',
    },
    {
      'name': 'Thanh Hóa (Bến xe Sầm Sơn)',
      'address': 'Đường Lê Lợi, TP. Sầm Sơn, Thanh Hóa',
      'city': 'Thanh Hóa',
    },
    {
      'name': 'Ninh Bình (Bến xe Ninh Bình)',
      'address': 'Số 207 Lê Đại Hành, Thanh Bình, TP. Ninh Bình',
      'city': 'Ninh Bình',
    },
    {
      'name': 'Hải Phòng (Bến xe Vĩnh Niệm)',
      'address': 'Bùi Viện, Vĩnh Niệm, Lê Chân, Hải Phòng',
      'city': 'Hải Phòng',
    },
    {
      'name': 'Nam Định (Bến xe Nam Định)',
      'address': 'Đường Điện Biên, Lộc Hòa, TP. Nam Định',
      'city': 'Nam Định',
    },
  ];

  @override
  void initState() {
    super.initState();
    _filteredLocations = _allLocations;
    _searchController.addListener(_onSearchChanged);
  }

  void _onSearchChanged() {
    final q = _searchController.text.toLowerCase().trim();
    setState(() {
      if (q.isEmpty) {
        _filteredLocations = _allLocations;
      } else {
        _filteredLocations = _allLocations.where((loc) {
          final name = loc['name']!.toLowerCase();
          final addr = loc['address']!.toLowerCase();
          final city = loc['city']!.toLowerCase();
          return name.contains(q) || addr.contains(q) || city.contains(q);
        }).toList();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: Text(widget.title),
      ),
      body: Column(
        children: [
          // Search Input Bar
          Container(
            padding: const EdgeInsets.all(16),
            color: Colors.white,
            child: TextField(
              controller: _searchController,
              autofocus: true,
              decoration: InputDecoration(
                hintText: 'Tìm bến xe, tỉnh thành, địa điểm...',
                prefixIcon: const Icon(Icons.search_rounded, color: AppColors.primarySapphire),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded),
                        onPressed: () => _searchController.clear(),
                      )
                    : null,
                filled: true,
                fillColor: AppColors.canvasPassenger,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: AppColors.whisperBorder),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: AppColors.whisperBorder),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: AppColors.primarySapphire, width: 2),
                ),
              ),
            ),
          ),

          // Quick City Filters
          Container(
            height: 48,
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _buildQuickCityChip('Tất cả', ''),
                _buildQuickCityChip('Hà Nội', 'Hà Nội'),
                _buildQuickCityChip('Thanh Hóa', 'Thanh Hóa'),
                _buildQuickCityChip('Ninh Bình', 'Ninh Bình'),
                _buildQuickCityChip('Hải Phòng', 'Hải Phòng'),
                _buildQuickCityChip('Nam Định', 'Nam Định'),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.whisperBorder),

          // Location Items List
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: _filteredLocations.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final item = _filteredLocations[index];
                return InkWell(
                  onTap: () => Navigator.of(context).pop(item['name']),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.whisperBorder),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.primarySapphireSoft,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.location_on_rounded,
                            color: AppColors.primarySapphire,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item['name']!,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.charcoalInk,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                item['address']!,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.mutedSteel,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickCityChip(String label, String query) {
    final isSelected = _searchController.text == query;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ActionChip(
        label: Text(label),
        labelStyle: TextStyle(
          fontSize: 12,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          color: isSelected ? Colors.white : AppColors.charcoalInk,
        ),
        backgroundColor: isSelected ? AppColors.primarySapphire : AppColors.canvasPassenger,
        side: const BorderSide(color: AppColors.whisperBorder),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        onPressed: () {
          _searchController.text = query;
        },
      ),
    );
  }
}
