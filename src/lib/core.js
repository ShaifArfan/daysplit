// Tempo core: shared by the background script, the popup and the dashboard.
// Loaded as a classic script after lib/sites.js; exposes globalThis.Tempo.
//
// Storage layout (browser.storage.local):
//   settings          -> user settings (merged over DEFAULT_SETTINGS)
//   rules             -> { "github.com": "work", "localhost:3000": "work", ... }
//   state             -> what the background is currently timing
//   day:YYYY-MM-DD    -> { "<hour 0-23>": { "<host>": milliseconds } }
//
// Only raw time per host is stored. Categories are applied when reading, so
// changing a site's category also fixes every past day.
globalThis.Tempo = (() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const store = api.storage.local;

  const CATEGORIES = ['work', 'entertainment', 'waste', 'other'];
  const LABELS = { work: 'Work', entertainment: 'Entertainment', waste: 'Waste', other: 'Other' };
  // Toolbar badge colors (white text sits on these, so they're a step darker
  // than the chart colors in ui/base.css).
  const BADGE_COLORS = { work: '#2a78d6', entertainment: '#a86f00', waste: '#c73d74', other: '#6b6a64' };

  const DEFAULT_SETTINGS = {
    idleMinutes: 2,
    countAudibleWhenIdle: true,
    badge: 'work', // 'work' | 'site' | 'off'
    dailySummary: true,
    summaryTime: '21:00',
    retentionDays: 180, // 0 = keep forever
  };

  const DAY_PREFIX = 'day:';

  // ---- Categorizing -------------------------------------------------------

  const BUILTIN = new Map();
  for (const category of ['work', 'entertainment', 'waste']) {
    for (const domain of TempoSites[category]) BUILTIN.set(domain, category);
  }
  const KEYWORDS = Object.fromEntries(
    Object.entries(TempoSites.keywords).map(([category, words]) => [category, new Set(words)]),
  );

  function isLocalHost(name) {
    return (
      name === 'localhost' ||
      name === '[::1]' ||
      /\.(localhost|local|test|internal|lan)$/.test(name) ||
      /^(127|10)\.\d+\.\d+\.\d+$/.test(name) ||
      /^192\.168\.\d+\.\d+$/.test(name) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(name)
    );
  }

  // "a.b.example.com" -> ["a.b.example.com", "b.example.com", "example.com"]
  function domainChain(name) {
    const parts = name.split('.');
    if (parts.length < 2) return [name];
    const out = [];
    for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
    return out;
  }

  // Returns { category, source } where source is:
  //   'rule'  - you picked it (rule says which pattern matched)
  //   'auto'  - Tempo's built-in list of known sites
  //   'guess' - guessed from words in the address
  //   'none'  - no idea yet
  function categorize(host, rules = {}) {
    if (CATEGORIES.includes(rules[host])) return { category: rules[host], source: 'rule', rule: host };
    const name = host.replace(/:\d+$/, '');
    const chain = domainChain(name);
    for (const d of chain) {
      if (CATEGORIES.includes(rules[d])) return { category: rules[d], source: 'rule', rule: d };
    }
    if (isLocalHost(name)) return { category: 'work', source: 'auto' };
    for (const d of chain) {
      const category = BUILTIN.get(d);
      if (category) return { category, source: 'auto' };
    }
    const words = name.split(/[.-]/);
    for (const category of ['work', 'entertainment', 'waste']) {
      if (words.some((w) => KEYWORDS[category].has(w))) return { category, source: 'guess' };
    }
    return { category: 'other', source: 'none' };
  }

  // The thing Tempo tracks: hostname without "www.", plus the port for local
  // dev servers so localhost:3000 and localhost:5173 stay separate.
  // Returns null for anything that isn't a normal web page.
  function hostFromUrl(url) {
    if (!url) return null;
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const name = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!name) return null;
    return u.port && isLocalHost(name) ? `${name}:${u.port}` : name;
  }

  // Turns whatever the user typed ("https://www.YouTube.com/watch", "*.google.com")
  // into a rule pattern, or null if it doesn't look like a site.
  function normalizePattern(input) {
    let text = String(input ?? '').trim().toLowerCase();
    if (!text) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) text = `http://${text.replace(/^\*\./, '')}`;
    let u;
    try {
      u = new URL(text);
    } catch {
      return null;
    }
    const name = u.hostname.replace(/^www\./, '');
    if (!/^(\[[0-9a-f:]+\]|[a-z0-9-]+(\.[a-z0-9-]+)*)$/.test(name)) return null;
    return u.port && isLocalHost(name) ? `${name}:${u.port}` : name;
  }

  // ---- Time helpers -------------------------------------------------------

  const pad = (n) => String(n).padStart(2, '0');

  function dayKey(t = Date.now()) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function dayStart(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function shiftDay(key, delta) {
    const d = dayStart(key);
    d.setDate(d.getDate() + delta);
    return dayKey(d.getTime());
  }

  // Splits [from, to) at every hour boundary (local time).
  function splitByHour(from, to) {
    const out = [];
    let t = from;
    while (t < to) {
      const d = new Date(t);
      const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const end = Math.min(nextHour, to);
      out.push({ day: dayKey(t), hour: d.getHours(), ms: end - t });
      t = end;
    }
    return out;
  }

  function nextOccurrence(hhmm, now = Date.now()) {
    const [h, m] = String(hhmm).split(':').map(Number);
    const d = new Date(now);
    d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function formatDuration(ms) {
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return ms >= 1000 ? `${Math.floor(ms / 1000)}s` : '0m';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // Badges fit about 4 characters: "0m", "45m", "2h05", "11h".
  function formatBadge(ms) {
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60);
    return h >= 10 ? `${h}h` : `${h}h${pad(totalMin % 60)}`;
  }

  // ---- Storage ------------------------------------------------------------

  async function getSettings() {
    const { settings } = await store.get('settings');
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async function saveSettings(patch) {
    const settings = { ...(await getSettings()), ...patch };
    await store.set({ settings });
    return settings;
  }

  async function getRules() {
    const { rules } = await store.get('rules');
    return rules ?? {};
  }

  async function saveRules(rules) {
    await store.set({ rules });
  }

  async function setRule(pattern, category) {
    const rules = await getRules();
    rules[pattern] = category;
    await store.set({ rules });
  }

  async function removeRule(pattern) {
    const rules = await getRules();
    delete rules[pattern];
    await store.set({ rules });
  }

  // Returns { "YYYY-MM-DD": dayData } for every key (empty object if missing).
  async function getDays(keys) {
    const res = await store.get(keys.map((k) => DAY_PREFIX + k));
    return Object.fromEntries(keys.map((k) => [k, res[DAY_PREFIX + k] ?? {}]));
  }

  async function addTime(host, from, to) {
    const segments = splitByHour(from, to);
    if (!segments.length) return;
    const keys = [...new Set(segments.map((s) => s.day))];
    const days = await getDays(keys);
    for (const { day, hour, ms } of segments) {
      const bucket = (days[day][hour] ??= {});
      bucket[host] = (bucket[host] ?? 0) + ms;
    }
    await store.set(Object.fromEntries(keys.map((k) => [DAY_PREFIX + k, days[k]])));
  }

  async function getAll() {
    const all = await store.get(null);
    const days = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(DAY_PREFIX)) days[key.slice(DAY_PREFIX.length)] = value;
    }
    return { settings: { ...DEFAULT_SETTINGS, ...all.settings }, rules: all.rules ?? {}, days };
  }

  async function removeDays(keys) {
    if (keys.length) await store.remove(keys.map((k) => DAY_PREFIX + k));
  }

  async function replaceDays(days) {
    await store.set(Object.fromEntries(Object.entries(days).map(([k, v]) => [DAY_PREFIX + k, v])));
  }

  async function clearAll() {
    await store.clear();
  }

  // ---- Summaries ----------------------------------------------------------

  const emptyTotals = () => Object.fromEntries(CATEGORIES.map((c) => [c, 0]));

  function summarize(day = {}, rules = {}) {
    const byCategory = emptyTotals();
    const hours = Array.from({ length: 24 }, emptyTotals);
    const siteMs = new Map();
    const info = new Map();
    let total = 0;
    for (const [hour, hosts] of Object.entries(day)) {
      const bucket = hours[hour];
      if (!bucket) continue;
      for (const [host, ms] of Object.entries(hosts)) {
        if (!(ms > 0)) continue;
        if (!info.has(host)) info.set(host, categorize(host, rules));
        const { category } = info.get(host);
        bucket[category] += ms;
        byCategory[category] += ms;
        total += ms;
        siteMs.set(host, (siteMs.get(host) ?? 0) + ms);
      }
    }
    const sites = [...siteMs]
      .map(([host, ms]) => ({ host, ms, ...info.get(host) }))
      .sort((a, b) => b.ms - a.ms);
    return { total, byCategory, hours, sites };
  }

  return {
    api,
    CATEGORIES,
    LABELS,
    BADGE_COLORS,
    DEFAULT_SETTINGS,
    categorize,
    hostFromUrl,
    normalizePattern,
    isLocalHost,
    dayKey,
    dayStart,
    shiftDay,
    splitByHour,
    nextOccurrence,
    formatDuration,
    formatBadge,
    getSettings,
    saveSettings,
    getRules,
    saveRules,
    setRule,
    removeRule,
    getDays,
    addTime,
    getAll,
    removeDays,
    replaceDays,
    clearAll,
    summarize,
  };
})();
