# Strikkeglede

- URL: strikkeglede.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: needs-recheck
- Chosen method: none — site is behind an active Cloudflare bot-challenge on every request, honest UA or browser UA alike.
- Alternatives: none found.
- Status: not viable 2026-07-25 — sitemap unreadable: no usable sitemap to drive full-catalog discovery from.
- Notes: `curl https://strikkeglede.no/robots.txt` (sandbox disabled) returned a raw IIS "403 - Forbidden: Access is denied" page, not a robots.txt. Fetching the homepage directly, even with the sources.js `BROWSER_UA` (real Chrome UA string), returns a Cloudflare "Attention Required!" JS-challenge page (`<title>Attention Required! | Cloudflare</title>`), not the site. This is a live bot wall, not a one-off — `scrapeSource()`'s plain `fetch()` (no JS execution) will never get past a Cloudflare JS challenge, so this isn't like NetOnNet's UA-only block (`cfg.ua = 'browser'` fixes those); no config flip fixes this one. Effectively non-viable for the current scrape infra until/unless a headless-browser fetch path is built — treating as blocked-in-practice, not formally in either "do not scrape" table (no ToS/robots signal was ever readable to check). Category would be a new "Hobby"/"Crafts" bucket (yarn/knitting) — moot until reachable.
