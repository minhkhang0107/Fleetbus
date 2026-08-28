import 'package:shared/shared.dart';
import '../di/di.dart' as di;
class DomainConfig extends Config {

  DomainConfig._();

  factory DomainConfig.getInstance() {
    return _instance;
  }

  static final DomainConfig _instance = DomainConfig._();

  @override
  Future<void> config() async => di.configureInjection();
}