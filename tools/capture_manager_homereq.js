import { spawn } from 'node:child_process';
import fs from 'node:fs';

async function main() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1600,1000'
  ]);

  try {
    let pageTarget = null;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const list = await fetch('http://127.0.0.1:9225/json/list').then(r => r.json());
        pageTarget = list.find(t => t.type === 'page');
        if (pageTarget) break;
      } catch (_) {}
    }

    if (!pageTarget) throw new Error('No page target found');
    console.log('Target found:', pageTarget.id);

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        const onMsg = (evt) => {
          const res = JSON.parse(evt.data);
          if (res.id === msgId) {
            ws.removeEventListener('message', onMsg);
            if (res.error) reject(res.error);
            else resolve(res.result);
          }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    console.log('Navigating to http://localhost:3000/manager ...');
    await send('Page.navigate', { url: 'http://localhost:3000/manager' });
    await new Promise(r => setTimeout(r, 1500));

    console.log('Submitting login form...');
    await send('Runtime.evaluate', {
      expression: `
        document.querySelector('#u').value = 'dispatcher@busgo.vn';
        document.querySelector('#p').value = 'disp123';
        document.querySelector('#loginBtn').click();
      `
    });

    console.log('Waiting for Dashboard to load...');
    await new Promise(r => setTimeout(r, 3000));

    // Switch to Home Requests Tab
    console.log('Switching to Duyệt đón tận nhà tab...');
    await send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button[data-view="homereq"]');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 2500));

    let shot = await send('Page.captureScreenshot');
    fs.writeFileSync('/tmp/man_mgr_homereq_pending.png', Buffer.from(shot.data, 'base64'));
    console.log('✅ Saved /tmp/man_mgr_homereq_pending.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().then(() => {
  console.log('Done capturing Manager Home Request screen!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
