import 'package:init/init.dart';
import 'package:app/di/di.dart' as di;
class AppConfig extends ApplicationInit {

  factory AppConfig.getInstance() {
    return _instance;
  }

  AppConfig._();

  static final AppConfig _instance = AppConfig._();

  @override
  Future<void> config() async{
    di.configureInjection();
  }

}