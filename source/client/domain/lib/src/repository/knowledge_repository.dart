import '../entity/persona_config.dart';
import '../entity/tour_offer.dart';

abstract class KnowledgeRepository {
  Future<PersonaConfig> getPersonaConfig();
  Future<void> savePersonaConfig(PersonaConfig config);
  Future<List<TourOffer>> getTours();
  Future<void> saveTour(TourOffer tour);
  Future<void> deleteTour(String id);
}
