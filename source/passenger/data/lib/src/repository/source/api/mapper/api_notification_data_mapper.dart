import 'package:data/src/repository/source/api/model/api_notification_data.dart';
import 'package:data/src/repository/source/base/base_data_mapper.dart';
import 'package:domain/domain.dart';
import 'package:injectable/injectable.dart';

@Injectable()
class ApiNotificationDataMapper extends BaseDataMapper<ApiNotificationData, AppNotification> {
  @override
  AppNotification mapToEntity(ApiNotificationData? data) {
    return AppNotification(
      notificationId: data?.notificationId ?? AppNotification.defaultNotificationId,
      image: data?.image ?? AppNotification.defaultImage,
      title: data?.title ?? AppNotification.defaultTitle,
      message: data?.message ?? AppNotification.defaultMessage,
    );
  }
}
