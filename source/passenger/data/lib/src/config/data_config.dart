import 'package:shared/shared.dart';
import '../di/di.dart' as di;

class DataConFig extends Config {
  DataConFig._();

  factory DataConFig.getInstance() {
    return _instance;
  }

  static final DataConFig _instance = DataConFig._();
  @override
  Future<void> config() async => di.configureInjection();
}