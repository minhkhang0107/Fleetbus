import 'package:data/src/repository/source/api/mapper/base/base_error_response_mapper.dart';
import 'package:data/src/repository/source/api/mapper/base/base_success_response_mapper.dart';
import 'package:data/src/repository/source/api/middleware/connectivity_interceptor.dart';
import 'package:data/src/repository/source/api/middleware/custom_log_interceptor.dart';
import 'package:data/src/repository/source/api/middleware/retry_on_error_interceptor.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

class ApiClientDefaultSetting {
  const ApiClientDefaultSetting._();

  static const defaultErrorResponseMapperType = ErrorResponseMapperType.jsonObject;
  static const defaultSuccessResponseMapperType = SuccessResponseMapperType.dataJsonObject;

  // required interceptors
  static List<Interceptor> requiredInterceptors(Dio dio) => [
        if (kDebugMode) CustomLogInterceptor(),
        ConnectivityInterceptor(),
        RetryOnErrorInterceptor(dio),
      ];
}
