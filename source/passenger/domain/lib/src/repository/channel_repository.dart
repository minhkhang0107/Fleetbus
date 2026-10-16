import '../entity/channel_connection.dart';

abstract class ChannelRepository {
  Future<List<ChannelConnection>> getChannels();
  Future<void> updateChannelAuthorization(String id, bool isAuthorized);
}
