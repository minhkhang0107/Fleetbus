import 'package:domain/domain.dart';
import 'gemini_proxy_service.dart';

class GeminiService {
  final GeminiProxyService _proxyService;

  GeminiService({
    GeminiProxyService? proxyService,
  }) : _proxyService = proxyService ?? GeminiProxyService();

  Future<Map<String, dynamic>> generateResponse({
    required String prompt,
    required PersonaConfig persona,
    required List<KnowledgeChunk> knowledgeChunks,
    String model = 'gemini-2.0-flash',
  }) async {
    // Route all AI requests securely through GeminiProxyService (0% API Key exposure on Client)
    return await _proxyService.executeProxyRequest(
      prompt: prompt,
      persona: persona,
      knowledgeChunks: knowledgeChunks,
      model: model,
    );
  }
}
