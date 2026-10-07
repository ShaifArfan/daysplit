// Tempo background: decides which site is "being used" right now and credits
// time to it.
//
// A site counts while all of these hold:
//   - a browser window has focus (switching to another app pauses tracking)
//   - the site is the active tab in that window
//   - you aren't idle, or the tab is playing audio (videos, calls, music)
//
// Chromium runs this as a service worker that can be stopped at any moment,
// so nothing lives in memory: the current target is kept in storage and time
// is committed on every tab/window/idle event plus a one-minute heartbeat.

// Chromium service worker: pull in the shared code. (Firefox lists these files
// in the manifest instead and has no importScripts in background pages.)
if (typeof importScripts === 'function') importScripts('lib/sites.js', 'lib/core.js');

const { api } = Tempo;

const TICK_ALARM = 'tempo-tick';
const SUMMARY_ALARM = 'tempo-summary';
const PRUNE_ALARM = 'tempo-prune';
const SUMMARY_NOTIFICATION = 'tempo-summary';

// Heartbeats arrive every minute. A longer gap means we weren't running
// (computer asleep, browser closed), so never credit more than this at once.
const MAX_CREDIT_MS = 150 * 1000;

// Events often fire in bursts (switching tabs fires several). Run updates one
// at a time so two of them can't both credit the same stretch of time.
let chain = Promise.resolve();
function serial(task) {
  chain = chain.then(task).catch((err) => console.error('[Tempo]', err));
  return chain;
}

async function readState() {
  const { state } = await api.storage.local.get('state');
  return state ?? null;
}

// Credit the time since the last checkpoint to whatever we were timing.
async function commit(now) {
  const state = await readState();
  if (!state?.active || !state.host || !state.since) return;
  const to = Math.min(now, state.since + MAX_CREDIT_MS);
  if (to > state.since) await Tempo.addTime(state.host, state.since, to);
}

// Figure out what should be timed from now on.
async function currentTarget(settings) {
  const win = await api.windows.getLastFocused().catch(() => null);
  if (!win?.focused) return { host: null, active: false };
  const [tab] = await api.tabs.query({ active: true, windowId: win.id });
  if (!tab || tab.incognito) return { host: null, active: false };
  const host = Tempo.hostFromUrl(tab.url);
  if (!host) return { host: null, active: false };
  const idle = await api.idle.queryState(Math.max(15, settings.idleMinutes * 60));
  const active = idle === 'active' || (idle === 'idle' && settings.countAudibleWhenIdle && !!tab.audible);
  return { host, active };
}

async function refresh() {
  const now = Date.now();
  await commit(now);
  const settings = await Tempo.getSettings();
  const target = await currentTarget(settings);
  await api.storage.local.set({ state: { host: target.host, active: target.active, since: now } });
  await updateBadge(target.host, settings);
}

const schedule = () => serial(refresh);

async function updateBadge(host, settings) {
  if (settings.badge === 'off') {
    await api.action.setBadgeText({ text: '' });
    return;
  }
  const key = Tempo.dayKey();
  const [days, rules] = await Promise.all([Tempo.getDays([key]), Tempo.getRules()]);
  const summary = Tempo.summarize(days[key], rules);
  const ms =
    settings.badge === 'site'
      ? (summary.sites.find((s) => s.host === host)?.ms ?? 0)
      : summary.byCategory.work;
  const category = host ? Tempo.categorize(host, rules).category : 'other';
  const title = host
    ? `Tempo · ${host} (${Tempo.LABELS[category]}) · ${Tempo.formatDuration(summary.byCategory.work)} work today`
    : `Tempo · ${Tempo.formatDuration(summary.byCategory.work)} work today`;
  await Promise.all([
    api.action.setBadgeText({ text: settings.badge === 'site' && !host ? '' : Tempo.formatBadge(ms) }),
    api.action.setBadgeBackgroundColor({ color: Tempo.BADGE_COLORS[category] }),
    api.action.setBadgeTextColor?.({ color: '#ffffff' }),
    api.action.setTitle({ title }),
  ]);
}

async function scheduleSummary(settings) {
  await api.alarms.clear(SUMMARY_ALARM);
  if (settings.dailySummary) {
    await api.alarms.create(SUMMARY_ALARM, { when: Tempo.nextOccurrence(settings.summaryTime) });
  }
}

async function sendSummary(scheduledTime) {
  const settings = await Tempo.getSettings();
  await scheduleSummary(settings);
  // Woke up hours late (laptop was asleep)? Skip rather than report a stale day.
  if (!settings.dailySummary || Date.now() - scheduledTime > 3 * 3600 * 1000) return;

  const key = Tempo.dayKey(scheduledTime);
  const [days, rules] = await Promise.all([Tempo.getDays([key]), Tempo.getRules()]);
  const { total, byCategory } = Tempo.summarize(days[key], rules);
  if (total < 60 * 1000) return;

  const focus = Math.round((byCategory.work / total) * 100);
  const parts = ['work', 'entertainment', 'waste', 'other']
    .filter((c) => byCategory[c] >= 60 * 1000)
    .map((c) => `${Tempo.LABELS[c]} ${Tempo.formatDuration(byCategory[c])}`);
  await api.notifications.create(SUMMARY_NOTIFICATION, {
    type: 'basic',
    iconUrl: api.runtime.getURL('icons/icon-128.png'),
    title: `Today: ${Tempo.formatDuration(byCategory.work)} focused (${focus}%)`,
    message: `${parts.join(' · ')}\n${Tempo.formatDuration(total)} in the browser. Click for the full day.`,
  });
}

async function prune() {
  const settings = await Tempo.getSettings();
  if (!settings.retentionDays) return;
  const oldest = Tempo.shiftDay(Tempo.dayKey(), -settings.retentionDays);
  const { days } = await Tempo.getAll();
  await Tempo.removeDays(Object.keys(days).filter((k) => k < oldest));
}

async function setup() {
  const settings = await Tempo.getSettings();
  api.idle.setDetectionInterval(Math.max(15, settings.idleMinutes * 60));
  if (!(await api.alarms.get(TICK_ALARM))) await api.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  if (!(await api.alarms.get(PRUNE_ALARM))) {
    await api.alarms.create(PRUNE_ALARM, { delayInMinutes: 1, periodInMinutes: 6 * 60 });
  }
  if (!(await api.alarms.get(SUMMARY_ALARM))) await scheduleSummary(settings);
  await refresh();
}

// ---- Listeners (registered synchronously so a sleeping worker wakes for them)

api.tabs.onActivated.addListener(schedule);
api.tabs.onUpdated.addListener((_tabId, change, tab) => {
  if (tab.active && ('url' in change || 'audible' in change || change.status === 'complete')) schedule();
});
api.windows.onFocusChanged.addListener(schedule);
api.idle.onStateChanged.addListener(schedule);

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) schedule();
  else if (alarm.name === SUMMARY_ALARM) serial(() => sendSummary(alarm.scheduledTime));
  else if (alarm.name === PRUNE_ALARM) serial(prune);
});

api.notifications.onClicked.addListener((id) => {
  if (id !== SUMMARY_NOTIFICATION) return;
  api.notifications.clear(id);
  api.runtime.openOptionsPage();
});

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) {
    serial(async () => {
      const settings = await Tempo.getSettings();
      api.idle.setDetectionInterval(Math.max(15, settings.idleMinutes * 60));
      await scheduleSummary(settings);
    });
  }
  // A category or setting changed: redraw the badge.
  if (changes.settings || changes.rules) schedule();
});

// The popup and dashboard ask for a flush so they show up-to-the-second totals.
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'flush') return false;
  serial(refresh).then(() => sendResponse({ ok: true }));
  return true;
});

api.runtime.onInstalled.addListener(() => serial(setup));
api.runtime.onStartup.addListener(() => serial(setup));
serial(setup);
