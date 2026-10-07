// Runs the real background script inside a VM with a fake browser API and a
// controllable clock, so tracking behavior can be tested without a browser.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const FILES = ['lib/sites.js', 'lib/core.js', 'background.js'];

function event() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    fire: (...args) => listeners.map((fn) => fn(...args)),
  };
}

export function at(y, m, d, h = 0, min = 0, s = 0) {
  return new Date(y, m - 1, d, h, min, s).getTime();
}

export async function startBackground({ now = at(2026, 10, 7, 9), seed = {}, files = FILES } = {}) {
  const clock = { now };
  const data = structuredClone(seed);
  const world = {
    focused: true,
    windowId: 1,
    tab: { id: 1, url: 'https://github.com/anthropics', active: true, audible: false, incognito: false },
    idle: 'active',
  };
  const badge = {};
  const notifications = [];
  const alarms = new Map();

  const storage = {
    onChanged: event(),
    local: {
      async get(keys) {
        if (keys == null) return structuredClone(data);
        const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const out = {};
        for (const k of list) if (k in data) out[k] = structuredClone(data[k]);
        return out;
      },
      async set(items) {
        const changes = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: data[k], newValue: v };
          data[k] = structuredClone(v);
        }
        storage.onChanged.fire(changes, 'local');
      },
      async remove(keys) {
        for (const k of [].concat(keys)) delete data[k];
      },
      async clear() {
        for (const k of Object.keys(data)) delete data[k];
      },
    },
  };

  const chrome = {
    storage,
    tabs: {
      onActivated: event(),
      onUpdated: event(),
      async query() {
        return world.tab ? [{ ...world.tab, windowId: world.windowId }] : [];
      },
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: event(),
      async getLastFocused() {
        return { id: world.windowId, focused: world.focused };
      },
    },
    idle: {
      onStateChanged: event(),
      async queryState() {
        return world.idle;
      },
      setDetectionInterval(seconds) {
        world.idleInterval = seconds;
      },
    },
    alarms: {
      onAlarm: event(),
      async create(name, info) {
        const scheduledTime = info.when ?? clock.now + (info.delayInMinutes ?? info.periodInMinutes) * 60000;
        alarms.set(name, { name, ...info, scheduledTime });
      },
      async get(name) {
        return alarms.get(name);
      },
      async clear(name) {
        return alarms.delete(name);
      },
    },
    action: {
      async setBadgeText({ text }) {
        badge.text = text;
      },
      async setBadgeBackgroundColor({ color }) {
        badge.color = color;
      },
      async setBadgeTextColor() {},
      async setTitle({ title }) {
        badge.title = title;
      },
    },
    notifications: {
      onClicked: event(),
      async create(id, options) {
        notifications.push({ id, ...options });
      },
      async clear() {},
    },
    runtime: {
      onInstalled: event(),
      onStartup: event(),
      onMessage: event(),
      getURL: (path) => `chrome-extension://tempo/${path}`,
      openOptionsPage() {},
    },
  };

  const context = vm.createContext({ chrome, console, structuredClone, URL, __clock: clock });
  vm.runInContext('Date.now = () => __clock.now;', context);
  for (const file of files) vm.runInContext(read(file), context, { filename: file });

  // Wait until the background's serial queue is empty (tasks can enqueue more).
  async function settle() {
    const current = () => vm.runInContext('typeof chain === "undefined" ? null : chain', context);
    for (let i = 0; i < 50; i++) {
      const pending = current();
      if (!pending) return;
      await pending;
      await new Promise((r) => setImmediate(r));
      if (pending === current()) return;
    }
    throw new Error('background never settled');
  }

  const env = {
    chrome,
    world,
    clock,
    data,
    badge,
    notifications,
    alarms,
    settle,
    Tempo: context.Tempo,
    advance(ms) {
      clock.now += ms;
    },
    async tick() {
      chrome.alarms.onAlarm.fire({ name: 'tempo-tick', scheduledTime: clock.now });
      await settle();
    },
    day(key = context.Tempo.dayKey(clock.now)) {
      return data[`day:${key}`] ?? {};
    },
    // Total ms per host for a day, across all hours.
    hosts(key) {
      const out = {};
      for (const hosts of Object.values(env.day(key))) {
        for (const [host, ms] of Object.entries(hosts)) out[host] = (out[host] ?? 0) + ms;
      }
      return out;
    },
  };
  await settle();
  return env;
}
