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
import { formatPNR } from '../core/formatters.js';

export class PassengerPaymentService {
  constructor(options = {}) {
    this.secretKey = options.secretKey || 'busgo_master_secret_key_2026';
    this.orders = new Map(); // orderId -> Order
    this.tickets = new Map(); // ticketId -> Ticket
    this.pnrIndex = new Map(); // PNR -> orderId
  }

  /**
   * PAX-013: Create Payment Order & VietQR Transfer Details
   */
  createPaymentOrder({ holdId, trip, seatCodes, payer, passengers, amountVnd, pickupStop, dropoffStop, mockNow = Date.now() }) {
    const orderId = `ord_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const rawPnr = `BG${Math.floor(100000 + Math.random() * 900000)}`;
    const pnr = formatPNR(rawPnr);

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

      const ticket = {
        ticket_id: ticketId,
        pnr: order.pnr,
        order_id: order.order_id,
        trip_id: order.trip_id,
        route_name: order.route_name,
        departure_time: order.departure_time,
        seat_code: seatCode,
        deck: seatCode.startsWith('A0') || seatCode.startsWith('B0') ? 1 : 2,
        passenger_name: passenger.full_name,
        passenger_phone: passenger.phone,
        pickup_stop: order.pickup_stop,
        dropoff_stop: order.dropoff_stop,
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
   * Handle VietQR Webhook Callback
   */
  handleVietQrCallback({ transferMemo, amountVnd, bankRef, now = Date.now() }) {
    let matchedOrder = null;

    // Match by memo or PNR in memo
    for (const order of this.orders.values()) {
      if (transferMemo && (transferMemo.includes(order.pnr.replace('-', '')) || transferMemo.includes(order.pnr))) {
        matchedOrder = order;
        break;
      }
    }

    if (!matchedOrder) {
      return { success: false, error: 'Không tìm thấy đơn hàng khớp với nội dung chuyển khoản', code: 'ORDER_NOT_MATCHED' };
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
   * PAX-016: Get passenger ticket wallet with tab filters (UPCOMING, COMPLETED, CANCELLED)
   */
  getTicketsByPhone(phone, filter = 'UPCOMING') {
    const normalized = phone.replace(/[\s\-\.]/g, '');
    const userTickets = [];

    for (const ticket of this.tickets.values()) {
      if (ticket.passenger_phone.includes(normalized) || ticket.pnr.includes(normalized)) {
        userTickets.push(ticket);
      }
    }

    // Tab filter
    let filtered = userTickets;
    if (filter === 'UPCOMING') {
      filtered = userTickets.filter(t => t.status === 'ACTIVE');
    } else if (filter === 'COMPLETED') {
      filtered = userTickets.filter(t => t.status === 'BOARDED');
    } else if (filter === 'CANCELLED') {
      filtered = userTickets.filter(t => t.status === 'CANCELLED');
    }

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
          phone_masked: ticket.passenger_phone.slice(0, 3) + '****' + ticket.passenger_phone.slice(-3),
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

    // If user explicitly pressed "Tôi đã chuyển tiền" (manualTrigger) and still pending,
    // trigger instantaneous bank reconciliation
    if (manualTrigger && order.payment_status === 'PENDING_PAYMENT') {
      const settleRes = this.settlePayment(orderId, `manual_tx_${mockNow}`, mockNow);
      if (settleRes.success) {
        return {
          success: true,
          payment_status: 'PAID',
          is_settled: true,
          reconciliation_mode: 'MANUAL_TRIGGER',
          data: settleRes.data.order,
          tickets: settleRes.data.tickets
        };
      }
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
