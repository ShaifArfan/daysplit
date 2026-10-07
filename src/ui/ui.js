// Small DOM helpers shared by the popup and dashboard.
globalThis.DaysplitUI = (() => {
  // el('div', { class: 'x', onclick: fn }, child, 'text', ...)
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key in node && key !== 'list') node[key] = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : String(child));
    }
    return node;
  }

  const SOURCE_TEXT = {
    rule: 'Set by you',
    auto: 'Known site',
    guess: 'Guessed from the address',
    none: 'Not sorted yet',
  };

  function sourceText(info) {
    if (info.source === 'rule' && info.rule && info.host && info.rule !== info.host) return `Your rule for ${info.rule}`;
    return SOURCE_TEXT[info.source] ?? '';
  }

  // A pill-shaped <select> that saves a rule for the site when changed.
  function catSelect(site, onChange) {
    const select = el(
      'select',
      {
        class: 'cat-select',
        'aria-label': `Category for ${site.host}`,
        title: sourceText(site),
        onchange: async () => {
          select.dataset.cat = select.value;
          await Daysplit.setRule(site.host, select.value);
          onChange?.(select.value);
        },
      },
      Daysplit.CATEGORIES.map((c) => el('option', { value: c, selected: c === site.category }, Daysplit.LABELS[c])),
    );
    select.dataset.cat = site.category;
    return select;
  }

  function stackbar(byCategory, total) {
    const bar = el('div', { class: 'stackbar', role: 'img' });
    const parts = [];
    for (const c of Daysplit.CATEGORIES) {
      if (!byCategory[c] || !total) continue;
      const pct = (byCategory[c] / total) * 100;
      if (pct < 0.4) continue;
      bar.append(el('span', { 'data-cat': c, style: { flex: `${pct} 1 0` } }));
      parts.push(`${Daysplit.LABELS[c]} ${Math.round(pct)}%`);
    }
    bar.setAttribute('aria-label', parts.length ? parts.join(', ') : 'No time tracked');
    return bar;
  }

  // Ask the background to commit the time counted so far.
  async function flush() {
    try {
      await Daysplit.api.runtime.sendMessage({ type: 'flush' });
    } catch {
      // Background not reachable (e.g. still starting): show what's stored.
    }
  }

  const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

  return { el, catSelect, stackbar, sourceText, flush, pct };
})();
