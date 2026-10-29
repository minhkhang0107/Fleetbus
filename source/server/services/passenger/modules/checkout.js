/**
 * FleetBus Passenger Manifest & Checkout Review Module
 * Implements PAX-011 (Passenger Info Form) and PAX-012 (Booking Review Checkout).
 */

import { validateVietnamPhone, validateCCCD, validatePersonName } from '../core/formatters.js';

export class PassengerCheckoutService {
  /**
   * PAX-011: Validate and construct passenger manifest
   */
  validateManifest({ payerInfo, passengerList, seatCodes, payer, passengers, selectedSeatsCount }) {
    const actualPayer = payerInfo || payer;
    const actualPassengers = passengerList || passengers || [];
    const actualSeatsCount = seatCodes ? seatCodes.length : (selectedSeatsCount || actualPassengers.length);

    // 1. Validate Payer
    const payerNameCheck = validatePersonName(actualPayer?.full_name);
    if (!actualPayer || !payerNameCheck.isValid) {
      return { success: false, isValid: false, error: payerNameCheck.message, code: 'INVALID_PAYER_NAME' };
    }
    const phoneCheck = validateVietnamPhone(actualPayer.phone);
    if (!phoneCheck.isValid) {
      return { success: false, isValid: false, error: phoneCheck.message, code: 'INVALID_PAYER_PHONE' };
    }

    // 2. Validate Passengers for each seat
    if (!Array.isArray(actualPassengers) || actualPassengers.length !== actualSeatsCount) {
      return {
        success: false,
        isValid: false,
        error: `Cần cung cấp thông tin cho đủ ${actualSeatsCount} hành khách`,
        code: 'PASSENGER_COUNT_MISMATCH'
      };
    }

    const validatedPassengers = [];
    for (let i = 0; i < actualSeatsCount; i++) {
      const p = actualPassengers[i];
      const seatCode = p.seat_code || (seatCodes ? seatCodes[i] : `A0${i + 1}`);

      const passengerNameCheck = validatePersonName(p?.full_name);
      if (!p || !passengerNameCheck.isValid) {
        return {
          success: false,
          isValid: false,
          error: passengerNameCheck.message,
          code: 'INVALID_PASSENGER_NAME'
        };
      }

      if (p.cccd) {
        const cccdCheck = validateCCCD(p.cccd);
        if (!cccdCheck.isValid) {
          return { success: false, isValid: false, error: `CCCD hành khách ghế ${seatCode} không hợp lệ: ${cccdCheck.message}`, code: 'INVALID_CCCD' };
        }
      }

      validatedPassengers.push({
        seat_code: seatCode,
        full_name: passengerNameCheck.normalized,
        phone: p.phone ? validateVietnamPhone(p.phone).normalized || actualPayer.phone : actualPayer.phone,
        cccd: p.cccd ? p.cccd.replace(/\s/g, '') : null
      });
    }

    return {
      success: true,
      isValid: true,
      data: {
        payer: {
          full_name: payerNameCheck.normalized,
          phone: phoneCheck.normalized,
          email: actualPayer.email || `${phoneCheck.normalized}@passenger.busgo.vn`
        },
        passengers: validatedPassengers
      }
    };
  }

  /**
   * PAX-012: Build Order Summary and Calculate Breakdown
   */
  /**
   * [resolveVoucher] (code, subtotal) → { ok, voucher, discount_vnd } or a refusal { ok: false, code, message }:
   * the company's discount codes (core/vouchers.js). A code that does not apply refuses the order, so the
   * passenger never pays a price other than the one the app showed.
   * [free = false]: when true, sets fares and totals to 0 đ without evaluating vouchers.
   */
  calculateOrderReview({ trip = {}, seatCodes = [], pickupStop = 'Bến xe Giáp Bát', dropoffStop = 'Bến xe Phía Bắc Thanh Hóa', voucherCode, resolveVoucher = null, insuranceSelected = false, insuranceEnabled = true, insurance_enabled, seats, seatPriceVnd, free = false }) {
    const isInsuranceEnabled = insurance_enabled !== undefined ? Boolean(insurance_enabled) : Boolean(insuranceEnabled);
    const effectiveSeatCodes = seatCodes.length > 0 ? seatCodes : (seats ? seats.map(s => typeof s === 'string' ? s : s.seat_code) : []);
    const seatPrice = seatPriceVnd || trip.base_fare_vnd || 220000;
    const perSeatPrices = Array.isArray(seats) && seats.length > 0 && seats.every(s => s && Number.isFinite(s.price_vnd))
      ? seats.map(s => s.price_vnd)
      : null;
    const subtotalFare = free
      ? 0
      : (perSeatPrices
        ? perSeatPrices.reduce((sum, price) => sum + price, 0)
        : effectiveSeatCodes.length * seatPrice);
    
    // Optional travel insurance (10,000 VND / passenger)
    const insuranceFare = !free && insuranceSelected && isInsuranceEnabled ? effectiveSeatCodes.length * 10000 : 0;

    // Voucher computation
    let voucherDiscount = 0;
    let appliedVoucher = null;

    if (!free && voucherCode) {
      const r = resolveVoucher ? resolveVoucher(voucherCode, subtotalFare) : { ok: false, code: 'VOUCHER_INVALID', message: 'Mã giảm giá không đúng' };
      if (!r.ok) {
        return { success: false, code: r.code, error: r.message };
      }
      voucherDiscount = r.discount_vnd;
      appliedVoucher = {
        code: r.voucher.code,
        description: r.voucher.description,
        discount_amount: voucherDiscount
      };
    }

    const finalTotal = free ? 0 : Math.max(0, subtotalFare + insuranceFare - voucherDiscount);

    return {
      success: true,
      total_payment_vnd: finalTotal,
      data: {
        trip_id: trip.trip_id || 'trp_hn_th_01',
        route_name: trip.route_name || 'Hà Nội — Thanh Hóa (Cao tốc)',
        departure_time: trip.departure_time || '2026-08-28T14:00:00+07:00',
        seat_codes: effectiveSeatCodes,
        total_seats: effectiveSeatCodes.length,
        pickup_stop: pickupStop,
        dropoff_stop: dropoffStop,
        total_payment_vnd: finalTotal,
        price_breakdown: {
          seat_fare_unit: free ? 0 : (perSeatPrices ? perSeatPrices[0] : seatPrice),
          subtotal_fare: subtotalFare,
          insurance_fare: insuranceFare,
          voucher_discount: voucherDiscount,
          final_total_vnd: finalTotal
        },
        applied_voucher: appliedVoucher,
        ...(free ? { free: true } : {})
      }
    };
  }

  computeOrderReview(args) {
    return this.calculateOrderReview(args);
  }
}
