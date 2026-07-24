# Bygghjemme.no

- URL: bygghjemme.no
- Category: Home, interior, furniture, garden & DIY
- Tier: phase1-scrape
- Chosen method: scrapeSource() — first-party Product JSON-LD confirmed present with real offers/price, no ToS or robots block. Cheapest option (no contract, no approval).
- Alternatives: none found (no affiliate-network signal in SHOP-CANDIDATES.md)
- Status: not started
- Notes:
  - robots.txt (curled, sandbox disabled): only disallows cart/checkout/search/admin/compare paths (`/handlekurv`, `/kasse`, `/sok`, `/admin`, `/compare`, etc). No named-bot blocks, product paths (`/…/p-<id>`) wide open.
  - ToS (WebFetch'd `https://www.bygghjemme.no/kjopsbetingelser/`): standard Norwegian consumer-purchase boilerplate (forbrukerkjøpsloven, angrerett, etc). No mention of scraping/automated access/bots/crawlers.
  - JSON-LD spot-check (curl, sandbox disabled, python parse) on `https://www.bygghjemme.no/hus-och-bygg/dor-og-port/verandador-og-terrassedor/skyvedor-terrasse/skyvedor-nordan/p-672032`: `<script type="application/ld+json" id="product-jsonld">` — `@type: Product`, includes `offers` with `price` populated. This is exactly the shape `scrapeSource()`/`productOffer()` already parses — no code changes needed.
  - Category mapping: sells windows, doors, bathroom fixtures, building materials — none of worker/cats.json's current categories (Audio/Phones/TV/Projectors/Gaming/Home/Computers/Toys/E-readers/Kitchen) fit. **A new category (e.g. "Building materials"/"DIY"/"Windows & Doors") + worker/extra.json rows would be needed** before this shop's products can surface anywhere in the catalog. Not added here — Phase B decision.
  - Candidate product URLs for worker/extra.json (all real, found via WebFetch on the NorDan brand listing page, not fabricated):
    1. Skyvedør NorDan — `https://www.bygghjemme.no/hus-och-bygg/dor-og-port/verandador-og-terrassedor/skyvedor-terrasse/skyvedor-nordan/p-672032` (spot-checked, JSON-LD confirmed) — proposed `product_id: bygghjemme-nordan-skyvedor`, cat: new "Building materials"/"Windows & Doors" cat, icon candidate `door-open`
    2. Ytterdør NorDan Ruten 831G2 — `.../ytterdor-nordan-ruten-831g2/p-1922616`
    3. Vindu NorDan Toppsving — `.../vindu-nordan-toppsving/p-861017`
    4. Sikkerhetsvindu NorDan 2-veis Innadslående — `.../sikkerhetsvindu-nordan-2-veis-innadslaende/p-670751`
  - Only #1 was spot-checked for JSON-LD; #2-4 are same brand/template so plausibly identical shape but unverified — WebSearch budget for this session ran out before a second confirmation pass could be done. Worth a quick re-check in Phase B before wiring.
