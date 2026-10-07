// Builds one folder per browser family from src/:
//   dist/chromium  - Chrome, Edge, Brave, Arc, Vivaldi, Opera...
//   dist/firefox   - Firefox, Zen, LibreWolf, Floorp, Waterfox...
//
//   node scripts/build.mjs            build both
//   node scripts/build.mjs --zip      also write store-ready .zip files
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };

const base = {
  manifest_version: 3,
  name: 'Daysplit – Website Time Tracker',
  short_name: 'Daysplit',
  version,
  description: 'See how much time you spend on each website, split into work, entertainment and waste. Everything stays on your device.',
  permissions: ['tabs', 'storage', 'idle', 'alarms', 'notifications'],
  icons,
  action: { default_title: 'Daysplit', default_popup: 'popup/popup.html', default_icon: icons },
  options_ui: { page: 'dashboard/dashboard.html', open_in_tab: true },
};

const manifests = {
  chromium: {
    ...base,
    // Chromium caps storage.local at 10 MB; years of history can exceed that.
    permissions: [...base.permissions, 'unlimitedStorage'],
    minimum_chrome_version: '110',
    background: { service_worker: 'background.js' },
  },
  firefox: {
    ...base,
    background: { scripts: ['lib/sites.js', 'lib/core.js', 'background.js'] },
    browser_specific_settings: {
      gecko: {
        id: 'daysplit@shaifarfan.github.io',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
};

function buildTarget(name, manifest) {
  const out = join(dist, name);
  rmSync(out, { recursive: true, force: true });
  cpSync(src, out, { recursive: true, filter: (p) => !p.endsWith('.DS_Store') });
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return out;
}


const zip = process.argv.includes('--zip');
mkdirSync(dist, { recursive: true });
for (const [name, manifest] of Object.entries(manifests)) {
  const out = buildTarget(name, manifest);
  console.log(`Built ${out}`);
  if (zip) {
    const file = join(dist, `daysplit-${name}-${version}.zip`);
    rmSync(file, { force: true });
    execFileSync('zip', ['-r', '-X', '-q', file, ...readdirSync(out)], { cwd: out });
    console.log(`Packed ${file}`);
  }
}
