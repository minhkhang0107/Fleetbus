import 'package:data/src/di/di.config.dart';
import 'package:get_it/get_it.dart';
import 'package:injectable/injectable.dart';

final GetIt getIt = GetIt.instance;

@injectableInit
void configureInjection() => getIt.init();
