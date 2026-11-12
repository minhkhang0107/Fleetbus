/**
 * Bank list and validation for VietQR Napas247 settlements and passenger refunds.
 */

export const VIETQR_BANKS = [
  { bin: '970415', code: 'VIETINBANK', short_name: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam', aliases: ['CTG', 'ICB'] },
  { bin: '970436', code: 'VIETCOMBANK', short_name: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam', aliases: ['VCB'] },
  { bin: '970418', code: 'BIDV', short_name: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam', aliases: ['BIDV'] },
  { bin: '970405', code: 'AGRIBANK', short_name: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam', aliases: ['VBA', 'VBARD'] },
  { bin: '970407', code: 'TECHCOMBANK', short_name: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam', aliases: ['TCB'] },
  { bin: '970422', code: 'MBBANK', short_name: 'MB Bank', name: 'Ngân hàng TMCP Quân đội', aliases: ['MB', 'MILITARYBANK'] },
  { bin: '970416', code: 'ACB', short_name: 'ACB', name: 'Ngân hàng TMCP Á Châu', aliases: ['ASIANCOMMERCIALBANK'] },
  { bin: '970432', code: 'VPBANK', short_name: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', aliases: ['VPB'] },
  { bin: '970423', code: 'TPBANK', short_name: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong', aliases: ['TPB'] },
  { bin: '970403', code: 'SACOMBANK', short_name: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín', aliases: ['STB'] },
  { bin: '970437', code: 'HDBANK', short_name: 'HDBank', name: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh', aliases: ['HDB'] },
  { bin: '970443', code: 'SHB', short_name: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội', aliases: ['SHB'] },
  { bin: '970441', code: 'VIB', short_name: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam', aliases: ['VIB'] },
  { bin: '970426', code: 'MSB', short_name: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam', aliases: ['MARITIMEBANK'] },
  { bin: '970440', code: 'SEABANK', short_name: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á', aliases: ['SSB'] },
  { bin: '970448', code: 'OCB', short_name: 'OCB', name: 'Ngân hàng TMCP Phương Đông', aliases: ['OCB'] },
  { bin: '970431', code: 'EXIMBANK', short_name: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam', aliases: ['EIB'] },
  { bin: '970449', code: 'LPBANK', short_name: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam', aliases: ['LPB', 'LIENVIETPOSTBANK'] },
  { bin: '970412', code: 'PVCOMBANK', short_name: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam', aliases: ['PVB'] },
  { bin: '970409', code: 'BACABANK', short_name: 'Bac A Bank', name: 'Ngân hàng TMCP Bắc Á', aliases: ['BAB', 'NASBANK'] },
  { bin: '970428', code: 'NAB', short_name: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á', aliases: ['NAMABANK'] },
  { bin: '970400', code: 'SAIGONBANK', short_name: 'Saigonbank', name: 'Ngân hàng TMCP Sài Gòn Công Thương', aliases: ['SGB'] },
  { bin: '970438', code: 'BVBANK', short_name: 'BaoViet Bank', name: 'Ngân hàng TMCP Bảo Việt', aliases: ['BVB', 'BAOVIETBANK'] },
  { bin: '970454', code: 'VIETCAPITALBANK', short_name: 'BVBank', name: 'Ngân hàng TMCP Bản Việt', aliases: ['VCCB'] },
  { bin: '970452', code: 'KIENLONGBANK', short_name: 'Kienlongbank', name: 'Ngân hàng TMCP Kiên Long', aliases: ['KLB'] },
  { bin: '970419', code: 'NCB', short_name: 'NCB', name: 'Ngân hàng TMCP Quốc Dân', aliases: ['NCB', 'NAVIBANK'] },
  { bin: '970427', code: 'VIETABANK', short_name: 'VietABank', name: 'Ngân hàng TMCP Việt Á', aliases: ['VAB'] },
  { bin: '970430', code: 'PGBANK', short_name: 'PGBank', name: 'Ngân hàng TMCP Xăng dầu Petrolimex', aliases: ['PGB'] },
  { bin: '970424', code: 'SHINHAN', short_name: 'Shinhan Bank', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam', aliases: ['SHBVN'] },
  { bin: '970457', code: 'WOORI', short_name: 'Woori Bank', name: 'Ngân hàng TNHH MTV Woori Việt Nam', aliases: ['WOORIBANK'] },
  { bin: '458761', code: 'HSBC', short_name: 'HSBC', name: 'Ngân hàng TNHH MTV HSBC Việt Nam', aliases: ['HSBC'] },
  { bin: '970410', code: 'STANDARD_CHARTERED', short_name: 'Standard Chartered', name: 'Ngân hàng TNHH MTV Standard Chartered Việt Nam', aliases: ['SCVN'] },
  { bin: '422589', code: 'CIMB', short_name: 'CIMB', name: 'Ngân hàng TNHH MTV CIMB Việt Nam', aliases: ['CIMB'] },
  { bin: '970439', code: 'PUBLICBANK', short_name: 'Public Bank', name: 'Ngân hàng TNHH MTV Public Việt Nam', aliases: ['PBVN'] }
];

export function normalizeAccountName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toUpperCase();
}

export function findBank({ bank_bin, bank_code, bin, code } = {}) {
  const rawBin = String(bank_bin || bin || '').trim();
  if (rawBin) {
    const byBin = VIETQR_BANKS.find(b => b.bin === rawBin);
    if (byBin) return byBin;
  }
  const rawCode = String(bank_code || code || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
  if (rawCode) {
    const byCode = VIETQR_BANKS.find(b => {
      if (b.bin === rawCode) return true;
      if (b.code.replace(/[\s\-_]/g, '') === rawCode) return true;
      if (b.short_name.toUpperCase().replace(/[\s\-_]/g, '') === rawCode) return true;
      if (b.aliases && b.aliases.some(a => a.replace(/[\s\-_]/g, '') === rawCode)) return true;
      return false;
    });
    if (byCode) return byCode;
  }
  return null;
}

export function maskAccountNumber(acc) {
  const str = String(acc || '').trim();
  if (!str) return '******';
  if (str.length <= 4) return '******';
  return `******${str.slice(-4)}`;
}

export function maskRefundAccount(account) {
  if (!account || typeof account !== 'object') return null;
  return {
    bank_bin: account.bank_bin || account.bin,
    bank_code: account.bank_code || account.code,
    bank_name: account.bank_name,
    account_number: maskAccountNumber(account.account_number),
    account_name: account.account_name
  };
}

export function validateRefundAccount(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'REFUND_ACCOUNT_REQUIRED', message: 'Nhập tài khoản ngân hàng để nhận tiền hoàn' };
  }

  const bank = findBank(input);
  if (!bank) {
    return { ok: false, code: 'UNKNOWN_BANK', message: 'Ngân hàng không hợp lệ hoặc chưa được hỗ trợ' };
  }

  const rawNumber = String(input.account_number || '').trim();
  if (!/^\d{6,19}$/.test(rawNumber)) {
    return { ok: false, code: 'INVALID_ACCOUNT_NUMBER', message: 'Số tài khoản chỉ gồm 6-19 chữ số' };
  }

  const normName = normalizeAccountName(input.account_name);
  if (!normName || normName.length < 2) {
    return { ok: false, code: 'INVALID_ACCOUNT_NAME', message: 'Chủ tài khoản không được để trống' };
  }

  return {
    ok: true,
    account: {
      bank_bin: bank.bin,
      bank_code: bank.code,
      bank_name: bank.short_name,
      account_number: rawNumber,
      account_name: normName
    }
  };
}
