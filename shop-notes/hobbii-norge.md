# Hobbii Norge

- URL: hobbii.no
- Category: Beauty, health & pharmacy / books, media & hobby
- Tier: phase1-scrape
- Chosen method: scrapeSource() — confirmed Product/Offer JSON-LD, robots.txt is Silent on product paths (standard Shopify boilerplate disallow list: cart/checkout/account/admin only), international chain with no NO-specific affiliate signal found. Cheapest option, no approval needed.
- Alternatives: Hobbii is an international group (hobbii.com, .no, .de, etc. — same Shopify-family platform as cchobby.no's multi-country setup); worth a Phase B check for a group-wide EU affiliate program, but nothing confirmed and scrape already works today.
- Status: not started
- Notes: robots.txt Silent (Shopify default: `/admin`, `/cart`, `/checkout`, `/account`, `/orders` disallowed, product/collection paths open). Real product page `https://hobbii.no/products/hp-1005670-honey-bunny` returns JSON-LD with `"@type": "Product"` and `"@type": "Offer"` present (Shopify's standard product schema — price/currency/availability all populate).

  Category mapping: yarn/crochet/knitting supplies fit none of worker/cats.json's current categories (Audio, Phones, TV, Projectors, Gaming, Home, Computers, Toys, E-readers, Kitchen) — needs a new "Hobby" or "Crafts" category + worker/extra.json rows before this shop can actually list anything.

  Candidate product URLs for worker/extra.json (real, found via product-page search):
  - https://hobbii.no/products/hp-1005670-honey-bunny (Honey Bunny yarn, own-brand) — proposed id `hobbii-honey-bunny`, cat `Hobby` (new), kw yarn/garn/crochet
  - Broader catalog browse (`hobbii.no/garn`, `hobbii.no/hobbii-garner`) is the discovery path for more SKUs — only one product spot-checked this round.

  JSON-LD spot-check result: PASS — Product+Offer confirmed on the one URL checked.
