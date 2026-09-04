import 'package:data/src/repository/source/api/client/base/dio_builder.dart';
import 'package:data/src/repository/source/api/client/base/rest_api_client.dart';
import 'package:dio/dio.dart';
import 'package:injectable/injectable.dart';

@LazySingleton()
class RawApiClient extends RestApiClient {
  RawApiClient()
      : super(
          dio: DioBuilder.createDio(
            options: BaseOptions(baseUrl: ''),
          ),
        );
}
