import 'package:dio/dio.dart';
import 'package:injectable/injectable.dart';

import 'package:shared/shared.dart';
import '../../../../../data.dart';
import '../middleware/header_interceptor.dart';
import 'base/dio_builder.dart';
import 'base/rest_api_client.dart';

@LazySingleton()
class NoneAuthAppServerApiClient extends RestApiClient {
  NoneAuthAppServerApiClient(HeaderInterceptor _headerInterceptor)
      : super(
          dio: DioBuilder.createDio (
            options: BaseOptions(baseUrl: UrlConstants.appApiBaseUrl),
            interceptors: [
              _headerInterceptor,
            ],
          ),
        );
}
