import 'package:data/src/repository/source/base/base_data_mapper.dart';
import 'package:data/src/repository/source/database/model/local_image_url_data.dart';
import 'package:domain/domain.dart';
import 'package:injectable/injectable.dart';

@Injectable()
class LocalImageUrlDataMapper extends BaseDataMapper<LocalImageUrlData, ImageUrl>
    with DataMapperMixin {
  @override
  ImageUrl mapToEntity(LocalImageUrlData? data) {
    return ImageUrl(
      origin: data?.origin ?? ImageUrl.defaultOrigin,
      sm: data?.sm ?? ImageUrl.defaultSm,
      md: data?.md ?? ImageUrl.defaultMd,
      lg: data?.lg ?? ImageUrl.defaultLg,
    );
  }

  @override
  LocalImageUrlData mapToData(ImageUrl entity) {
    return LocalImageUrlData(
      origin: entity.origin,
      lg: entity.lg,
      md: entity.md,
      sm: entity.sm,
    );
  }
}
