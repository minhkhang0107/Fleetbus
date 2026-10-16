import 'package:domain/domain.dart';

class KnowledgeRepositoryImpl implements KnowledgeRepository {
  PersonaConfig _personaConfig = const PersonaConfig(
    agentName: 'Nguyễn Văn A',
    jobTitle: 'Chuyên viên tư vấn Tour Chuyên nghiệp (5 năm EXP)',
    toneOfVoice:
        'Lịch sự, nhiệt tình, tư vấn chi tiết lịch trình, xưng em gọi anh/chị',
  );

  final List<TourOffer> _tours = [
    const TourOffer(
      id: 'tour_1',
      title: 'Tour Đà Nẵng - Hội An - Bà Nà Hills 3N2Đ',
      price: '5,990,000 VNĐ',
      startDate: '2026-09-01',
      expiryDate: '2026-09-30',
      isActive: true,
      content:
          'Trọn gói vé máy bay khứ hồi + Khách sạn 4 sao biển Mỹ Khê + Vé cáp treo Bà Nà Hills + Ăn 5 bữa chính. Phù hợp cho gia đình và nhóm bạn.',
    ),
    const TourOffer(
      id: 'tour_2',
      title: 'Voucher Giảm 20% Tour Phú Quốc 4N3Đ Combo VinWonders',
      price: '7,200,000 VNĐ',
      startDate: '2026-08-15',
      expiryDate: '2026-10-15',
      isActive: true,
      content:
          'Bao gồm 3 đêm tại Vinholidays Fiesta Phú Quốc + Vé vui chơi không giới hạn VinWonders & Safari + Xe đón tiễn sân bay.',
    ),
    const TourOffer(
      id: 'tour_3',
      title: 'Tour Du Thuyền Hạ Long 5 Sao 2N1Đ Đêm Gala Dinner',
      price: '3,850,000 VNĐ',
      startDate: '2026-07-01',
      expiryDate: '2026-08-01',
      isActive: false,
      content:
          'Trải nghiệm du thuyền cao cấp 5 sao trên vịnh Hạ Long, chèo thuyền Kayak thăm hang Sang Sáng, tiệc Sunset Party trên Sundeck.',
    ),
  ];

  @override
  Future<PersonaConfig> getPersonaConfig() async {
    return _personaConfig;
  }

  @override
  Future<void> savePersonaConfig(PersonaConfig config) async {
    _personaConfig = config;
  }

  @override
  Future<List<TourOffer>> getTours() async {
    return List.unmodifiable(_tours);
  }

  @override
  Future<void> saveTour(TourOffer tour) async {
    final index = _tours.indexWhere((t) => t.id == tour.id);
    if (index >= 0) {
      _tours[index] = tour;
    } else {
      _tours.add(tour);
    }
  }

  @override
  Future<void> deleteTour(String id) async {
    _tours.removeWhere((t) => t.id == id);
  }
}
