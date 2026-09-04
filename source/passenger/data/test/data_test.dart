import 'package:flutter_test/flutter_test.dart';
import 'package:domain/domain.dart';
import 'package:data/data.dart';

void main() {
  group('Data Repositories Tests', () {
    late KnowledgeRepository knowledgeRepo;
    late ChannelRepository channelRepo;
    late ChatRepository chatRepo;

    setUp(() {
      knowledgeRepo = KnowledgeRepositoryImpl();
      channelRepo = ChannelRepositoryImpl();
      chatRepo = ChatRepositoryImpl();
    });

    test('KnowledgeRepository get and update persona config', () async {
      final persona = await knowledgeRepo.getPersonaConfig();
      expect(persona.agentName, isNotEmpty);

      const newPersona = PersonaConfig(
        agentName: 'Lê Thị B',
        jobTitle: 'Quản lý Tour',
        toneOfVoice: 'Thân thiện',
      );
      await knowledgeRepo.savePersonaConfig(newPersona);

      final updated = await knowledgeRepo.getPersonaConfig();
      expect(updated.agentName, 'Lê Thị B');
    });

    test('KnowledgeRepository CRUD operations on tours', () async {
      final initialTours = await knowledgeRepo.getTours();
      expect(initialTours.length, greaterThanOrEqualTo(3));

      const newTour = TourOffer(
        id: 'tour_test',
        title: 'Tour Sapa 3N2Đ',
        price: '4,200,000 VNĐ',
        startDate: '2026-10-01',
        expiryDate: '2026-11-01',
        isActive: true,
        content: 'Chinh phục đỉnh Fansipan',
      );

      await knowledgeRepo.saveTour(newTour);
      final toursAfterAdd = await knowledgeRepo.getTours();
      expect(toursAfterAdd.length, initialTours.length + 1);

      await knowledgeRepo.deleteTour('tour_test');
      final toursAfterDelete = await knowledgeRepo.getTours();
      expect(toursAfterDelete.length, initialTours.length);
    });

    test('ChannelRepository get and update channel authorization', () async {
      final channels = await channelRepo.getChannels();
      expect(channels, isNotEmpty);

      final firstChannel = channels.first;
      await channelRepo.updateChannelAuthorization(firstChannel.id, false);

      final updatedChannels = await channelRepo.getChannels();
      final updatedFirst = updatedChannels.firstWhere((c) => c.id == firstChannel.id);
      expect(updatedFirst.isAuthorized, isFalse);
    });

    test('ChatRepository get conversations, messages and toggle takeover', () async {
      final conversations = await chatRepo.getConversations();
      expect(conversations, isNotEmpty);

      final firstChat = conversations.first;
      final messages = await chatRepo.getMessages(firstChat.id);
      expect(messages, isNotEmpty);

      await chatRepo.toggleHumanTakeover(firstChat.id, true);
      final updatedConvs = await chatRepo.getConversations();
      final updatedChat = updatedConvs.firstWhere((c) => c.id == firstChat.id);
      expect(updatedChat.isHumanTakeoverActive, isTrue);

      await chatRepo.sendMessage(firstChat.id, 'Xin chào từ nhân viên', 'human');
      final updatedMessages = await chatRepo.getMessages(firstChat.id);
      expect(updatedMessages.last.text, 'Xin chào từ nhân viên');
      expect(updatedMessages.last.sender, 'human');
    });
  });
}
