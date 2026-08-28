import 'package:data/src/repository/source/database/model/local_image_url_data.dart';
import 'package:data/src/repository/source/database/model/local_user_data.dart';
import 'package:injectable/injectable.dart';
import 'package:objectbox/objectbox.dart';

import '../../../../data.dart';

@LazySingleton()
class AppDatabase {
  AppDatabase(this.store);

  final Store store;

  int putUser(LocalUserData user) {
    return store.box<LocalUserData>().put(user);
  }

  Stream<List<LocalUserData>> getUsersStream() {
    return store
        .box<LocalUserData>()
        .query()
        .watch(triggerImmediately: true)
        .map((query) => query.find());
  }

  List<LocalUserData> getUsers() {
    return store.box<LocalUserData>().getAll();
  }

  LocalUserData? getUser(int id) {
    return store.box<LocalUserData>().get(id);
  }

  bool deleteImageUrl(int id) {
    return store.box<LocalImageUrlData>().remove(id);
  }

  int deleteAllUsersAndImageUrls() {
    store.box<LocalImageUrlData>().removeAll();

    return store.box<LocalUserData>().removeAll();
  }
}
