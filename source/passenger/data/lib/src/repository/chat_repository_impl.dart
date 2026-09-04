import 'package:domain/domain.dart';
import '../service/gemini_service.dart';
import 'knowledge_repository_impl.dart';
import 'channel_repository_impl.dart';

class ChatRepositoryImpl implements ChatRepository {
  final GeminiService _geminiService;
  final KnowledgeRepositoryImpl _knowledgeRepo;
  final ChannelRepositoryImpl _channelRepo;

  ChatRepositoryImpl({
    GeminiService? geminiService,
    KnowledgeRepositoryImpl? knowledgeRepo,
    ChannelRepositoryImpl? channelRepo,
  })  : _geminiService = geminiService ?? GeminiService(),
        _knowledgeRepo = knowledgeRepo ?? KnowledgeRepositoryImpl(),
        _channelRepo = channelRepo ?? ChannelRepositoryImpl();

  final List<ChatConversation> _allConversations = [
    const ChatConversation(
      id: 'chat_1',
      customerName: 'Nguyễn Văn Minh',
      platform: 'Zalo OA',
      time: '10:42 AM',
      preview: 'Anh muốn đăng ký tour Đà Nẵng 3N2Đ cho 2 người...',
      unread: 2,
      isHumanTakeoverActive: false,
    ),
    const ChatConversation(
      id: 'chat_2',
      customerName: 'Trần Thị Thu Hà',
      platform: 'Messenger',
      time: '09:15 AM',
      preview: 'Voucher giảm giá 20% còn hạn đến khi nào em?',
      unread: 0,
      isHumanTakeoverActive: true,
    ),
    const ChatConversation(
      id: 'chat_3',
      customerName: 'Lê Hoàng Nam',
      platform: 'Telegram',
      time: 'Hôm qua',
      preview: 'Cho mình xin thêm thông tin giá tour Phú Quốc...',
      unread: 0,
      isHumanTakeoverActive: false,
    ),
  ];

  final Map<String, List<ChatMessage>> _messagesMap = {
    'chat_1': [
      const ChatMessage(
        id: 'msg_101',
        sender: 'user',
        text: 'Chào em, tour Đà Nẵng 3N2Đ đợt này giá thế nào vậy?',
        time: '10:40 AM',
      ),
      const ChatMessage(
        id: 'msg_102',
        sender: 'ai',
        text:
            'Dạ em chào anh Minh! Tour Đà Nẵng - Hội An - Bà Nà Hills 3 ngày 2 đêm bên em đang có giá khuyến mãi chỉ 5.990.000 VNĐ/khách (áp dụng đến 30/09). Giá đã bao gồm vé máy bay và khách sạn 4 sao ạ!',
        time: '10:41 AM',
        confidence: 0.94,
      ),
      const ChatMessage(
        id: 'msg_103',
        sender: 'user',
        text: 'Cho anh xin thêm thông tin dịch vụ đi kèm nhé.',
        time: '10:42 AM',
      ),
    ],
    'chat_2': [
      const ChatMessage(
        id: 'msg_201',
        sender: 'user',
        text: 'Voucher giảm giá 20% còn hạn đến khi nào em?',
        time: '09:14 AM',
      ),
      const ChatMessage(
        id: 'msg_202',
        sender: 'ai',
        text:
            'Dạ chị Hà ơi, Voucher giảm 20% Phú Quốc có thời hạn đến 15/10/2026 ạ.',
        time: '09:15 AM',
        confidence: 0.68,
      ),
    ],
    'chat_3': [
      const ChatMessage(
        id: 'msg_301',
        sender: 'user',
        text: 'Cho mình xin thêm thông tin giá tour Phú Quốc...',
        time: 'Hôm qua',
      ),
    ],
  };

  final Map<String, List<KnowledgeChunk>> _knowledgeMap = {
    'chat_1': [
      const KnowledgeChunk(
        id: 'kc_1',
        title: 'Tour Đà Nẵng - Hội An 3N2Đ',
        price: '5,990,000 VNĐ',
        score: 0.94,
        snippet:
            'Bao gồm vé máy bay khứ hồi + Khách sạn 4 sao trung tâm + Vé Bà Nà Hills. Hạn đăng ký 30/09.',
      ),
      const KnowledgeChunk(
        id: 'kc_2',
        title: 'Chính sách trẻ em & phụ thu',
        price: 'Chi tiết',
        score: 0.88,
        snippet:
            'Trẻ em dưới 5 tuổi miễn phí (tối đa 1 bé/phòng). Trẻ từ 5-11 tuổi tính 75% giá tour người lớn.',
      ),
    ],
    'chat_2': [
      const KnowledgeChunk(
        id: 'kc_3',
        title: 'Voucher Giảm 20% Tour Phú Quốc 4N3Đ Combo VinWonders',
        price: '7,200,000 VNĐ',
        score: 0.68,
        snippet:
            'Bao gồm 3 đêm tại Vinholidays Fiesta Phú Quốc + Vé vui chơi không giới hạn VinWonders & Safari.',
      ),
    ],
    'chat_3': [
      const KnowledgeChunk(
        id: 'kc_3',
        title: 'Voucher Giảm 20% Tour Phú Quốc 4N3Đ Combo VinWonders',
        price: '7,200,000 VNĐ',
        score: 0.91,
        snippet:
            'Bao gồm 3 đêm tại Vinholidays Fiesta Phú Quốc + Vé vui chơi không giới hạn VinWonders & Safari.',
      ),
    ],
  };

  @override
  Future<List<ChatConversation>> getConversations() async {
    final channels = await _channelRepo.getChannels();
    final authorizedPlatforms = channels
        .where((c) => c.isAuthorized)
        .map((c) => c.platform.toLowerCase())
        .toSet();

    return _allConversations.where((conv) {
      final p = conv.platform.toLowerCase();
      if (p.contains('zalo') && authorizedPlatforms.contains('zalo oa')) return true;
      if (p.contains('messenger') && authorizedPlatforms.contains('messenger')) return true;
      if (p.contains('telegram') && authorizedPlatforms.contains('telegram')) return true;
      if (p.contains('instagram') && authorizedPlatforms.contains('instagram')) return true;
      return false;
    }).toList();
  }

  @override
  Future<List<ChatMessage>> getMessages(String chatId) async {
    return List.unmodifiable(_messagesMap[chatId] ?? []);
  }

  @override
  Future<List<KnowledgeChunk>> getRetrievedKnowledge(String chatId) async {
    return List.unmodifiable(_knowledgeMap[chatId] ?? []);
  }

  @override
  Future<void> toggleHumanTakeover(String chatId, bool isTakeover) async {
    final index = _allConversations.indexWhere((c) => c.id == chatId);
    if (index >= 0) {
      _allConversations[index] = _allConversations[index].copyWith(
        isHumanTakeoverActive: isTakeover,
      );
    }
  }

  @override
  Future<void> sendMessage(
    String chatId,
    String text,
    String sender, {
    String model = 'gemini-2.0-flash',
  }) async {
    final list = _messagesMap[chatId] ?? [];
    list.add(
      ChatMessage(
        id: 'msg_${DateTime.now().millisecondsSinceEpoch}',
        sender: sender,
        text: text,
        time: 'Just now',
      ),
    );
    _messagesMap[chatId] = list;

    // Update conversation preview
    final convIdx = _allConversations.indexWhere((c) => c.id == chatId);
    if (convIdx >= 0) {
      _allConversations[convIdx] = _allConversations[convIdx].copyWith(
        preview: text,
        time: 'Just now',
      );
    }

    // Auto AI response if user sent message and Human Takeover is OFF
    final conv = convIdx >= 0 ? _allConversations[convIdx] : null;
    if (sender == 'user' && (conv == null || !conv.isHumanTakeoverActive)) {
      final persona = await _knowledgeRepo.getPersonaConfig();
      final chunks = _knowledgeMap[chatId] ?? [];

      final aiResult = await _geminiService.generateResponse(
        prompt: text,
        persona: persona,
        knowledgeChunks: chunks,
        model: model,
      );

      list.add(
        ChatMessage(
          id: 'msg_${DateTime.now().millisecondsSinceEpoch + 1}',
          sender: 'ai',
          text: aiResult['text'] as String,
          time: 'Just now',
          confidence: aiResult['confidence'] as double?,
        ),
      );
      _messagesMap[chatId] = list;
    }
  }
}
