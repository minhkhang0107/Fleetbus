import 'package:data/src/repository/source/api/client/base/dio_builder.dart';
import 'package:data/src/repository/source/api/client/base/rest_api_client.dart';
import 'package:dio/dio.dart';
import 'package:injectable/injectable.dart';

import 'package:shared/shared.dart';

@LazySingleton()
class RandomUserApiClient extends RestApiClient {
  RandomUserApiClient()
      : super(
          dio: DioBuilder.createDio(
            options: BaseOptions(baseUrl: UrlConstants.randomUserBaseUrl),
          ),
        );
}
