import 'package:data/src/repository/source/api/mapper/base/base_error_response_mapper.dart';
import 'package:injectable/injectable.dart';
import 'package:shared/shared.dart';

@Injectable()
class GoongErrorResponseMapper extends BaseErrorResponseMapper<Map<String, dynamic>> {
  @override
  ServerError mapToServerError(Map<String, dynamic>? json) {
    return ServerError(
      generalMessage: json?['error']['message'] as String?,
    );
  }
}
