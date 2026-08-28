import 'package:data/src/repository/source/api/mapper/base/base_success_response_mapper.dart';
import 'package:shared/shared.dart';

class PlainResponseMapper<T extends Object> extends BaseSuccessResponseMapper<T, T> {
  @override
  T? mapToDataModel({
    required dynamic response,
    Decoder<T>? decoder,
  }) {
    assert(decoder == null);

    return response is T ? response : null;
  }
}
