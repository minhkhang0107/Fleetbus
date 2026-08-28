import 'package:data/data.dart';
import 'package:shared/shared.dart';
import 'package:domain/domain.dart';
abstract class ApplicationInit extends Config {}

class AppInitializer {
  AppInitializer(this._applicationInit);

  final ApplicationInit _applicationInit;

  Future<void> init() async {
    await DataConFig.getInstance().init();
    await DomainConfig.getInstance().init();
    await SharedConfig.getInstance().init();
    _applicationInit.init();
  }
}