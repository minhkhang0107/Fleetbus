/**
 * About and legal texts of the three apps (SH-006, D157): terms of use per app, and the model and data notice.
 * The server is the single source so a change of terms needs no app release; open-source licences are listed by each client.
 */

export const LEGAL_VERSION = '1.1';
export const LEGAL_EFFECTIVE_DATE = '2026-10-29';
/** Where people write about their personal data (privacy policy, deletion requests). */
export const PRIVACY_CONTACT_EMAIL = process.env.FLEETBUS_PRIVACY_EMAIL || 'mjnhkhang1@gmail.com';
export const LEGAL_APPS = ['passenger', 'driver', 'manager'];

const COMMON_CLOSING = [
  {
    heading: 'Thay đổi điều khoản',
    body: 'Điều khoản có thể được cập nhật khi dịch vụ hoặc quy định pháp luật thay đổi. Mỗi lần cập nhật có số phiên bản và ngày hiệu lực ở đầu trang. Tiếp tục sử dụng sau ngày hiệu lực nghĩa là bạn đồng ý với phiên bản mới.'
  },
  {
    heading: 'Luật áp dụng',
    body: 'Điều khoản này được điều chỉnh theo pháp luật Việt Nam. Tranh chấp được ưu tiên giải quyết bằng thương lượng; nếu không thành, đưa ra cơ quan có thẩm quyền tại Việt Nam.'
  }
];

const TERMS = {
  passenger: [
    {
      heading: 'Phạm vi dịch vụ',
      body: 'BusGo là phần mềm giúp bạn tìm chuyến, giữ ghế, thanh toán và theo dõi xe của nhà xe bạn chọn. Hợp đồng vận chuyển được lập giữa bạn và nhà xe; nhà xe chịu trách nhiệm về chuyến đi, giá vé và chính sách của mình theo quy định pháp luật.'
    },
    {
      heading: 'Tài khoản',
      body: 'Bạn đăng nhập bằng số điện thoại và mã OTP gửi qua tin nhắn. Không đưa mã OTP cho người khác; nhà xe và BusGo không bao giờ hỏi mã này. Vé gắn với số điện thoại đã đặt.'
    },
    {
      heading: 'Giữ ghế và thanh toán',
      body: 'Ghế được giữ 10 phút để bạn thanh toán; hết thời gian, ghế được nhả cho người khác. Vé chỉ được xuất khi ngân hàng xác nhận đã nhận đúng số tiền và đúng nội dung chuyển khoản. Giá hiển thị khi thanh toán là số tiền cuối cùng, đã trừ mã giảm giá nếu có.'
    },
    {
      heading: 'Hủy vé và hoàn tiền',
      body: 'Hủy từ 12 giờ trước giờ chạy được hoàn 100%, từ 6 đến dưới 12 giờ hoàn 80%, dưới 6 giờ không hoàn. Chuyến chậm hơn 30 phút so với giờ chạy được hoàn 100%, không phí. Nếu nhà xe không nhận đón hoặc trả tận nhà, bạn được hoàn 100% phần tiền còn lại. Mức hoàn cụ thể luôn hiện trước khi bạn xác nhận hủy.'
    },
    {
      heading: 'Lên xe',
      body: 'Có mặt ở điểm đón trước 15 phút. Mỗi vé chỉ lên xe một lần; vé vẫn dùng được khi mất mạng. Bạn có thể chia sẻ vé cho người đi cùng; người nhận dùng vé như chính bạn.'
    },
    {
      heading: 'Vị trí và thông báo',
      body: 'App chỉ dùng vị trí của bạn khi bạn cho phép, để gợi ý điểm đón gần nhất. Vị trí xe của chuyến được hiện cho hành khách của chuyến và người nhận link theo dõi, và ngừng hiện khi chuyến kết thúc. Thông báo dùng để báo xe sắp tới, xe đang chờ và thay đổi của chuyến; bạn có thể tắt trong cài đặt của điện thoại.'
    },
    {
      heading: 'Dữ liệu cá nhân',
      body: 'Dữ liệu được thu thập gồm họ tên, số điện thoại, vé đã đặt, địa chỉ đón hoặc trả tận nhà (nếu có) và lịch sử thanh toán. Dữ liệu dùng để xuất vé, liên hệ về chuyến và vận hành chuyến; chỉ nhà xe và tài xế của chuyến được xem. Dữ liệu được xử lý theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân và chỉ lưu trong thời gian cần cho các mục đích trên hoặc theo yêu cầu của pháp luật. Chi tiết, quyền của bạn và cách xóa tài khoản ở mục "Chính sách quyền riêng tư".'
    },
    {
      heading: 'Hành vi không được phép',
      body: 'Không giữ ghế hàng loạt mà không có ý định đi, không dùng vé giả hoặc vé của người khác khi chưa được chia sẻ, không gian lận thanh toán hoặc mã giảm giá, không can thiệp vào hệ thống. Nhà xe có quyền từ chối phục vụ hoặc khóa tài khoản vi phạm.'
    },
    {
      heading: 'Giờ dự kiến',
      body: 'Giờ đón, giờ xe tới và vị trí xe trên bản đồ là thông tin tham khảo, có thể lệch do giao thông, thời tiết hoặc tín hiệu định vị. Khi cần, hãy gọi tổng đài nhà xe.'
    }
  ],
  driver: [
    {
      heading: 'Đối tượng sử dụng',
      body: 'App dành cho tài xế và phụ xe được nhà xe cấp tài khoản. Bạn đăng nhập bằng mã nhà xe, mã nhân viên hoặc số điện thoại, và mã PIN 6 số. Không đưa mã PIN cho người khác; lần đầu đăng nhập phải đổi mã PIN. Mọi thao tác trên tài khoản được tính là của bạn.'
    },
    {
      heading: 'Vị trí trong ca',
      body: 'Vị trí của điện thoại, kể cả khi app chạy nền, chỉ được ghi từ lúc bạn vào chuyến đến khi kết thúc chuyến. Vị trí được gửi cho điều hành của nhà xe và hành khách của chuyến để biết xe đang ở đâu. App không ghi vị trí ngoài ca.'
    },
    {
      heading: 'An toàn khi lái xe',
      body: 'Không thao tác trên app khi đang lái xe. Dừng xe ở nơi an toàn hoặc nhờ phụ xe thao tác.'
    },
    {
      heading: 'Soát vé và thu tiền',
      body: 'Soát vé bằng mã QR hoặc danh sách khách; chỉ đánh dấu khách vắng mặt khi đã hết thời gian chờ theo quy định. Ghi đúng số tiền mặt thu của khách (thu hộ, khách đón dọc đường) và nộp đủ cho nhà xe khi kết thúc ca.'
    },
    {
      heading: 'Báo sự cố',
      body: 'Báo sự cố và thời gian chậm dự kiến trung thực, ngay khi biết, để điều hành và hành khách được báo kịp thời.'
    },
    {
      heading: 'Dữ liệu của hành khách',
      body: 'Tên, số điện thoại và địa chỉ của hành khách chỉ được dùng để phục vụ chuyến. Không chụp, lưu, chép hoặc chia sẻ ra ngoài app.'
    },
    {
      heading: 'Dữ liệu của bạn',
      body: 'Nhà xe lưu họ tên, mã nhân viên, số điện thoại, thông tin bằng lái, lịch chạy, vị trí trong ca và nhật ký thao tác của bạn để điều hành và đối soát, theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. Bạn có quyền yêu cầu xem hoặc sửa dữ liệu của mình qua điều độ nhà xe.'
    }
  ],
  manager: [
    {
      heading: 'Đối tượng sử dụng',
      body: 'Trang điều hành dành cho nhân viên nhà xe được cấp tài khoản: giám đốc, điều độ, phòng vé và kế toán. Mỗi người dùng một tài khoản riêng, không dùng chung. Tài khoản giám đốc nhà xe và kế toán phải bật xác thực 2 bước.'
    },
    {
      heading: 'Quyền và nhật ký',
      body: 'Mỗi vai trò chỉ thấy và làm được phần việc của mình. Mọi thao tác thay đổi dữ liệu được ghi vào nhật ký thao tác, không sửa hoặc xóa được.'
    },
    {
      heading: 'Dữ liệu hành khách và tài xế',
      body: 'Nhà xe là bên kiểm soát dữ liệu cá nhân của hành khách và tài xế; BusGo là bên xử lý dữ liệu theo yêu cầu của nhà xe. Chỉ dùng dữ liệu cho việc bán vé và điều hành chuyến; không xuất, sao chép hoặc chia sẻ ra ngoài trái với Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.'
    },
    {
      heading: 'Nội dung nhà xe đăng',
      body: 'Nhà xe chịu trách nhiệm về giá vé, lịch chạy, chính sách hủy vé, quảng cáo và mã giảm giá mình đăng, và bảo đảm đúng quy định về giá và quảng cáo.'
    },
    {
      heading: 'Bảo mật',
      body: 'Đăng xuất khi rời máy dùng chung. Báo ngay cho quản trị nền tảng khi nghi tài khoản bị lộ để khóa và cấp lại.'
    }
  ]
};

// Privacy policy of each app (Google Play and App Store ask for one, inside the app and at a public URL; Nghị định
// 13/2023/NĐ-CP). It says what the code collects, nothing more: keep it in step with the apps and the server.
const PRIVACY = {
  passenger: [
    {
      heading: 'Ai chịu trách nhiệm về dữ liệu của bạn',
      body: 'Nhà xe bạn đặt vé là bên kiểm soát dữ liệu cá nhân của bạn. BusGo cung cấp phần mềm và máy chủ, là bên xử lý dữ liệu theo yêu cầu của nhà xe. Chính sách này áp dụng cho ứng dụng BusGo dành cho hành khách và trang theo dõi chuyến xe.'
    },
    {
      heading: 'Dữ liệu chúng tôi thu thập',
      body: '(1) Số điện thoại để đăng nhập bằng mã OTP. (2) Họ tên và số điện thoại của hành khách trên vé. (3) Địa chỉ và vị trí ghim trên bản đồ khi bạn đặt đón hoặc trả tận nhà. (4) Vé, đơn, số tiền, nội dung chuyển khoản và mã giao dịch ngân hàng của vé; chúng tôi không thu thập số thẻ hay mật khẩu ngân hàng. (5) Số tài khoản, ngân hàng và tên chủ tài khoản bạn nhập để nhận tiền hoàn khi hủy vé đã chuyển khoản. (6) Vị trí của điện thoại, chỉ khi bạn cho phép và chỉ lúc app đang mở, để gợi ý điểm đón; app không theo dõi vị trí của bạn khi chạy nền. (7) Mã thiết bị nhận thông báo đẩy. (8) Địa chỉ IP và thời điểm truy cập, để chống lạm dụng và bảo vệ tài khoản.'
    },
    {
      heading: 'Mục đích sử dụng',
      body: 'Xuất vé và cho bạn lên xe; báo cho bạn về chuyến (xe sắp tới, xe đang chờ, thay đổi giờ); đón hoặc trả tận nhà; đối soát thanh toán và hoàn tiền; chăm sóc khách hàng; bảo vệ tài khoản và chống gian lận; thực hiện nghĩa vụ pháp luật của nhà xe (kế toán, vận tải hành khách). Chúng tôi không bán dữ liệu, không dùng dữ liệu để quảng cáo và không gửi dữ liệu tới mô hình trí tuệ nhân tạo.'
    },
    {
      heading: 'Chia sẻ dữ liệu',
      body: 'Nhà xe và tài xế của chuyến thấy tên, ghế, điểm đón và trả của bạn. Tài xế thấy số điện thoại đã che; khi cần gọi bạn lúc đón, tài xế mở được số đầy đủ và mỗi lần mở được ghi vào nhật ký chuyến. Nhà cung cấp tin nhắn SMS nhận số điện thoại và nội dung tin (mã OTP, thông báo chuyến). Google Firebase Cloud Messaging nhận mã thiết bị và nội dung thông báo ngắn. Máy chủ bản đồ OpenStreetMap France nhận địa chỉ IP và vùng bản đồ bạn xem. Ngân hàng và cổng đối soát chuyển khoản của nhà xe nhận thông tin giao dịch bạn chuyển. Người nhận link theo dõi hoặc vé bạn chia sẻ thấy chuyến và điểm đón của vé đó. Cơ quan nhà nước có thẩm quyền khi pháp luật yêu cầu.'
    },
    {
      heading: 'Lưu trữ và bảo mật',
      body: 'Dữ liệu lưu trên máy chủ do BusGo quản lý, trong cơ sở dữ liệu riêng của từng nhà xe, được mã hóa; đường truyền giữa app và máy chủ được mã hóa. Chỉ nhân viên nhà xe có quyền mới xem được dữ liệu, mọi thao tác được ghi nhật ký. Tài khoản được giữ đến khi bạn xóa. Vé, đơn và chứng từ thanh toán được giữ theo thời hạn pháp luật kế toán yêu cầu. Vị trí xe chỉ hiện trong chuyến. Bản sao lưu được xoay vòng và tự xóa sau khoảng 7 ngày.'
    },
    {
      heading: 'Quyền của bạn và cách xóa tài khoản',
      body: 'Theo Nghị định 13/2023/NĐ-CP, bạn có quyền được biết, xem, sửa, xóa dữ liệu, rút lại sự đồng ý và phản đối việc xử lý. Xóa tài khoản ngay trong app: Cá nhân > Xóa tài khoản. Không còn app thì vào trang xóa tài khoản trên web (đường dẫn ở cuối chính sách này) và xác nhận bằng mã OTP gửi tới số điện thoại. Khi xóa, phiên đăng nhập, thiết bị nhận thông báo và thông báo bị xóa; vé và đơn cũ chỉ còn ở dạng ẩn danh cho sổ sách của nhà xe. Bạn có thể tắt quyền vị trí và thông báo bất cứ lúc nào trong cài đặt của điện thoại.'
    },
    {
      heading: 'Trẻ em',
      body: 'App dành cho người từ 16 tuổi. Vé cho trẻ em do cha mẹ hoặc người giám hộ đặt.'
    }
  ],
  driver: [
    {
      heading: 'Ai chịu trách nhiệm về dữ liệu của bạn',
      body: 'Nhà xe nơi bạn làm việc là bên kiểm soát dữ liệu cá nhân của bạn và tạo tài khoản cho bạn. BusGo cung cấp phần mềm và máy chủ, là bên xử lý dữ liệu theo yêu cầu của nhà xe. Chính sách này áp dụng cho ứng dụng BusGo Driver.'
    },
    {
      heading: 'Dữ liệu chúng tôi thu thập',
      body: '(1) Họ tên, mã nhân viên, số điện thoại, hạng và hạn bằng lái do nhà xe nhập. (2) Vị trí chính xác của điện thoại trong ca chạy, kể cả khi app đóng hoặc không được sử dụng, từ lúc bạn bấm đi đón khách hoặc xuất bến tới khi kết thúc chuyến; ngoài ca app không lấy vị trí. (3) Thao tác trong ca: kiểm tra xe, quét vé, cho khách lên xe, thu tiền, báo sự cố kèm ghi chú. (4) Địa chỉ IP và thời điểm truy cập. Camera chỉ dùng để quét mã QR trên vé; hình ảnh được xử lý trên máy, không gửi đi.'
    },
    {
      heading: 'Mục đích sử dụng',
      body: 'Cho hành khách và điều hành biết xe đang ở đâu và khi nào tới; xếp lịch chạy; đối soát vé và tiền mặt; xử lý sự cố; bảo vệ tài khoản. Chúng tôi không bán dữ liệu và không dùng dữ liệu để quảng cáo.'
    },
    {
      heading: 'Chia sẻ dữ liệu',
      body: 'Vị trí xe được gửi tới điều hành của nhà xe và tới hành khách của chuyến (và người họ chia sẻ link theo dõi) trong lúc chuyến chạy. Thao tác trong ca được nhà xe xem để đối soát. Máy chủ bản đồ OpenStreetMap France nhận địa chỉ IP và vùng bản đồ app hiển thị. Cơ quan nhà nước có thẩm quyền khi pháp luật yêu cầu.'
    },
    {
      heading: 'Lưu trữ và bảo mật',
      body: 'Dữ liệu lưu trên máy chủ do BusGo quản lý, trong cơ sở dữ liệu riêng của nhà xe, được mã hóa; đường truyền được mã hóa. Thời gian lưu do nhà xe quyết định theo quy định lao động, vận tải và kế toán. Bản sao lưu tự xóa sau khoảng 7 ngày.'
    },
    {
      heading: 'Quyền của bạn',
      body: 'Theo Nghị định 13/2023/NĐ-CP, bạn có quyền được biết, xem, sửa, xóa dữ liệu và rút lại sự đồng ý. Tài khoản do nhà xe tạo và đóng: liên hệ điều độ hoặc giám đốc nhà xe để xem, sửa hoặc xóa tài khoản. Bạn có thể tắt quyền vị trí bất cứ lúc nào trong cài đặt của điện thoại; khi đó hành khách không thấy vị trí xe.'
    }
  ],
  manager: [
    {
      heading: 'Ai chịu trách nhiệm về dữ liệu',
      body: 'Nhà xe là bên kiểm soát dữ liệu của hành khách, tài xế và nhân viên văn phòng; BusGo là bên xử lý dữ liệu. Trang điều hành chỉ dành cho nhân viên do nhà xe cấp tài khoản.'
    },
    {
      heading: 'Dữ liệu và nhật ký',
      body: 'Trang lưu tài khoản nhân viên (email, họ tên, vai trò, khóa xác thực 2 bước), mọi thao tác kèm địa chỉ IP trong nhật ký không sửa được, và dữ liệu vận hành của nhà xe. Dữ liệu được mã hóa, chỉ người có quyền mới xem.'
    }
  ]
};

const PRIVACY_CLOSING = {
  heading: 'Liên hệ',
  body: `Về dữ liệu cá nhân, liên hệ tổng đài của nhà xe (trong app) hoặc BusGo qua email ${PRIVACY_CONTACT_EMAIL}. Chính sách có thể được cập nhật; mỗi bản có số phiên bản và ngày hiệu lực ở đầu trang.`
};

const MODEL_NOTICE = [
  {
    heading: 'Mô hình trí tuệ nhân tạo',
    body: 'BusGo không tích hợp, không gọi và không gửi dữ liệu tới mô hình trí tuệ nhân tạo hay học máy nào. Giờ đón dự kiến, giờ xe tới và vị trí xe được tính theo lịch chạy, lộ trình và vị trí định vị của xe.'
  },
  {
    heading: 'Dữ liệu bản đồ',
    body: 'Dữ liệu bản đồ © những người đóng góp OpenStreetMap, cấp phép theo Open Database License (ODbL) 1.0. Ảnh bản đồ do OpenStreetMap France cung cấp. Hình dạng tuyến đường được lấy một lần từ bộ định tuyến OSRM trên dữ liệu OpenStreetMap và lưu sẵn trên máy chủ.',
    links: [
      { label: 'OpenStreetMap — bản quyền', url: 'https://www.openstreetmap.org/copyright' },
      { label: 'Open Database License 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' }
    ]
  },
  {
    heading: 'Phông chữ',
    apps: ['passenger', 'driver'],
    body: 'Phông Geist (© The Geist Project Authors) và JetBrains Mono (© The JetBrains Mono Project Authors), cấp phép theo SIL Open Font License 1.1. Toàn văn giấy phép có trong mục "Giấy phép mã nguồn mở".',
    links: [{ label: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org' }]
  },
  {
    heading: 'Dịch vụ bên thứ ba',
    apps: ['passenger'],
    body: 'Thông báo đẩy được gửi qua Firebase Cloud Messaging của Google; dịch vụ chỉ nhận mã thiết bị và lời thông báo ngắn về chuyến, không nhận số điện thoại hay thông tin thanh toán của bạn.'
  }
];

const pick = (sections, app) => sections.filter(s => !s.apps || s.apps.includes(app)).map(({ apps, ...s }) => s);

/** The about and legal content one app shows; null for an unknown app. */
export function legalContent(app) {
  if (!LEGAL_APPS.includes(app)) return null;
  return {
    app,
    version: LEGAL_VERSION,
    effective_date: LEGAL_EFFECTIVE_DATE,
    terms: { title: 'Điều khoản sử dụng', sections: [...TERMS[app], ...COMMON_CLOSING] },
    privacy: { title: 'Chính sách quyền riêng tư', sections: [...PRIVACY[app], PRIVACY_CLOSING] },
    model_notice: { title: 'Giấy phép mô hình và dữ liệu', sections: pick(MODEL_NOTICE, app) }
  };
}
