import 'package:data/src/repository/source/api/model/api_user_data.dart';
import 'package:freezed_annotation/freezed_annotation.dart';


part 'api_user_response_data.freezed.dart';
part 'api_user_response_data.g.dart';

@freezed
class ApiUserResponseData with _$ApiUserResponseData {
  const factory ApiUserResponseData({
    @JsonKey(name: 'user') ApiUserData? userData,
  }) = _ApiUserResponseData;

  factory ApiUserResponseData.fromJson(Map<String, dynamic> json) =>
      _$ApiUserResponseDataFromJson(json);
}
