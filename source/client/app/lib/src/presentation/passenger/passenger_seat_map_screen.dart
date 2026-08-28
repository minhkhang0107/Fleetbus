import 'package:flutter/material.dart';
import 'package:resources/resources.dart';
import 'passenger_checkout_screen.dart';

class PassengerSeatMapScreen extends StatefulWidget {
  const PassengerSeatMapScreen({super.key});

  @override
  State<PassengerSeatMapScreen> createState() => _PassengerSeatMapScreenState();
}

class _PassengerSeatMapScreenState extends State<PassengerSeatMapScreen> {
  int _selectedDeck = 1;
  final Set<String> _selectedSeats = {'A01'};

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasPassenger,
      appBar: AppBar(
        title: const Text('Chọn chỗ ngồi (Cabin VIP)'),
      ),
      body: Column(
        children: [
          // Deck Switcher
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: Colors.white,
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _selectedDeck === 1 ? AppColors.primarySapphire : Colors.grey.shade100,
                      foregroundColor: _selectedDeck === 1 ? Colors.white : AppColors.charcoalInk,
                      minimumSize: const Size(double.infinity, 44),
                    ),
                    onPressed: () => setState(() => _selectedDeck = 1),
                    child: const Text('TẦNG DƯỚI (Deck 1)', style: TextStyle(fontSize: 12)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _selectedDeck === 2 ? AppColors.primarySapphire : Colors.grey.shade100,
                      foregroundColor: _selectedDeck === 2 ? Colors.white : AppColors.charcoalInk,
                      minimumSize: const Size(double.infinity, 44),
                    ),
                    onPressed: () => setState(() => _selectedDeck = 2),
                    child: const Text('TẦNG TRÊN (Deck 2)', style: TextStyle(fontSize: 12)),
                  ),
                ),
              ],
            ),
          ),

          // Seat Grid (PAX-009)
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Center(
                    child: Text(
                      '🚌 ĐẦU XE / BÁC TÀI',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.mutedSteel),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                ..._buildDeckRows(_selectedDeck),
              ],
            ),
          ),

          // Bottom Bar
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: const Border(top: BorderSide(color: AppColors.whisperBorder)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 10,
                  offset: const Offset(0, -4),
                )
              ],
            ),
            child: SafeArea(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Ghế đã chọn: ${_selectedSeats.isEmpty ? "Chưa chọn" : _selectedSeats.join(", ")}',
                        style: const TextStyle(fontSize: 12, color: AppColors.mutedSteel),
                      ),
                      Text(
                        '${_selectedSeats.length * 220}.000 đ',
                        style: const TextStyle(
                          fontFamily: 'JetBrains Mono',
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primarySapphire,
                        ),
                      ),
                    ],
                  ),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(160, 50),
                    ),
                    onPressed: _selectedSeats.isEmpty
                        ? null
                        : () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => PassengerCheckoutScreen(
                                  selectedSeats: _selectedSeats.toList(),
                                ),
                              ),
                            );
                          },
                    child: Text('TIẾP TỤC (${_selectedSeats.length})'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildDeckRows(int deck) {
    final rows = deck === 1
        ? [
            {'a': 'A01', 'b': 'B01'},
            {'a': 'A02', 'b': 'B02'},
            {'a': 'A03', 'b': 'B03'},
            {'a': 'A04', 'b': 'B04'},
            {'a': 'A05', 'b': 'B05'},
          ]
        : [
            {'a': 'A07', 'b': 'B06'},
            {'a': 'A08', 'b': 'B07'},
            {'a': 'A09', 'b': 'B08'},
            {'a': 'A10', 'b': 'B09'},
            {'a': 'A11', 'b': 'B10'},
          ];

    return rows.map((r) {
      final codeA = r['a']!;
      final codeB = r['b']!;
      final isSelA = _selectedSeats.contains(codeA);
      final isSelB = _selectedSeats.contains(codeB);

      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          children: [
            Expanded(
              child: _buildSeatItem(codeA, isSelA, () => _toggleSeat(codeA)),
            ),
            const SizedBox(
              width: 50,
              child: Center(
                child: Text('LỐI ĐI', style: TextStyle(fontSize: 10, color: AppColors.mutedSteel, fontFamily: 'JetBrains Mono')),
              ),
            ),
            Expanded(
              child: _buildSeatItem(codeB, isSelB, () => _toggleSeat(codeB)),
            ),
          ],
        ),
      );
    }).toList();
  }

  Widget _buildSeatItem(String code, bool isSelected, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 60,
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primarySapphire : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppColors.primarySapphire : AppColors.whisperBorder,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              code,
              style: TextStyle(
                fontFamily: 'JetBrains Mono',
                fontWeight: FontWeight.bold,
                fontSize: 14,
                color: isSelected ? Colors.white : AppColors.charcoalInk,
              ),
            ),
            Text(
              '220k',
              style: TextStyle(
                fontFamily: 'JetBrains Mono',
                fontSize: 11,
                color: isSelected ? Colors.white70 : AppColors.mutedSteel,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _toggleSeat(String code) {
    setState(() {
      if (_selectedSeats.contains(code)) {
        _selectedSeats.remove(code);
      } else {
        if (_selectedSeats.length >= 5) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Bạn chỉ được chọn tối đa 5 ghế!')),
          );
          return;
        }
        _selectedSeats.add(code);
      }
    });
  }
}
