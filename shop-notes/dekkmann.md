# Dekkmann

- URL: dekkmann.no → redirects to the BestDrive platform, www.bestdrive.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none — no per-SKU priced product page found
- Alternatives: none found
- Status: not started
- Notes: robots.txt (fetched via the redirect target) is open (`Disallow:
  /etc/`, `/libs/` only — Adobe AEM default). Fetched a real tire-model
  page, `https://www.bestdrive.no/dekk/Continental/continental-sommerdekk/premiumcontact7.html`
  (200 OK): only ONE ld+json block on the page, a `BreadcrumbList` — no
  `Product`/`Offer` node, no price in JSON-LD. This looks like a brand/
  model brochure page (you pick tire size via a fitment tool, not a static
  per-SKU priced page), same pattern as Dekk1/MECA — tire-fitting chains
  in this batch don't expose conventional per-product JSON-LD pricing.
  Needs a human to find whether BestDrive/Dekkmann has any page that
  actually shows a price per tire+size combination before this can move
  past needs-recheck.
