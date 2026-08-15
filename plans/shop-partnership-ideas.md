# Getting Norwegian web stores to want to join pricy.no

Research + brainstorm, 2026-08-14. Ideas for merchant-facing value so shops
actively agree to be listed, feed us data, and sign scraping/feed agreements
(today: 0 approved shops, all sampled at 400 pages). The "additional sales"
addon API (ADDON_SOURCES) is the template: a small, optional, shop-controlled
hook that gives the shop something rather than taking from it.

## The market window (why shops will listen right now)

- **Prisjakt is bleeding merchants over fees.** A "market-based" click-price
  increase took effect Jan 1 2026 — announced the day before Black Friday —
  and large Nordic shops have publicly left: Inet ("click fees erase the
  entire margin on popular products… Prisjakt has in principle a monopoly"),
  Cyberphoto, Teknikproffset ("the cost of the traffic now exceeds the value
  it generates"), Jollyroom (CEO: not "god forretningsskikk"). Prisjakt's
  planned IPO was postponed amid the churn.
  (ehandel.se, netthandel.no, inet.se/nyhet/12084, teknikveckan.se)
- **Norway has no independent domestic comparison site at scale.** Prisguiden
  was shut down mid-2023 and folded into Klarna's app; Prisjakt is
  Swedish-owned (Schibsted → eEquity, June 2025). A shop's comparison data at
  Klarna lives inside a payments company it may compete with.
  (springboard.no, retailmagasinet.no, eequity.se)
- Prisjakt's own model is free basic listing + CPC/CPO for "profiled" shops
  (logo, description, review replies, buy button); last public CPC figures:
  1.35 kr/click electronics up to 9 kr/click contact lenses (SEK, 2024).
  Nordic merchants paid Prisjakt ~400 MNOK/yr. That's the price umbrella we
  can undercut. (prisjakt.no/information/hvordan-vi-tjener-penger, ehandel.se)

**The pitch that falls out of this:** independent, Norwegian, honest ranking,
and merchant terms that are the opposite of what shops just got burned by —
public pricing, long notice periods on changes, no fees on traffic that
doesn't convert.

---

## Ideas, ranked by (value to shop ÷ effort for us)

### 1. Førpris-compliance reports from our price history — **the sleeper hit**

**What:** We already store `price_points` per offer per shop. Sell/give shops
a report or API answering: "your documented lowest price in the last 30 days
per product" — exactly the reference price prisopplysningsforskriften § 9a
requires them to compute and *document* before advertising any discount.
Alert them when a planned "was-price" would be illegal.

**Why they care:** Enforcement is real and expensive: FLOYD was fined
2 MNOK (June 2025) with *zero* of 20 spot-checked products compliant; the
EU-wide Nov 2025 Black Friday sweep found ≥30% of shops in violation and
Forbrukertilsynet sent warning letters that escalate to fines on repeat.
Gebyr can reach 4% of turnover. Forbrukertilsynet demands 30+ days of price
records — which many shops don't systematically keep, and we record as a
byproduct. (forbrukertilsynet.no, bull.no)

**Viability:** No comparison site offers this (checked). Data already exists
in D1; the deliverable is one bearer-gated endpoint / emailed CSV per shop.
Caveats to state honestly: our history only covers products/periods we
crawled, and "member prices" have carve-outs — position it as a *safety net
and documentation trail*, not legal advice. This is also a self-serving
flywheel: the more complete our crawl of their catalog (i.e. the more they
approve us), the better their compliance coverage. **Effort: small. Do this.**

### 2. Demand-signal sharing: "N users are watching this at your shop"

**What:** Aggregate, k-anonymous merchant insights from data we uniquely
hold: watch counts per product, price-alert thresholds ("14 users have an
alert under 900 kr"), search terms in their category with weak supply
(Skyscanner sells exactly this to airlines as "Unserved Routes"), and
out-of-stock demand ("this product of yours is watched but has no stock").

**Why they care:** This is forward demand — repricing and stocking signal no
ad network gives them. Precedent says platforms treat this as their stickiest
merchant perk: Amazon Brand Analytics (free, retention lever), eBay Terapeak,
trivago Rate Insights, Google's free Price Competitiveness report. **No
comparison site anywhere exposes its price-alert/watchlist counts to
merchants** — confirmed gap, we'd be first. (partners.skyscanner.net,
sell.amazon.com, bidnamic.com)

**Viability:** Watches/alerts tables exist; a per-shop rollup is a query.
Guardrails: aggregates only, floor counts (≥3–5 users) so no individual is
inferable — same k-anonymity instinct as `udom.p`'s ≥3-reporter rule and the
gift-list `by` stripping. Start as a monthly email ("pricy innsikt"), not a
dashboard — an email costs nothing and is itself the sales channel.
**Effort: small–medium.**

### 3. Zero-integration onboarding: "reply to this email and you're done"

**What:** Make joining literally effortless. Three tiers, shop picks one:
(a) **approve our crawl** — one email reply flips `approved:` in
crawl-urls.json, we do everything (sitemap discovery already works, 47/50
shops); (b) **reuse a feed they already have** — every Norwegian platform
exports Google Merchant Center or Prisjakt-format prisfil out of the box
(Shopify ~30%, WooCommerce ~40%, Mystore, 24Nettbutikk all have it built in;
Klarna's own docs say a Google feed works "in 9 of 10 cases"); (c) Adtraction
CPA feed if they're already there (retail CPA 8–20%, no click risk).

**Why they care:** Feed maintenance is a known burden and our ingest already
speaks EAN/GTIN, which every feed carries. The pitch: "you change nothing;
you just say yes." Approval also directly fixes their frozen prices and
missing images (8,937 imageless products today) — i.e. *their* listing looks
better the moment they agree.

**Viability:** (a) exists; (b) needs one feed parser (Google Shopping XML —
one format covers ~all platforms, Prisjakt CSV as a bonus) mapped onto the
existing ingest POST. **Effort: (a) zero, (b) a parser.** This is the
prerequisite that makes every other idea deliverable at scale.

### 4. The addon API family: more shop-controlled hooks (proven pattern)

ADDON_SOURCES has no precedent — no comparison site lets the shop drive
checkout cross-sell (closest: Amazon Virtual Bundles, idealo's own checkout).
Extend the same contract shape (optional per-shop config var, POST, small
JSON answer, graceful fallback):

- **Shop-declared campaigns:** shop POSTs/feeds us "these EANs are on sale
  until date X" → we badge them, and (opt-in per user) push to users watching
  those products. "Notify the 40 people watching your product that it
  dropped" is marketing money can't buy elsewhere — and it's honest, because
  our own price history verifies the drop (and § 9a-checks the førpris, tying
  into idea 1).
- **Stock/price webhook:** shop pings us on change → their listing is
  fresher than any competitor's crawl cycle. Freshness becomes *their* perk.
- Later: shop answers "similar products you also carry" for out-of-stock
  redirects within the same shop.

**Viability:** Same wire pattern as ADDON_SOURCES/SOURCES, all dormant-safe
behind config. **Effort: small per hook.** The point is the story: "pricy has
an API *for shops*, not just about them."

### 5. Merchant-terms as the product: public, fair, CPA-first pricing

**What:** Free listing forever (PriceRunner precedent: list regardless of
customer status). Paid tier is **CPA/CPO only** — no click fees ever, which
is Daisycon's "no cure no pay" pitch and precisely the wound Prisjakt
merchants are nursing ("paying for traffic that doesn't convert"). Publish
the price list on the site; commit contractually to e.g. 90 days notice on
changes and never mid-Q4 (Inet/Cyberphoto's stated grievance was timing).
Neutral ranking guaranteed — paying never moves you up (Prisjakt gets
accused of exactly this: "lowest price not always shown",
varmepumpeoversikt.no).

**Viability:** This is a policy document, not code — but it's the frame that
makes every sales conversation easy, and it costs nothing while we have no
revenue anyway. Revenue later can come from idea 2's premium analytics and,
much later, clearly-labeled sponsored slots (idealo Ads launched 2026 with
organic ranking untouched — the acceptable precedent). **Effort: writing.**

### 6. Embeddable badges & widgets on the shop's own site

**What:** "Se prishistorikk på pricy.no" / "Beste pris"-badge the shop embeds
on its product pages, plus a Folkedommen claims widget. idealo runs exactly
this (idealo Badge, crawl-verified embedding); Prisjakt's "Årets butikk"
shows Norwegian shops *want* third-party trust marks to display.

**Why they care:** A shop showing its own price history voluntarily signals
honesty (and § 9a compliance) to its customers; the badge is free marketing
for them and free distribution + backlinks for us.

**Viability:** A tiny JS/iframe endpoint on the Worker; only offer the badge
where we genuinely see them as best/competitive, or it's meaningless.
**Effort: small, but only worth it once traffic exists** — a badge from an
unknown site has no pull. Park until we have users; sequence after 1–3.

### 7. The AI-shopping channel: "be visible where the agents shop"

**What:** pricy already runs an MCP server (search/watch/buy). Pitch to
shops: listing on pricy = discoverability to AI assistants shopping on users'
behalf — a channel Prisjakt doesn't offer and shops can't easily build alone.

**Viability:** Real and already built, but the buyer-side volume is
speculative in 2026 — use it as a differentiator slide, not the headline.
**Effort: zero (exists).**

---

## What I'd actually do

1. **Now:** idea 5 (write the merchant terms page) + idea 1 (førpris report,
   one endpoint) + idea 3a (approval email template pointing at both). The
   combined cold email to a shop is concrete: *"We're Norwegian, listing is
   free, ranking is neutral, here's your last-30-days lowest-price
   documentation for the products we track — approve our crawl and it covers
   your whole catalog."*
2. **Next:** idea 2 as a monthly per-shop email once a few shops are in.
3. **Then:** idea 3b (Google-feed ingest) when a shop prefers pushing a feed
   over being crawled; idea 4 hooks as partner conversations surface needs.
4. **Later:** badges (6) once traffic justifies them; sponsored anything only
   after neutrality has a track record.

Skipped deliberately: building a merchant dashboard/login (emails + bearer
endpoints cover v1 — a dashboard is warranted when ≥~10 shops ask), payment/
checkout integration (Klarna's game, capital-intensive, and undermines the
independence pitch), and any pay-for-rank product (the trust asset is the
business).

## Sources (key)

- Prisjakt merchant model & pricing: prisjakt.no/information/hvordan-vi-tjener-penger; ehandel.se (CPC segments, 2026 increase)
- Merchant exodus: inet.se/nyhet/12084; feber.se/samhalle/inet-lamnar-prisjakt…; netthandel.no/flere-nettbutikker-forlater-prisjakt…; teknikveckan.se
- Prisguiden → Klarna: springboard.no/prisguiden-klarna; retailmagasinet.no/921964; klarna.com press
- Førpris rules & enforcement: forbrukertilsynet.no/…/salg-og-bruk-av-forpriser; bull.no (FLOYD 2 MNOK); forbrukertilsynet.no Black Friday sweep 2025
- Feeds/platforms: help.shopify.com (Google channel); support.24nettbutikk.no/knowledge/prisjakt-og-prisguide; mystore.no/utvidelse-google-shopping; avecdo.com/product-feeds/prisjakt; docs.klarna.com (feed reuse)
- Affiliate CPA norms: capitalize.no/blogg/affiliate-nettverk; affiliateprogrammer.no; linehub.com (Daisycon no-cure-no-pay)
- Merchant value-add precedents: partner.idealo.com (Business, Badge, idealo Ads 2026); bidnamic.com (Google Price Competitiveness); partners.skyscanner.net (Travel Insight/Unserved Routes); sell.amazon.com (Brand Analytics, Virtual Bundles); studio.trivago.com; ebay.com (Terapeak)
