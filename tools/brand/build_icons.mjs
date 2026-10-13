// Renders the BusGo icons of both apps from marks.mjs with headless Chrome: Android launcher (legacy + adaptive +
// monochrome), notification icon, launch screen logo, iOS app icons, and the in-app logo. Run: node tools/brand/build_icons.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { svg, THEMES } from './marks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const jobs = [];
const files = [];
for (const app of ['passenger', 'driver']) {
  const t = app;
  const res = path.join(ROOT, `source/${app}/app/android/app/src/main/res`);
  for (const [d, k] of Object.entries(DENSITIES)) {
    jobs.push({ kind: 'rounded', theme: t, size: 48 * k, out: `${res}/mipmap-${d}/ic_launcher.png` });
    jobs.push({ kind: 'foreground', theme: t, size: 108 * k, out: `${res}/mipmap-${d}/ic_launcher_foreground.png` });
    jobs.push({ kind: 'background', theme: t, size: 108 * k, out: `${res}/mipmap-${d}/ic_launcher_background.png` });
    jobs.push({ kind: 'monochrome', theme: t, size: 108 * k, out: `${res}/mipmap-${d}/ic_launcher_monochrome.png` });
    jobs.push({ kind: 'notification', theme: t, size: 24 * k, out: `${res}/drawable-${d}/ic_stat_busgo.png` });
    // Launch screen logo, 96dp, and the Android 12 splash icon (the mark inside its 2/3 safe circle).
    jobs.push({ kind: 'rounded', theme: t, size: 96 * k, out: `${res}/drawable-${d}/splash_logo.png` });
    jobs.push({ kind: 'foreground', theme: t, size: 288 * k, out: `${res}/drawable-${d}/splash_icon.png` });
  }
  files.push([`${res}/mipmap-anydpi-v26/ic_launcher.xml`, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`]);
  const icons = path.join(ROOT, `source/${app}/app/ios/Runner/Assets.xcassets/AppIcon.appiconset`);
  const contents = JSON.parse(fs.readFileSync(`${icons}/Contents.json`, 'utf8'));
  for (const img of contents.images) {
    const px = Math.round(parseFloat(img.size) * parseInt(img.scale, 10));
    jobs.push({ kind: 'square', theme: t, size: px, out: `${icons}/${img.filename}` });
  }
  // iOS launch screen: the logo at 96pt on the brand colour (LaunchScreen.storyboard).
  const launch = path.join(ROOT, `source/${app}/app/ios/Runner/Assets.xcassets/LaunchImage.imageset`);
  for (const [suffix, k] of [['', 1], ['@2x', 2], ['@3x', 3]]) jobs.push({ kind: 'rounded', theme: t, size: 96 * k, out: `${launch}/LaunchImage${suffix}.png` });
  jobs.push({ kind: 'rounded', theme: t, size: 512, out: path.join(ROOT, `source/${app}/app/assets/brand/logo.png`) });
  jobs.push({ kind: 'mark', theme: t, size: 512, out: path.join(ROOT, `source/${app}/app/assets/brand/mark.png`) });
}
// The design sources next to the generator.
for (const app of ['passenger', 'driver']) {
  files.push([path.join(ROOT, `tools/brand/${app}_icon.svg`), svg.rounded(THEMES[app])]);
}

const unique = [...new Map(jobs.map(j => [j.out, j])).values()];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'busgo-brand-'));
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${tmp}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9335/json')).json(); if (targets.find(t => t.type === 'page')) break; } catch {} await sleep(250); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const j of unique) {
  await send('Emulation.setDeviceMetricsOverride', { width: j.size, height: j.size, deviceScaleFactor: 1, mobile: false });
  const html = `<html><body style="margin:0;background:transparent">${svg[j.kind](THEMES[j.theme]).replace('<svg ', `<svg width="${j.size}" height="${j.size}" `)}</body></html>`;
  await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') });
  await sleep(120);
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: j.size, height: j.size, scale: 1 } });
  fs.mkdirSync(path.dirname(j.out), { recursive: true });
  fs.writeFileSync(j.out, Buffer.from(r.result.data, 'base64'));
}
ws.close();
await new Promise(r => { chrome.once('exit', r); chrome.kill(); });
fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
for (const [file, text] of files) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
console.log(`rendered ${unique.length} images, wrote ${files.length} files`);
