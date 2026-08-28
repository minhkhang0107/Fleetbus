import 'package:data/src/repository/source/api/mapper/base/base_error_response_mapper.dart';
import 'package:graphql_flutter/graphql_flutter.dart';
import 'package:injectable/injectable.dart';

import 'package:shared/shared.dart';

@Injectable()
class ServerGraphQLErrorMapper extends BaseErrorResponseMapper<OperationException> {
  const ServerGraphQLErrorMapper();

  @override
  ServerError mapToServerError(OperationException? errorResponse) {
    return ServerError(
      generalMessage: errorResponse?.graphqlErrors.firstOrNull?.message,
      generalServerErrorId: errorResponse?.graphqlErrors.firstOrNull?.extensions?['code'] as String?,
      errors: errorResponse?.graphqlErrors
              .map((e) => ServerErrorDetail(
                    message: e.message,
                    serverErrorId: e.extensions?['code'] as String? ?? '',
                  ))
              .toList(growable: false) ??
          [],
    );
  }
}
