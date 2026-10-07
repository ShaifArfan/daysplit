const { api } = Tempo;
const { el } = TempoUI;
const $ = (id) => document.getElementById(id);

const TOP_SITES = 6;

let currentHost = null;

async function render() {
  const key = Tempo.dayKey();
  const [days, rules, tabs] = await Promise.all([
    Tempo.getDays([key]),
    Tempo.getRules(),
    api.tabs.query({ active: true, currentWindow: true }),
  ]);
  const summary = Tempo.summarize(days[key], rules);
  const { total, byCategory } = summary;
  currentHost = Tempo.hostFromUrl(tabs[0]?.url);

  // Header
  $('dateLine').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  $('focusTime').textContent = Tempo.formatDuration(byCategory.work);
  $('totalLine').textContent = total
    ? `of ${Tempo.formatDuration(total)} in the browser today`
    : 'Nothing tracked yet today';
  const focus = TempoUI.pct(byCategory.work, total);
  $('score').style.setProperty('--p', focus);
  $('scoreValue').textContent = total ? `${focus}%` : '–';
  $('score').setAttribute('aria-label', total ? `Focus score ${focus}%` : 'Focus score: no data yet');

  renderCurrent(summary, rules);

  // Category split
  $('stack').replaceChildren(TempoUI.stackbar(byCategory, total));
  $('legend').replaceChildren(
    ...Tempo.CATEGORIES.map((c) =>
      el('li', {}, el('span', { class: 'dot', 'data-cat': c }), Tempo.LABELS[c], el('b', {}, Tempo.formatDuration(byCategory[c]))),
    ),
  );

  // Top sites
  const top = summary.sites.slice(0, TOP_SITES);
  $('sitesEmpty').hidden = top.length > 0;
  $('sites').replaceChildren(
    ...top.map((site) =>
      el(
        'li',
        {},
        el('span', { class: 'name', title: site.host }, site.host),
        el('span', { class: 'time' }, Tempo.formatDuration(site.ms)),
        TempoUI.catSelect(site, render),
      ),
    ),
  );
}

function renderCurrent(summary, rules) {
  const seg = $('curSeg');
  if (!currentHost) {
    $('curHost').textContent = 'This page isn’t tracked';
    $('curMeta').textContent = 'Browser and extension pages don’t count.';
    $('curAvatar').textContent = '·';
    $('curAvatar').removeAttribute('data-cat');
    seg.hidden = true;
    return;
  }
  const info = Tempo.categorize(currentHost, rules);
  const ms = summary.sites.find((s) => s.host === currentHost)?.ms ?? 0;
  $('curHost').textContent = currentHost;
  $('curHost').title = currentHost;
  $('curMeta').textContent = `${Tempo.formatDuration(ms)} today · ${TempoUI.sourceText({ ...info, host: currentHost })}`;
  $('curAvatar').textContent = currentHost.replace(/^\[|\]$/g, '')[0];
  $('curAvatar').dataset.cat = info.category;
  seg.hidden = false;
  seg.replaceChildren(
    ...Tempo.CATEGORIES.map((c) =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(c === info.category),
          'data-cat': c,
          onclick: async () => {
            await Tempo.setRule(currentHost, c);
            render();
          },
        },
        el('span', { class: 'dot' }),
        Tempo.LABELS[c],
      ),
    ),
  );
}

$('openDash').addEventListener('click', () => {
  api.runtime.openOptionsPage();
  window.close();
});

$('openSettings').addEventListener('click', async () => {
  await api.tabs.create({ url: api.runtime.getURL('dashboard/dashboard.html#settings') });
  window.close();
});

// Show stored numbers immediately, then refresh once the background has
// committed the last few seconds.
render().then(() => TempoUI.flush()).then(render);
