class BankInfo {
  const BankInfo({required this.bin, required this.shortName, this.name = ''});
  final String bin;
  final String shortName;
  final String name;
}

const vietQrBanks = [
  BankInfo(bin: '970415', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam'),
  BankInfo(bin: '970436', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam'),
  BankInfo(bin: '970418', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam'),
  BankInfo(bin: '970405', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam'),
  BankInfo(bin: '970407', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam'),
  BankInfo(bin: '970422', shortName: 'MB Bank', name: 'Ngân hàng TMCP Quân đội'),
  BankInfo(bin: '970416', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu'),
  BankInfo(bin: '970432', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng'),
  BankInfo(bin: '970423', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong'),
  BankInfo(bin: '970403', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín'),
  BankInfo(bin: '970437', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh'),
  BankInfo(bin: '970443', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội'),
  BankInfo(bin: '970441', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam'),
  BankInfo(bin: '970426', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam'),
  BankInfo(bin: '970440', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á'),
  BankInfo(bin: '970448', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông'),
  BankInfo(bin: '970431', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam'),
  BankInfo(bin: '970449', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam'),
  BankInfo(bin: '970412', shortName: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam'),
  BankInfo(bin: '970409', shortName: 'Bac A Bank', name: 'Ngân hàng TMCP Bắc Á'),
  BankInfo(bin: '970428', shortName: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á'),
  BankInfo(bin: '970400', shortName: 'Saigonbank', name: 'Ngân hàng TMCP Sài Gòn Công Thương'),
  BankInfo(bin: '970438', shortName: 'BaoViet Bank', name: 'Ngân hàng TMCP Bảo Việt'),
  BankInfo(bin: '970454', shortName: 'BVBank', name: 'Ngân hàng TMCP Bản Việt'),
  BankInfo(bin: '970452', shortName: 'Kienlongbank', name: 'Ngân hàng TMCP Kiên Long'),
  BankInfo(bin: '970419', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân'),
  BankInfo(bin: '970427', shortName: 'VietABank', name: 'Ngân hàng TMCP Việt Á'),
  BankInfo(bin: '970430', shortName: 'PGBank', name: 'Ngân hàng TMCP Xăng dầu Petrolimex'),
  BankInfo(bin: '970424', shortName: 'Shinhan Bank', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam'),
  BankInfo(bin: '970457', shortName: 'Woori Bank', name: 'Ngân hàng TNHH MTV Woori Việt Nam'),
  BankInfo(bin: '458761', shortName: 'HSBC', name: 'Ngân hàng TNHH MTV HSBC Việt Nam'),
  BankInfo(bin: '970410', shortName: 'Standard Chartered', name: 'Ngân hàng TNHH MTV Standard Chartered Việt Nam'),
  BankInfo(bin: '422589', shortName: 'CIMB', name: 'Ngân hàng TNHH MTV CIMB Việt Nam'),
  BankInfo(bin: '970439', shortName: 'Public Bank', name: 'Ngân hàng TNHH MTV Public Việt Nam'),
];
