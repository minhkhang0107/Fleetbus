import 'flavor_model.dart';

const flavorKey = 'FLAVOR';
const launchJsonPath = './.vscode/launch.json';
const settingsJsonPath = './.vscode/settings.json';
const workspaceXmlPath = './.idea/workspace.xml';

const flavorsList = [
  Flavor(
      flavorEnum: FlavorsEnum.develop,
      name: 'develop',
      googleAPIKey: 'KhangDM',
      prefix: 'DEV',
      envPath: './env/develop.env'),
  Flavor(
      flavorEnum: FlavorsEnum.qa,
      name: 'qa',
      googleAPIKey: 'KhangDM',
      prefix: 'QA',
      envPath: './env/qa.env'),
  Flavor(
      flavorEnum: FlavorsEnum.staging,
      name: 'staging',
      googleAPIKey: 'KhangDM',
      prefix: 'STG',
      envPath: './env/staging.env'),
  Flavor(
      flavorEnum: FlavorsEnum.production,
      name: 'production',
      googleAPIKey: 'KhangDM',
      prefix: 'PROD',
      envPath: './env/production.env'),
];
