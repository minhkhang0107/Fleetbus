import 'package:data/src/repository/source/base/base_data_mapper.dart';
import 'package:data/src/repository/source/preference/model/preference_user_data.dart';
import 'package:domain/domain.dart';
import 'package:injectable/injectable.dart';

@Injectable()
class PreferenceUserDataMapper extends BaseDataMapper<PreferenceUserData, User>
    with DataMapperMixin {
  @override
  User mapToEntity(PreferenceUserData? data) {
    return User(
      id: data?.id ?? User.defaultId,
      email: data?.email ?? User.defaultEmail,
    );
  }

  @override
  PreferenceUserData mapToData(User entity) {
    return PreferenceUserData(
      id: entity.id,
      email: entity.email,
    );
  }
}
