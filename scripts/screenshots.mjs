// Regenerates the README screenshots (docs/) and the store images
// (store/assets/). It loads the built extension into a throwaway headless
// Chrome profile, fills it with a week of demo data, and captures the real
// pages. Then it renders store/slides.html at the exact sizes the stores need.
//
//   npm run build && npm run screenshots
//
// Needs Google Chrome. Set CHROME_PATH if it isn't installed in the usual place.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const EXT = join(root, 'dist', 'chromium');
const RAW = join(root, 'store', '.raw');
const ASSETS = join(root, 'store', 'assets');
const DOCS = join(root, 'docs');

const CHROME =
  process.env.CHROME_PATH ??
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  }[process.platform] ??
  'google-chrome';

// ---- Minimal Chrome DevTools Protocol client over --remote-debugging-pipe ----

const profile = mkdtempSync(join(tmpdir(), 'daysplit-shots-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    '--hide-scrollbars',
    '--lang=en-US',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
);

chrome.on('exit', (code) => {
  for (const { reject } of pending.values()) reject(new Error(`Chrome exited (code ${code})`));
  pending.clear();
});

let nextId = 1;
const pending = new Map();
const errors = [];
let buffer = '';
chrome.stdio[4].on('data', (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  }
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(session, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function attach(targetId) {
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  return sessionId;
}

async function open(url, { width, height, scale = 2, dark = false }) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const session = await attach(targetId);
  await send('Page.enable', {}, session);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, session);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }, session);
  await send('Emulation.setLocaleOverride', { locale: 'en-US' }, session);
  await send('Page.navigate', { url }, session);
  await sleep(1200);
  await evaluate(session, 'Promise.all([...document.images].map((i) => i.decode().catch(() => {})))');
  return {
    session,
    close: () => send('Target.closeTarget', { targetId }),
    resize: (w, h, s = scale) =>
      send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: s, mobile: false }, session),
  };
}

// Saves a PNG. `clip` is in CSS pixels of the whole document; omit it for the
// viewport, or pass 'page' for the full page.
async function capture(session, file, clip) {
  if (clip === 'page') {
    const { cssContentSize: s } = await send('Page.getLayoutMetrics', {}, session);
    clip = { x: 0, y: 0, width: s.width, height: s.height };
  }
  const { data } = await send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: !!clip, clip: clip && { ...clip, scale: 1 } },
    session,
  );
  writeFileSync(file, Buffer.from(data, 'base64'));
}

function pngSize(file) {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// ---- Demo data ----------------------------------------------------------

const SEED = `(async () => {
  const sites = {
    work: ['github.com', 'localhost:5173', 'docs.google.com', 'claude.ai', 'stackoverflow.com', 'linear.app', 'mail.google.com', 'developer.mozilla.org', 'vercel.com'],
    entertainment: ['youtube.com', 'netflix.com', 'open.spotify.com', 'twitch.tv'],
    waste: ['x.com', 'reddit.com', 'instagram.com', 'facebook.com'],
    other: ['bank.example', 'amazon.com', 'weather.com', 'news.ycombinator.com', 'shop.example.org'],
  };
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const data = {};
  for (let back = 6; back >= 0; back--) {
    const day = {};
    for (let h = 8; h <= 22; h++) {
      if (rand() < 0.15) continue;
      const evening = h >= 19;
      let left = (25 + rand() * 33) * 60000;
      while (left > 60000) {
        const r = rand();
        const cat = evening
          ? r < 0.25 ? 'work' : r < 0.65 ? 'entertainment' : r < 0.9 ? 'waste' : 'other'
          : r < 0.72 ? 'work' : r < 0.8 ? 'entertainment' : r < 0.93 ? 'waste' : 'other';
        const ms = Math.min(left, (2 + rand() * 18) * 60000);
        const bucket = (day[h] ??= {});
        const host = pick(sites[cat]);
        bucket[host] = Math.round((bucket[host] ?? 0) + ms);
        left -= ms;
      }
    }
    data['day:' + Daysplit.shiftDay(Daysplit.dayKey(), -back)] = day;
  }
  data.rules = { 'news.ycombinator.com': 'waste', 'linkedin.com': 'work', 'medium.com': 'work', 'web.whatsapp.com': 'other' };
  await chrome.storage.local.clear();
  await chrome.storage.local.set(data);
})()`;

// Pretend the active tab is YouTube (the popup is opened as its own tab here).
const FAKE_TAB = `(async () => {
  chrome.tabs.query = async () => [{ url: 'https://www.youtube.com/watch?v=demo' }];
  await render();
})()`;

// Clip around the first `count` matches (plus a little page background), cut at maxHeight.
// Padding stays under the 16px gap between cards so neighbors don't peek in.
const rectOf = (selector, maxHeight, count = 1, pad = 14) => `(() => {
  const rs = [...document.querySelectorAll(${JSON.stringify(selector)})].slice(0, ${count}).map((n) => n.getBoundingClientRect());
  const top = Math.min(...rs.map((r) => r.top)), bottom = Math.max(...rs.map((r) => r.bottom));
  const left = Math.min(...rs.map((r) => r.left)), right = Math.max(...rs.map((r) => r.right));
  return { x: left + scrollX - ${pad}, y: top + scrollY - ${pad}, width: right - left + ${2 * pad}, height: Math.min(bottom - top + ${2 * pad}, ${maxHeight}) };
})()`;

// ---- Run ------------------------------------------------------------------

try {
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });
  mkdirSync(ASSETS, { recursive: true });
  await sleep(1000);

  const { id } = await send('Extensions.loadUnpacked', { path: EXT });
  await sleep(1000);
  const { targetInfos } = await send('Target.getTargets');
  const worker = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(id));
  if (!worker) throw new Error('Extension service worker did not start. Did you run `npm run build`?');
  const sw = await attach(worker.targetId);
  await evaluate(sw, SEED);

  const base = `chrome-extension://${id}`;
  for (const theme of ['light', 'dark']) {
    const dark = theme === 'dark';

    const popup = await open(`${base}/popup/popup.html`, { width: 380, height: 300, dark });
    await evaluate(popup.session, FAKE_TAB);
    await sleep(300);
    await capture(popup.session, join(RAW, `popup-${theme}.png`), 'page');
    await capture(popup.session, join(DOCS, `popup-${theme}.png`), 'page');
    await popup.close();

    const dash = await open(`${base}/dashboard/dashboard.html`, { width: 1280, height: 826, dark });
    await capture(dash.session, join(RAW, `dashboard-${theme}.png`));
    await dash.resize(1280, 826, 1.25); // 1600px wide for the README
    await capture(dash.session, join(DOCS, `dashboard-${theme}.png`));
    if (!dark) {
      await dash.resize(1280, 900, 2);
      await capture(dash.session, join(RAW, 'sites-light.png'), await evaluate(dash.session, rectOf('.card:has(#sitesBody)', 680)));
      await evaluate(dash.session, `location.hash = '#settings'`);
      await sleep(500);
      await capture(dash.session, join(RAW, 'settings-light.png'), await evaluate(dash.session, rectOf('[data-panel="settings"] .card', 700, 2)));
    }
    await dash.close();
  }

  const slides = [
    ['overview', 1280, 800, 'screenshot-1-overview.png'],
    ['popup', 1280, 800, 'screenshot-2-popup.png'],
    ['sites', 1280, 800, 'screenshot-3-sites.png'],
    ['settings', 1280, 800, 'screenshot-4-settings.png'],
    ['dark', 1280, 800, 'screenshot-5-dark.png'],
    ['promo-small', 440, 280, 'promo-small-440x280.png'],
    ['promo-marquee', 1400, 560, 'promo-marquee-1400x560.png'],
  ];
  const slidesUrl = pathToFileURL(join(root, 'store', 'slides.html')).href;
  for (const [slide, width, height, file] of slides) {
    const page = await open(`${slidesUrl}?slide=${slide}`, { width, height, scale: 1 });
    await capture(page.session, join(ASSETS, file));
    await page.close();
    const [w, h] = pngSize(join(ASSETS, file));
    if (w !== width || h !== height) throw new Error(`${file} is ${w}x${h}, expected ${width}x${height}`);
  }

  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log(`Wrote README images to docs/ and ${slides.length} store images to store/assets/`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  if (chrome.exitCode === null) {
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await exited;
  }
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
