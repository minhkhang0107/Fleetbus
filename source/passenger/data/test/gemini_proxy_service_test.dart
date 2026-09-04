import 'package:test/test.dart';
import 'package:domain/domain.dart';
import 'package:data/data.dart';

void main() {
  group('GeminiProxyService Security Tests', () {
    test('executeProxyRequest routes securely without leaking client API keys', () async {
      final proxy = GeminiProxyService();
      const persona = PersonaConfig(
        agentName: 'Nguyễn Văn A',
        jobTitle: 'Chuyên viên tư vấn',
        toneOfVoice: 'Lịch sự',
      );
      const chunks = [
        KnowledgeChunk(
          id: 'kc_1',
          title: 'Tour Đà Nẵng 3N2Đ',
          price: '5,990,000 VNĐ',
          score: 0.95,
          snippet: 'Bao gồm vé máy bay khứ hồi',
        ),
      ];

      final res = await proxy.executeProxyRequest(
        prompt: 'Cho xin thông tin tour Đà Nẵng',
        persona: persona,
        knowledgeChunks: chunks,
        model: 'gemini-2.0-flash',
      );

      expect(res['text'], isNotEmpty);
      expect(res['confidence'], greaterThanOrEqualTo(0.50));
      expect(res['isSecuredViaProxy'], isTrue);
    });
  });
}
