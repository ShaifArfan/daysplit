const { api } = Daysplit;
const { el } = DaysplitUI;
const $ = (id) => document.getElementById(id);

const TOP_SITES = 6;

let currentHost = null;

async function render() {
  const key = Daysplit.dayKey();
  const [days, rules, tabs] = await Promise.all([
    Daysplit.getDays([key]),
    Daysplit.getRules(),
    api.tabs.query({ active: true, currentWindow: true }),
  ]);
  const summary = Daysplit.summarize(days[key], rules);
  const { total, byCategory } = summary;
  currentHost = Daysplit.hostFromUrl(tabs[0]?.url);

  // Header
  $('dateLine').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  $('focusTime').textContent = Daysplit.formatDuration(byCategory.work);
  $('totalLine').textContent = total
    ? `of ${Daysplit.formatDuration(total)} in the browser today`
    : 'Nothing tracked yet today';
  const focus = DaysplitUI.pct(byCategory.work, total);
  $('score').style.setProperty('--p', focus);
  $('scoreValue').textContent = total ? `${focus}%` : '–';
  $('score').setAttribute('aria-label', total ? `Focus score ${focus}%` : 'Focus score: no data yet');

  renderCurrent(summary, rules);

  // Category split
  $('stack').replaceChildren(DaysplitUI.stackbar(byCategory, total));
  $('legend').replaceChildren(
    ...Daysplit.CATEGORIES.map((c) =>
      el('li', {}, el('span', { class: 'dot', 'data-cat': c }), Daysplit.LABELS[c], el('b', {}, Daysplit.formatDuration(byCategory[c]))),
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
        el('span', { class: 'time' }, Daysplit.formatDuration(site.ms)),
        DaysplitUI.catSelect(site, render),
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
  const info = Daysplit.categorize(currentHost, rules);
  const ms = summary.sites.find((s) => s.host === currentHost)?.ms ?? 0;
  $('curHost').textContent = currentHost;
  $('curHost').title = currentHost;
  $('curMeta').textContent = `${Daysplit.formatDuration(ms)} today · ${DaysplitUI.sourceText({ ...info, host: currentHost })}`;
  $('curAvatar').textContent = currentHost.replace(/^\[|\]$/g, '')[0];
  $('curAvatar').dataset.cat = info.category;
  seg.hidden = false;
  seg.replaceChildren(
    ...Daysplit.CATEGORIES.map((c) =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(c === info.category),
          'data-cat': c,
          onclick: async () => {
            await Daysplit.setRule(currentHost, c);
            render();
          },
        },
        el('span', { class: 'dot' }),
        Daysplit.LABELS[c],
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
render().then(() => DaysplitUI.flush()).then(render);
