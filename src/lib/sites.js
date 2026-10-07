// Built-in guesses for well-known sites. A category you pick yourself (in the
// popup or the dashboard) always wins over anything listed here.
//
// Entries match the domain and all of its subdomains, so "google.com" would
// also cover "mail.google.com". The most specific entry wins.
globalThis.TempoSites = {
  work: [
    // Code & dev tools
    'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'stackexchange.com',
    'superuser.com', 'serverfault.com', 'developer.mozilla.org', 'npmjs.com', 'pypi.org',
    'crates.io', 'docs.rs', 'pkg.go.dev', 'readthedocs.io', 'readthedocs.org', 'devdocs.io',
    'caniuse.com', 'regex101.com', 'codepen.io', 'codesandbox.io', 'stackblitz.com',
    'replit.com', 'jsfiddle.net', 'dev.to', 'hashnode.com', 'w3schools.com', 'mdn.dev',
    'leetcode.com', 'hackerrank.com', 'docker.com', 'hub.docker.com', 'kubernetes.io',
    'postman.com', 'swagger.io', 'jsonformatter.org', 'sentry.io', 'datadoghq.com',
    'grafana.com', 'circleci.com', 'travis-ci.com', 'gitpod.io', 'codeberg.org',
    // Cloud & hosting
    'vercel.com', 'netlify.com', 'cloudflare.com', 'dash.cloudflare.com', 'heroku.com',
    'render.com', 'fly.io', 'railway.app', 'supabase.com', 'firebase.google.com',
    'console.firebase.google.com', 'console.cloud.google.com', 'cloud.google.com',
    'console.aws.amazon.com', 'aws.amazon.com', 'portal.azure.com', 'azure.microsoft.com',
    'digitalocean.com', 'planetscale.com', 'neon.tech', 'mongodb.com', 'expo.dev',
    'appstoreconnect.apple.com', 'developer.apple.com', 'developer.android.com',
    // AI assistants
    'claude.ai', 'console.anthropic.com', 'docs.anthropic.com', 'chatgpt.com',
    'chat.openai.com', 'platform.openai.com', 'gemini.google.com', 'aistudio.google.com',
    'perplexity.ai', 'huggingface.co', 'kaggle.com', 'colab.research.google.com',
    // Docs, planning & communication
    'docs.google.com', 'sheets.google.com', 'slides.google.com', 'drive.google.com',
    'mail.google.com', 'calendar.google.com', 'meet.google.com', 'keep.google.com',
    'outlook.office.com', 'outlook.office365.com', 'outlook.live.com', 'office.com',
    'teams.microsoft.com', 'teams.live.com', 'sharepoint.com', 'onedrive.live.com',
    'notion.so', 'notion.site', 'figma.com', 'miro.com', 'canva.com', 'linear.app',
    'atlassian.net', 'atlassian.com', 'jira.com', 'trello.com', 'asana.com', 'clickup.com',
    'monday.com', 'basecamp.com', 'airtable.com', 'coda.io', 'obsidian.md', 'slack.com',
    'app.slack.com', 'zoom.us', 'loom.com', 'calendly.com', 'dropbox.com', 'box.com',
    'overleaf.com', 'grammarly.com', 'excalidraw.com', 'whimsical.com', 'lucid.app',
    // Learning
    'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org', 'udacity.com',
    'pluralsight.com', 'frontendmasters.com', 'egghead.io', 'freecodecamp.org',
    'codecademy.com', 'scholar.google.com', 'arxiv.org', 'wikipedia.org',
  ],
  entertainment: [
    'youtube.com', 'youtu.be', 'music.youtube.com', 'netflix.com', 'primevideo.com',
    'hulu.com', 'disneyplus.com', 'hotstar.com', 'max.com', 'hbomax.com', 'peacocktv.com',
    'paramountplus.com', 'tv.apple.com', 'music.apple.com', 'crunchyroll.com',
    'twitch.tv', 'kick.com', 'vimeo.com', 'dailymotion.com', 'bilibili.com',
    'spotify.com', 'open.spotify.com', 'soundcloud.com', 'deezer.com', 'tidal.com',
    'imdb.com', 'letterboxd.com', 'rottentomatoes.com', 'goodreads.com',
    'store.steampowered.com', 'steamcommunity.com', 'epicgames.com', 'itch.io',
    'chess.com', 'lichess.org', 'poki.com', 'crazygames.com', 'miniclip.com',
    'chorki.com', 'bongobd.com', 'hoichoi.tv', 'toffeelive.com', 'jiocinema.com',
    'zee5.com', 'sonyliv.com', 'mxplayer.in',
  ],
  waste: [
    'facebook.com', 'm.facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com',
    'x.com', 'reddit.com', 'old.reddit.com', 'threads.net', 'threads.com', 'bsky.app',
    'snapchat.com', 'pinterest.com', 'tumblr.com', '9gag.com', 'imgur.com',
    'buzzfeed.com', 'boredpanda.com', 'quora.com', 'ifunny.co', 'knowyourmeme.com',
    'tmz.com', 'dailymail.co.uk', 'likee.video', 'vk.com',
  ],

  // When a site isn't listed above, Tempo looks at the words in its address
  // (split on dots and dashes). "docs.python.org" contains "docs", so it's
  // probably work; "something.tv" ends in "tv", so probably entertainment.
  keywords: {
    work: [
      'docs', 'doc', 'documentation', 'developer', 'developers', 'devdocs', 'api', 'sdk',
      'console', 'dashboard', 'admin', 'portal', 'wiki', 'jira', 'confluence', 'jenkins',
      'grafana', 'kibana', 'sentry', 'gitlab', 'git', 'learn', 'academy', 'course',
      'courses', 'tutorial', 'tutorials', 'mail', 'webmail', 'calendar', 'meet', 'intranet',
      'erp', 'crm', 'lms', 'scholar', 'research', 'edu', 'staging',
    ],
    entertainment: [
      'tv', 'movie', 'movies', 'film', 'films', 'anime', 'manga', 'stream', 'streaming',
      'music', 'games', 'game', 'gaming', 'watch', 'video', 'videos', 'radio',
      'podcast', 'podcasts', 'cinema', 'series', 'comics',
    ],
    waste: ['meme', 'memes', 'gossip', 'celebrity', 'viral', 'social', 'funny'],
  },
};
