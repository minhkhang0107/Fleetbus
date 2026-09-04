import 'package:flutter/material.dart';
import 'package:domain/domain.dart';
import 'package:data/data.dart';
import 'package:resources/resources.dart';

class ChatDashboardScreen extends StatefulWidget {
  final ChatRepository? repository;

  const ChatDashboardScreen({super.key, this.repository});

  @override
  State<ChatDashboardScreen> createState() => _ChatDashboardScreenState();
}

class _ChatDashboardScreenState extends State<ChatDashboardScreen> {
  late final ChatRepository _repository;
  bool _isLoading = true;
  bool _isSending = false;

  List<ChatConversation> _conversations = [];
  int _selectedChatIndex = 0;
  List<ChatMessage> _currentMessages = [];
  List<KnowledgeChunk> _retrievedKnowledge = [];

  String _selectedModel = 'gemini-2.0-flash';
  final List<String> _geminiModels = [
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-3.6-flash',
  ];

  final TextEditingController _msgController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? ChatRepositoryImpl();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    setState(() => _isLoading = true);
    final convs = await _repository.getConversations();
    _conversations = List.from(convs);

    if (_conversations.isNotEmpty) {
      if (_selectedChatIndex >= _conversations.length) {
        _selectedChatIndex = 0;
      }
      final activeChat = _conversations[_selectedChatIndex];
      final msgs = await _repository.getMessages(activeChat.id);
      final chunks = await _repository.getRetrievedKnowledge(activeChat.id);

      _currentMessages = List.from(msgs);
      _retrievedKnowledge = List.from(chunks);
    } else {
      _currentMessages = [];
      _retrievedKnowledge = [];
    }

    setState(() => _isLoading = false);
  }

  Future<void> _selectChat(int index) async {
    setState(() => _selectedChatIndex = index);
    final activeChat = _conversations[index];
    final msgs = await _repository.getMessages(activeChat.id);
    final chunks = await _repository.getRetrievedKnowledge(activeChat.id);

    setState(() {
      _currentMessages = List.from(msgs);
      _retrievedKnowledge = List.from(chunks);
    });
  }

  Future<void> _toggleHumanTakeover(bool isTakeover) async {
    if (_conversations.isEmpty) return;
    final activeChat = _conversations[_selectedChatIndex];
    await _repository.toggleHumanTakeover(activeChat.id, isTakeover);

    setState(() {
      _conversations[_selectedChatIndex] = activeChat.copyWith(
        isHumanTakeoverActive: isTakeover,
      );
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isTakeover
                ? 'HUMAN TAKEOVER KÍCH HOẠT: AI đã tạm dừng trả lời cho ${activeChat.customerName}'
                : 'AI AUTO-REPLY KÍCH HOẠT: AI tiếp tục tư vấn cho ${activeChat.customerName}',
          ),
          backgroundColor: isTakeover ? AppColors.alertCrimson : AppColors.sapphireAccent,
        ),
      );
    }
  }

  Future<void> _sendMessage() async {
    if (_conversations.isEmpty) return;
    final text = _msgController.text.trim();
    if (text.isEmpty || _isSending) return;

    final activeChat = _conversations[_selectedChatIndex];
    final sender = activeChat.isHumanTakeoverActive ? 'human' : 'user';

    setState(() => _isSending = true);
    _msgController.clear();

    await _repository.sendMessage(
      activeChat.id,
      text,
      sender,
      model: _selectedModel,
    );

    final msgs = await _repository.getMessages(activeChat.id);
    setState(() {
      _currentMessages = List.from(msgs);
      _isSending = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: AppColors.canvasWhite,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.sapphireAccent),
        ),
      );
    }

    if (_conversations.isEmpty) {
      return Scaffold(
        backgroundColor: AppColors.canvasWhite,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.alertCrimson.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.comments_disabled_rounded, size: 36, color: AppColors.alertCrimson),
              ),
              const SizedBox(height: 16),
              const Text(
                'Chưa Có Kênh Mạng Xã Hội Nào Được Kết Nối',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.charcoalInk),
              ),
              const SizedBox(height: 8),
              const SizedBox(
                width: 420,
                child: Text(
                  'Tin nhắn chỉ hiển thị cho các kênh đã được ủy quyền (Connected). Vui lòng sang tab Channels để nhập Token hoặc ủy quyền Zalo OA, Messenger, Telegram.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: AppColors.mutedSteel),
                ),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: () {
                  // Trigger navigation refresh
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.sapphireAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                icon: const Icon(Icons.tune_rounded, size: 18),
                label: const Text('Sang Trang Cài Đặt Channels'),
              ),
            ],
          ),
        ),
      );
    }

    final activeChat = _conversations[_selectedChatIndex];

    return Scaffold(
      backgroundColor: AppColors.canvasWhite,
      body: Row(
        children: [
          // Column 1: Omnichannel Inbox (20%)
          Expanded(
            flex: 20,
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.pureSurface,
                border: Border(
                  right: BorderSide(color: AppColors.whisperBorder),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.all(16.0),
                    child: Text(
                      'Omnichannel Inbox (Connected Only)',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.whisperBorder),
                  Expanded(
                    child: ListView.separated(
                      itemCount: _conversations.length,
                      separatorBuilder: (_, __) =>
                          const Divider(height: 1, color: AppColors.whisperBorder),
                      itemBuilder: (context, index) {
                        final chat = _conversations[index];
                        final isSelected = index == _selectedChatIndex;
                        return ListTile(
                          selected: isSelected,
                          selectedTileColor:
                              AppColors.sapphireAccent.withValues(alpha: 0.08),
                          onTap: () => _selectChat(index),
                          leading: CircleAvatar(
                            backgroundColor:
                                AppColors.mutedSteel.withValues(alpha: 0.2),
                            child: Text(
                              chat.customerName[0],
                              style: const TextStyle(
                                color: AppColors.charcoalInk,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  chat.customerName,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.charcoalInk,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: chat.platform == 'Zalo OA'
                                      ? Colors.blue.withValues(alpha: 0.1)
                                      : Colors.purple.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  chat.platform,
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: chat.platform == 'Zalo OA'
                                        ? Colors.blue[700]
                                        : Colors.purple[700],
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          subtitle: Text(
                            chat.preview,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.mutedSteel,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Column 2: Active Chat Window (50%)
          Expanded(
            flex: 50,
            child: Container(
              color: AppColors.canvasWhite,
              child: Column(
                children: [
                  // Chat Header
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: const BoxDecoration(
                      color: AppColors.pureSurface,
                      border: Border(
                        bottom: BorderSide(color: AppColors.whisperBorder),
                      ),
                    ),
                    child: Row(
                      children: [
                        Text(
                          activeChat.customerName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppColors.charcoalInk,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.safeEmerald.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'Online',
                            style: TextStyle(
                              fontSize: 11,
                              color: AppColors.safeEmerald,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.sapphireAccent.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppColors.sapphireAccent.withValues(alpha: 0.3)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.auto_awesome, size: 14, color: AppColors.sapphireAccent),
                              const SizedBox(width: 6),
                              DropdownButtonHideUnderline(
                                child: DropdownButton<String>(
                                  value: _selectedModel,
                                  isDense: true,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.sapphireAccent,
                                    fontFamily: 'JetBrains Mono',
                                  ),
                                  onChanged: (val) {
                                    if (val != null) {
                                      setState(() => _selectedModel = val);
                                    }
                                  },
                                  items: _geminiModels.map((m) {
                                    return DropdownMenuItem(
                                      value: m,
                                      child: Text(m),
                                    );
                                  }).toList(),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Chat Thread
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _currentMessages.length + (_isSending ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == _currentMessages.length && _isSending) {
                          return const Padding(
                            padding: EdgeInsets.only(bottom: 16),
                            child: Align(
                              alignment: Alignment.centerRight,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppColors.sapphireAccent,
                                    ),
                                  ),
                                  SizedBox(width: 8),
                                  Text(
                                    'Gemini AI đang tạo câu trả lời...',
                                    style: TextStyle(fontSize: 12, color: AppColors.mutedSteel),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }

                        final msg = _currentMessages[index];
                        final isUser = msg.sender == 'user';
                        final isHuman = msg.sender == 'human';

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Column(
                            crossAxisAlignment: isUser
                                ? CrossAlignment.start
                                : CrossAlignment.end,
                            children: [
                              Row(
                                mainAxisAlignment: isUser
                                    ? MainAxisAlignment.start
                                    : MainAxisAlignment.end,
                                children: [
                                  if (!isUser && msg.confidence != null) ...[
                                    _ConfidenceBadge(
                                        confidence: msg.confidence!),
                                    const SizedBox(width: 8),
                                  ],
                                  Container(
                                    constraints:
                                        const BoxConstraints(maxWidth: 400),
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: isUser
                                          ? AppColors.pureSurface
                                          : isHuman
                                              ? AppColors.alertCrimson
                                              : AppColors.sapphireAccent,
                                      borderRadius: BorderRadius.circular(10),
                                      border: isUser
                                          ? Border.all(
                                              color: AppColors.whisperBorder)
                                          : null,
                                    ),
                                    child: Text(
                                      msg.text,
                                      style: TextStyle(
                                        color: isUser
                                            ? AppColors.charcoalInk
                                            : Colors.white,
                                        fontSize: 14,
                                        height: 1.4,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                isUser
                                    ? 'Khách hàng • ${msg.time}'
                                    : isHuman
                                        ? 'Nhân viên (Human Takeover) • ${msg.time}'
                                        : 'AI Bot ($_selectedModel) • ${msg.time}',
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: AppColors.mutedSteel,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),

                  // Input Bar
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: const BoxDecoration(
                      color: AppColors.pureSurface,
                      border: Border(
                        top: BorderSide(color: AppColors.whisperBorder),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _msgController,
                            onSubmitted: (_) => _sendMessage(),
                            decoration: InputDecoration(
                              hintText: activeChat.isHumanTakeoverActive
                                  ? 'Gõ câu trả lời trực tiếp (Human Takeover đang bật)...'
                                  : 'Gõ câu hỏi giả lập từ khách hàng (AI $_selectedModel sẽ tự trả lời)...',
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        ElevatedButton(
                          onPressed: _sendMessage,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: activeChat.isHumanTakeoverActive
                                ? AppColors.alertCrimson
                                : AppColors.sapphireAccent,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 20, vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: const Icon(Icons.send_rounded, size: 18),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Column 3: Control Panel & Takeover (30%)
          Expanded(
            flex: 30,
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.pureSurface,
                border: Border(
                  left: BorderSide(color: AppColors.whisperBorder),
                ),
              ),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Text(
                    'Agent Control Panel',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppColors.charcoalInk,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Human Takeover Card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: activeChat.isHumanTakeoverActive
                          ? AppColors.alertCrimson.withValues(alpha: 0.08)
                          : AppColors.sapphireAccent.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: activeChat.isHumanTakeoverActive
                            ? AppColors.alertCrimson
                            : AppColors.sapphireAccent,
                        width: 1.5,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              activeChat.isHumanTakeoverActive
                                  ? 'HUMAN TAKEOVER'
                                  : 'AI AUTO-REPLY',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: activeChat.isHumanTakeoverActive
                                    ? AppColors.alertCrimson
                                    : AppColors.sapphireAccent,
                              ),
                            ),
                            Switch(
                              value: activeChat.isHumanTakeoverActive,
                              activeColor: AppColors.alertCrimson,
                              onChanged: _toggleHumanTakeover,
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          activeChat.isHumanTakeoverActive
                              ? 'AI đã tạm dừng trả lời khách hàng này. Nhân viên đang kiểm soát hoàn toàn phiên chat.'
                              : 'AI đang tự động truy xuất tri thức và tư vấn cho khách hàng bằng mô hình $_selectedModel.',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.mutedSteel,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Customer Context Summary Card
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: AppColors.canvasWhite,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.whisperBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        const Text(
                          'Tóm Tắt Khách Hàng',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: AppColors.charcoalInk,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(Icons.person_outline, size: 14, color: AppColors.mutedSteel),
                            const SizedBox(width: 6),
                            Text('Họ tên: ${activeChat.customerName}', style: const TextStyle(fontSize: 12, color: AppColors.charcoalInk)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(Icons.hub_outlined, size: 14, color: AppColors.mutedSteel),
                            const SizedBox(width: 6),
                            Text('Kênh liên hệ: ${activeChat.platform}', style: const TextStyle(fontSize: 12, color: AppColors.charcoalInk)),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const Text(
                    'Retrieved Knowledge Context (RAG)',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: AppColors.charcoalInk,
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Retrieved Chunks List
                  if (_retrievedKnowledge.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        'Chưa có dữ liệu tri thức được truy xuất cho cuộc hội thoại này.',
                        style: TextStyle(fontSize: 12, color: AppColors.mutedSteel),
                      ),
                    )
                  else
                    ..._retrievedKnowledge.map(
                      (chunk) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _RetrievedChunkCard(chunk: chunk),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConfidenceBadge extends StatelessWidget {
  final double confidence;

  const _ConfidenceBadge({required this.confidence});

  @override
  Widget build(BuildContext context) {
    final isHigh = confidence >= 0.85;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isHigh
            ? AppColors.safeEmerald.withValues(alpha: 0.12)
            : AppColors.alertCrimson.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        'Score: ${confidence.toStringAsFixed(2)}',
        style: TextStyle(
          fontSize: 11,
          fontFamily: 'JetBrains Mono',
          fontWeight: FontWeight.w600,
          color: isHigh ? AppColors.safeEmerald : AppColors.alertCrimson,
        ),
      ),
    );
  }
}

class _RetrievedChunkCard extends StatelessWidget {
  final KnowledgeChunk chunk;

  const _RetrievedChunkCard({required this.chunk});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.canvasWhite,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.whisperBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  chunk.title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.charcoalInk,
                  ),
                ),
              ),
              Text(
                '${(chunk.score * 100).toInt()}% Match',
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono',
                  color: AppColors.sapphireAccent,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Giá: ${chunk.price}',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.mutedSteel,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            chunk.snippet,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.charcoalInk,
            ),
          ),
        ],
      ),
    );
  }
}
