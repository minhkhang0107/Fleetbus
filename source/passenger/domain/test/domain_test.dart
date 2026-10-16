import 'package:flutter_test/flutter_test.dart';
import 'package:domain/domain.dart';

void main() {
  group('Domain Entities Tests', () {
    test('PersonaConfig model initialization & copyWith', () {
      const persona = PersonaConfig(
        agentName: 'Nguyễn Văn A',
        jobTitle: 'Chuyên viên tư vấn',
        toneOfVoice: 'Lịch sự',
      );

      expect(persona.agentName, 'Nguyễn Văn A');
      expect(persona.jobTitle, 'Chuyên viên tư vấn');
      expect(persona.toneOfVoice, 'Lịch sự');

      final updated = persona.copyWith(agentName: 'Trần Văn B');
      expect(updated.agentName, 'Trần Văn B');
      expect(updated.jobTitle, 'Chuyên viên tư vấn');
    });

    test('TourOffer model initialization & copyWith', () {
      const tour = TourOffer(
        id: 'tour_1',
        title: 'Tour Đà Nẵng 3N2Đ',
        price: '5,990,000 VNĐ',
        startDate: '2026-09-01',
        expiryDate: '2026-09-30',
        isActive: true,
        content: 'Lịch trình trọn gói',
      );

      expect(tour.id, 'tour_1');
      expect(tour.isActive, isTrue);

      final expiredTour = tour.copyWith(isActive: false);
      expect(expiredTour.isActive, isFalse);
    });

    test('ChannelConnection model initialization & copyWith', () {
      const channel = ChannelConnection(
        id: 'zalo_oa',
        name: 'Zalo Official Account',
        channelAccount: 'Zalo OA #1234',
        platform: 'Zalo OA',
        isAuthorized: true,
        expiresText: 'Làm mới tự động',
      );

      expect(channel.id, 'zalo_oa');
      expect(channel.isAuthorized, isTrue);

      final unauth = channel.copyWith(isAuthorized: false);
      expect(unauth.isAuthorized, isFalse);
    });

    test('ChatConversation and ChatMessage models initialization', () {
      const conversation = ChatConversation(
        id: 'chat_1',
        customerName: 'Nguyễn Văn Minh',
        platform: 'Zalo OA',
        time: '10:42 AM',
        preview: 'Xin chào',
        unread: 2,
        isHumanTakeoverActive: false,
      );

      const message = ChatMessage(
        id: 'msg_1',
        sender: 'ai',
        text: 'Chào anh Minh',
        time: '10:42 AM',
        confidence: 0.95,
      );

      expect(conversation.customerName, 'Nguyễn Văn Minh');
      expect(conversation.isHumanTakeoverActive, isFalse);
      expect(message.confidence, 0.95);
      expect(message.sender, 'ai');
    });
  });
}
