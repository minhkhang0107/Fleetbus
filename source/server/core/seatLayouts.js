/**
 * Built-in seat layout templates and validation rules for FleetBus vehicles.
 */

export const DEFAULT_LAYOUT_ID = 'CABIN_22';

function makeCabin22() {
  const seats = [];
  // Deck 1: A01-A06 column 1, B01-B05 column 3
  for (let i = 1; i <= 6; i++) {
    seats.push({ seat_code: `A0${i}`, deck: 1, row: i, column: 1, type: 'VIP_CABIN' });
  }
  for (let i = 1; i <= 5; i++) {
    seats.push({ seat_code: `B0${i}`, deck: 1, row: i, column: 3, type: 'VIP_CABIN' });
  }
  // Deck 2: A07-A11 column 1, B06-B11 column 3
  for (let i = 7; i <= 11; i++) {
    seats.push({ seat_code: `A${String(i).padStart(2, '0')}`, deck: 2, row: i - 6, column: 1, type: 'VIP_CABIN' });
  }
  for (let i = 6; i <= 11; i++) {
    seats.push({ seat_code: `B${String(i).padStart(2, '0')}`, deck: 2, row: i - 5, column: 3, type: 'VIP_CABIN' });
  }
  return {
    layout_id: 'CABIN_22',
    name: 'Limousine 22 phòng (2 tầng)',
    vehicle_type: 'DOUBLE_DECK_VIP_CABIN',
    total_decks: 2,
    columns: 3,
    seats,
    builtin: true
  };
}

function makeCabin34() {
  const seats = [];
  let d1Index = 1;
  for (let r = 1; r <= 5; r++) {
    for (const c of [1, 3, 5]) {
      seats.push({ seat_code: `A${String(d1Index++).padStart(2, '0')}`, deck: 1, row: r, column: c, type: 'VIP_CABIN' });
    }
  }
  for (const c of [1, 5]) {
    seats.push({ seat_code: `A${String(d1Index++).padStart(2, '0')}`, deck: 1, row: 6, column: c, type: 'VIP_CABIN' });
  }
  let d2Index = 1;
  for (let r = 1; r <= 5; r++) {
    for (const c of [1, 3, 5]) {
      seats.push({ seat_code: `B${String(d2Index++).padStart(2, '0')}`, deck: 2, row: r, column: c, type: 'VIP_CABIN' });
    }
  }
  for (const c of [1, 5]) {
    seats.push({ seat_code: `B${String(d2Index++).padStart(2, '0')}`, deck: 2, row: 6, column: c, type: 'VIP_CABIN' });
  }
  return {
    layout_id: 'CABIN_34',
    name: 'Limousine 34 phòng (2 tầng, 3 dãy)',
    vehicle_type: 'DOUBLE_DECK_VIP_CABIN',
    total_decks: 2,
    columns: 5,
    seats,
    builtin: true
  };
}

function makeSleeper34() {
  const cabin = makeCabin34();
  return {
    ...cabin,
    layout_id: 'SLEEPER_34',
    name: 'Giường nằm 34 chỗ (2 tầng, 3 dãy)',
    vehicle_type: 'DOUBLE_DECK_SLEEPER',
    seats: cabin.seats.map(s => ({ ...s, type: 'SLEEPER' }))
  };
}

function makeSeat45() {
  const seats = [];
  let index = 1;
  for (let r = 1; r <= 10; r++) {
    for (const c of [1, 2, 4, 5]) {
      seats.push({ seat_code: `S${String(index++).padStart(2, '0')}`, deck: 1, row: r, column: c, type: 'SEAT' });
    }
  }
  for (let c = 1; c <= 5; c++) {
    seats.push({ seat_code: `S${String(index++).padStart(2, '0')}`, deck: 1, row: 11, column: c, type: 'SEAT' });
  }
  return {
    layout_id: 'SEAT_45',
    name: 'Ghế ngồi 45 chỗ (1 tầng)',
    vehicle_type: 'SINGLE_DECK_SEATER',
    total_decks: 1,
    columns: 5,
    seats,
    builtin: true
  };
}

export const BUILTIN_LAYOUTS = [
  makeCabin22(),
  makeCabin34(),
  makeSleeper34(),
  makeSeat45()
];

/**
 * Validates a seat layout template. Returns an error message string or null.
 */
export function validateLayout(layout) {
  if (!layout || typeof layout !== 'object') {
    return 'Dữ liệu sơ đồ không hợp lệ';
  }
  if (typeof layout.name !== 'string' || !layout.name.trim() || layout.name.length > 80) {
    return 'Tên sơ đồ phải là chuỗi từ 1 đến 80 ký tự';
  }
  if (!Number.isInteger(layout.total_decks) || layout.total_decks < 1 || layout.total_decks > 3) {
    return 'Số tầng phải là số nguyên từ 1 đến 3';
  }
  if (!Number.isInteger(layout.columns) || layout.columns < 1 || layout.columns > 8) {
    return 'Số cột phải là số nguyên từ 1 đến 8';
  }
  if (!Array.isArray(layout.seats) || layout.seats.length < 1 || layout.seats.length > 80) {
    return 'Số lượng ghế phải từ 1 đến 80';
  }

  const allowedTypes = ['VIP_CABIN', 'SLEEPER', 'SEAT'];
  const seatCodeRegex = /^[A-Z0-9]{1,4}$/;
  const seenCodes = new Set();
  const seenCells = new Set();
  const decksWithSeats = new Set();

  for (const seat of layout.seats) {
    if (!seat || typeof seat !== 'object') {
      return 'Dữ liệu ghế không hợp lệ';
    }
    if (typeof seat.seat_code !== 'string' || !seatCodeRegex.test(seat.seat_code)) {
      return `Mã ghế không hợp lệ: ${seat?.seat_code}`;
    }
    if (seenCodes.has(seat.seat_code)) {
      return `Mã ghế trùng lặp: ${seat.seat_code}`;
    }
    seenCodes.add(seat.seat_code);

    if (!Number.isInteger(seat.deck) || seat.deck < 1 || seat.deck > layout.total_decks) {
      return `Tầng của ghế ${seat.seat_code} phải từ 1 đến ${layout.total_decks}`;
    }
    decksWithSeats.add(seat.deck);

    if (!Number.isInteger(seat.row) || seat.row < 1 || seat.row > 30) {
      return `Hàng của ghế ${seat.seat_code} phải từ 1 đến 30`;
    }
    if (!Number.isInteger(seat.column) || seat.column < 1 || seat.column > layout.columns) {
      return `Cột của ghế ${seat.seat_code} phải từ 1 đến ${layout.columns}`;
    }

    const cellKey = `${seat.deck}:${seat.row}:${seat.column}`;
    if (seenCells.has(cellKey)) {
      return `Trùng vị trí ghế tại tầng ${seat.deck}, hàng ${seat.row}, cột ${seat.column}`;
    }
    seenCells.add(cellKey);

    if (!allowedTypes.includes(seat.type)) {
      return `Loại ghế không hợp lệ: ${seat.type}`;
    }
  }

  for (let d = 1; d <= layout.total_decks; d++) {
    if (!decksWithSeats.has(d)) {
      return `Tầng ${d} không có ghế nào`;
    }
  }

  return null;
}

/**
 * Finds a seat layout template by ID from built-ins or custom layouts.
 */
export function findLayout(layoutId, customLayouts = []) {
  if (!layoutId) return null;
  return BUILTIN_LAYOUTS.find(l => l.layout_id === layoutId)
    || (Array.isArray(customLayouts) ? customLayouts.find(l => l.layout_id === layoutId) : null)
    || null;
}
