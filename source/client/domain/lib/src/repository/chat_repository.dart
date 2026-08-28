import '../entity/chat_entities.dart';

abstract class ChatRepository {
  Future<List<ChatConversation>> getConversations();
  Future<List<ChatMessage>> getMessages(String chatId);
  Future<List<KnowledgeChunk>> getRetrievedKnowledge(String chatId);
  Future<void> toggleHumanTakeover(String chatId, bool isTakeover);
  Future<void> sendMessage(String chatId, String text, String sender, {String model});
}
