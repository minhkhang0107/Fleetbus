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
  validateManifest({ payerInfo, passengerList, seatCodes }) {
    // 1. Validate Payer
    if (!payerInfo || !payerInfo.full_name || payerInfo.full_name.trim().length < 2) {
      return { success: false, error: 'Họ và tên người đặt vé không hợp lệ', code: 'INVALID_PAYER_NAME' };
    }
    const phoneCheck = validateVietnamPhone(payerInfo.phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.message, code: 'INVALID_PAYER_PHONE' };
    }

    // 2. Validate Passengers for each seat
    if (!Array.isArray(passengerList) || passengerList.length !== seatCodes.length) {
      return {
        success: false,
        error: `Cần cung cấp thông tin cho đủ ${seatCodes.length} hành khách`,
        code: 'PASSENGER_COUNT_MISMATCH'
      };
    }

    const validatedPassengers = [];
    for (let i = 0; i < seatCodes.length; i++) {
      const p = passengerList[i];
      const seatCode = seatCodes[i];

      if (!p || !p.full_name || p.full_name.trim().length < 2) {
        return {
          success: false,
          error: `Họ tên hành khách ghế ${seatCode} không được để trống`,
          code: 'INVALID_PASSENGER_NAME'
        };
      }

      if (p.cccd) {
        const cccdCheck = validateCCCD(p.cccd);
        if (!cccdCheck.isValid) {
          return { success: false, error: `CCCD hành khách ghế ${seatCode} không hợp lệ: ${cccdCheck.message}`, code: 'INVALID_CCCD' };
        }
      }

      validatedPassengers.push({
        seat_code: seatCode,
        full_name: p.full_name.trim(),
        phone: p.phone ? validateVietnamPhone(p.phone).normalized || payerInfo.phone : payerInfo.phone,
        cccd: p.cccd ? p.cccd.replace(/\s/g, '') : null
      });
    }

    return {
      success: true,
      data: {
        payer: {
          full_name: payerInfo.full_name.trim(),
          phone: phoneCheck.normalized,
          email: payerInfo.email || `${phoneCheck.normalized}@passenger.busgo.vn`
        },
        passengers: validatedPassengers
      }
    };
  }

  /**
   * PAX-012: Build Order Summary and Calculate Breakdown
   */
  calculateOrderReview({ trip, seatCodes, pickupStop, dropoffStop, voucherCode, insuranceSelected = true }) {
    const seatPrice = trip.base_fare_vnd || 220000;
    const subtotalFare = seatCodes.length * seatPrice;
    
    // Optional travel insurance (10,000 VND / passenger)
    const insuranceFare = insuranceSelected ? seatCodes.length * 10000 : 0;

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
      data: {
        trip_id: trip.trip_id,
        route_name: trip.route_name,
        departure_time: trip.departure_time,
        seat_codes: seatCodes,
        total_seats: seatCodes.length,
        pickup_stop: pickupStop,
        dropoff_stop: dropoffStop,
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
}
