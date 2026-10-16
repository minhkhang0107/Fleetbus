import 'android_studio/gen_android_studio.dart';
import 'common/index.dart';
import 'vscode/gen_vs_code.dart';

void main() {
  final Map<FlavorsEnum, Map<String, String>> allDartDefinesByEnv = {};
  flavorsList.forEach((element) {
    allDartDefinesByEnv[element.flavorEnum] =
        readDartDefineFromEnv(element.envPath, element);
  });

  VsCodeEnvGenerator(
    allDartDefinesByEnv: allDartDefinesByEnv,
  ).call();

  AndroidStudioEnvGenerator(
    allDartDefinesByEnv: allDartDefinesByEnv,
  ).call();
}
