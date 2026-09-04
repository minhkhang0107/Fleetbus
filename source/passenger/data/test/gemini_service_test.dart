import 'package:flutter_test/flutter_test.dart';
import 'package:domain/domain.dart';
import 'package:data/src/service/gemini_service.dart';

void main() {
  group('GeminiService Tests', () {
    late GeminiService geminiService;

    setUp(() {
      geminiService = GeminiService();
    });

    test('generateResponse returns smart simulated response when offline / demo mode', () async {
      const persona = PersonaConfig(
        agentName: 'Nguyễn Văn A',
        jobTitle: 'Chuyên viên tư vấn Tour',
        toneOfVoice: 'Lịch sự',
      );

      final chunks = [
        const KnowledgeChunk(
          id: 'kc_1',
          title: 'Tour Đà Nẵng 3N2Đ',
          price: '5,990,000 VNĐ',
          score: 0.94,
          snippet: 'Khách sạn 4 sao + Vé máy bay',
        )
      ];

      final result = await geminiService.generateResponse(
        prompt: 'Tư vấn tour Đà Nẵng cho anh với',
        persona: persona,
        knowledgeChunks: chunks,
        model: 'gemini-2.0-flash',
      );

      expect(result['text'], contains('Đà Nẵng'));
      expect(result['confidence'], greaterThanOrEqualTo(0.85));
      expect(result['model'], contains('gemini-2.0-flash'));
    });

    test('generateResponse handles gemini-1.5-flash and gemini-3.6-flash models', () async {
      const persona = PersonaConfig(
        agentName: 'Trần Văn B',
        jobTitle: 'Quản lý tư vấn',
        toneOfVoice: 'Nhiệt tình',
      );

      final result15 = await geminiService.generateResponse(
        prompt: 'Phú Quốc combo có gì hot?',
        persona: persona,
        knowledgeChunks: [],
        model: 'gemini-1.5-flash',
      );
      expect(result15['model'], contains('gemini-1.5-flash'));

      final result36 = await geminiService.generateResponse(
        prompt: 'Chào em',
        persona: persona,
        knowledgeChunks: [],
        model: 'gemini-3.6-flash',
      );
      expect(result36['model'], contains('gemini-3.6-flash'));
    });
  });
}
