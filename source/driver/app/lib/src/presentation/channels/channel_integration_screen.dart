import 'package:flutter/material.dart';
import 'package:domain/domain.dart';
import 'package:data/data.dart';
import 'package:resources/resources.dart';

class ChannelIntegrationScreen extends StatefulWidget {
  final ChannelRepository? repository;

  const ChannelIntegrationScreen({super.key, this.repository});

  @override
  State<ChannelIntegrationScreen> createState() =>
      _ChannelIntegrationScreenState();
}

class _ChannelIntegrationScreenState extends State<ChannelIntegrationScreen> {
  late final ChannelRepository _repository;
  bool _isLoading = true;
  List<ChannelConnection> _channels = [];

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? ChannelRepositoryImpl();
    _loadChannels();
  }

  Future<void> _loadChannels() async {
    setState(() => _isLoading = true);
    final list = await _repository.getChannels();
    setState(() {
      _channels = List.from(list);
      _isLoading = false;
    });
  }

  Future<void> _disconnectChannel(ChannelConnection channel) async {
    await _repository.updateChannelAuthorization(channel.id, false);
    await _loadChannels();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Đã ngắt kết nối kênh: ${channel.name}'),
          backgroundColor: AppColors.alertCrimson,
        ),
      );
    }
  }

  void _showAuthorizationModal(ChannelConnection channel) {
    if (channel.id == 'telegram_bot') {
      _showTelegramAuthModal(channel);
    } else if (channel.id == 'zalo_oa') {
      _showZaloAuthModal(channel);
    } else {
      _showGenericOAuthModal(channel);
    }
  }

  void _showTelegramAuthModal(ChannelConnection channel) {
    final tokenCtrl = TextEditingController(text: '7192830192:AAHgXyZ-90123841029481920');

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.send_rounded, color: Colors.lightBlue),
              SizedBox(width: 8),
              Text('Ủy Quyền Telegram Bot Token'),
            ],
          ),
          content: SizedBox(
            width: 460,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAlignment.start,
              children: [
                const Text(
                  'Nhập HTTP API Bot Token được cấp từ @BotFather trên Telegram để kết nối Webhook tự động:',
                  style: TextStyle(fontSize: 13, color: AppColors.charcoalInk),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: tokenCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Telegram Bot Token',
                    hintText: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.canvasWhite,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.whisperBorder),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: AppColors.sapphireAccent),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Hệ thống sẽ gọi Telegram setWebhook API để tự động lắng nghe tin nhắn từ khách hàng.',
                          style: TextStyle(fontSize: 11, color: AppColors.mutedSteel),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy', style: TextStyle(color: AppColors.mutedSteel)),
            ),
            ElevatedButton.icon(
              onPressed: () async {
                final token = tokenCtrl.text.trim();
                if (token.isEmpty) return;

                await _repository.updateChannelAuthorization(channel.id, true);
                await _loadChannels();

                if (ctx.mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Đã liên kết thành công Telegram Bot Token! Webhook active.'),
                      backgroundColor: AppColors.safeEmerald,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.sapphireAccent,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.check_circle_rounded, size: 18),
              label: const Text('Xác Nhận & Kết Nối'),
            ),
          ],
        );
      },
    );
  }

  void _showZaloAuthModal(ChannelConnection channel) {
    final appIdCtrl = TextEditingController(text: '38291049182049120');
    final appSecretCtrl = TextEditingController(text: 'secret_zalo_oa_live_key');

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.chat_bubble_rounded, color: Colors.blue),
              SizedBox(width: 8),
              Text('Ủy Quyền Zalo Official Account (PKCE)'),
            ],
          ),
          content: SizedBox(
            width: 460,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAlignment.start,
              children: [
                const Text(
                  'Nhập App ID và Secret Key của Zalo Official Account App để khởi chạy luồng OAuth 2.0 PKCE:',
                  style: TextStyle(fontSize: 13, color: AppColors.charcoalInk),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: appIdCtrl,
                  decoration: const InputDecoration(labelText: 'Zalo App ID'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: appSecretCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Zalo Secret Key'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy', style: TextStyle(color: AppColors.mutedSteel)),
            ),
            ElevatedButton.icon(
              onPressed: () async {
                await _repository.updateChannelAuthorization(channel.id, true);
                await _loadChannels();

                if (ctx.mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Đã ủy quyền thành công Zalo OA! Access Token active 25h.'),
                      backgroundColor: AppColors.safeEmerald,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.sapphireAccent,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.verified_user_rounded, size: 18),
              label: const Text('Ủy Quyền OAuth 2.0'),
            ),
          ],
        );
      },
    );
  }

  void _showGenericOAuthModal(ChannelConnection channel) {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: Row(
            children: [
              Icon(_getChannelIcon(channel.platform), color: AppColors.sapphireAccent),
              const SizedBox(width: 8),
              Text('Ủy Quyền Meta Graph API (${channel.name})'),
            ],
          ),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Text(
                  'Hệ thống sẽ khởi chạy Meta Business OAuth Popup để lấy Page Access Token vĩnh viễn cho kênh ${channel.name}.',
                  style: const TextStyle(fontSize: 13, color: AppColors.charcoalInk),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy', style: TextStyle(color: AppColors.mutedSteel)),
            ),
            ElevatedButton.icon(
              onPressed: () async {
                await _repository.updateChannelAuthorization(channel.id, true);
                await _loadChannels();

                if (ctx.mounted) {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Đã ủy quyền thành công kênh: ${channel.name}'),
                      backgroundColor: AppColors.safeEmerald,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.sapphireAccent,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.verified_user_rounded, size: 18),
              label: const Text('Ủy Quyền Meta OAuth'),
            ),
          ],
        );
      },
    );
  }

  IconData _getChannelIcon(String platform) {
    switch (platform.toLowerCase()) {
      case 'zalo oa':
      case 'zalo':
        return Icons.chat_bubble_rounded;
      case 'messenger':
      case 'facebook':
        return Icons.facebook_rounded;
      case 'telegram':
        return Icons.send_rounded;
      case 'instagram':
        return Icons.camera_alt_rounded;
      default:
        return Icons.hub_rounded;
    }
  }

  Color _getPlatformColor(String platform) {
    switch (platform.toLowerCase()) {
      case 'zalo oa':
      case 'zalo':
        return Colors.blue[700]!;
      case 'messenger':
      case 'facebook':
        return Colors.indigo[600]!;
      case 'telegram':
        return Colors.lightBlue[600]!;
      case 'instagram':
        return Colors.pink[600]!;
      default:
        return AppColors.sapphireAccent;
    }
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

    return Scaffold(
      backgroundColor: AppColors.canvasWhite,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAlignment.start,
          children: [
            const Text(
              'Social Channel Integration Settings',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppColors.charcoalInk,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Cấu hình kết nối API cho các kênh tư vấn mạng xã hội để AI phản hồi tự động.',
              style: TextStyle(fontSize: 13, color: AppColors.mutedSteel),
            ),
            const SizedBox(height: 24),

            // Channel List
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _channels.length,
              itemBuilder: (context, index) {
                final channel = _channels[index];
                final isAuthorized = channel.isAuthorized;
                final color = _getPlatformColor(channel.platform);

                return Card(
                  elevation: 0,
                  margin: const EdgeInsets.only(bottom: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: AppColors.whisperBorder),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            _getChannelIcon(channel.platform),
                            color: color,
                            size: 26,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    channel.name,
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.charcoalInk,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  if (isAuthorized)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppColors.safeEmerald
                                            .withValues(alpha: 0.1),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(Icons.check_circle_rounded,
                                              size: 12,
                                              color: AppColors.safeEmerald),
                                          SizedBox(width: 4),
                                          Text(
                                            'Connected',
                                            style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.safeEmerald,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                channel.channelAccount,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontFamily: 'JetBrains Mono',
                                  color: AppColors.mutedSteel,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                channel.expiresText,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isAuthorized
                                      ? AppColors.mutedSteel
                                      : AppColors.alertCrimson,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        if (isAuthorized) ...[
                          OutlinedButton.icon(
                            onPressed: () => _disconnectChannel(channel),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.alertCrimson,
                              side: const BorderSide(
                                  color: AppColors.alertCrimson),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            icon: const Icon(Icons.power_settings_new_rounded,
                                size: 18),
                            label: const Text('Disconnect'),
                          ),
                        ] else ...[
                          ElevatedButton.icon(
                            onPressed: () => _showAuthorizationModal(channel),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.sapphireAccent,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 20, vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            icon: const Icon(Icons.key_rounded, size: 18),
                            label: const Text('Authorize'),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
