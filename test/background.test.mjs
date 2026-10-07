import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBackground, at } from './helpers.mjs';

const MIN = 60 * 1000;

test('counts time on the active tab', async () => {
  const env = await startBackground();
  env.advance(MIN);
  await env.tick();
  assert.deepEqual(env.hosts(), { 'github.com': MIN });
  assert.deepEqual(Object.keys(env.day()), ['9']);
});

test('switching tabs credits the previous site up to the switch', async () => {
  const env = await startBackground();
  env.advance(30 * 1000);
  env.world.tab = { ...env.world.tab, id: 2, url: 'https://www.youtube.com/watch?v=x' };
  env.chrome.tabs.onActivated.fire({ tabId: 2, windowId: 1 });
  await env.settle();
  env.advance(45 * 1000);
  await env.tick();
  assert.deepEqual(env.hosts(), { 'github.com': 30 * 1000, 'youtube.com': 45 * 1000 });
});

test('navigating within the same tab is picked up from tabs.onUpdated', async () => {
  const env = await startBackground();
  env.advance(20 * 1000);
  env.world.tab = { ...env.world.tab, url: 'https://reddit.com/r/all' };
  env.chrome.tabs.onUpdated.fire(1, { url: env.world.tab.url }, env.world.tab);
  await env.settle();
  env.advance(10 * 1000);
  await env.tick();
  assert.deepEqual(env.hosts(), { 'github.com': 20 * 1000, 'reddit.com': 10 * 1000 });
});

test('a burst of events never double-counts', async () => {
  const env = await startBackground();
  env.advance(MIN);
  env.chrome.tabs.onActivated.fire({ tabId: 1 });
  env.chrome.windows.onFocusChanged.fire(1);
  env.chrome.tabs.onUpdated.fire(1, { status: 'complete' }, env.world.tab);
  env.chrome.tabs.onUpdated.fire(1, { url: env.world.tab.url }, env.world.tab);
  env.chrome.alarms.onAlarm.fire({ name: 'tempo-tick' });
  await env.settle();
  assert.deepEqual(env.hosts(), { 'github.com': MIN });
});

test('pauses while the browser is not focused', async () => {
  const env = await startBackground();
  env.advance(MIN);
  env.world.focused = false;
  env.chrome.windows.onFocusChanged.fire(-1);
  await env.settle();
  for (let i = 0; i < 5; i++) {
    env.advance(MIN);
    await env.tick();
  }
  env.world.focused = true;
  env.chrome.windows.onFocusChanged.fire(1);
  await env.settle();
  env.advance(MIN);
  await env.tick();
  assert.deepEqual(env.hosts(), { 'github.com': 2 * MIN });
});

test('stops when idle, unless the tab is playing audio', async () => {
  const env = await startBackground();
  env.world.idle = 'idle';
  env.chrome.idle.onStateChanged.fire('idle');
  await env.settle();
  env.advance(MIN);
  await env.tick();
  assert.deepEqual(env.hosts(), {});

  env.world.tab = { ...env.world.tab, url: 'https://youtube.com/watch?v=1', audible: true };
  env.chrome.tabs.onUpdated.fire(1, { audible: true }, env.world.tab);
  await env.settle();
  env.advance(MIN);
  await env.tick();
  assert.deepEqual(env.hosts(), { 'youtube.com': MIN });

  env.world.idle = 'locked';
  env.chrome.idle.onStateChanged.fire('locked');
  await env.settle();
  env.advance(MIN);
  await env.tick();
  assert.deepEqual(env.hosts(), { 'youtube.com': MIN }, 'a locked screen never counts');
});

test('audio does not count while idle when that setting is off', async () => {
  const env = await startBackground({ seed: { settings: { countAudibleWhenIdle: false } } });
  env.world.idle = 'idle';
  env.world.tab = { ...env.world.tab, audible: true };
  env.chrome.idle.onStateChanged.fire('idle');
  await env.settle();
  env.advance(MIN);
  await env.tick();
  assert.deepEqual(env.hosts(), {});
});

test('a long gap (sleep, closed browser) is capped instead of counted', async () => {
  const env = await startBackground();
  env.advance(3 * 60 * MIN);
  await env.tick();
  const total = env.hosts()['github.com'];
  assert.ok(total <= 150 * 1000, `credited ${total}ms`);
});

test('time is split across hours and midnight', async () => {
  const env = await startBackground({ now: at(2026, 10, 7, 23, 59, 30) });
  env.advance(MIN);
  await env.tick();
  assert.deepEqual(env.day('2026-10-07'), { 23: { 'github.com': 30 * 1000 } });
  assert.deepEqual(env.day('2026-10-08'), { 0: { 'github.com': 30 * 1000 } });
});

test('browser pages, extension pages and private windows are not tracked', async () => {
  const env = await startBackground();
  for (const url of ['chrome://newtab/', 'about:blank', 'moz-extension://abc/dashboard.html', 'file:///Users/me/a.pdf']) {
    env.world.tab = { ...env.world.tab, url };
    env.chrome.tabs.onUpdated.fire(1, { url }, env.world.tab);
    await env.settle();
    env.advance(MIN);
    await env.tick();
  }
  env.world.tab = { ...env.world.tab, url: 'https://secret.example', incognito: true };
  env.chrome.tabs.onActivated.fire({ tabId: 1 });
  await env.settle();
  env.advance(MIN);
  await env.tick();
  assert.deepEqual(env.hosts(), {});
});

test('badge shows work time today, colored by the current site', async () => {
  const env = await startBackground();
  // 65 one-minute heartbeats
  for (let i = 0; i < 65; i++) {
    env.advance(MIN);
    await env.tick();
  }
  assert.equal(env.badge.text, '1h05');
  assert.equal(env.badge.color, env.Tempo.BADGE_COLORS.work);

  env.world.tab = { ...env.world.tab, url: 'https://instagram.com/' };
  env.chrome.tabs.onActivated.fire({ tabId: 1 });
  await env.settle();
  assert.equal(env.badge.color, env.Tempo.BADGE_COLORS.waste);
  assert.equal(env.badge.text, '1h05', 'badge still shows work time');
});

test('changing a rule recolors the badge right away', async () => {
  const env = await startBackground();
  env.world.tab = { ...env.world.tab, url: 'https://youtube.com/' };
  env.chrome.tabs.onActivated.fire({ tabId: 1 });
  await env.settle();
  assert.equal(env.badge.color, env.Tempo.BADGE_COLORS.entertainment);
  await env.Tempo.setRule('youtube.com', 'work');
  await env.settle();
  assert.equal(env.badge.color, env.Tempo.BADGE_COLORS.work);
});

test('flush message commits time and replies', async () => {
  const env = await startBackground();
  env.advance(42 * 1000);
  let reply;
  const [keepOpen] = env.chrome.runtime.onMessage.fire({ type: 'flush' }, {}, (r) => (reply = r));
  assert.equal(keepOpen, true);
  await env.settle();
  assert.deepEqual({ ...reply }, { ok: true });
  assert.deepEqual(env.hosts(), { 'github.com': 42 * 1000 });
});

test('end-of-day notification summarizes the day', async () => {
  const env = await startBackground({
    now: at(2026, 10, 7, 21),
    seed: {
      'day:2026-10-07': {
        10: { 'github.com': 90 * MIN },
        14: { 'youtube.com': 30 * MIN, 'reddit.com': 20 * MIN },
        15: { 'bank.example': 10 * MIN },
      },
    },
  });
  assert.equal(env.alarms.get('tempo-summary').scheduledTime, at(2026, 10, 8, 21), 'next summary is tomorrow 21:00');
  env.chrome.alarms.onAlarm.fire({ name: 'tempo-summary', scheduledTime: env.clock.now });
  await env.settle();
  assert.equal(env.notifications.length, 1);
  const [n] = env.notifications;
  assert.equal(n.title, 'Today: 1h 30m focused (60%)');
  assert.match(n.message, /^Work 1h 30m · Entertainment 30m · Waste 20m · Other 10m\n2h 30m in the browser/);
});

test('a summary alarm that fires hours late is skipped', async () => {
  const env = await startBackground({ now: at(2026, 10, 8, 8), seed: { 'day:2026-10-07': { 10: { 'github.com': 90 * MIN } } } });
  env.chrome.alarms.onAlarm.fire({ name: 'tempo-summary', scheduledTime: at(2026, 10, 7, 21) });
  await env.settle();
  assert.equal(env.notifications.length, 0);
});

test('old history is pruned past the retention window', async () => {
  const env = await startBackground({
    seed: {
      settings: { retentionDays: 30 },
      'day:2026-08-01': { 9: { 'a.com': 1 } },
      'day:2026-09-20': { 9: { 'b.com': 1 } },
    },
  });
  env.chrome.alarms.onAlarm.fire({ name: 'tempo-prune' });
  await env.settle();
  assert.equal('day:2026-08-01' in env.data, false);
  assert.equal('day:2026-09-20' in env.data, true);
});

test('setup creates heartbeat, prune and summary alarms', async () => {
  const env = await startBackground();
  assert.equal(env.alarms.get('tempo-tick').periodInMinutes, 1);
  assert.ok(env.alarms.get('tempo-prune'));
  assert.ok(env.alarms.get('tempo-summary'));
  assert.equal(env.world.idleInterval, 120);
});

test('turning the summary off removes its alarm; idle setting is applied', async () => {
  const env = await startBackground();
  await env.Tempo.saveSettings({ dailySummary: false, idleMinutes: 5 });
  await env.settle();
  assert.equal(env.alarms.has('tempo-summary'), false);
  assert.equal(env.world.idleInterval, 300);
});
