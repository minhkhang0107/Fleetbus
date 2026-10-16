import 'package:data/src/repository/source/api/model/api_image_url_data.dart';
import 'package:data/src/repository/source/base/base_data_mapper.dart';
import 'package:domain/domain.dart';
import 'package:injectable/injectable.dart';

@Injectable()
class ApiImageUrlDataMapper extends BaseDataMapper<ApiImageUrlData, ImageUrl> {
  @override
  ImageUrl mapToEntity(ApiImageUrlData? data) {
    return ImageUrl(
      origin: data?.origin ?? ImageUrl.defaultOrigin,
      sm: data?.sm ?? ImageUrl.defaultSm,
      md: data?.md ?? ImageUrl.defaultMd,
      lg: data?.lg ?? ImageUrl.defaultLg,
    );
  }
}
