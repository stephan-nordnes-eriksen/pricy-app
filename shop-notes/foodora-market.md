# Foodora Market

- URL: foodora.no/groceries
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: needs-recheck
- Chosen method: none — actively bot-walled, and the catalog is vendor/city-scoped rather than exposed as stable crawlable product pages
- Alternatives: none identified
- Status: not started
- Notes:
  `curl -sL https://www.foodora.no/robots.txt`: mostly permissive for
  `User-Agent: *` (a handful of app-route disallows: `/login`,
  `/referral`, `*/home`, `*/view-all/*`, an xhr collector endpoint), and
  it explicitly names AI crawlers — `OAI-SearchBot`/`ChatGPT-User` get
  `Allow: /`, but plain `GPTBot` gets `Disallow: /`. No blanket ban on
  general scrapers.

  Actual fetches of `https://www.foodora.no/groceries` (plain UA, then
  full browser UA + `Accept-Language: nb-NO`) both returned **HTTP 403**,
  serving a PerimeterX bot-challenge page (`px-captcha`,
  `window._pxAppId`, etc.) — an actively enforced commercial bot wall,
  not merely an absence of restriction. WebFetch of
  `/page/terms-and-conditions` also 403'd, so the ToS text itself
  couldn't be read directly.

  This matches "App/API driven": Foodora Market's grocery catalog is
  scoped to a selected delivery address/dark-store rather than served as
  stable, addressable product pages — there is no plain-fetch page that
  would resolve to a consistent product+price the way `scrapeSource()`
  expects, even before the PerimeterX wall is factored in.

  **Catalog-fit verdict:** even if the bot wall were cleared, Foodora
  Market pricing is delivery-zone/dark-store specific (same local-
  pricing problem as Meny, arguably worse — assortment varies by rider
  area), and there's no server-rendered product/offer markup to point a
  `scrape` source at. This would require a real mobile/web API
  integration keyed to a delivery address, a different kind of project
  than `scrapeSource()`/`adtractionSource()` support today — not a fit as
  currently scoped.
