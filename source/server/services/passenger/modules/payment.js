/**
 * FleetBus Passenger Payment, Ticket Wallet & Dynamic HMAC QR Module
 * Implements PAX-013 (VietQR Payment), PAX-014/015 (Verification & Success), PAX-016 (My Tickets), PAX-017 (Dynamic QR Ticket).
 */

import {
  generateVietQRPayload,
  generateDynamicTicketQR,
  verifyDynamicTicketQR,
  generateGroupBoardingQR,
  verifyGroupBoardingQR,
  generateTicketPin,
  verifyTicketPin
} from '../core/cryptoEngine.js';
import { validateVietnamPhone, calculateRefundAmount } from '../core/formatters.js';
import { getTicketSecret } from '../../../config.js';

// PAX-025: a delay longer than this waives the cancellation fee
const DELAY_WAIVER_AFTER_MINUTES = 30;

export class PassengerPaymentService {
  constructor(options = {}) {
    this.secretKey = options.secretKey || getTicketSecret();
    this.orders = new Map(); // orderId -> Order
    this.tickets = new Map(); // ticketId -> Ticket
    this.pnrIndex = new Map(); // PNR -> orderId
    this.walletCredits = []; // change credited to a passenger wallet (REV-04)
  }

  /**
   * REV-04: Credit change owed to a passenger into the BusGo wallet.
   */
  creditWallet(phone, amountVnd, ref, reason = 'Tiền thừa COD') {
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid || !(amountVnd > 0)) {
      return { success: false, error: 'Không thể cộng tiền vào ví', code: 'INVALID_WALLET_CREDIT' };
    }
    const credit = { phone: phoneCheck.normalized, amount_vnd: amountVnd, ref, reason, credited_at: new Date().toISOString() };
    this.walletCredits.push(credit);
    return { success: true, data: credit };
  }

  /**
   * Who may act on a ticket: the OWNER (the payer) may show, delegate and cancel it; a HOLDER (the named
   * passenger or the delegate) may show it; anybody else has no access. null when the ticket does not exist.
   */
  getTicketAccess(ticketId, phone) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;
    const normalize = (value) => validateVietnamPhone(value).normalized || value;
    const caller = normalize(phone);
    if (!caller) return 'NONE';
    if (ticket.owner_phone && normalize(ticket.owner_phone) === caller) return 'OWNER';
    if (normalize(ticket.passenger_phone) === caller) return 'HOLDER';
    if (ticket.delegated_to?.phone && normalize(ticket.delegated_to.phone) === caller) return 'HOLDER';
    return 'NONE';
  }

  /**
   * The payer of an order (by order id or PNR). null when the order does not exist.
   */
  getOrderAccess(orderIdOrPnr, phone) {
    const order = this.orders.get(orderIdOrPnr) || this.orders.get(this.pnrIndex.get(orderIdOrPnr));
    if (!order) return null;
    const normalize = (value) => validateVietnamPhone(value).normalized || value;
    return order.payer?.phone && normalize(order.payer.phone) === normalize(phone) ? 'OWNER' : 'NONE';
  }

  getWalletBalance(phone) {
    const normalized = validateVietnamPhone(phone).normalized || phone;
    return this.walletCredits
      .filter(c => c.phone === normalized)
      .reduce((sum, c) => sum + c.amount_vnd, 0);
  }

  /**
   * PAX-013: Create Payment Order & VietQR Transfer Details
   */
  createPaymentOrder({ holdId, trip, seatCodes, payer, passengers, amountVnd, pickupStop, dropoffStop, pickupStopId = null, dropoffStopId = null, mockNow = Date.now() }) {
    const orderId = `ord_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    let pnr;
    do {
      pnr = `BG-${Math.floor(100000 + Math.random() * 900000)}`;
    } while (this.pnrIndex.has(pnr));

    const bankBin = '970415'; // VietinBank
    const accountNumber = '1088219999';
    const accountName = 'FLEETBUS VIET NAM JSC';
    const transferMemo = `BUSGO ${pnr.replace('-', '')}`;

    const vietQrPayload = generateVietQRPayload({
      bankBin,
      accountNumber,
      amount: amountVnd,
      memo: transferMemo
    });

    const order = {
      order_id: orderId,
      pnr,
      hold_id: holdId,
      trip_id: trip.trip_id,
      route_name: trip.route_name,
      departure_time: trip.departure_time,
      seat_codes: seatCodes,
      pickup_stop: pickupStop,
      dropoff_stop: dropoffStop,
      pickup_stop_id: pickupStopId,
      dropoff_stop_id: dropoffStopId,
      payer,
      passengers,
      amount_vnd: amountVnd,
      payment_method: 'VIETQR_NAPAS247',
      payment_status: 'PENDING_PAYMENT',
      payment_details: {
        bank_name: 'VietinBank',
        bank_bin: bankBin,
        account_number: accountNumber,
        account_name: accountName,
        transfer_memo: transferMemo,
        qr_payload: vietQrPayload,
        qr_image_url: `https://api.vietqr.io/image/${bankBin}-${accountNumber}-compact.png?amount=${amountVnd}&addInfo=${encodeURIComponent(transferMemo)}&accountName=${encodeURIComponent(accountName)}`
      },
      created_at: new Date(mockNow).toISOString(),
      expires_at: new Date(mockNow + 600000).toISOString(), // 10 min payment window
      ticket_ids: []
    };

    this.orders.set(orderId, order);
    this.pnrIndex.set(pnr, orderId);

    return {
      success: true,
      data: order
    };
  }

  /**
   * PAX-014 / PAX-015: Process Webhook payment settlement callback & generate E-Tickets
   */
  settlePayment(orderId, paymentRef = `tx_${Date.now()}`, mockNow = Date.now()) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, error: 'Không tìm thấy đơn hàng', code: 'ORDER_NOT_FOUND' };
    }

    if (order.payment_status === 'PAID') {
      return { success: true, message: 'Đơn hàng đã được thanh toán trước đó', data: order };
    }

    if (mockNow > new Date(order.expires_at).getTime()) {
      order.payment_status = 'EXPIRED';
      return { success: false, error: 'Đơn hàng đã hết thời gian giữ chỗ thanh toán', code: 'PAYMENT_EXPIRED' };
    }

    order.payment_status = 'PAID';
    order.paid_at = new Date(mockNow).toISOString();
    order.payment_ref = paymentRef;

    // Generate individual tickets for each passenger / seat
    const generatedTicketIds = [];
    for (let i = 0; i < order.seat_codes.length; i++) {
      const seatCode = order.seat_codes[i];
      const passenger = order.passengers[i] || order.payer;
      const ticketId = `tkt_${order.pnr.replace('-', '')}_${seatCode}`;
      const seatInfo = this.seatMapService?.getSeatInfo?.(order.trip_id, seatCode);

      const ticket = {
        ticket_id: ticketId,
        pnr: order.pnr,
        order_id: order.order_id,
        trip_id: order.trip_id,
        route_name: order.route_name,
        departure_time: order.departure_time,
        seat_code: seatCode,
        deck: seatInfo ? seatInfo.deck : (seatCode.startsWith('A0') || seatCode.startsWith('B0') ? 1 : 2),
        fare_vnd: Math.round(order.amount_vnd / order.seat_codes.length),
        owner_phone: order.payer?.phone || passenger.phone,
        passenger_name: passenger.full_name,
        passenger_phone: passenger.phone,
        pickup_stop: order.pickup_stop,
        dropoff_stop: order.dropoff_stop,
        pickup_stop_id: order.pickup_stop_id,
        dropoff_stop_id: order.dropoff_stop_id,
        status: 'ACTIVE', // ACTIVE | BOARDED | CANCELLED
        created_at: new Date(mockNow).toISOString(),
        boarded_at: null
      };

      this.tickets.set(ticketId, ticket);
      generatedTicketIds.push(ticketId);
    }

    order.ticket_ids = generatedTicketIds;
    const issuedTickets = generatedTicketIds.map(id => this.tickets.get(id));

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('TICKET_SETTLED', { order, tickets: issuedTickets });
    }

    return {
      success: true,
      data: {
        order,
        tickets: issuedTickets
      }
    };
  }

  /**
   * Handle VietQR Webhook Callback (PAX-014, OQ-008)
   * The order is matched on the PNR inside the transfer memo and the received amount must equal the order amount.
   */
  handleVietQrCallback({ transferMemo, amountVnd, bankRef, now = Date.now() }) {
    const pnrMatch = /BG-?(\d{6})/i.exec(String(transferMemo || ''));
    const orderId = pnrMatch ? this.pnrIndex.get(`BG-${pnrMatch[1]}`) : null;
    const matchedOrder = orderId ? this.orders.get(orderId) : null;

    if (!matchedOrder) {
      return { success: false, error: 'Không tìm thấy đơn hàng khớp với nội dung chuyển khoản', code: 'ORDER_NOT_MATCHED' };
    }

    const issuedTicketsOf = (order) => (order.ticket_ids || []).map(id => this.tickets.get(id)).filter(Boolean);

    if (matchedOrder.payment_status === 'PAID') {
      return { success: true, pnr: matchedOrder.pnr, order_id: matchedOrder.order_id, issued_tickets: issuedTicketsOf(matchedOrder) };
    }

    if (matchedOrder.payment_status === 'UNMATCHED_OVERDUE') {
      return { success: true, settled: false, status: 'UNMATCHED_OVERDUE', pnr: matchedOrder.pnr, order_id: matchedOrder.order_id };
    }

    if (Number(amountVnd) !== matchedOrder.amount_vnd) {
      matchedOrder.payment_anomalies = matchedOrder.payment_anomalies || [];
      matchedOrder.payment_anomalies.push({
        type: 'AMOUNT_MISMATCH',
        expected_vnd: matchedOrder.amount_vnd,
        received_vnd: Number(amountVnd),
        bank_ref: bankRef || null,
        at: new Date(now).toISOString()
      });
      if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
        this.eventBridge.emit('PAYMENT_ANOMALY', { order: matchedOrder, receivedVnd: Number(amountVnd), bankRef });
      }
      return {
        success: false,
        error: 'Số tiền chuyển khoản không khớp với đơn hàng',
        code: 'AMOUNT_MISMATCH',
        expected_vnd: matchedOrder.amount_vnd,
        received_vnd: Number(amountVnd)
      };
    }

    if (now > new Date(matchedOrder.expires_at).getTime()) {
      matchedOrder.payment_status = 'UNMATCHED_OVERDUE';
      matchedOrder.overdue_received_vnd = Number(amountVnd);
      matchedOrder.overdue_bank_ref = bankRef || null;
      if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
        this.eventBridge.emit('PAYMENT_OVERDUE', { order: matchedOrder, amountVnd: Number(amountVnd), bankRef });
      }
      return { success: true, settled: false, status: 'UNMATCHED_OVERDUE', pnr: matchedOrder.pnr, order_id: matchedOrder.order_id };
    }

    const settleResult = this.settlePayment(matchedOrder.order_id, bankRef, now);
    if (!settleResult.success) {
      return settleResult;
    }

    return {
      success: true,
      pnr: matchedOrder.pnr,
      order_id: matchedOrder.order_id,
      issued_tickets: settleResult.data.tickets || []
    };
  }

  /**
   * PAX-016: Get passenger ticket wallet with tab filters (UPCOMING, COMPLETED, CANCELLED).
   * The phone must be a complete, valid number and is matched exactly.
   */
  getTicketsByPhone(phone, filter = 'UPCOMING') {
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.message, code: 'INVALID_PHONE' };
    }
    const normalized = phoneCheck.normalized;
    const normalizeStored = (value) => validateVietnamPhone(value).normalized || value;
    const userTickets = [];

    for (const ticket of this.tickets.values()) {
      const owns = normalizeStored(ticket.passenger_phone) === normalized
        || (ticket.owner_phone && normalizeStored(ticket.owner_phone) === normalized);
      const delegated = ticket.delegated_to?.phone && normalizeStored(ticket.delegated_to.phone) === normalized;
      if (owns || delegated) {
        userTickets.push(ticket);
      }
    }

    // Tab filter (PAX-016, BR-MYTICKETS-001): "Sắp đi" keeps a ticket, boarded or not, until its trip is over;
    // "Lịch sử" holds finished trips and no-shows; "Đã hủy" holds cancelled tickets.
    const tab = filter === 'COMPLETED' ? 'HISTORY' : filter;
    if (!['UPCOMING', 'HISTORY', 'CANCELLED'].includes(tab)) {
      return { success: false, error: 'Tab vé không hợp lệ (UPCOMING, HISTORY hoặc CANCELLED)', code: 'INVALID_TAB' };
    }
    const isCancelled = (t) => t.status === 'CANCELLED';
    const isHistory = (t) => !isCancelled(t) && (t.status === 'NO_SHOW' || Boolean(t.trip_completed));
    const filtered = userTickets.filter(t => {
      if (tab === 'CANCELLED') return isCancelled(t);
      if (tab === 'HISTORY') return isHistory(t);
      return !isCancelled(t) && !isHistory(t);
    });

    return {
      success: true,
      total_count: filtered.length,
      data: filtered
    };
  }

  /**
   * PAX-017: Get dynamic rotating HMAC-SHA256 Boarding QR pass (30s window)
   */
  getDynamicBoardingPass(ticketId, mockNow = Date.now()) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return { success: false, error: 'Không tìm thấy vé', code: 'TICKET_NOT_FOUND' };
    }

    // PAX-017: a boarded or absent ticket still opens, with its status and no QR to show or share
    if (['BOARDED', 'NO_SHOW'].includes(ticket.status)) {
      return { success: true, data: { ticket, dynamic_qr: null } };
    }
    if (ticket.status !== 'ACTIVE') {
      return {
        success: false,
        error: `Vé không ở trạng thái khả dụng (${ticket.status})`,
        code: 'TICKET_NOT_ACTIVE',
        status: ticket.status
      };
    }

    const qrData = generateDynamicTicketQR(ticket, this.secretKey, mockNow);

    return {
      success: true,
      data: {
        ticket,
        dynamic_qr: qrData,
        anti_screenshot_watermark: {
          timestamp: new Date(mockNow).toISOString(),
          phone_masked: ticket.passenger_phone ? ticket.passenger_phone.slice(0, 3) + '****' + ticket.passenger_phone.slice(-3) : null,
          pnr: ticket.pnr
        }
      }
    };
  }

  /**
   * PAX-013 / PAX-014: Active resume polling & manual confirmation trigger (REV-02)
   */
  checkPaymentStatus(orderId, { manualTrigger = false, mockNow = Date.now() } = {}) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, error: 'Không tìm thấy đơn hàng', code: 'ORDER_NOT_FOUND' };
    }

    // Check expiry
    if (order.payment_status === 'PENDING_PAYMENT' && mockNow > new Date(order.expires_at).getTime()) {
      order.payment_status = 'EXPIRED';
      return { success: false, error: 'Đơn hàng đã hết hạn thanh toán', code: 'PAYMENT_EXPIRED', data: order };
    }

    // "Tôi đã chuyển tiền" only asks for an immediate bank reconciliation. An order is
    // never settled without money received, which arrives through the bank webhook.
    if (manualTrigger && order.payment_status === 'PENDING_PAYMENT') {
      order.manual_check_requests = (order.manual_check_requests || 0) + 1;
      return {
        success: true,
        payment_status: order.payment_status,
        is_settled: false,
        reconciliation_mode: 'MANUAL_RECONCILE_REQUESTED',
        message: 'Chúng tôi chưa nhận được tiền. Vui lòng chờ trong giây lát, hệ thống sẽ tự cập nhật khi ngân hàng báo có.',
        data: order,
        tickets: []
      };
    }

    return {
      success: true,
      payment_status: order.payment_status,
      is_settled: order.payment_status === 'PAID',
      reconciliation_mode: 'ACTIVE_POLL',
      data: order,
      tickets: order.ticket_ids ? order.ticket_ids.map(id => this.tickets.get(id)).filter(Boolean) : []
    };
  }

  /**
   * PAX-015: A booking (order) with its tickets, by order id or PNR.
   */
  getBooking(orderIdOrPnr) {
    const order = this.orders.get(orderIdOrPnr) || this.orders.get(this.pnrIndex.get(orderIdOrPnr));
    if (!order) {
      return { success: false, error: 'Không tìm thấy đơn đặt vé', code: 'BOOKING_NOT_FOUND' };
    }
    return {
      success: true,
      data: {
        order_id: order.order_id,
        pnr: order.pnr,
        trip_id: order.trip_id,
        route_name: order.route_name,
        departure_time: order.departure_time,
        seat_codes: order.seat_codes,
        amount_vnd: order.amount_vnd,
        payment_status: order.payment_status,
        expires_at: order.expires_at,
        tickets: (order.ticket_ids || []).map(id => this.tickets.get(id)).filter(Boolean)
      }
    };
  }

  /**
   * PAX-017 / REV-01: Aggregate Group Boarding Pass for multi-ticket orders
   */
  getGroupBoardingPass(orderIdOrPnr, mockNow = Date.now()) {
    let order = this.orders.get(orderIdOrPnr);
    if (!order && this.pnrIndex.has(orderIdOrPnr)) {
      order = this.orders.get(this.pnrIndex.get(orderIdOrPnr));
    }
    if (!order) {
      return { success: false, error: 'Không tìm thấy đơn hàng tương ứng', code: 'ORDER_NOT_FOUND' };
    }

    const orderTickets = (order.ticket_ids || []).map(id => this.tickets.get(id)).filter(Boolean);
    const activeTickets = orderTickets.filter(t => t.status === 'ACTIVE');

    if (activeTickets.length === 0) {
      return { success: false, error: 'Không còn vé khả dụng để xuất vé đoàn', code: 'NO_ACTIVE_TICKETS' };
    }

    const groupQr = generateGroupBoardingQR(activeTickets, this.secretKey, mockNow);

    return {
      success: true,
      data: {
        pnr: order.pnr,
        order_id: order.order_id,
        total_tickets: orderTickets.length,
        active_tickets_count: activeTickets.length,
        group_qr: groupQr,
        tickets: orderTickets
      }
    };
  }

  /**
   * PAX-017 / REV-01: Delegate / Share Ticket to companion with offline 6-digit PIN
   */
  delegateTicket(ticketId, { delegateToPhone, delegateToName, mockNow = Date.now() }) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return { success: false, error: 'Không tìm thấy vé', code: 'TICKET_NOT_FOUND' };
    }

    if (ticket.status !== 'ACTIVE') {
      return { success: false, error: `Không thể chia sẻ vé đang ở trạng thái ${ticket.status}`, code: 'TICKET_NOT_ACTIVE' };
    }

    const pin = generateTicketPin(ticketId, this.secretKey);
    const shareLink = `https://busgo.vn/ticket/share?t=${ticketId}&pin=${pin}`;

    ticket.delegated_to = {
      phone: delegateToPhone,
      name: delegateToName,
      pin,
      delegated_at: new Date(mockNow).toISOString(),
      share_link: shareLink
    };

    return {
      success: true,
      message: `Đã tạo mã chia sẻ vé cho ${delegateToName} (${delegateToPhone})`,
      data: {
        ticket_id: ticketId,
        pnr: ticket.pnr,
        seat_code: ticket.seat_code,
        delegate_phone: delegateToPhone,
        offline_pin: pin,
        share_link: shareLink,
        sms_preview: `[BusGo] Bạn nhận được vé xe tuyến ${ticket.route_name}, Ghế ${ticket.seat_code}. Xuất trình mã PIN: ${pin} hoặc mở link: ${shareLink}`
      }
    };
  }

  /**
   * PAX-021: Cancel a ticket and open a refund request.
   * Price and departure come from the stored ticket, never from the client. Cancelling is a one-way step.
   */
  cancelTicket(ticketId, { now = Date.now(), reason = 'Khách hủy vé trực tuyến' } = {}) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return { success: false, error: 'Không tìm thấy vé', code: 'TICKET_NOT_FOUND' };
    }
    if (ticket.status !== 'ACTIVE') {
      return { success: false, error: `Không thể hủy vé đang ở trạng thái ${ticket.status}`, code: 'TICKET_NOT_ACTIVE' };
    }

    // PAX-025 (BR-DELAY-001): when the manager declared a delay over 30 minutes the cancellation fee is waived
    const delayMinutes = typeof this.getTripDelayMinutes === 'function' ? this.getTripDelayMinutes(ticket.trip_id) : 0;
    const refundCalc = delayMinutes > DELAY_WAIVER_AFTER_MINUTES
      ? {
        percentage: 100,
        feePercentage: 0,
        refundAmount: ticket.fare_vnd,
        feeAmount: 0,
        tier: 'DELAY_WAIVER',
        message: `Chuyến chậm ${delayMinutes} phút (trên ${DELAY_WAIVER_AFTER_MINUTES} phút): Hoàn tiền 100%, không thu phí hủy`
      }
      : calculateRefundAmount(ticket.fare_vnd, ticket.departure_time, now);
    const cancelledAt = new Date(now).toISOString();

    ticket.status = 'CANCELLED';
    ticket.cancelled_at = cancelledAt;

    const refundRequest = {
      ticket_id: ticket.ticket_id,
      pnr: ticket.pnr,
      trip_id: ticket.trip_id,
      amount_vnd: refundCalc.refundAmount,
      reason,
      policy: { tier: refundCalc.tier, percentage: refundCalc.percentage, fee_vnd: refundCalc.feeAmount }
    };
    const refund = this.eventBridge && typeof this.eventBridge.requestRefund === 'function'
      ? this.eventBridge.requestRefund(refundRequest)
      : { refund_id: `ref_${Date.now()}`, status: 'REFUND_REQUESTED', ...refundRequest };

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('TICKET_CANCELLED', {
        ticketId: ticket.ticket_id,
        pnr: ticket.pnr,
        tripId: ticket.trip_id,
        seatCode: ticket.seat_code,
        refundAmountVnd: refundCalc.refundAmount
      });
    }

    return {
      success: true,
      message: `Đã hủy vé. Yêu cầu hoàn tiền ${refundCalc.refundAmount.toLocaleString('vi-VN')} đ đang chờ xử lý`,
      data: {
        ticket_id: ticket.ticket_id,
        pnr: ticket.pnr,
        refund_id: refund.refund_id,
        total_price_vnd: ticket.fare_vnd,
        refund_percentage: refundCalc.percentage,
        refund_amount_vnd: refundCalc.refundAmount,
        fee_amount_vnd: refundCalc.feeAmount,
        tier: refundCalc.tier,
        policy_message: refundCalc.message,
        status: 'REFUND_REQUESTED',
        cancelled_at: cancelledAt
      }
    };
  }

  /**
   * Driver QR Scan / Group QR / Offline PIN validation endpoint (REV-01, REV-03)
   */
  validateAndBoardTicket(inputString, mockNow = Date.now()) {
    if (!inputString) return { success: false, error: 'Chuỗi quét hoặc mã PIN không được để trống' };

    // Case A: Group Boarding QR (BUSGO_GRP|...)
    if (inputString.startsWith('BUSGO_GRP|')) {
      const groupCheck = verifyGroupBoardingQR(inputString, this.secretKey, mockNow);
      if (!groupCheck.isValid) {
        return { success: false, error: `Mã QR nhóm không hợp lệ (${groupCheck.reason})`, code: groupCheck.reason };
      }

      const boardedTickets = [];
      for (const tktId of groupCheck.ticket_ids) {
        const ticket = this.tickets.get(tktId);
        if (ticket && ticket.status === 'ACTIVE') {
          ticket.status = 'BOARDED';
          ticket.boarded_at = new Date(mockNow).toISOString();
          boardedTickets.push(ticket);
        }
      }

      return {
        success: true,
        isGroup: true,
        message: `Soát vé đoàn thành công! Đã cho ${boardedTickets.length}/${groupCheck.ticket_count} khách lên xe`,
        data: {
          pnr: groupCheck.pnr,
          boarded_count: boardedTickets.length,
          tickets: boardedTickets
        }
      };
    }

    // Case B: 6-digit PIN (Format: PIN:ticketId:pin or just ticketId with pin lookup)
    if (inputString.startsWith('PIN:')) {
      const [, ticketId, pin] = inputString.split(':');
      const ticket = this.tickets.get(ticketId);
      if (!ticket) return { success: false, error: 'Không tìm thấy vé trong hệ thống', code: 'TICKET_NOT_FOUND' };

      const pinCheck = verifyTicketPin(ticketId, pin, this.secretKey);
      if (!pinCheck.isValid) return { success: false, error: 'Mã PIN vé không chính xác', code: 'INVALID_PIN' };

      if (ticket.status === 'BOARDED') {
        return { success: false, error: `Vé này đã lên xe lúc ${ticket.boarded_at}`, code: 'TICKET_ALREADY_USED' };
      }

      ticket.status = 'BOARDED';
      ticket.boarded_at = new Date(mockNow).toISOString();
      return {
        success: true,
        message: `Xác thực mã PIN thành công! Khách ${ticket.passenger_name} (Ghế ${ticket.seat_code}) lên xe`,
        data: ticket
      };
    }

    // Case C: Standard Dynamic TOTP QR (BUSGO|...)
    const qrCheck = verifyDynamicTicketQR(inputString, this.secretKey, mockNow);
    if (!qrCheck.isValid) {
      return { success: false, error: `Mã QR không hợp lệ: ${qrCheck.reason}`, code: qrCheck.reason };
    }

    const ticket = this.tickets.get(qrCheck.ticket_id);
    if (!ticket) {
      return { success: false, error: 'Vé không tồn tại trong hệ thống', code: 'TICKET_NOT_FOUND' };
    }

    if (ticket.status === 'BOARDED') {
      return {
        success: false,
        error: `Vé này đã được soát vé lên xe lúc ${ticket.boarded_at}`,
        code: 'TICKET_ALREADY_USED'
      };
    }

    ticket.status = 'BOARDED';
    ticket.boarded_at = new Date(mockNow).toISOString();

    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('PASSENGER_BOARDED', {
        tripId: ticket.trip_id,
        passenger: ticket,
        ticketId: ticket.ticket_id,
        pnr: ticket.pnr,
        now: mockNow
      });
    }

    return {
      success: true,
      message: 'Soát vé thành công! Mời hành khách lên xe',
      data: ticket
    };
  }
}
