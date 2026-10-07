# Store listing copy

Everything to paste into the Chrome Web Store and Firefox Add-ons (AMO) forms. Images are in [assets/](assets/). Regenerate them with `npm run build && npm run screenshots`.

Upload files (from `npm run package`):

- Chrome: `dist/daysplit-chromium-<version>.zip`
- Firefox: `dist/daysplit-firefox-<version>.zip`

---

## Shared

**Name:** Daysplit – Website Time Tracker (taken from the manifest)

**Short summary** (Chrome takes it from the manifest, max 132 characters):

> See how much time you spend on each website, split into work, entertainment and waste. Everything stays on your device.

**Homepage:** https://github.com/ShaifArfan/daysplit

**Support:** https://github.com/ShaifArfan/daysplit/issues

**Privacy policy:** https://github.com/ShaifArfan/daysplit/blob/main/PRIVACY.md

**Description** (Chrome shows plain text, so this uses no Markdown):

```
Daysplit shows where your browser time goes. It tracks how long you spend on each website and splits your day into Work, Entertainment, Waste and Other, so at the end of the day you can see how much of it was focused work.

HOW IT COUNTS
• Time counts only for the active tab of a focused browser window. Switch to another app and it pauses.
• Step away and it stops after a short idle timeout (2 minutes by default). A tab playing sound, like a video or a call, keeps counting.
• Private windows and browser pages are never tracked.

SORTED AUTOMATICALLY
• About 200 well-known sites come pre-sorted: code hosting and docs count as Work, streaming as Entertainment, social feeds as Waste.
• Local development servers count as Work.
• For anything else, Daysplit guesses from the address, such as "docs." or ".tv".
• Disagree? Change a site's category in one click. Past days update too.

SEE YOUR DAY
• Popup: today's focused time, your focus score, and the site you're on.
• Dashboard: time by hour, the last 7 days, and every site you visited.
• Toolbar badge: today's work time, colored by the current site's category.
• Optional end-of-day notification with the day's totals.

PRIVATE BY DESIGN
• Everything stays in your browser. No account, no servers, no analytics.
• Only domains are saved, never full addresses or page contents.
• Export your data as JSON, or erase it, at any time.

Daysplit is free and open source under the MIT license:
https://github.com/ShaifArfan/daysplit
```

---

## Chrome Web Store

Developer dashboard: https://chrome.google.com/webstore/devconsole

### Store listing tab

| Field | Value |
|---|---|
| Description | the shared description above |
| Category | Productivity → **Workflow & Planning** |
| Language | English |
| Store icon | `assets/store-icon-128.png` |
| Screenshots | `assets/screenshot-1-overview.png` … `screenshot-5-dark.png` (in order) |
| Small promo tile | `assets/promo-small-440x280.png` |
| Marquee promo tile | `assets/promo-marquee-1400x560.png` |
| Homepage URL | https://github.com/ShaifArfan/daysplit |
| Support URL | https://github.com/ShaifArfan/daysplit/issues |
| Mature content | No |

### Privacy practices tab

**Single purpose:**

> Daysplit measures how much time the user spends on each website and shows that time split into the categories work, entertainment, waste and other.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabs` | Reads the address of the active tab to get its domain, so time is credited to the site the user is on. Only the domain is kept, in local storage. |
| `storage` | Saves time per domain, the user's category rules and settings in local extension storage. |
| `unlimitedStorage` | Months of per-hour history can exceed the default 10 MB local storage limit. This keeps long histories saving correctly. |
| `idle` | Stops counting when the user is away from the computer, so totals reflect real use. |
| `alarms` | A one-minute heartbeat saves elapsed time (the service worker can be stopped at any moment). Also schedules the optional end-of-day summary. |
| `notifications` | Shows the optional end-of-day summary of time per category. |

**Remote code:** No, I am not using remote code.

**Data usage.** Tick only:

- [x] **Web history** (the domains of visited sites, with time spent; stored only on the device)

Leave every other type unticked. Then tick all three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/ShaifArfan/daysplit/blob/main/PRIVACY.md

### Distribution tab

Visibility: **Public**. Regions: **All regions**. Price: free.

---

## Firefox Add-ons (AMO)

Developer hub: https://addons.mozilla.org/developers/addon/submit/distribution

1. Choose **On this site** (listed).
2. Upload `dist/daysplit-firefox-<version>.zip`.
3. **Do you need to submit source code?** No. Nothing is minified or bundled; the zip contains the original source files.

| Field | Value |
|---|---|
| Name | Daysplit – Website Time Tracker |
| Add-on URL | `daysplit` (if available) |
| Summary (max 250) | See where your browser time goes. Daysplit tracks time on each website and splits your day into work, entertainment and waste. Everything stays on your device. |
| Description | the shared description above |
| Categories | **Other** |
| Support website | https://github.com/ShaifArfan/daysplit/issues |
| License | MIT License |
| Privacy policy | Optional for AMO, since the add-on declares it collects no data. You can paste the text of `PRIVACY.md` anyway. |

**Notes for reviewers:**

> Plain JavaScript with no bundler or minification. The build step (scripts/build.mjs) only copies src/ and writes a per-browser manifest. Source: https://github.com/ShaifArfan/daysplit. The add-on makes no network requests and runs no remote code; all data stays in storage.local.

**Release notes (1.0.0):** First release.

### Or submit from the command line

Create API keys at https://addons.mozilla.org/developers/addon/api/key/, then:

```bash
npx web-ext sign --source-dir dist/firefox --channel listed --amo-metadata store/amo-metadata.json --api-key "$WEB_EXT_API_KEY" --api-secret "$WEB_EXT_API_SECRET"
```

You still add the screenshots on the AMO website afterwards.
