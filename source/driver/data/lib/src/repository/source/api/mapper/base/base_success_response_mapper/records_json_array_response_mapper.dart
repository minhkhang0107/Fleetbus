import 'package:data/src/repository/source/api/mapper/base/base_success_response_mapper.dart';
import 'package:data/src/repository/source/api/model/base/records_response.dart';
import 'package:shared/shared.dart';

class RecordsJsonArrayResponseMapper<T extends Object>
    extends BaseSuccessResponseMapper<T, RecordsListResponse<T>> {
  @override
  // ignore: avoid-dynamic
  RecordsListResponse<T>? mapToDataModel({
    required dynamic response,
    Decoder<T>? decoder,
  }) {
    return decoder != null && response is Map<String, dynamic>
        ? RecordsListResponse.fromJson(response, (json) => decoder(json))
        : null;
  }
}
