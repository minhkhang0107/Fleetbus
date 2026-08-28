import 'package:data/src/repository/source/api/mapper/api_image_url_data_mapper.dart';
import 'package:data/src/repository/source/api/model/api_user_data.dart';
import 'package:data/src/repository/source/base/base_data_mapper.dart';
import 'package:data/src/repository/source/shared/mapper/gender_data_mapper.dart';
import 'package:domain/domain.dart';
import 'package:injectable/injectable.dart';
import 'package:shared/shared.dart';

@Injectable()
class ApiUserDataMapper extends BaseDataMapper<ApiUserData, User> {
  ApiUserDataMapper(
    this._genderDataMapper,
    this._apiImageUrlDataMapper,
  );

  final GenderDataMapper _genderDataMapper;
  final ApiImageUrlDataMapper _apiImageUrlDataMapper;

  @override
  User mapToEntity(ApiUserData? data) {
    return User(
      id: data?.id ?? User.defaultId,
      email: data?.email ?? User.defaultEmail,
      money: BigDecimal.tryParse(data?.money) ?? User.defaultMoney,
      birthday: DateTimeUtils.tryParse(
            date: data?.birthday,
            format: DateTimeFormatConstants.appServerResponse,
          ) ??
          User.defaultBirthday,
      avatar: _apiImageUrlDataMapper.mapToEntity(data?.avatar),
      photos: _apiImageUrlDataMapper.mapToListEntity(data?.photos),
      gender: _genderDataMapper.mapToEntity(data?.gender),
    );
  }
}
