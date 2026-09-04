import 'package:domain/domain.dart';

class ChannelRepositoryImpl implements ChannelRepository {
  final List<ChannelConnection> _channels = [
    const ChannelConnection(
      id: 'zalo_oa',
      name: 'Zalo Official Account',
      channelAccount: 'Zalo OA #84930291',
      platform: 'Zalo OA',
      isAuthorized: true,
      expiresText: 'Access Token hết hạn sau 12h (Tự động làm mới)',
    ),
    const ChannelConnection(
      id: 'fb_messenger',
      name: 'Facebook Messenger',
      channelAccount: 'Page: Du Lịch Việt Nam Fans',
      platform: 'Messenger',
      isAuthorized: true,
      expiresText: 'Token vĩnh viễn (Page Token)',
    ),
    const ChannelConnection(
      id: 'telegram_bot',
      name: 'Telegram Bot',
      channelAccount: 'Chưa liên kết',
      platform: 'Telegram',
      isAuthorized: false,
      expiresText: 'Cần nhập Bot Token từ @BotFather',
    ),
    const ChannelConnection(
      id: 'instagram_direct',
      name: 'Instagram Direct',
      channelAccount: 'Chưa liên kết',
      platform: 'Instagram',
      isAuthorized: false,
      expiresText: 'Cần cấp quyền Meta Business Graph API',
    ),
  ];

  @override
  Future<List<ChannelConnection>> getChannels() async {
    return List.unmodifiable(_channels);
  }

  @override
  Future<void> updateChannelAuthorization(String id, bool isAuthorized) async {
    final index = _channels.indexWhere((c) => c.id == id);
    if (index >= 0) {
      final old = _channels[index];
      _channels[index] = old.copyWith(
        isAuthorized: isAuthorized,
        expiresText: isAuthorized
            ? 'Đã ủy quyền thành công'
            : 'Chưa liên kết tài khoản',
      );
    }
  }
}
