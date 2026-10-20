/**
 * About and legal texts of the three apps (SH-006, D157): terms of use per app, and the model and data notice.
 * The server is the single source so a change of terms needs no app release; open-source licences are listed by each client.
 */

export const LEGAL_VERSION = '1.0';
export const LEGAL_EFFECTIVE_DATE = '2026-10-20';
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
      body: 'Dữ liệu được thu thập gồm họ tên, số điện thoại, vé đã đặt, địa chỉ đón hoặc trả tận nhà (nếu có) và lịch sử thanh toán. Dữ liệu dùng để xuất vé, liên hệ về chuyến và vận hành chuyến; chỉ nhà xe và tài xế của chuyến được xem. Dữ liệu được xử lý theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân và chỉ lưu trong thời gian cần cho các mục đích trên hoặc theo yêu cầu của pháp luật. Bạn có quyền yêu cầu xem, sửa hoặc xóa dữ liệu của mình qua tổng đài nhà xe.'
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
    model_notice: { title: 'Giấy phép mô hình và dữ liệu', sections: pick(MODEL_NOTICE, app) }
  };
}
