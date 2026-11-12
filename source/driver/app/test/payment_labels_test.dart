import 'package:app/src/presentation/driver_store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the manifest names every payment method in words, never as the server code (CASH_POS)', () {
    String pay(Object? method) => Passenger.fromJson({'ticket_id': 't', 'seat_code': 'A01', 'payment_method': method}).pay;
    expect(pay('CASH_POS'), 'Tiền mặt tại quầy');
    expect(pay('CARD_POS'), 'Thẻ tại quầy');
    expect(pay('BANK_TRANSFER'), 'Chuyển khoản');
    expect(pay('VIETQR_NAPAS247'), 'VietQR');
    expect(pay('SOMETHING_NEW'), 'Đã thanh toán');
    expect(pay(null), '');
  });
}
