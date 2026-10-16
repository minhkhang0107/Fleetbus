import 'package:data/src/repository/source/api/model/api_token_data.dart';
import 'package:data/src/repository/source/base/base_data_mapper.dart';
import 'package:domain/domain.dart';
import 'package:injectable/injectable.dart';

@Injectable()
class ApiTokenDataMapper extends BaseDataMapper<ApiTokenData, Token> {
  @override
  Token mapToEntity(ApiTokenData? data) {
    return Token(
      accessToken: data?.accessToken ?? Token.defaultAccessToken,
      refreshToken: data?.refreshToken ?? Token.defaultRefreshToken,
    );
  }
}
