/**
 * Onboarding page of a bus company (/o/:code): what the company prints or shares so its passengers
 * install the app and type the right company code. The QR encodes this page's own URL.
 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderOnboardingPage(op, pageUrl) {
  const color = /^#[0-9A-Fa-f]{6}$/.test(op.primary_color || '') ? op.primary_color : '#2563EB';
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(op.name)} — BusGo</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #f8fafc; }
  main { max-width: 440px; margin: 0 auto; padding: 32px 16px; text-align: center; }
  h1 { margin: 0 0 4px; font-size: 24px; color: ${color}; }
  .code { font: 700 36px/1.2 ui-monospace, Menlo, monospace; letter-spacing: 2px; margin: 20px 0 8px; padding: 12px; border: 2px dashed ${color}; border-radius: 12px; background: #fff; }
  #qr { display: inline-block; padding: 12px; background: #fff; border-radius: 12px; margin: 16px 0; }
  #qr img, #qr svg { display: block; width: 220px; height: 220px; }
  ol { text-align: left; padding-left: 22px; }
  .muted { color: #475569; font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>${esc(op.name)}</h1>
  ${op.hotline ? `<div class="muted">Tổng đài ${esc(op.hotline)}</div>` : ''}
  <div class="code">${esc(op.code)}</div>
  <div class="muted">Mã nhà xe</div>
  <div id="qr" aria-label="Mã QR của trang này"></div>
  <ol>
    <li>Cài và mở app BusGo.</li>
    <li>Nhập mã nhà xe <b>${esc(op.code)}</b>.</li>
    <li>Đăng nhập bằng số điện thoại để đặt chỗ và theo dõi xe.</li>
  </ol>
</main>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
<script>
  try {
    var qr = qrcode(0, 'M');
    qr.addData(${JSON.stringify(pageUrl).replace(/</g, '\\u003c')});
    qr.make();
    document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch (e) {
    document.getElementById('qr').textContent = 'Không tạo được mã QR';
  }
</script>
</body>
</html>`;
}

export function renderOnboardingNotFound() {
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Không tìm thấy nhà xe</title></head>'
    + '<body style="font-family:system-ui,sans-serif;text-align:center;padding:40px 16px"><h1>Không tìm thấy nhà xe</h1><p>Mã nhà xe không đúng hoặc nhà xe đang tạm ngừng hoạt động.</p></body></html>';
}
