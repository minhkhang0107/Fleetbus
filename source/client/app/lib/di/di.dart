import 'package:get_it/get_it.dart';
import 'package:injectable/injectable.dart';
import 'package:app/di/di.config.dart';

GetIt getIt = GetIt.instance;

@injectableInit
void configureInjection() => getIt.init();