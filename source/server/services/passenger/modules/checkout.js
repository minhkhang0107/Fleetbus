/**
 * FleetBus Passenger Manifest & Checkout Review Module
 * Implements PAX-011 (Passenger Info Form) and PAX-012 (Booking Review Checkout).
 */

import { validateVietnamPhone, validateCCCD } from '../core/formatters.js';

export const PROMO_VOUCHERS = {
  'BUSGO50K': { type: 'FIXED', value: 50000, minOrder: 200000, description: 'Giảm 50.000 đ cho đơn từ 200k' },
  'VIP10': { type: 'PERCENT', value: 10, maxDiscount: 50000, minOrder: 150000, description: 'Giảm 10% tối đa 50k' }
};

export class PassengerCheckoutService {
  /**
   * PAX-011: Validate and construct passenger manifest
   */
  validateManifest({ payerInfo, passengerList, seatCodes, payer, passengers, selectedSeatsCount }) {
    const actualPayer = payerInfo || payer;
    const actualPassengers = passengerList || passengers || [];
    const actualSeatsCount = seatCodes ? seatCodes.length : (selectedSeatsCount || actualPassengers.length);

    // 1. Validate Payer
    if (!actualPayer || !actualPayer.full_name || actualPayer.full_name.trim().length < 2) {
      return { success: false, isValid: false, error: 'Họ và tên người đặt vé không hợp lệ', code: 'INVALID_PAYER_NAME' };
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

      if (!p || !p.full_name || p.full_name.trim().length < 2) {
        return {
          success: false,
          isValid: false,
          error: `Họ tên hành khách ghế ${seatCode} không được để trống`,
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
        full_name: p.full_name.trim(),
        phone: p.phone ? validateVietnamPhone(p.phone).normalized || actualPayer.phone : actualPayer.phone,
        cccd: p.cccd ? p.cccd.replace(/\s/g, '') : null
      });
    }

    return {
      success: true,
      isValid: true,
      data: {
        payer: {
          full_name: actualPayer.full_name.trim(),
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
  calculateOrderReview({ trip = {}, seatCodes = [], pickupStop = 'Bến xe Giáp Bát', dropoffStop = 'Bến xe Phía Bắc Thanh Hóa', voucherCode, insuranceSelected = true, seats, seatPriceVnd }) {
    const effectiveSeatCodes = seatCodes.length > 0 ? seatCodes : (seats ? seats.map(s => typeof s === 'string' ? s : s.seat_code) : []);
    const seatPrice = seatPriceVnd || trip.base_fare_vnd || 220000;
    const subtotalFare = effectiveSeatCodes.length * seatPrice;
    
    // Optional travel insurance (10,000 VND / passenger)
    const insuranceFare = insuranceSelected ? effectiveSeatCodes.length * 10000 : 0;

    // Voucher computation
    let voucherDiscount = 0;
    let appliedVoucher = null;

    if (voucherCode) {
      const promo = PROMO_VOUCHERS[voucherCode.toUpperCase().trim()];
      if (promo && subtotalFare >= promo.minOrder) {
        if (promo.type === 'FIXED') {
          voucherDiscount = promo.value;
        } else if (promo.type === 'PERCENT') {
          const rawDiscount = (subtotalFare * promo.value) / 100;
          voucherDiscount = Math.min(rawDiscount, promo.maxDiscount);
        }
        appliedVoucher = {
          code: voucherCode.toUpperCase().trim(),
          description: promo.description,
          discount_amount: voucherDiscount
        };
      }
    }

    const finalTotal = Math.max(0, subtotalFare + insuranceFare - voucherDiscount);

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
          seat_fare_unit: seatPrice,
          subtotal_fare: subtotalFare,
          insurance_fare: insuranceFare,
          voucher_discount: voucherDiscount,
          final_total_vnd: finalTotal
        },
        applied_voucher: appliedVoucher
      }
    };
  }

  computeOrderReview(args) {
    return this.calculateOrderReview(args);
  }
}
