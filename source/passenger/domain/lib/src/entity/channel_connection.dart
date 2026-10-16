class ChannelConnection {
  final String id;
  final String name;
  final String channelAccount;
  final String platform;
  final bool isAuthorized;
  final String expiresText;

  const ChannelConnection({
    required this.id,
    required this.name,
    required this.channelAccount,
    required this.platform,
    required this.isAuthorized,
    required this.expiresText,
  });

  ChannelConnection copyWith({
    String? id,
    String? name,
    String? channelAccount,
    String? platform,
    bool? isAuthorized,
    String? expiresText,
  }) {
    return ChannelConnection(
      id: id ?? this.id,
      name: name ?? this.name,
      channelAccount: channelAccount ?? this.channelAccount,
      platform: platform ?? this.platform,
      isAuthorized: isAuthorized ?? this.isAuthorized,
      expiresText: expiresText ?? this.expiresText,
    );
  }
}
