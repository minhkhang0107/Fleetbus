import 'package:data/src/repository/source/api/mapper/base/base_error_response_mapper.dart';
import 'package:injectable/injectable.dart';

import 'package:shared/shared.dart';

@Injectable()
// ignore: avoid-dynamic
class JsonArrayErrorResponseMapper extends BaseErrorResponseMapper<List<dynamic>> {
  @override
  // ignore: avoid-dynamic
  ServerError mapToServerError(List<dynamic>? data) {
    return ServerError(
      errors: data
              ?.map((jsonObject) => ServerErrorDetail(
                    serverStatusCode: jsonObject['code'] as int?,
                    message: jsonObject['message'] as String?,
                  ))
              .toList(growable: false) ??
          [],
    );
  }
}
