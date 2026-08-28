class ChatMessage {
  final String id;
  final String sender; // 'user', 'ai', 'human'
  final String text;
  final String time;
  final double? confidence;

  const ChatMessage({
    required this.id,
    required this.sender,
    required this.text,
    required this.time,
    this.confidence,
  });
}

class ChatConversation {
  final String id;
  final String customerName;
  final String platform;
  final String time;
  final String preview;
  final int unread;
  final bool isHumanTakeoverActive;

  const ChatConversation({
    required this.id,
    required this.customerName,
    required this.platform,
    required this.time,
    required this.preview,
    required this.unread,
    required this.isHumanTakeoverActive,
  });

  ChatConversation copyWith({
    String? id,
    String? customerName,
    String? platform,
    String? time,
    String? preview,
    int? unread,
    bool? isHumanTakeoverActive,
  }) {
    return ChatConversation(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      platform: platform ?? this.platform,
      time: time ?? this.time,
      preview: preview ?? this.preview,
      unread: unread ?? this.unread,
      isHumanTakeoverActive:
          isHumanTakeoverActive ?? this.isHumanTakeoverActive,
    );
  }
}

class KnowledgeChunk {
  final String id;
  final String title;
  final String price;
  final double score;
  final String snippet;

  const KnowledgeChunk({
    required this.id,
    required this.title,
    required this.price,
    required this.score,
    required this.snippet,
  });
}
