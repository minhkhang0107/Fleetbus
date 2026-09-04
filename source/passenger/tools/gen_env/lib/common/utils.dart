import 'dart:convert';
import 'dart:io';

import 'package:collection/collection.dart';

import 'constants.dart';
import 'flavor_model.dart';

Map<String, String> readDartDefineFromEnv(String path, Flavor flavor) {
  final file = File(path);
  if (!file.existsSync()) {
    file.createSync(recursive: true);
    file.writeAsStringSync('FLAVOR=${flavor.name}\n');
  }

  final lines = LineSplitter.split(file.readAsStringSync());
  final map = <String, String>{};
  final regex = RegExp(r'(\w+)=(.*)');
  lines.forEach((element) {
    final match = regex.firstMatch(element);

    if (match != null) {
      map[match[1]!] = match[2]!;
    }
  });

  if (!map.containsKey(flavorKey)) {
    file.writeAsStringSync('FLAVOR=${flavor.name}', mode: FileMode.append);
    map[flavorKey] = flavor.name;
  }

  return map;
}

String convertEnvToDartDefineString(Map<String, String>? envs) {
  final StringBuffer buffer = StringBuffer();
  envs?.forEach((key, value) {
    buffer.write('--dart-define $key=$value ');
  });
  final string = buffer.toString();
  return string.substring(0, string.length - 1);
}

Flavor? getFlavorFromString(String launcherName) {
  return flavorsList
      .firstWhereOrNull((element) => element.isEqualToString(launcherName));
}
