import 'package:url_launcher/url_launcher.dart';

class IntentUtils {
  static Future<bool> openBrowserURL({
    required String url,
    bool inApp = false,
  }) async {
    Uri uri = Uri.parse(url);
    return await canLaunchUrl(uri)
        ? await launchUrl(uri )
        : false;
  }
}
