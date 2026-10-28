/**
 * FleetBus Passenger Payment, Ticket Wallet & Boarding Pass Module
 * Implements PAX-013 (VietQR Payment), PAX-014/015 (Verification & Success), PAX-016 (My Tickets), PAX-017 (Boarding QR).
 */

import { DEMO_DATE, vnDate } from '../../../core/serviceDate.js';
import {
  generateVietQRPayload,
  generateBoardingQR,
  generateGroupBoardingQR,
  generateTicketPin,
  createShareToken
} from '../core/cryptoEngine.js';
import { validateVietnamPhone, calculateRefundAmount } from '../core/formatters.js';
import { getTicketSecret, isProduction } from '../../../config.js';
import { findOperatorById, DEFAULT_OPERATOR_ID } from '../../../core/operators.js';

// PAX-025: a delay longer than this waives the cancellation fee
const DELAY_WAIVER_AFTER_MINUTES = 30;

function resolveStopTime(trip, pickupStopId, searchService) {
  if (searchService && trip?.trip_id && pickupStopId) {
    const times = searchService.stopTimes?.(trip.trip_id);
    const stop = times?.[pickupStopId];
    if (stop?.planned_time) {
      return {
        pickup_time: stop.planned_time,
        pickup_time_estimated: stop.time_source === 'ESTIMATED'
      };
    }
  }
  return {
    pickup_time: trip?.departure_time || null,
    pickup_time_estimated: false
  };
}

export class PassengerPaymentService {
  constructor(options = {}) {
    this.secretKey = options.secretKey || getTicketSecret();
    this.searchService = options.searchService || null;
    this.orders = new Map(); // orderId -> Order
    this.tickets = new Map(); // ticketId -> Ticket
    this.pnrIndex = new Map(); // PNR -> orderId
    this.bankTransactions = new Map(); // txKey -> BankTransaction
    this.gatewayCredentials = new Map(); // operatorId -> { provider, values, updated_at, updated_by, last_webhook_at, reconciliation }
    this.walletCredits = []; // change credited to a passenger wallet (REV-04)
  }

  /**
   * REV-04: Credit change owed to a passenger into the BusGo wallet.
   */
  creditWallet(phone, amountVnd, ref, reason = 'Tiền thừa COD', operatorId = DEFAULT_OPERATOR_ID) {
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid || !(amountVnd > 0)) {
      return { success: false, error: 'Không thể cộng tiền vào ví', code: 'INVALID_WALLET_CREDIT' };
    }
    const credit = { phone: phoneCheck.normalized, amount_vnd: amountVnd, ref, reason, operator_id: operatorId, credited_at: new Date().toISOString() };
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

  getWalletBalance(phone, operatorId = DEFAULT_OPERATOR_ID) {
    const normalized = validateVietnamPhone(phone).normalized || phone;
    return this.walletCredits
      .filter(c => c.phone === normalized && (c.operator_id || DEFAULT_OPERATOR_ID) === operatorId)
      .reduce((sum, c) => sum + c.amount_vnd, 0);
  }

  /**
   * PAX-013: Create Payment Order & VietQR Transfer Details
   */
  createPaymentOrder({ holdId, trip, seatCodes, payer, passengers, amountVnd, pickupStop, dropoffStop, pickupStopId = null, dropoffStopId = null, homePickup = null, homeDropoff = null, mockNow = Date.now(), voucherCode = null, discountVnd = 0, paymentMethod = 'VIETQR_NAPAS247' }) {
    const orderId = `ord_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const operatorId = trip.operator_id || DEFAULT_OPERATOR_ID;
    const operator = findOperatorById(operatorId);
    let pnr;
    do {
      pnr = `BG-${Math.floor(100000 + Math.random() * 900000)}`;
    } while (this.pnrIndex.has(pnr));

    const isCash = paymentMethod === 'CASH';
    let paymentDetails = null;
    if (!isCash) {
      const bankBin = operator.bank.bin;
      const accountNumber = operator.bank.account_number;
      const accountName = operator.bank.account_name;
      const transferMemo = `${operator.memo_prefix} ${pnr.replace('-', '')}`;

      const vietQrPayload = generateVietQRPayload({
        bankBin,
        accountNumber,
        amount: amountVnd,
        memo: transferMemo
      });

      paymentDetails = {
        bank_name: operator.bank.bank_name,
        bank_bin: bankBin,
        account_number: accountNumber,
        account_name: accountName,
        transfer_memo: transferMemo,
        qr_payload: vietQrPayload,
        qr_image_url: `https://api.vietqr.io/image/${bankBin}-${accountNumber}-compact.png?amount=${amountVnd}&addInfo=${encodeURIComponent(transferMemo)}&accountName=${encodeURIComponent(accountName)}`
      };
    }

    const timeInfo = resolveStopTime(trip, pickupStopId, this.searchService);
    const departureMs = trip?.departure_time ? Date.parse(trip.departure_time) : NaN;
    const expiresAt = isCash && Number.isFinite(departureMs)
      ? new Date(departureMs).toISOString()
      : new Date(mockNow + 600000).toISOString();

    const order = {
      order_id: orderId,
      pnr,
      hold_id: holdId,
      trip_id: trip.trip_id,
      operator_id: operatorId,
      route_name: trip.route_name,
      departure_time: trip.departure_time,
      pickup_time: timeInfo.pickup_time,
      pickup_time_estimated: timeInfo.pickup_time_estimated,
      seat_codes: seatCodes,
      pickup_stop: pickupStop,
      dropoff_stop: dropoffStop,
      pickup_stop_id: pickupStopId,
      dropoff_stop_id: dropoffStopId,
      home_pickup: homePickup,
      home_dropoff: homeDropoff,
      payer,
      passengers,
      amount_vnd: amountVnd,
      // The discount code the passenger used, for the office's booking list (H3).
      ...(voucherCode ? { voucher_code: voucherCode, discount_vnd: discountVnd } : {}),
      payment_method: isCash ? 'CASH' : 'VIETQR_NAPAS247',
      payment_status: 'PENDING_PAYMENT',
      payment_details: paymentDetails,
      created_at: new Date(mockNow).toISOString(),
      expires_at: expiresAt, // 10 min payment window; a cash order stays until departure
      ticket_ids: []
    };

    this.orders.set(orderId, order);
    this.pnrIndex.set(pnr, orderId);

    return {
      success: true,
      data: order
    };
  }

  _issuedTicketsOf(order) {
    return (order?.ticket_ids || []).map(id => this.tickets.get(id)).filter(Boolean);
  }

  _requestOrderRefund(order, { amount_vnd, reason, source, policy = null }) {
    const req = {
      pnr: order.pnr,
      trip_id: order.trip_id,
      amount_vnd,
      reason,
      source,
      policy,
      operator_id: order.operator_id || DEFAULT_OPERATOR_ID
    };
    if (this.eventBridge && typeof this.eventBridge.requestRefund === 'function') {
      return this.eventBridge.requestRefund(req);
    }
    return { refund_id: `ref_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`, status: 'REFUND_REQUESTED', ...req };
  }

  /** Marks an order EXPIRED and refunds any partial transfer received before expiry. */
  _expireOrder(order) {
    order.payment_status = 'EXPIRED';
    const refundAmount = order.paid_amount_vnd || 0;
    if (refundAmount > 0) {
      order.refunded_vnd = (order.refunded_vnd || 0) + refundAmount;
      order.paid_amount_vnd = 0;
      const refund = this._requestOrderRefund(order, {
        amount_vnd: refundAmount,
        reason: `Đơn ${order.pnr} hết hạn khi mới thanh toán ${refundAmount} đ (UNDERPAID_EXPIRED)`,
        source: 'UNDERPAID_EXPIRED'
      });
      order.underpaid_refund_id = refund.refund_id;
    }
  }

  /** Whether a late transfer on an expired order can still settle (trip on sale and seats still free). */
  _isLateOrderSellable(order, now = Date.now()) {
    if (order.closed_reason === 'TRIP_CANCELLED') return false;
    const services = this.eventBridge?.services;
    const opsTrip = services?.managerService?.findTrip?.(order.trip_id)
      || services?.managerService?.trips?.find(t => t.trip_id === order.trip_id);
    if (opsTrip && (opsTrip.status === 'CANCELLED' || opsTrip.status === 'COMPLETED' || opsTrip.sales_closed)) {
      return false;
    }
    const drvTrip = services?.driverService?.activeTrips?.get?.(order.trip_id);
    if (drvTrip && (drvTrip.status === 'CANCELLED' || drvTrip.status === 'COMPLETED')) {
      return false;
    }
    if (this.seatMapService && typeof this.seatMapService.checkSellable === 'function') {
      if (order.hold_id && this.seatMapService.seatHolds) {
        for (const [k, h] of this.seatMapService.seatHolds.entries()) {
          if (h.tripId === order.trip_id && h.holdId === order.hold_id) {
            this.seatMapService.seatHolds.delete(k);
          }
        }
      }
      const check = this.seatMapService.checkSellable(
        order.trip_id,
        order.seat_codes,
        now,
        null,
        { pickupStopId: order.pickup_stop_id, dropoffStopId: order.dropoff_stop_id }
      );
      if (!check.success) return false;
    }
    return true;
  }

  _resultFromStoredTx(record, { replay = false } = {}) {
    const order = record.order_id ? this.orders.get(record.order_id) : null;
    const settledOutcomes = ['SETTLED', 'OVERPAID_SETTLED', 'LATE_SETTLED'];
    return {
      success: true,
      outcome: record.outcome,
      ...(replay ? { replay: true } : {}),
      ...(record.order_id ? { order_id: record.order_id } : {}),
      ...(record.pnr ? { pnr: record.pnr } : {}),
      ...(settledOutcomes.includes(record.outcome) && order ? { issued_tickets: this._issuedTicketsOf(order) } : {}),
      ...(record.outcome === 'PARTIAL' && order && order.remaining_vnd !== undefined ? { remaining_vnd: order.remaining_vnd } : {}),
      ...(record.refund_id ? { refund_id: record.refund_id } : {})
    };
  }

  /**
   * PAX-014 / PAX-015: Process Webhook payment settlement callback & generate E-Tickets
   */
  settlePayment(orderId, paymentRef = `tx_${Date.now()}`, mockNow = Date.now(), { allowExpired = false } = {}) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, error: 'Không tìm thấy đơn hàng', code: 'ORDER_NOT_FOUND' };
    }

    if (order.payment_status === 'PAID' || order.payment_status === 'UNPAID_COD') {
      return { success: true, message: 'Đơn hàng đã được thanh toán trước đó', data: order };
    }

    const expiresAtMs = new Date(order.expires_at).getTime();
    const demoCashOrder = order.payment_method === 'CASH' && !isProduction() && Number.isFinite(expiresAtMs) && vnDate(expiresAtMs) === DEMO_DATE;
    if (!demoCashOrder && !allowExpired && mockNow > expiresAtMs) {
      this._expireOrder(order);
      return { success: false, error: 'Đơn hàng đã hết thời gian giữ chỗ thanh toán', code: 'PAYMENT_EXPIRED' };
    }

    const isCashCod = order.payment_method === 'CASH' && order.amount_vnd > 0;
    if (isCashCod) {
      order.payment_status = 'UNPAID_COD';
    } else {
      order.payment_status = 'PAID';
      order.paid_at = new Date(mockNow).toISOString();
    }
    order.payment_ref = paymentRef;
    const vehiclePlate = this._resolveVehiclePlate(order.trip_id) || null;

    // Generate individual tickets for each passenger / seat
    const generatedTicketIds = [];
    for (let i = 0; i < order.seat_codes.length; i++) {
      const seatCode = order.seat_codes[i];
      const passenger = order.passengers[i] || order.payer;
      const ticketId = `tkt_${order.pnr.replace('-', '')}_${seatCode}`;
      const seatInfo = this.seatMapService?.getSeatInfo?.(order.trip_id, seatCode);
      const fareVnd = Math.round(order.amount_vnd / order.seat_codes.length);

      const ticket = {
        ticket_id: ticketId,
        pnr: order.pnr,
        order_id: order.order_id,
        trip_id: order.trip_id,
        operator_id: order.operator_id || DEFAULT_OPERATOR_ID,
        route_name: order.route_name,
        departure_time: order.departure_time,
        pickup_time: order.pickup_time || order.departure_time,
        pickup_time_estimated: Boolean(order.pickup_time_estimated),
        seat_code: seatCode,
        deck: seatInfo?.deck || 1,
        fare_vnd: fareVnd,
        ...(isCashCod ? {
          payment_method: 'CASH',
          payment_status: 'UNPAID_COD',
          cod_amount_vnd: fareVnd,
          cod_collected: false
        } : {}),
        owner_phone: order.payer?.phone || passenger.phone,
        passenger_name: passenger.full_name,
        passenger_phone: passenger.phone,
        pickup_stop: order.pickup_stop,
        dropoff_stop: order.dropoff_stop,
        pickup_stop_id: order.pickup_stop_id,
        dropoff_stop_id: order.dropoff_stop_id,
        home_pickup: order.home_pickup || null,
        home_dropoff: order.home_dropoff || null,
        vehicle_plate: vehiclePlate,
        status: 'ACTIVE', // ACTIVE | BOARDED | CANCELLED
        created_at: new Date(mockNow).toISOString(),
        boarded_at: null,
        share_token: createShareToken()
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
   * Unified settlement engine for every incoming bank transfer (VietQR webhook, SePay, office manual confirm).
   */
  applyBankTransfer(tx = {}, now = Date.now()) {
    const operatorId = tx.operatorId || DEFAULT_OPERATOR_ID;
    const provider = tx.provider || 'VIETQR_HMAC';
    const providerTxId = tx.providerTxId ?? null;
    const bankRef = tx.bankRef ?? null;
    const amount = Number(tx.amountVnd);
    const memo = String(tx.memo ?? '');
    const accountNumber = tx.accountNumber ?? null;
    const occurredAt = tx.occurredAt ?? null;
    const direction = tx.direction || 'IN';
    const note = tx.note ?? null;

    // a. Outgoing bank notification is ignored and not stored as money in.
    if (direction === 'OUT') {
      return { success: true, outcome: 'IGNORED_OUT' };
    }

    // b. Deduplicate when providerTxId or bankRef is present.
    const dedupeId = providerTxId || bankRef || null;
    if (dedupeId) {
      const existingKey = `${operatorId}:${provider}:${dedupeId}`;
      const existing = this.bankTransactions.get(existingKey);
      if (existing) {
        return this._resultFromStoredTx(existing, { replay: true });
      }
    }

    const txKey = tx._txKey || (dedupeId
      ? `${operatorId}:${provider}:${dedupeId}`
      : `${operatorId}:${provider}:anon_${now}_${Math.floor(1000 + Math.random() * 9000)}`);

    const storeTx = (outcome, { order = null, refundId = null } = {}) => {
      const record = {
        tx_id: txKey,
        operator_id: operatorId,
        provider,
        provider_tx_id: providerTxId,
        bank_ref: bankRef,
        amount_vnd: amount,
        memo,
        account_number: accountNumber,
        occurred_at: occurredAt,
        received_at: tx._receivedAt || new Date(now).toISOString(),
        outcome,
        order_id: order ? order.order_id : null,
        pnr: order ? order.pnr : null,
        refund_id: refundId || null,
        note,
        ...(tx.staff ? { staff: tx.staff } : {})
      };
      this.bankTransactions.set(txKey, record);
      return record;
    };

    // c. Wrong account number (compare digits only).
    if (accountNumber !== null && accountNumber !== undefined && String(accountNumber).trim() !== '') {
      const operator = findOperatorById(operatorId);
      const expectedDigits = String(operator?.bank?.account_number || '').replace(/\D/g, '');
      const receivedDigits = String(accountNumber).replace(/\D/g, '');
      if (expectedDigits && receivedDigits !== expectedDigits) {
        storeTx('WRONG_ACCOUNT');
        return { success: true, outcome: 'WRONG_ACCOUNT' };
      }
    }

    // d. Match order directly by orderId or by scanning normalized memo for BG(\d{6}) candidates of this operator.
    let matchedOrder = null;
    if (tx.orderId) {
      const ord = this.orders.get(tx.orderId);
      if (ord && (ord.operator_id || DEFAULT_OPERATOR_ID) === operatorId) {
        matchedOrder = ord;
      }
    } else {
      const normMemo = memo.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const re = /BG(\d{6})/g;
      let m;
      while ((m = re.exec(normMemo)) !== null) {
        const pnr = `BG-${m[1]}`;
        const ordId = this.pnrIndex.get(pnr);
        const ord = ordId ? this.orders.get(ordId) : null;
        if (ord && (ord.operator_id || DEFAULT_OPERATOR_ID) === operatorId) {
          matchedOrder = ord;
          break;
        }
      }
    }

    if (!matchedOrder) {
      storeTx('UNMATCHED');
      if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
        this.eventBridge.emit('PAYMENT_UNMATCHED', {
          operatorId,
          amountVnd: amount,
          memo,
          bankRef: bankRef || providerTxId || txKey
        });
      }
      return { success: true, outcome: 'UNMATCHED' };
    }

    // e. Order already PAID: if payment_ref differs from this tx, open a full refund (DUPLICATE_TRANSFER).
    if (matchedOrder.payment_status === 'PAID') {
      const refMatches = matchedOrder.payment_ref && (
        matchedOrder.payment_ref === bankRef
        || matchedOrder.payment_ref === providerTxId
        || matchedOrder.payment_ref === txKey
      );
      if (refMatches) {
        storeTx('SETTLED', { order: matchedOrder });
        return {
          success: true,
          outcome: 'SETTLED',
          replay: true,
          order_id: matchedOrder.order_id,
          pnr: matchedOrder.pnr,
          issued_tickets: this._issuedTicketsOf(matchedOrder)
        };
      }
      matchedOrder.refunded_vnd = (matchedOrder.refunded_vnd || 0) + amount;
      const refund = this._requestOrderRefund(matchedOrder, {
        amount_vnd: amount,
        reason: `Chuyển khoản trùng cho đơn đã thanh toán ${matchedOrder.pnr} (DUPLICATE_TRANSFER)`,
        source: 'DUPLICATE_TRANSFER'
      });
      storeTx('DUPLICATE_REFUND', { order: matchedOrder, refundId: refund.refund_id });
      return {
        success: true,
        outcome: 'DUPLICATE_REFUND',
        order_id: matchedOrder.order_id,
        pnr: matchedOrder.pnr,
        refund_id: refund.refund_id
      };
    }

    // f. Accumulate paid amount and log transaction on the order.
    matchedOrder.paid_amount_vnd = (matchedOrder.paid_amount_vnd || 0) + amount;
    matchedOrder.payment_txs = matchedOrder.payment_txs || [];
    matchedOrder.payment_txs.push({
      tx_id: txKey,
      amount_vnd: amount,
      at: new Date(now).toISOString()
    });

    // g. Late transfer: if seats are still free on a sellable trip, continue to settle; else refund paid_amount_vnd.
    const expiresAtMs = new Date(matchedOrder.expires_at).getTime();
    const isLate = (Number.isFinite(expiresAtMs) && now > expiresAtMs)
      || matchedOrder.payment_status === 'EXPIRED'
      || matchedOrder.payment_status === 'UNMATCHED_OVERDUE';

    if (isLate) {
      if (!this._isLateOrderSellable(matchedOrder, now)) {
        matchedOrder.payment_status = 'UNMATCHED_OVERDUE';
        const refundAmount = matchedOrder.paid_amount_vnd;
        matchedOrder.refunded_vnd = (matchedOrder.refunded_vnd || 0) + refundAmount;
        matchedOrder.paid_amount_vnd = 0;
        matchedOrder.overdue_received_vnd = refundAmount;
        matchedOrder.overdue_bank_ref = bankRef || providerTxId || txKey;
        const refunds = this.eventBridge?.services?.managerService?.refundRequests;
        const beforeLen = refunds ? refunds.length : 0;
        if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
          this.eventBridge.emit('PAYMENT_OVERDUE', {
            order: matchedOrder,
            amountVnd: refundAmount,
            bankRef: bankRef || providerTxId || txKey
          });
        }
        const refund = (refunds && refunds.length > beforeLen)
          ? refunds.at(-1)
          : this._requestOrderRefund(matchedOrder, {
            amount_vnd: refundAmount,
            reason: 'Thanh toán đến sau khi hết hạn giữ chỗ (UNMATCHED_OVERDUE)',
            source: 'UNMATCHED_OVERDUE'
          });
        storeTx('LATE_REFUND', { order: matchedOrder, refundId: refund.refund_id });
        return {
          success: true,
          outcome: 'LATE_REFUND',
          order_id: matchedOrder.order_id,
          pnr: matchedOrder.pnr,
          refund_id: refund.refund_id
        };
      }
    }

    // h. Partial payment: keep PENDING_PAYMENT, record remaining_vnd and alert the office.
    if (matchedOrder.paid_amount_vnd < matchedOrder.amount_vnd) {
      matchedOrder.payment_status = 'PENDING_PAYMENT';
      matchedOrder.remaining_vnd = matchedOrder.amount_vnd - matchedOrder.paid_amount_vnd;
      matchedOrder.payment_anomalies = matchedOrder.payment_anomalies || [];
      matchedOrder.payment_anomalies.push({
        type: 'AMOUNT_MISMATCH',
        expected_vnd: matchedOrder.amount_vnd,
        received_vnd: amount,
        paid_amount_vnd: matchedOrder.paid_amount_vnd,
        remaining_vnd: matchedOrder.remaining_vnd,
        bank_ref: bankRef || providerTxId || null,
        at: new Date(now).toISOString()
      });
      if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
        this.eventBridge.emit('PAYMENT_ANOMALY', {
          order: matchedOrder,
          receivedVnd: amount,
          bankRef: bankRef || providerTxId || txKey
        });
      }
      storeTx('PARTIAL', { order: matchedOrder });
      return {
        success: true,
        outcome: 'PARTIAL',
        order_id: matchedOrder.order_id,
        pnr: matchedOrder.pnr,
        remaining_vnd: matchedOrder.remaining_vnd
      };
    }

    // i. Paid in full (or overpaid): settle order, and open a refund for any excess.
    matchedOrder.remaining_vnd = 0;
    const settleRes = this.settlePayment(matchedOrder.order_id, bankRef || txKey, now, { allowExpired: isLate });
    const excess = matchedOrder.paid_amount_vnd - matchedOrder.amount_vnd;
    let refundId = null;
    if (excess > 0) {
      matchedOrder.refunded_vnd = (matchedOrder.refunded_vnd || 0) + excess;
      matchedOrder.paid_amount_vnd = matchedOrder.amount_vnd;
      const refund = this._requestOrderRefund(matchedOrder, {
        amount_vnd: excess,
        reason: `Chuyển khoản dư ${excess} đ cho đơn ${matchedOrder.pnr} (OVERPAID_EXCESS)`,
        source: 'OVERPAID_EXCESS'
      });
      refundId = refund.refund_id;
    }
    const outcome = isLate
      ? 'LATE_SETTLED'
      : (excess > 0 ? 'OVERPAID_SETTLED' : 'SETTLED');
    storeTx(outcome, { order: matchedOrder, refundId });
    return {
      success: true,
      outcome,
      order_id: matchedOrder.order_id,
      pnr: matchedOrder.pnr,
      issued_tickets: settleRes.data?.tickets || this._issuedTicketsOf(matchedOrder),
      ...(refundId ? { refund_id: refundId } : {})
    };
  }

  /**
   * MGR-037: Manual payment confirmation by the office (cashier, finance controller, director).
   */
  confirmPaymentManually(orderId, { operatorId = DEFAULT_OPERATOR_ID, amountVnd, note, staff = null } = {}, now = Date.now()) {
    const order = this.orders.get(orderId) || this.orders.get(this.pnrIndex.get(orderId));
    if (!order || (operatorId && (order.operator_id || DEFAULT_OPERATOR_ID) !== operatorId)) {
      return { success: false, error: 'Không tìm thấy đơn hàng', code: 'ORDER_NOT_FOUND', status: 404 };
    }
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    if (cleanNote.length < 3 || cleanNote.length > 200) {
      return { success: false, error: 'Ghi chú xác nhận cần từ 3 đến 200 ký tự', code: 'VALIDATION_ERROR', status: 400 };
    }
    const amount = Number(amountVnd);
    if (!Number.isInteger(amount) || amount <= 0) {
      return { success: false, error: 'Số tiền xác nhận phải là số nguyên dương', code: 'VALIDATION_ERROR', status: 400 };
    }
    const n = (order.manual_confirm_count = (order.manual_confirm_count || 0) + 1);
    return this.applyBankTransfer({
      operatorId: order.operator_id || DEFAULT_OPERATOR_ID,
      provider: 'MANUAL',
      providerTxId: `manual_${order.order_id}_${n}`,
      bankRef: null,
      amountVnd: amount,
      memo: cleanNote,
      note: cleanNote,
      accountNumber: null,
      occurredAt: new Date(now).toISOString(),
      direction: 'IN',
      staff,
      orderId: order.order_id
    }, now);
  }

  /**
   * MGR-037: List stored bank transactions for an operator, newest first.
   */
  listBankTransactions({ operatorId = DEFAULT_OPERATOR_ID, outcome = null } = {}) {
    const entries = [...this.bankTransactions.values()].filter(r => {
      if ((r.operator_id || DEFAULT_OPERATOR_ID) !== operatorId) return false;
      if (outcome && outcome !== 'ALL' && r.outcome !== outcome) return false;
      return true;
    });
    return entries.reverse().sort((a, b) => {
      const ta = Date.parse(a.received_at || a.occurred_at || '') || 0;
      const tb = Date.parse(b.received_at || b.occurred_at || '') || 0;
      return tb - ta;
    });
  }

  /**
   * MGR-037: Re-apply a stored UNMATCHED bank transaction to the order with the given PNR (same company only).
   */
  assignBankTransaction(txId, pnr, { operatorId = DEFAULT_OPERATOR_ID, staff = null } = {}, now = Date.now()) {
    const record = this.bankTransactions.get(txId);
    if (!record || (operatorId && (record.operator_id || DEFAULT_OPERATOR_ID) !== operatorId)) {
      return { success: false, error: 'Không tìm thấy giao dịch ngân hàng', code: 'BANK_TX_NOT_FOUND', status: 404 };
    }
    if (record.outcome !== 'UNMATCHED') {
      return { success: false, error: 'Chỉ gán được giao dịch đang ở trạng thái UNMATCHED', code: 'BANK_TX_NOT_UNMATCHED', status: 409 };
    }
    const cleanPnr = typeof pnr === 'string' ? pnr.trim().toUpperCase() : '';
    if (!cleanPnr) {
      return { success: false, error: 'Cần mã đặt vé (PNR) để gán giao dịch', code: 'VALIDATION_ERROR', status: 400 };
    }
    const ordId = this.pnrIndex.get(cleanPnr) || (this.orders.has(cleanPnr) ? cleanPnr : null);
    const order = ordId ? this.orders.get(ordId) : null;
    if (!order || (order.operator_id || DEFAULT_OPERATOR_ID) !== (record.operator_id || DEFAULT_OPERATOR_ID)) {
      return { success: false, error: 'Không tìm thấy đơn đặt vé thuộc nhà xe này', code: 'ORDER_NOT_FOUND', status: 404 };
    }

    this.bankTransactions.delete(record.tx_id);
    const res = this.applyBankTransfer({
      _txKey: record.tx_id,
      _receivedAt: record.received_at,
      operatorId: record.operator_id || DEFAULT_OPERATOR_ID,
      provider: record.provider,
      providerTxId: record.provider_tx_id,
      bankRef: record.bank_ref,
      amountVnd: record.amount_vnd,
      memo: record.memo,
      accountNumber: record.account_number,
      occurredAt: record.occurred_at,
      direction: 'IN',
      orderId: order.order_id,
      note: record.note
    }, now);

    const updated = this.bankTransactions.get(record.tx_id);
    if (updated) {
      updated.assigned_by = staff || null;
      updated.assigned_at = new Date(now).toISOString();
    }

    return {
      ...res,
      tx_id: record.tx_id,
      assigned_by: staff || null
    };
  }

  /**
   * Handle VietQR Webhook Callback (PAX-014, OQ-008): thin wrapper over applyBankTransfer.
   */
  handleVietQrCallback({
    transferMemo,
    memo,
    amountVnd,
    bankRef = null,
    providerTxId = null,
    accountNumber = null,
    occurredAt = null,
    direction = 'IN',
    operatorId = DEFAULT_OPERATOR_ID,
    now = Date.now()
  } = {}) {
    const res = this.applyBankTransfer({
      operatorId,
      provider: 'VIETQR_HMAC',
      providerTxId: providerTxId || bankRef || null,
      bankRef: bankRef || null,
      amountVnd: Number(amountVnd),
      memo: transferMemo ?? memo ?? '',
      accountNumber,
      occurredAt,
      direction
    }, now);

    const settledOutcomes = ['SETTLED', 'OVERPAID_SETTLED', 'LATE_SETTLED'];
    if (settledOutcomes.includes(res.outcome)) {
      return {
        success: true,
        settled: true,
        status: res.outcome,
        outcome: res.outcome,
        replay: Boolean(res.replay),
        pnr: res.pnr || null,
        order_id: res.order_id || null,
        issued_tickets: res.issued_tickets || [],
        ...(res.refund_id ? { refund_id: res.refund_id } : {})
      };
    }

    return {
      success: true,
      settled: false,
      status: res.outcome,
      outcome: res.outcome,
      replay: Boolean(res.replay),
      pnr: res.pnr || null,
      order_id: res.order_id || null,
      ...(res.remaining_vnd !== undefined ? { remaining_vnd: res.remaining_vnd } : {}),
      ...(res.refund_id ? { refund_id: res.refund_id } : {})
    };
  }

  /** Plate of the bus assigned to a trip, from the event bridge (null before the office assigns one). */
  _resolveVehiclePlate(tripId) {
    return (tripId && this.plateProvider?.(tripId)) || null;
  }


  _enrichTicket(ticket) {
    if (!ticket) return ticket;
    if (ticket.pickup_time === undefined) {
      const timeInfo = resolveStopTime({ trip_id: ticket.trip_id, departure_time: ticket.departure_time }, ticket.pickup_stop_id, this.searchService);
      ticket.pickup_time = timeInfo.pickup_time;
      ticket.pickup_time_estimated = timeInfo.pickup_time_estimated;
    }
    if (!ticket.vehicle_plate && ticket.trip_id) {
      const plate = this._resolveVehiclePlate(ticket.trip_id);
      if (plate) ticket.vehicle_plate = plate;
    }
    return ticket;
  }

  /**
   * PAX-016: Get passenger ticket wallet with tab filters (UPCOMING, COMPLETED, CANCELLED).
   * The phone must be a complete, valid number and is matched exactly.
   */
  getTicketsByPhone(phone, filter = 'UPCOMING', operatorId = DEFAULT_OPERATOR_ID, now = Date.now()) {
    const phoneCheck = validateVietnamPhone(phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.message, code: 'INVALID_PHONE' };
    }
    const normalized = phoneCheck.normalized;
    const normalizeStored = (value) => validateVietnamPhone(value).normalized || value;
    const userTickets = [];

    for (const ticket of this.tickets.values()) {
      if ((ticket.operator_id || DEFAULT_OPERATOR_ID) !== operatorId) continue;
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
    // A trip whose day is over is history even if nobody closed it (outside production the demo day stays upcoming).
    const today = vnDate(now);
    const dayOver = (t) => {
      const day = t.departure_time ? vnDate(Date.parse(t.departure_time)) : null;
      return Boolean(day) && day < today && (isProduction() || day !== DEMO_DATE);
    };
    const isHistory = (t) => !isCancelled(t) && (t.status === 'NO_SHOW' || Boolean(t.trip_completed) || dayOver(t));
    const filtered = userTickets.filter(t => {
      if (tab === 'CANCELLED') return isCancelled(t);
      if (tab === 'HISTORY') return isHistory(t);
      return !isCancelled(t) && !isHistory(t);
    });

    return {
      success: true,
      total_count: filtered.length,
      data: filtered.map(t => this._enrichTicket(t))
    };
  }

  /**
   * PAX-017: the boarding pass of a ticket. The QR is static and versioned (D104).
   */
  getBoardingPass(ticketId) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return { success: false, error: 'Không tìm thấy vé', code: 'TICKET_NOT_FOUND' };
    }
    this._enrichTicket(ticket);

    // PAX-017: a boarded or absent ticket still opens, with its status and no QR to show or share
    if (['BOARDED', 'NO_SHOW'].includes(ticket.status)) {
      return { success: true, data: { ticket, boarding_qr: null } };
    }
    if (ticket.status !== 'ACTIVE') {
      return {
        success: false,
        error: `Vé không ở trạng thái khả dụng (${ticket.status})`,
        code: 'TICKET_NOT_ACTIVE',
        status: ticket.status
      };
    }
    return { success: true, data: this._passData(ticket) };
  }

  /** The pass of an active ticket: its QR and the backup PIN of the same version (PAX-017 section 7.1). */
  _passData(ticket) {
    return {
      ticket,
      boarding_qr: generateBoardingQR(ticket, this.secretKey),
      offline_pin: generateTicketPin(ticket.ticket_id, this.secretKey, ticket.qr_version || 1)
    };
  }

  /**
   * PAX-017: the passenger revokes a leaked QR (and its PIN) by taking a new version.
   * `boardingStarted` is true once the trip has left: the driver tablet may then be offline
   * with the old version, so the QR is frozen (BR-TICKET-008).
   */
  reissueBoardingQR(ticketId, { boardingStarted = false } = {}) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return { success: false, error: 'Không tìm thấy vé', code: 'TICKET_NOT_FOUND' };
    if (ticket.status !== 'ACTIVE') {
      return { success: false, error: `Vé không ở trạng thái khả dụng (${ticket.status})`, code: 'TICKET_NOT_ACTIVE' };
    }
    if (boardingStarted) {
      return { success: false, error: 'Chuyến đã xuất bến, không đổi được mã QR. Nhờ tài xế kiểm tra bằng tên và số ghế.', code: 'BOARDING_STARTED' };
    }
    ticket.qr_version = (ticket.qr_version || 1) + 1;
    if (ticket.delegated_to) ticket.delegated_to = null;
    if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
      this.eventBridge.emit('TICKET_QR_REISSUED', { tripId: ticket.trip_id, ticketId, version: ticket.qr_version });
    }
    return { success: true, data: this._passData(ticket) };
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
      this._expireOrder(order);
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
      tickets: order.ticket_ids ? order.ticket_ids.map(id => this._enrichTicket(this.tickets.get(id))).filter(Boolean) : []
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
        tickets: (order.ticket_ids || []).map(id => this._enrichTicket(this.tickets.get(id))).filter(Boolean)
      }
    };
  }

  /**
   * PAX-017 / REV-01: Aggregate Group Boarding Pass for multi-ticket orders
   */
  getGroupBoardingPass(orderIdOrPnr) {
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

    const groupQr = generateGroupBoardingQR(activeTickets, this.secretKey);

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

    // The link is an opaque token; the PIN goes in the SMS text, never in a URL (BR-TICKET-005)
    const pin = generateTicketPin(ticketId, this.secretKey, ticket.qr_version || 1);
    const shareToken = createShareToken();
    const shareLink = `https://busgo.vn/pass/${shareToken}`;

    ticket.delegated_to = {
      phone: delegateToPhone,
      name: delegateToName,
      share_token: shareToken,
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

    if (ticket.payment_method === 'CASH' && ticket.cod_collected !== true) {
      const cancelledAt = new Date(now).toISOString();
      ticket.status = 'CANCELLED';
      ticket.cancelled_at = cancelledAt;

      if (this.eventBridge && typeof this.eventBridge.emit === 'function') {
        this.eventBridge.emit('TICKET_CANCELLED', {
          ticketId: ticket.ticket_id,
          pnr: ticket.pnr,
          tripId: ticket.trip_id,
          seatCode: ticket.seat_code,
          refundAmountVnd: 0
        });
      }

      return {
        success: true,
        message: 'Đã hủy vé tiền mặt. Bạn chưa thanh toán nên không phát sinh hoàn tiền',
        data: {
          ticket_id: ticket.ticket_id,
          pnr: ticket.pnr,
          refund_id: null,
          total_price_vnd: ticket.fare_vnd,
          refund_percentage: 0,
          refund_amount_vnd: 0,
          fee_amount_vnd: 0,
          tier: 'CASH_UNPAID',
          policy_message: 'Vé tiền mặt chưa thu tiền: không phát sinh hoàn tiền',
          status: 'CANCELLED',
          cancelled_at: cancelledAt
        }
      };
    }

    // PAX-025 (BR-DELAY-001): when the manager declared a delay over 30 minutes the cancellation fee is waived
    const delayMinutes = typeof this.getTripDelayMinutes === 'function' ? this.getTripDelayMinutes(ticket.trip_id) : 0;
    // D130: the company refused the home pickup / drop-off the passenger booked; leaving is free.
    const homeRefused = [ticket.home_pickup, ticket.home_dropoff].some(h => h?.status === 'REJECTED');
    const refundCalc = homeRefused
      ? {
        percentage: 100,
        feePercentage: 0,
        refundAmount: ticket.fare_vnd,
        feeAmount: 0,
        tier: 'HOME_SERVICE_REFUSED',
        message: 'Nhà xe không nhận đón/trả tận nhà: Hoàn 100%, không thu phí hủy'
      }
      : delayMinutes > DELAY_WAIVER_AFTER_MINUTES
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
   * Link relatives open to follow the bus (spec adjustment A3). It lasts until 6 h after the later of the departure and
   * the moment it was shared, and stops showing the bus once the trip ends.
   */
  createShareLink(ticketId, mockNow = Date.now()) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return { success: false, error: 'Không tìm thấy vé', code: 'TICKET_NOT_FOUND' };
    }
    if (ticket.status === 'CANCELLED') {
      return { success: false, error: 'Vé đã hủy', code: 'TICKET_CANCELLED' };
    }
    const departure = new Date(ticket.departure_time).getTime();
    const expiresAt = new Date(Math.max(Number.isFinite(departure) ? departure : 0, mockNow) + 6 * 60 * 60 * 1000).toISOString();
    ticket.share_expires_at = expiresAt;

    return {
      success: true,
      data: {
        share_token: ticket.share_token,
        share_url: `/t/${ticket.share_token}`,
        expires_at: expiresAt
      }
    };
  }

  /** Whether the share link of a ticket was issued and has not expired. */
  shareLinkValid(ticket, mockNow = Date.now()) {
    return Boolean(ticket?.share_expires_at) && new Date(ticket.share_expires_at).getTime() > mockNow;
  }
}
