/**
 * Server-rendered legal and account deletion pages.
 * Rendered from core/legal.js texts with no external dependencies or assets.
 */
import { LEGAL_APPS, legalContent, PRIVACY_CONTACT_EMAIL } from '../core/legal.js';
import { OPERATORS } from '../core/operators.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

function formatEffectiveDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return isoDate;
}

/**
 * Renders terms of use or privacy policy page for an app.
 * Returns null if the app or document type is invalid.
 */
export function renderLegalPage(app, doc) {
  if (!LEGAL_APPS.includes(app) || (doc !== 'terms' && doc !== 'privacy')) {
    return null;
  }

  const content = legalContent(app);
  if (!content || !content[doc]) {
    return null;
  }

  const docData = content[doc];
  const otherDoc = doc === 'terms' ? 'privacy' : 'terms';
  const otherTitle = content[otherDoc].title;
  const effectiveDate = formatEffectiveDate(content.effective_date);

  const sectionsHtml = docData.sections.map(section => {
    const paragraphs = String(section.body || '')
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${esc(p)}</p>`)
      .join('');

    const links = Array.isArray(section.links) && section.links.length > 0
      ? `<ul class="links">${section.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label || l.url)}</a></li>`).join('')}</ul>`
      : '';

    return `    <section>
      <h2>${esc(section.heading)}</h2>
      ${paragraphs}
      ${links}
    </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(docData.title)} — BusGo</title>
<style>
  body {
    margin: 0;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background: #f8fafc;
  }
  main {
    max-width: 680px;
    margin: 0 auto;
    padding: 32px 16px 48px;
  }
  header {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e2e8f0;
  }
  .brand {
    font-size: 14px;
    font-weight: 700;
    color: #2563eb;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 26px;
    color: #0f172a;
    line-height: 1.3;
  }
  .meta {
    font-size: 14px;
    color: #64748b;
  }
  section {
    margin-bottom: 24px;
  }
  h2 {
    margin: 20px 0 8px;
    font-size: 18px;
    color: #1e293b;
    line-height: 1.4;
  }
  p {
    margin: 0 0 10px;
    color: #334155;
    line-height: 1.6;
  }
  ul.links {
    margin: 6px 0 12px;
    padding-left: 20px;
  }
  ul.links li {
    margin-bottom: 4px;
  }
  a {
    color: #2563eb;
    text-decoration: none;
  }
  a:hover, a:focus {
    text-decoration: underline;
  }
  .bottom-nav {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
  }
  .nav-title {
    font-size: 14px;
    font-weight: 600;
    color: #475569;
    margin-bottom: 8px;
  }
  .bottom-nav ul {
    margin: 0;
    padding-left: 20px;
  }
  .bottom-nav li {
    margin-bottom: 6px;
  }
</style>
</head>
<body>
<main>
  <header>
    <div class="brand">BusGo</div>
    <h1>${esc(docData.title)}</h1>
    <div class="meta">Phiên bản ${esc(content.version)} · hiệu lực từ ${esc(effectiveDate)}</div>
  </header>
${sectionsHtml}
  <nav class="bottom-nav">
    <div class="nav-title">Tài liệu và liên kết liên quan</div>
    <ul>
      <li><a href="/legal/${esc(app)}/${esc(otherDoc)}">${esc(otherTitle)}</a></li>
      ${app === 'passenger' ? '<li><a href="/xoa-tai-khoan">Xóa tài khoản</a></li>' : ''}
    </ul>
  </nav>
</main>
</body>
</html>`;
}

/**
 * 404 page for unknown legal documents.
 */
export function renderLegalNotFound() {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Không tìm thấy tài liệu — BusGo</title>
<style>
  body {
    margin: 0;
    font: 16px/1.5 system-ui, -apple-system, sans-serif;
    color: #0f172a;
    background: #f8fafc;
    padding: 48px 16px;
    text-align: center;
  }
  main {
    max-width: 480px;
    margin: 0 auto;
  }
  h1 {
    font-size: 24px;
    color: #1e293b;
    margin: 0 0 12px;
  }
  p {
    color: #475569;
    margin: 0 0 20px;
  }
  a {
    color: #2563eb;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
</style>
</head>
<body>
<main>
  <h1>404 — Không tìm thấy tài liệu</h1>
  <p>Tài liệu pháp lý bạn yêu cầu không tồn tại hoặc ứng dụng không hợp lệ.</p>
  <p><a href="/">Quay lại trang chủ</a></p>
</main>
</body>
</html>`;
}

/**
 * Account deletion request page for passenger accounts.
 */
export function renderAccountDeletionPage(operators = OPERATORS.filter(op => op.active !== false)) {
  const operatorOptions = operators.map(op => `        <option value="${esc(op.code)}">${esc(op.name)} (${esc(op.code)})</option>`).join('\n');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yêu cầu xóa tài khoản — BusGo</title>
<style>
  body {
    margin: 0;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background: #f8fafc;
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 32px 16px 48px;
  }
  header {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e2e8f0;
  }
  .brand {
    font-size: 14px;
    font-weight: 700;
    color: #2563eb;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 26px;
    color: #0f172a;
    line-height: 1.3;
  }
  .lead {
    font-size: 15px;
    color: #475569;
    margin: 0;
  }
  .card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  h2 {
    font-size: 17px;
    color: #1e293b;
    margin: 0 0 10px;
  }
  p {
    margin: 0 0 10px;
    color: #334155;
    font-size: 15px;
  }
  ul {
    margin: 0 0 12px;
    padding-left: 20px;
    color: #334155;
    font-size: 15px;
  }
  li {
    margin-bottom: 6px;
  }
  .form-group {
    margin-bottom: 16px;
  }
  label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #334155;
    margin-bottom: 6px;
  }
  .form-control {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    font-size: 16px;
    color: #0f172a;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-family: inherit;
  }
  .form-control:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }
  .btn {
    display: inline-block;
    padding: 10px 20px;
    font-size: 15px;
    font-weight: 600;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    text-align: center;
  }
  .btn-primary {
    background: #2563eb;
    color: #ffffff;
  }
  .btn-primary:hover {
    background: #1d4ed8;
  }
  .btn-danger {
    background: #dc2626;
    color: #ffffff;
  }
  .btn-danger:hover {
    background: #b91c1c;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .status-box {
    padding: 12px 16px;
    border-radius: 8px;
    margin: 16px 0;
    font-size: 14px;
    line-height: 1.5;
  }
  .status-box.info {
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
  }
  .status-box.error {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }
  .status-box.success {
    background: #f0fdf4;
    color: #166534;
    border: 1px solid #bbf7d0;
  }
  .alt-contact {
    margin-top: 24px;
    padding: 14px 16px;
    background: #f1f5f9;
    border-radius: 8px;
    font-size: 14px;
    color: #475569;
  }
  a {
    color: #2563eb;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .bottom-nav {
    margin-top: 36px;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    font-size: 14px;
  }
  .bottom-nav ul {
    margin: 0;
    padding-left: 20px;
  }
  .bottom-nav li {
    margin-bottom: 6px;
  }
</style>
</head>
<body>
<main>
  <header>
    <div class="brand">BusGo</div>
    <h1>Yêu cầu xóa tài khoản hành khách</h1>
    <p class="lead">Trang hỗ trợ xóa tài khoản và dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.</p>
  </header>

  <div class="card">
    <h2>Dữ liệu nào bị xóa và dữ liệu nào được lưu trữ ẩn danh?</h2>
    <p>Theo chính sách quyền riêng tư của BusGo và quy định pháp luật:</p>
    <ul>
      <li><strong>Dữ liệu bị xóa hoàn toàn:</strong> Phiên đăng nhập, thiết bị nhận thông báo đẩy và toàn bộ thông báo của bạn trên hệ thống sẽ bị xóa ngay lập tức. Bạn sẽ không thể đăng nhập lại vào tài khoản cũ.</li>
      <li><strong>Dữ liệu được lưu trữ ẩn danh:</strong> Dữ liệu vé và đơn hàng cũ chỉ còn lưu trữ dưới dạng ẩn danh (họ tên hành khách được thay thế bằng thông tin ẩn danh, số điện thoại được che giấu) nhằm phục vụ nghĩa vụ kế toán và đối soát vận tải của nhà xe theo quy định của pháp luật.</li>
      <li><strong>Điều kiện xóa tài khoản:</strong> Nếu bạn còn chuyến xe chưa khởi hành hoặc có yêu cầu hoàn tiền đang chờ xử lý, hệ thống sẽ từ chối xóa tài khoản cho đến khi chuyến đi hoàn tất hoặc thủ tục hoàn tiền được giải quyết xong.</li>
    </ul>
  </div>

  <div class="card">
    <h2>Cách xóa tài khoản trong ứng dụng BusGo</h2>
    <p>Nếu bạn vẫn đang cài đặt ứng dụng BusGo trên điện thoại, bạn có thể tự xóa tài khoản một cách nhanh chóng:</p>
    <p>Vào mục <strong>Cá nhân &gt; Xóa tài khoản</strong> và xác nhận theo hướng dẫn trên màn hình.</p>
  </div>

  <div class="card" id="deletion-card">
    <h2>Xóa tài khoản trực tuyến (khi không còn ứng dụng)</h2>
    <p>Nếu không còn cài đặt app, bạn hãy chọn nhà xe và xác nhận bằng số điện thoại dưới đây:</p>

    <div id="deletion-form">
      <div class="form-group">
        <label for="operator-select">Nhà xe bạn đã đăng ký tài khoản</label>
        <select id="operator-select" class="form-control">
${operatorOptions}
        </select>
      </div>

      <div class="form-group">
        <label for="phone-input">Số điện thoại đăng ký tài khoản</label>
        <input type="tel" id="phone-input" class="form-control" placeholder="Ví dụ: 0912345678" maxlength="15" autocomplete="tel">
      </div>

      <div class="form-group">
        <button type="button" id="btn-request-otp" class="btn btn-primary">Gửi mã OTP</button>
      </div>

      <div id="step-confirm" style="display: none; margin-top: 20px; padding-top: 16px; border-top: 1px dashed #cbd5e1;">
        <div class="form-group">
          <label for="otp-input">Mã OTP (gồm 6 số nhận qua tin nhắn SMS)</label>
          <input type="text" id="otp-input" class="form-control" placeholder="Nhập 6 số OTP" maxlength="6" autocomplete="one-time-code">
        </div>

        <div class="form-group">
          <label for="confirm-text-input">Xác nhận: Nhập chữ <strong>XÓA</strong> vào ô dưới đây</label>
          <input type="text" id="confirm-text-input" class="form-control" placeholder="Nhập chữ XÓA để xác nhận">
        </div>

        <div class="form-group">
          <button type="button" id="btn-delete" class="btn btn-danger">Xác nhận xóa tài khoản</button>
        </div>
      </div>
    </div>

    <div id="status-box" class="status-box" style="display: none;" role="alert"></div>
  </div>

  <div class="alt-contact">
    <strong>Liên hệ hỗ trợ dữ liệu cá nhân:</strong><br>
    Nếu gặp khó khăn hoặc có thắc mắc về quyền riêng tư, bạn có thể gửi email trực tiếp tới bộ phận bảo vệ dữ liệu cá nhân:
    <a href="mailto:${esc(PRIVACY_CONTACT_EMAIL)}">${esc(PRIVACY_CONTACT_EMAIL)}</a>.
  </div>

  <nav class="bottom-nav">
    <div class="nav-title">Chính sách &amp; Điều khoản</div>
    <ul>
      <li><a href="/legal/passenger/privacy">Chính sách quyền riêng tư</a></li>
      <li><a href="/legal/passenger/terms">Điều khoản sử dụng</a></li>
    </ul>
  </nav>
</main>

<script>
(function() {
  var opSelect = document.getElementById('operator-select');
  var phoneInput = document.getElementById('phone-input');
  var btnRequestOtp = document.getElementById('btn-request-otp');
  var stepConfirm = document.getElementById('step-confirm');
  var otpInput = document.getElementById('otp-input');
  var confirmTextInput = document.getElementById('confirm-text-input');
  var btnDelete = document.getElementById('btn-delete');
  var statusBox = document.getElementById('status-box');
  var deletionForm = document.getElementById('deletion-form');

  function showStatus(msg, type) {
    statusBox.textContent = msg;
    statusBox.className = 'status-box ' + type;
    statusBox.style.display = 'block';
  }

  function hideStatus() {
    statusBox.style.display = 'none';
    statusBox.textContent = '';
  }

  btnRequestOtp.addEventListener('click', function() {
    hideStatus();
    var phone = (phoneInput.value || '').trim();
    var opCode = opSelect.value;
    if (!phone) {
      showStatus('Vui lòng nhập số điện thoại.', 'error');
      return;
    }
    btnRequestOtp.disabled = true;
    btnRequestOtp.textContent = 'Đang gửi...';

    fetch('/api/v1/auth/passenger/otp/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Code': opCode
      },
      body: JSON.stringify({ phone: phone })
    })
    .then(function(res) {
      return res.json().then(function(json) { return { status: res.status, json: json }; });
    })
    .then(function(result) {
      btnRequestOtp.disabled = false;
      btnRequestOtp.textContent = 'Gửi lại mã OTP';
      if (result.json && result.json.status === 'success') {
        stepConfirm.style.display = 'block';
        otpInput.focus();
        showStatus('Mã OTP đã được gửi tới số điện thoại của bạn qua tin nhắn SMS.', 'info');
      } else {
        var err = (result.json && (result.json.message || result.json.error)) || 'Không thể gửi mã OTP. Vui lòng thử lại.';
        showStatus(err, 'error');
      }
    })
    .catch(function() {
      btnRequestOtp.disabled = false;
      btnRequestOtp.textContent = 'Gửi mã OTP';
      showStatus('Lỗi kết nối máy chủ. Vui lòng thử lại sau.', 'error');
    });
  });

  btnDelete.addEventListener('click', function() {
    hideStatus();
    var phone = (phoneInput.value || '').trim();
    var opCode = opSelect.value;
    var otp = (otpInput.value || '').trim();
    var confirmText = (confirmTextInput.value || '').trim();

    if (!otp) {
      showStatus('Vui lòng nhập mã OTP nhận được.', 'error');
      return;
    }
    // XÓA may come with a combining accent from a Vietnamese keyboard; XOA is accepted too.
    if (['XÓA', 'XO\u0301A', 'XOA'].indexOf(confirmText.toUpperCase()) < 0) {
      showStatus('Vui lòng nhập chính xác chữ XÓA để xác nhận.', 'error');
      return;
    }

    btnDelete.disabled = true;
    btnDelete.textContent = 'Đang xử lý...';

    fetch('/api/v1/auth/passenger/otp/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Code': opCode
      },
      body: JSON.stringify({ phone: phone, otp: otp })
    })
    .then(function(res) {
      return res.json().then(function(json) { return { status: res.status, json: json }; });
    })
    .then(function(result) {
      if (!result.json || result.json.status !== 'success' || !result.json.data || !result.json.data.token) {
        var err = (result.json && (result.json.message || result.json.error)) || 'Mã OTP không hợp lệ hoặc đã hết hạn.';
        throw new Error(err);
      }
      var token = result.json.data.token;
      return fetch('/api/v1/passenger/me', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + token,
          'X-Operator-Code': opCode
        }
      }).then(function(delRes) {
        return delRes.json().then(function(json) { return { status: delRes.status, json: json }; });
      });
    })
    .then(function(delResult) {
      btnDelete.disabled = false;
      btnDelete.textContent = 'Xác nhận xóa tài khoản';
      if (delResult.json && delResult.json.status === 'success') {
        deletionForm.style.display = 'none';
        showStatus('Tài khoản của bạn tại nhà xe đã được xóa thành công. Toàn bộ phiên đăng nhập đã bị vô hiệu hóa.', 'success');
      } else {
        var err = (delResult.json && (delResult.json.message || delResult.json.error)) || 'Không thể xóa tài khoản. Vui lòng kiểm tra lại.';
        showStatus(err, 'error');
      }
    })
    .catch(function(err) {
      btnDelete.disabled = false;
      btnDelete.textContent = 'Xác nhận xóa tài khoản';
      showStatus(err.message || 'Lỗi xử lý. Vui lòng thử lại.', 'error');
    });
  });
})();
</script>
</body>
</html>`;
}
