import 'package:data/src/repository/source/api/client/base/dio_builder.dart';
import 'package:data/src/repository/source/api/client/base/rest_api_client.dart';
import 'package:data/src/repository/source/api/middleware/access_token_interceptor.dart';
import 'package:data/src/repository/source/api/middleware/header_interceptor.dart';
import 'package:dio/dio.dart';
import 'package:injectable/injectable.dart';

import 'package:shared/shared.dart';

@LazySingleton()
class RefreshTokenApiClient extends RestApiClient {
  RefreshTokenApiClient(
    HeaderInterceptor _headerInterceptor,
    AccessTokenInterceptor _accessTokenInterceptor,
  ) : super(
          dio: DioBuilder.createDio(
            options: BaseOptions(baseUrl: UrlConstants.appApiBaseUrl),
            interceptors: [
              _headerInterceptor,
              _accessTokenInterceptor,
            ],
          ),
        );
}
