import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBackground } from './helpers.mjs';

// Load just the shared code (no background) to test pure helpers.
const { Tempo } = await startBackground({ files: ['lib/sites.js', 'lib/core.js'] });

// Objects from the VM have a different Object.prototype; compare as plain JSON.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

test('hostFromUrl normalizes addresses', () => {
  assert.equal(Tempo.hostFromUrl('https://www.GitHub.com/a/b?c'), 'github.com');
  assert.equal(Tempo.hostFromUrl('http://localhost:5173/'), 'localhost:5173');
  assert.equal(Tempo.hostFromUrl('http://127.0.0.1:8000/x'), '127.0.0.1:8000');
  assert.equal(Tempo.hostFromUrl('https://example.com:8443/'), 'example.com');
  assert.equal(Tempo.hostFromUrl('chrome://settings'), null);
  assert.equal(Tempo.hostFromUrl('about:newtab'), null);
  assert.equal(Tempo.hostFromUrl('not a url'), null);
  assert.equal(Tempo.hostFromUrl(undefined), null);
});

test('categorize: known sites, subdomains, keywords, local dev', () => {
  const cat = (h, rules) => Tempo.categorize(h, rules);
  same(cat('github.com'), { category: 'work', source: 'auto' });
  same(cat('gist.github.com'), { category: 'work', source: 'auto' });
  same(cat('youtube.com'), { category: 'entertainment', source: 'auto' });
  same(cat('instagram.com'), { category: 'waste', source: 'auto' });
  same(cat('docs.python.org'), { category: 'work', source: 'guess' });
  same(cat('cool-anime.example'), { category: 'entertainment', source: 'guess' });
  same(cat('localhost:3000'), { category: 'work', source: 'auto' });
  same(cat('myapp.test'), { category: 'work', source: 'auto' });
  same(cat('bank.example'), { category: 'other', source: 'none' });
  // More specific built-in entry wins over the parent domain.
  assert.equal(cat('music.youtube.com').category, 'entertainment');
});

test('categorize: your rules beat built-ins, most specific rule wins', () => {
  const rules = { 'youtube.com': 'work', 'google.com': 'waste', 'mail.google.com': 'work', 'localhost:8080': 'other' };
  same(Tempo.categorize('youtube.com', rules), { category: 'work', source: 'rule', rule: 'youtube.com' });
  same(Tempo.categorize('music.youtube.com', rules), { category: 'work', source: 'rule', rule: 'youtube.com' });
  assert.equal(Tempo.categorize('news.google.com', rules).category, 'waste');
  assert.equal(Tempo.categorize('mail.google.com', rules).category, 'work');
  assert.equal(Tempo.categorize('localhost:8080', rules).category, 'other');
  assert.equal(Tempo.categorize('localhost:3000', rules).category, 'work');
  assert.equal(Tempo.categorize('x.com', { 'x.com': 'bogus' }).category, 'waste', 'invalid rule ignored');
});

test('normalizePattern accepts what people type', () => {
  assert.equal(Tempo.normalizePattern('YouTube.com'), 'youtube.com');
  assert.equal(Tempo.normalizePattern('https://www.reddit.com/r/all'), 'reddit.com');
  assert.equal(Tempo.normalizePattern('*.google.com'), 'google.com');
  assert.equal(Tempo.normalizePattern('localhost:3000'), 'localhost:3000');
  assert.equal(Tempo.normalizePattern('  '), null);
  assert.equal(Tempo.normalizePattern('not a site!'), null);
});

test('summarize totals by category, hour and site, applying rules retroactively', () => {
  const day = { 9: { 'github.com': 1000, 'youtube.com': 500 }, 21: { 'youtube.com': 2000, 'bank.example': 100 } };
  const s = Tempo.summarize(day);
  assert.equal(s.total, 3600);
  same(s.byCategory, { work: 1000, entertainment: 2500, waste: 0, other: 100 });
  assert.equal(s.hours[21].entertainment, 2000);
  same(s.sites.map((x) => x.host), ['youtube.com', 'github.com', 'bank.example']);

  const after = Tempo.summarize(day, { 'youtube.com': 'waste' });
  same(after.byCategory, { work: 1000, entertainment: 0, waste: 2500, other: 100 });
});

test('formatting', () => {
  assert.equal(Tempo.formatDuration(0), '0m');
  assert.equal(Tempo.formatDuration(42 * 1000), '42s');
  assert.equal(Tempo.formatDuration(5 * 60000), '5m');
  assert.equal(Tempo.formatDuration(120 * 60000), '2h');
  assert.equal(Tempo.formatDuration(135 * 60000), '2h 15m');
  assert.equal(Tempo.formatBadge(30 * 1000), '0m');
  assert.equal(Tempo.formatBadge(59 * 60000), '59m');
  assert.equal(Tempo.formatBadge(65 * 60000), '1h05');
  assert.equal(Tempo.formatBadge(11 * 3600000), '11h');
});

test('day helpers', () => {
  assert.equal(Tempo.shiftDay('2026-10-01', -1), '2026-09-30');
  assert.equal(Tempo.shiftDay('2026-12-31', 1), '2027-01-01');
  const next = Tempo.nextOccurrence('21:00', new Date(2026, 9, 7, 20, 59).getTime());
  assert.equal(next, new Date(2026, 9, 7, 21, 0).getTime());
  const tomorrow = Tempo.nextOccurrence('21:00', new Date(2026, 9, 7, 21, 0).getTime());
  assert.equal(tomorrow, new Date(2026, 9, 8, 21, 0).getTime());
});
