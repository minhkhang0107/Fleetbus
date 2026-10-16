import 'package:data/src/repository/source/api/mapper/base/base_success_response_mapper.dart';
import 'package:data/src/repository/source/api/model/base/data_response.dart';
import 'package:shared/shared.dart';

class DataJsonObjectResponseMapper<T extends Object>
    extends BaseSuccessResponseMapper<T, DataResponse<T>> {
  @override
  // ignore: avoid-dynamic
  DataResponse<T>? mapToDataModel({
    required dynamic response,
    Decoder<T>? decoder,
  }) {
    return decoder != null && response is Map<String, dynamic>
        ? DataResponse.fromJson(response, (json) => decoder(json))
        : null;
  }
}
