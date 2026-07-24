# DressMyKid

- URL: dressmykid.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase1-scrape
- Chosen method: scrape — same platform/vendor as Familiebutikken (identical robots.txt template, identical `mainEntity`-nested JSON-LD shape, same `mystore_no` image host pattern) — real check confirms the same conclusion.
- Alternatives: none found.
- Status: not started
- Notes: robots.txt open (same template as Familiebutikken/Vakre Barn — only backend/invoice paths blocked). Curled a real product page (`https://www.dressmykid.no/products/hummel-bee-joggebukse-til-smabarn-faded-denim`) — same `@graph: [{@type: Webpage, mainEntity: {@type: Product, offers: {...}}}]` shape as Familiebutikken. Needs the same productOffer() `mainEntity` unwrap fix before scrapeSource() actually picks up a price here — see familiebutikken.md, fix once for both. Baby & kids clothing — no existing pricy.no category fits.
