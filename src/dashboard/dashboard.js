const { api, CATEGORIES, LABELS, formatDuration: fmt } = Tempo;
const { el, pct } = TempoUI;
const $ = (id) => document.getElementById(id);

const HOUR = 3600 * 1000;
const SITE_LIMIT = 40;

const ui = { day: Tempo.dayKey(), filter: 'all', showAll: false };

// ---- Views -----------------------------------------------------------------

const currentView = () => (location.hash === '#settings' ? 'settings' : 'overview');

let shownView = null;

function showView() {
  const view = currentView();
  if (view !== shownView) {
    shownView = view;
    window.scrollTo(0, 0);
  }
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== view;
  for (const link of document.querySelectorAll('.tabs a')) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  hideTip();
  return view === 'settings' ? renderSettings() : renderOverview();
}

window.addEventListener('hashchange', showView);

// Redraw when data changes (another window browsing, a category edit, an import).
let redrawTimer;
api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const keys = Object.keys(changes);
  const relevant =
    currentView() === 'settings'
      ? keys.some((k) => k === 'settings' || k === 'rules')
      : keys.some((k) => k !== 'state');
  if (!relevant) return;
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(showView, 150);
});

// ---- Tooltip ---------------------------------------------------------------

const tip = $('tip');

function placeTip(x, y) {
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left = x + 14;
  if (left + w > window.innerWidth - 8) left = Math.max(8, x - w - 14);
  let top = y - h - 12;
  if (top < 8) top = y + 18;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideTip() {
  tip.hidden = true;
}

function attachTip(node, content) {
  const show = (x, y) => {
    tip.replaceChildren(...content());
    tip.hidden = false;
    placeTip(x, y);
  };
  node.addEventListener('mouseenter', (e) => show(e.clientX, e.clientY));
  node.addEventListener('mousemove', (e) => placeTip(e.clientX, e.clientY));
  node.addEventListener('mouseleave', hideTip);
  node.addEventListener('focus', () => {
    const r = node.getBoundingClientRect();
    show(r.left + r.width / 2, r.top + 20);
  });
  node.addEventListener('blur', hideTip);
}

function tipRows(title, totals, extra = []) {
  const sum = CATEGORIES.reduce((n, c) => n + totals[c], 0);
  const rows = CATEGORIES.filter((c) => totals[c] >= 1000).map((c) =>
    el('div', { class: 'row' }, el('span', { class: 'dot', 'data-cat': c }), LABELS[c], el('b', {}, fmt(totals[c]))),
  );
  return [
    el('h4', {}, title),
    ...(rows.length ? rows : [el('div', { class: 'muted' }, 'Nothing tracked')]),
    rows.length > 1 ? el('div', { class: 'row muted' }, 'Total', el('b', {}, fmt(sum))) : null,
    ...extra,
  ].filter(Boolean);
}

// ---- Overview --------------------------------------------------------------

async function renderOverview() {
  const keys = Array.from({ length: 7 }, (_, i) => Tempo.shiftDay(ui.day, i - 6));
  const [days, rules] = await Promise.all([Tempo.getDays(keys), Tempo.getRules()]);
  const summaries = keys.map((k) => Tempo.summarize(days[k], rules));
  const day = summaries[6];

  renderDayNav();
  renderTiles(day, summaries[5]);
  renderSplit(day);
  renderHours(day, days[ui.day], rules);
  renderWeek(keys, summaries);
  renderSites(day);
}

function renderDayNav() {
  const today = Tempo.dayKey();
  const date = Tempo.dayStart(ui.day);
  const yesterday = Tempo.shiftDay(today, -1);
  $('dayTitle').textContent =
    ui.day === today ? 'Today' : ui.day === yesterday ? 'Yesterday' : date.toLocaleDateString(undefined, { weekday: 'long' });
  $('daySub').textContent = date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  $('dayPicker').value = ui.day;
  $('dayPicker').max = today;
  $('nextDay').disabled = ui.day >= today;
  $('todayBtn').disabled = ui.day === today;
}

function delta(cur, prev, upIsGood) {
  if (!prev) return null;
  const vs = ui.day === Tempo.dayKey() ? 'yesterday' : 'the day before';
  const diff = cur - prev;
  if (Math.abs(diff) < 60 * 1000) return el('span', { class: 'delta flat' }, `Same as ${vs}`);
  const up = diff > 0;
  const tone = upIsGood == null ? 'flat' : up === upIsGood ? 'good' : 'bad';
  return el(
    'span',
    { class: `delta ${tone}` },
    el('span', { 'aria-hidden': 'true' }, up ? '▲' : '▼'),
    `${fmt(Math.abs(diff))} ${up ? 'more' : 'less'} than ${vs}`,
  );
}

function renderTiles(day, prev) {
  const { total, byCategory } = day;
  const hero = el(
    'div',
    { class: 'tile hero' },
    el('p', { class: 'tile-label' }, el('span', { class: 'dot', 'data-cat': 'work' }), 'Focused on work'),
    el('p', { class: 'tile-value' }, fmt(byCategory.work)),
    el('p', { class: 'tile-sub' }, total ? `${pct(byCategory.work, total)}% of ${fmt(total)} in the browser` : 'Nothing tracked on this day'),
    delta(byCategory.work, prev.byCategory.work, true),
  );
  const tile = (c, upIsGood) =>
    el(
      'div',
      { class: 'tile' },
      el('p', { class: 'tile-label' }, el('span', { class: 'dot', 'data-cat': c }), LABELS[c]),
      el('p', { class: 'tile-value' }, fmt(byCategory[c])),
      el('p', { class: 'tile-sub' }, `${pct(byCategory[c], total)}% of the day`),
      delta(byCategory[c], prev.byCategory[c], upIsGood),
    );
  $('tiles').replaceChildren(hero, tile('entertainment', null), tile('waste', false), tile('other', null));
}

function renderSplit(day) {
  const { total, byCategory } = day;
  $('splitNote').textContent = total
    ? `${fmt(total)} in the browser · focus score ${pct(byCategory.work, total)}%`
    : 'No browsing tracked on this day.';
  $('splitBar').replaceChildren(TempoUI.stackbar(byCategory, total));
  $('splitLegend').replaceChildren(
    ...CATEGORIES.map((c) =>
      el(
        'li',
        {},
        el('span', { class: 'dot', 'data-cat': c }),
        LABELS[c],
        el('b', {}, fmt(byCategory[c])),
        el('span', { class: 'muted' }, `${pct(byCategory[c], total)}%`),
      ),
    ),
  );
}

// A column of stacked category segments, scaled so `max` fills the plot.
function stack(totals, max, plotHeight) {
  const sum = CATEGORIES.reduce((n, c) => n + totals[c], 0);
  const node = el('span', { class: 'stack' });
  if (!sum || !max) return node;
  const fullPx = (sum / max) * plotHeight;
  const parts = CATEGORIES.filter((c) => (totals[c] / max) * plotHeight >= 1);
  const room = Math.max(parts.length, fullPx - 2 * (parts.length - 1)); // 2px gaps between segments
  for (const c of parts) {
    const h = Math.max(1, (totals[c] / sum) * room);
    node.append(el('span', { 'data-cat': c, style: { height: `${h}px` } }));
  }
  return node;
}

function axis(ticks, max, label) {
  return el(
    'div',
    { class: 'y-axis', 'aria-hidden': 'true' },
    ticks.map((t) => el('span', { style: { bottom: `${(t / max) * 100}%` } }, label(t))),
  );
}

function plotHeight(chart) {
  return parseFloat(getComputedStyle(chart).getPropertyValue('--plot-h')) || 170;
}

const hourName = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });

function renderHours(day, raw, rules) {
  const chart = $('hoursChart');
  const H = plotHeight(chart);
  const ticks = [0, 30 * 60 * 1000, HOUR];
  const plot = el(
    'div',
    { class: 'plot' },
    ticks.slice(1).map((t) => el('div', { class: 'gridline', style: { bottom: `${(t / HOUR) * 100}%` } })),
  );
  const cols = el('div', { class: 'cols' });
  day.hours.forEach((totals, h) => {
    const sum = CATEGORIES.reduce((n, c) => n + totals[c], 0);
    const col = el('div', { class: 'col', tabindex: sum ? 0 : null, 'aria-label': `${hourName(h)}: ${fmt(sum)}` }, stack(totals, HOUR, H));
    attachTip(col, () => {
      const top = Object.entries(raw[h] ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([host, ms]) =>
          el(
            'div',
            { class: 'row muted' },
            el('span', { class: 'dot', 'data-cat': Tempo.categorize(host, rules).category }),
            host,
            el('b', {}, fmt(ms)),
          ),
        );
      const title = `${hourName(h)} – ${hourName((h + 1) % 24)}`;
      return tipRows(title, totals, top.length ? [el('h4', { style: { marginTop: '8px' } }, 'Top sites'), ...top] : []);
    });
    cols.append(col);
  });
  plot.append(cols);
  const xAxis = el(
    'div',
    { class: 'x-axis', 'aria-hidden': 'true' },
    day.hours.map((_, h) => el('span', {}, h % 6 === 0 ? hourName(h) : '')),
  );
  chart.replaceChildren(axis(ticks, HOUR, (t) => `${t / 60000}m`), plot, xAxis);
  chart.setAttribute('role', 'img');
  const busiest = day.hours
    .map((t, h) => [h, t.work])
    .sort((a, b) => b[1] - a[1])[0];
  chart.setAttribute(
    'aria-label',
    day.total && busiest[1] ? `Time by hour. Most work happened around ${hourName(busiest[0])}.` : 'Time by hour: nothing tracked.',
  );
}

function niceStep(max) {
  for (const hours of [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12]) if (max / (hours * HOUR) <= 4) return hours * HOUR;
  return 24 * HOUR;
}

function renderWeek(keys, summaries) {
  const chart = $('weekChart');
  const H = plotHeight(chart);
  const max = Math.max(...summaries.map((s) => s.total));
  const step = niceStep(max || HOUR);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let t = 0; t <= top + 1; t += step) ticks.push(t);

  const plot = el(
    'div',
    { class: 'plot' },
    ticks.slice(1).map((t) => el('div', { class: 'gridline', style: { bottom: `${(t / top) * 100}%` } })),
  );
  const cols = el('div', { class: 'cols' });
  keys.forEach((key, i) => {
    const s = summaries[i];
    const date = Tempo.dayStart(key);
    const name = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const col = el(
      'button',
      {
        type: 'button',
        class: `col${key === ui.day ? ' selected' : ''}`,
        'aria-label': `${name}: ${fmt(s.total)}, ${pct(s.byCategory.work, s.total)}% work`,
        'aria-pressed': String(key === ui.day),
        onclick: () => goToDay(key),
      },
      stack(s.byCategory, top, H),
      key === ui.day && s.total >= 60 * 1000 ? el('span', { class: 'cap', style: { bottom: `${(s.total / top) * 100}%` } }, fmt(s.total)) : null,
    );
    attachTip(col, () => tipRows(name, s.byCategory, s.total ? [el('div', { class: 'row muted' }, 'Focus score', el('b', {}, `${pct(s.byCategory.work, s.total)}%`))] : []));
    cols.append(col);
  });
  plot.append(cols);
  const xAxis = el(
    'div',
    { class: 'x-axis', 'aria-hidden': 'true' },
    keys.map((key) => {
      const d = Tempo.dayStart(key);
      return el(
        'span',
        { class: key === ui.day ? 'selected' : '' },
        d.toLocaleDateString(undefined, { weekday: 'short' }),
        el('br'),
        d.getDate(),
      );
    }),
  );
  chart.replaceChildren(axis(ticks, top, fmt), plot, xAxis);
}

function renderSites(day) {
  const { sites, total } = day;
  const count = (fn) => sites.filter(fn).length;
  const unsorted = count((s) => s.source === 'none');
  const filters = [
    ['all', 'All', sites.length],
    ...CATEGORIES.map((c) => [c, LABELS[c], count((s) => s.category === c)]),
  ];
  if (unsorted || ui.filter === 'unsorted') filters.push(['unsorted', 'Not sorted yet', unsorted]);

  $('siteFilters').replaceChildren(
    ...filters.map(([id, label, n]) =>
      el(
        'button',
        {
          type: 'button',
          class: `chip${id === 'unsorted' ? ' attention' : ''}`,
          'aria-pressed': String(ui.filter === id),
          onclick: () => {
            ui.filter = id;
            ui.showAll = false;
            renderSites(day);
          },
        },
        CATEGORIES.includes(id) ? el('span', { class: 'dot', 'data-cat': id }) : null,
        label,
        el('span', { class: 'count' }, n),
      ),
    ),
  );

  const shown = sites.filter((s) =>
    ui.filter === 'all' ? true : ui.filter === 'unsorted' ? s.source === 'none' : s.category === ui.filter,
  );
  const visible = ui.showAll ? shown : shown.slice(0, SITE_LIMIT);
  const rows = visible.map((site) =>
    el(
      'tr',
      {},
      el(
        'td',
        {},
        el(
          'div',
          { class: 'site-cell' },
          el('span', { class: 'site-name', title: site.host }, site.host),
          el('span', { class: 'site-source' }, TempoUI.sourceText(site)),
        ),
      ),
      el('td', {}, TempoUI.catSelect(site)),
      el('td', { class: 'time-cell' }, fmt(site.ms)),
      el(
        'td',
        { class: 'share-cell' },
        el(
          'div',
          { class: 'share' },
          el('div', { class: 'share-track' }, el('div', { class: 'share-fill', 'data-cat': site.category, style: { width: `${(site.ms / total) * 100}%` } })),
          el('span', { class: 'share-pct' }, site.ms / total < 0.01 ? '<1%' : `${pct(site.ms, total)}%`),
        ),
      ),
    ),
  );
  if (shown.length > visible.length) {
    rows.push(
      el(
        'tr',
        { class: 'more-row' },
        el(
          'td',
          { colspan: 4 },
          el(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                ui.showAll = true;
                renderSites(day);
              },
            },
            `Show all ${shown.length} sites`,
          ),
        ),
      ),
    );
  }
  $('sitesBody').replaceChildren(...rows);
  $('sitesEmpty').hidden = shown.length > 0;
  $('sitesEmpty').textContent = ui.filter === 'unsorted' ? 'Everything is sorted.' : 'No sites for this day.';
}

function goToDay(key) {
  const today = Tempo.dayKey();
  ui.day = key > today ? today : key;
  ui.showAll = false;
  renderOverview();
}

$('prevDay').addEventListener('click', () => goToDay(Tempo.shiftDay(ui.day, -1)));
$('nextDay').addEventListener('click', () => goToDay(Tempo.shiftDay(ui.day, 1)));
$('todayBtn').addEventListener('click', () => goToDay(Tempo.dayKey()));
$('dayPicker').addEventListener('change', (e) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) goToDay(e.target.value);
});
document.addEventListener('keydown', (e) => {
  if (currentView() !== 'overview' || e.altKey || e.metaKey || e.ctrlKey) return;
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === 'ArrowLeft') goToDay(Tempo.shiftDay(ui.day, -1));
  if (e.key === 'ArrowRight') goToDay(Tempo.shiftDay(ui.day, 1));
});

// ---- Settings --------------------------------------------------------------

let toastTimer;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), 2200);
}

async function renderSettings() {
  const [settings, rules, all] = await Promise.all([Tempo.getSettings(), Tempo.getRules(), Tempo.getAll()]);

  $('idleMinutes').value = String(settings.idleMinutes);
  $('countAudible').checked = settings.countAudibleWhenIdle;
  $('badge').value = settings.badge;
  $('dailySummary').checked = settings.dailySummary;
  $('summaryTime').value = settings.summaryTime;
  $('summaryTime').disabled = !settings.dailySummary;
  $('retentionDays').value = String(settings.retentionDays);

  const patterns = Object.keys(rules).sort((a, b) => a.localeCompare(b));
  $('rulesEmpty').hidden = patterns.length > 0;
  $('rulesList').replaceChildren(
    ...patterns.map((pattern) =>
      el(
        'li',
        {},
        el('span', { class: 'pattern', title: pattern }, pattern),
        TempoUI.catSelect({ host: pattern, category: rules[pattern], source: 'rule' }),
        el(
          'button',
          {
            type: 'button',
            class: 'btn small',
            'aria-label': `Remove rule for ${pattern}`,
            onclick: async () => {
              await Tempo.removeRule(pattern);
              toast(`Removed rule for ${pattern}`);
            },
          },
          'Remove',
        ),
      ),
    ),
  );

  const dayKeys = Object.keys(all.days).sort();
  $('dataNote').textContent = dayKeys.length
    ? `${dayKeys.length} day${dayKeys.length === 1 ? '' : 's'} of history stored, starting ${Tempo.dayStart(dayKeys[0]).toLocaleDateString()}.`
    : 'No history stored yet.';
}

const ruleCat = $('ruleCat');
ruleCat.append(...CATEGORIES.map((c) => el('option', { value: c }, LABELS[c])));
ruleCat.dataset.cat = ruleCat.value;
ruleCat.addEventListener('change', () => (ruleCat.dataset.cat = ruleCat.value));

$('addRule').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pattern = Tempo.normalizePattern($('rulePattern').value);
  const error = $('ruleError');
  if (!pattern) {
    error.textContent = 'That doesn’t look like a website. Try something like youtube.com.';
    error.hidden = false;
    return;
  }
  error.hidden = true;
  await Tempo.setRule(pattern, ruleCat.value);
  $('rulePattern').value = '';
  toast(`${pattern} → ${LABELS[ruleCat.value]}`);
});

async function saveSetting(patch) {
  await Tempo.saveSettings(patch);
  toast('Saved');
}

$('idleMinutes').addEventListener('change', (e) => saveSetting({ idleMinutes: Number(e.target.value) }));
$('countAudible').addEventListener('change', (e) => saveSetting({ countAudibleWhenIdle: e.target.checked }));
$('badge').addEventListener('change', (e) => saveSetting({ badge: e.target.value }));
$('dailySummary').addEventListener('change', (e) => saveSetting({ dailySummary: e.target.checked }));
$('summaryTime').addEventListener('change', (e) => {
  if (/^\d{2}:\d{2}$/.test(e.target.value)) saveSetting({ summaryTime: e.target.value });
});
$('retentionDays').addEventListener('change', (e) => saveSetting({ retentionDays: Number(e.target.value) }));

$('exportBtn').addEventListener('click', async () => {
  const data = await Tempo.getAll();
  const json = JSON.stringify({ app: 'tempo', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = el('a', { href: url, download: `tempo-${Tempo.dayKey()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('That file isn’t valid JSON.');
    return;
  }
  if (data?.app !== 'tempo' || typeof data.days !== 'object') {
    toast('That isn’t a Tempo export.');
    return;
  }
  const days = Object.fromEntries(
    Object.entries(data.days).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object'),
  );
  const rules = Object.fromEntries(
    Object.entries(data.rules ?? {}).filter(([k, v]) => Tempo.normalizePattern(k) === k && CATEGORIES.includes(v)),
  );
  const ok = confirm(
    `Import ${Object.keys(days).length} days of history and ${Object.keys(rules).length} rules?\n\n` +
      'Days that already exist in this browser will be replaced by the imported ones. Rules are merged.',
  );
  if (!ok) return;
  const settings = Object.fromEntries(
    Object.entries(data.settings ?? {}).filter(([k, v]) => typeof v === typeof Tempo.DEFAULT_SETTINGS[k]),
  );
  await Tempo.replaceDays(days);
  await Tempo.saveRules({ ...(await Tempo.getRules()), ...rules });
  await Tempo.saveSettings(settings);
  toast('Import complete');
});

$('eraseBtn').addEventListener('click', async () => {
  const ok = confirm('Erase all Tempo history, rules and settings in this browser?\n\nThis can’t be undone. Export first if you want a backup.');
  if (!ok) return;
  await Tempo.clearAll();
  toast('All data erased');
});

// ---- Start -----------------------------------------------------------------

showView();
TempoUI.flush().then(() => currentView() === 'overview' && renderOverview());
