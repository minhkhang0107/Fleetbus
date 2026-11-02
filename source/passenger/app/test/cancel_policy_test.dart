import 'dart:convert';

import 'package:app/src/presentation/passenger/passenger_store.dart';
import 'package:data/src/service/passenger_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// D184: the cancel sheet shows the company's own policy and previews the refund with the same tiers the server uses.
void main() {
  const rules = [
    'Hủy từ 24 giờ trở lên trước giờ chạy: Hoàn tiền 100%',
    'Hủy trước giờ chạy 2-24 giờ: Hoàn tiền 50% (Phí hủy 50%)',
    'Hủy dưới 2 giờ trước giờ chạy: Không hoàn tiền',
  ];

  PassengerStore storeWith(Object? policy) {
    SharedPreferences.setMockInitialValues({});
    final client = MockClient((req) async {
      final data = req.url.path.endsWith('/service-config') ? {'pickup_modes': ['FIXED_STOP'], 'service_areas': [], 'cancellation_policy': policy} : {};
      return http.Response(jsonEncode({'status': 'success', 'data': data}), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    });
    return PassengerStore(api: PassengerApiClientService(baseUrl: 'http://test', client: client));
  }

  Ticket ticketLeaving(Duration inTime) => Ticket.fromJson({
        'ticket_id': 't1',
        'pnr': 'BG-1',
        'trip_id': 'trp_1',
        'departure_time': DateTime.now().add(inTime).toUtc().toIso8601String(),
        'fare_vnd': 200000,
        'seat_code': 'A01',
        'status': 'ACTIVE',
        'payment_method': 'VIETQR',
      });

  test('the company policy from the server drives the rules and the refund preview', () async {
    final store = storeWith({
      'tiers': [
        {'min_hours_before': 24, 'refund_percent': 100},
        {'min_hours_before': 2, 'refund_percent': 50},
        {'min_hours_before': 0, 'refund_percent': 0},
      ],
      'delay_waiver_minutes': 60,
      'rules': rules,
    });
    await store.loadCancelPolicy();
    expect(store.cancelPolicy.rules, rules);
    expect(store.refundFor(ticketLeaving(const Duration(hours: 3))), (percent: 50, tier: 'Hủy trước giờ chạy 2-24 giờ: Hoàn tiền 50% (Phí hủy 50%)'));
    expect(store.refundFor(ticketLeaving(const Duration(hours: 30))).percent, 100);
    expect(store.refundFor(ticketLeaving(const Duration(hours: 1))).percent, 0);
  });

  test('no policy from the server (older server, offline): the default PAX-021 tiers', () async {
    final store = storeWith(null);
    await store.loadCancelPolicy();
    expect(store.cancelPolicy, same(CancelPolicy.fallback));
    expect(store.refundFor(ticketLeaving(const Duration(hours: 8))), (percent: 80, tier: 'Hủy trước giờ chạy 6-12 giờ: Hoàn tiền 80% (Phí hủy 20%)'));
  });
}
