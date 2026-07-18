# Fulfillment plan — getting the shop order actually placed (2026-07-16)

Companion to AUTOBUY-PLAN.md; this file covers only leg 3: after the
trigger fires and payment is solved, **who places the order at the shop
and how**. Research snapshot below, then the plan.

## The landscape (July 2026)

Two open agent-checkout standards are racing, plus a legal ruling that
kills every non-opt-in shortcut:

**UCP — Universal Commerce Protocol** (Google + Shopify, Jan 2026).
The bigger coalition: Visa, Mastercard, Stripe, Amex, Adyen, Walmart,
Target, Best Buy, Zalando, Klarna… Merchants stay merchant of record;
agents drive catalog → cart → checkout via standardized APIs (MCP/A2A
compatible); payments via AP2 mandates. It is a **live channel already**:
UCP-powered checkout runs in Google AI Mode/Gemini/YouTube Shopping for
select US merchants; Canada/Australia next, then UK; Europe announced,
no date. Agent side is explicitly not Google-only — agent platforms
register a profile (Shopify hosts theirs at a well-known URL; trust
tiers gate whether the agent may complete payment or must hand off).
**Vipps MobilePay is building a UCP Payment Handler** (WALLET/CARD) so
users can pay with Vipps inside agent-driven checkouts — docs exist but
are marked under development. This is the Norwegian rail attaching
itself to exactly this standard.

**ACP — Agentic Commerce Protocol** (OpenAI + Stripe, spec 2026-04-17,
beta). Powers ChatGPT Instant Checkout (US Etsy/Shopify). Merchant
implements checkout endpoints; agent pays with Stripe Shared Payment
Tokens; MCP integration is in the spec. Klarna payments ride SPTs for
US-via-Stripe merchants. Narrower coalition than UCP; overlapping goals
— expect convergence or a winner. Track both, implement neither until a
Norwegian shop is reachable through one.

**Klarna Agentic Product Protocol**: **discovery only** — a hosted feed
of 100M+ products across 12 markets (Nordics likely, unconfirmed). No
agent-checkout-at-Klarna-merchants capability announced. Useful someday
as a catalog source, not fulfillment.

**Universal checkout aggregators** (Rye, Zinc): Rye turns a product URL
into a completed order via browser automation — but **ships to US
addresses only**; Zinc is Amazon-centric US. Parked; re-check Rye's
international roadmap ~quarterly.

**The legal line — Amazon v. Perplexity**: Amazon sued Perplexity for
Comet's agent shopping (agent disguised as Chrome, logged into user
accounts, completed checkout). March 2026: federal injunction blocked
Comet from Amazon's logged-in surfaces — "at the user's direction" but
"without authorization" (CFAA theory; appeal pending at the Ninth
Circuit). Whatever the final outcome, the message for us is settled:
**fulfillment only through channels the shop has opted into** — a
protocol, a partnership, or a human. No stealth automation, ever. This
mirrors our existing no-scraping-checkouts rule and, conveniently, our
scraping experience: the shops already 403 us at the *catalog* layer.

## Our eight shops, honestly

None run Shopify (big-box Nordic retailers on enterprise/custom stacks),
so Shopify's ready-made agent surface doesn't apply. No Norwegian
merchant is live on UCP or ACP today. Signals: Elkjøp Nordic is publicly
doing agentic-commerce strategy work (Vercel/Stripe/Orium circle);
Vipps's UCP Payment Handler tells us Norwegian UCP adoption is being
prepared plumbing-first. When Google flips UCP checkout on in Europe,
merchants onboard via Google Merchant Center — a low-effort path our
shops (all of which do Google Shopping) can take without a platform
migration. That is the most likely arrival route for real fulfillment.

## Fulfillment options, ranked

| # | Option | Status | Use |
|---|--------|--------|-----|
| F1 | **Deep-link handoff** — notify on trigger, user finishes checkout at the shop via `offers.url` | Works today, every shop, zero legal weight, Adtraction pays us | Ship now (= AUTOBUY-PLAN AB-1) |
| F2 | **Manual concierge** — we take payment (Vipps), a human places the shop order | Works today at toy scale; MoR obligations (angrerett, VAT) per AUTOBUY-PLAN | Optional, capped, only to learn |
| F3 | **Direct shop partnership** — one shop agrees to programmatic ordering (business account + API/EDI, or a blessed automated checkout) | BD conversation, not code. Power is the natural first ask: friendliest to us so far, and "your price-drop buyers, delivered as confirmed orders" is free revenue for them | Start the conversation when AB-1 shows real triggered volume |
| F4 | **UCP agent-side integration** — register an agent profile, drive catalog→cart→checkout, pay via AP2 handler (ideally the Vipps one) | The strategic bet. Blocked on European rollout + first NO merchant | Build when the first of our shops is reachable |
| F5 | **ACP agent-side** — same idea, OpenAI/Stripe flavor, SPT payments | Track; only if a target shop picks ACP over UCP | Wait |
| F6 | **Checkout runner on the user's behalf** — we automate the shop's own checkout as the user's agent; the user approves payment in their own app (Vipps push / 3DS). The shop stays the merchant; we never touch money | **Chosen direction (2026-07-16)** — see section below | Build now |
| — | Stealth automation (fully unattended card checkout), US aggregators (Rye/Zinc) | Impossible in EEA (SCA) / US-shipping only | Never / re-check Rye quarterly |

## F6 — the checkout runner (chosen direction, 2026-07-16)

Decision: fulfillment happens **on the user's behalf, at the shop,
as the user**. The user is the buyer, the shop is the merchant of
record, pricy is the user's agent doing the tedium. We never hold the
user's money or card, so no MoR/angrerett/VAT burden lands on us — the
purchase is an ordinary consumer sale between user and shop.

**Why this works in the EEA when "vault the card" doesn't:** SCA stops
being the blocker and becomes the anchor. The runner drives the shop's
checkout up to the payment step and selects **Vipps** — the shop itself
then pushes a payment request to the user's own phone. The user's tap
in the Vipps app IS the SCA, the authorization, and the proof the
purchase was user-directed. Shops with **Vipps Hurtigkasse** (express
checkout) are even better: after a phone number, address, shipping
choice and payment all happen inside the user's Vipps app — the runner
only has to reach the buy button.

**The flow:**

1. Cron trigger fires (price ≤ max, in stock, not expired).
2. Fulfillment job queued; runner opens `offers.url`, adds to cart,
   enters guest checkout (no shop account, no stored credentials).
3. Fills contact/shipping from the user's pricy profile — new profile
   fields: full name, address, phone (PII; the fullmakt ceremony
   becomes consent-to-act-as-agent + collecting these).
4. Selects Vipps → the shop pushes the payment to the user's phone.
   User taps approve. (Notification from us in parallel: "Auto-buy
   triggered at 4 990 kr — approve the Vipps request from Power.")
5. Runner waits for the confirmation page, captures the real order
   ref → `purchases` row `confirmed`, with the shop's ref this time.
6. Approval expired / user asleep? Re-fire on demand from the
   notification link while the price holds. Any step fails → fall back
   to F1 (deep link). Auto-buy degrades, never breaks.

**Runner infrastructure — learn from our own crawling:** the shops'
WAFs already 403 datacenter traffic at the *catalog* layer, and
Cloudflare Browser Rendering egresses from datacenter IPs. So v1 runs
where `tools/crawl.mjs` already runs: a local/home machine driving
Playwright, polling a bearer-gated `/api/fulfillment-jobs` queue on the
Worker and POSTing results back — the exact laptop-ingest pattern we
already ship. Browser Rendering stays the plan-B runner for shops that
tolerate it (keep_alive ≤10 min per session is enough for a checkout).

**Per-shop adapters, empirically:** one small Playwright script per
shop (add-to-cart → guest checkout → Vipps). A shop is `runner`-enabled
when its script passes a live dry-run; it drops to `link` the day it
blocks us. Survey first: which of our eight have Vipps/Hurtigkasse in
checkout and tolerate a real browser (expect Power and Clas Ohlson
first — the two that tolerate our crawler; expect Elkjøp/Komplett/
Proshop/NetOnNet to resist).

**Posture (the line we hold):** real browser, real user data, one real
purchase per user tap — but **no evasion arms race**: no proxy
rotation, no fingerprint spoofing, no CAPTCHA-solving services. If a
shop blocks the runner or objects, that shop falls back to deep link
and we ask them directly for a blessed path — they're still getting a
full-price sale from a customer who was leaving anyway; some will say
yes. Legal context: Amazon v. Perplexity (US, CFAA, injunction stayed
on appeal) is the hostile scenario; Norway has no CFAA analog and the
user's explicit mandate + their own payment approval is the strongest
posture available. Per-shop kill switch from day one.

**What this replaces:** AB-2/AB-3 in AUTOBUY-PLAN (Vipps merchant
onboarding, MoR, Recurring-agreement fullmakt) are no longer needed —
the shop is the Vipps merchant, not us. The fullmakt ceremony survives
as agency-consent + profile collection. F3 (shop partnership) morphs
into "ask blocked shops for a blessed runner path". F4 (UCP) is still
the endgame: when a shop goes live on UCP, its adapter swaps from
Playwright to protocol calls and the approval moves from Vipps push to
AP2 mandate — same seam, same UX.

## The plan

1. **Fulfillment seam in `buy_now`** — per-shop driver dispatch:
   `link` (default), `runner`, later `ucp`. Purchases get a real state
   machine: `triggered → job_queued → awaiting_approval → confirmed |
   failed → link_fallback`.
2. **Ship F1 (deep link) as the universal fallback** — same as before;
   nothing about F6 changes this.
3. **Vipps-in-checkout survey** of the eight shops (manual, an
   afternoon): which offer Vipps/Hurtigkasse, which tolerate a real
   browser at checkout. Record results per shop here.
4. **Runner v1** — local Playwright runner + job queue endpoint +
   the two friendliest shops' adapters. Profile fields + reworded
   fullmakt ceremony (upstream Claude Design change) land with it.
5. **Per-shop rollout, empirically** — adapter per shop, kill switch
   per shop, blocked shops get the direct ask (old F3).
6. **UCP watch unchanged** — first NO merchant on UCP converts its
   adapter to protocol calls (old F4); the runner is the bridge until
   then.

## Explored & superseded: pricy holds the payment details (2026-07-16)

> Superseded same day by F6 above — under F6 the user pays the shop
> directly, so pricy never stores payment details at all. Kept for the
> SCA analysis, which is what makes F6 the right shape.

Question: if the user registers payment details with us, can we do
automated fulfillment **right now**, and do we need per-shop agreements?

**Storing the payment is the solved half.** Two clean options, both
making pricy merchant of record toward the user:

- Vipps Recurring variable agreement (the fullmakt, per AUTOBUY-PLAN
  AB-3), or
- card-on-file via Stripe/Adyen: one SCA-authenticated setup, then
  later charges ride the PSD2 **merchant-initiated-transaction (MIT)
  exemption** — no user present needed. Standard subscription plumbing.

**Using the user's own card at the shop's checkout is a dead end in the
EEA — technically, not just legally.** A shop checkout is a
*customer-initiated* transaction: PSD2 SCA applies, the issuer fires a
3DS challenge to the cardholder (BankID app in Norway), and no bot can
answer it. The MIT exemption belongs to the merchant with the mandate
(us charging the user), never to us replaying the user's card at Elkjøp.
This is why Rye/Zinc exist in the US (no SCA mandate) and not here. PCI
vaulting/forwarding tech exists (Stripe Vault-and-Forward, VGS) but it
solves card *custody*, not the SCA challenge or the shop's bot defenses
or the Amazon-v-Perplexity authorization problem. Klarna-invoice-as-
checkout-hack: same story — Klarna's own risk checks push app/BankID
confirmation to the user. Rejected.

**So yes — automated fulfillment today requires the shop's sign-off.
But "agreement" is lighter than it sounds:** for several of our shops
it's a standard B2B product, not a bespoke partnership:

- **Dustin** offers EDI ordering + punchout to business customers as an
  off-the-shelf service — free on their side for standard formats,
  1–2 months integration. That is programmatic order placement,
  available now, by opening a business account.
- Komplett (Komplett Bedrift) and Elkjøp (Elkjøp Bedrift) have B2B arms
  with integration offerings — ask the same question there.
- Caveats to resolve per shop: (a) **price basis** — B2B/contract
  prices are not the consumer campaign price our trigger fired on, and
  auto-buy's whole promise is the drop price; (b) dropshipping to
  consumer addresses needs their explicit OK; (c) as reseller we owe
  the user angrerett and carry returns; VAT/resale registration.

**Right-now architecture, if we commit:** Vipps/MIT charge to the user
→ order placed through the shop's B2B channel (`edi` fulfillment
driver) where one exists, human concierge (`manual`) elsewhere. This is
F2/F3 made concrete; the caveat (a) price question decides whether it's
actually viable per shop — get Dustin's answer first, it's the cheapest
probe.

## Watchlist (check ~monthly, note dates here)

- Google UCP checkout availability: Canada/Australia → UK → **Europe**.
- First Norwegian merchant on UCP or ACP (watch Elkjøp specifically).
- Vipps Agentic Commerce docs leaving "under development" — then get a
  pilot conversation going.
- Amazon v. Perplexity, Ninth Circuit outcome (defines the US baseline
  for non-opt-in agents; EU/Norway will read it too).
- Rye international shipping; Klarna protocol growing a checkout leg.
- ACP↔UCP convergence (both Stripe-backed; a merge would simplify F4/F5
  into one build).

## Sources

- [Google UCP guide](https://developers.google.com/merchant/ucp) · [ucp.dev](https://ucp.dev/) · [UCP under the hood](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/) · [Google agentic shopping rollout](https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/) · [European response analysis](https://www.merkle.com/en/merkle-now/articles-blogs/2026/ucp-how-european-commerce-leaders-should-respond.html)
- [Shopify agents docs (profiles, trust tiers, carts/checkout)](https://shopify.dev/docs/agents) · [Shopify UCP engineering](https://shopify.engineering/UCP)
- [Vipps MobilePay Agentic Commerce (UCP Payment Handler)](https://developer.vippsmobilepay.com/docs/APIs/agentic-commerce/)
- [ACP spec](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) · [Stripe ACP](https://docs.stripe.com/agentic-commerce/acp)
- [Klarna Agentic Product Protocol](https://www.klarna.com/international/enterprise/agentic-product-protocol/) · [Klarna × Stripe SPT](https://investors.klarna.com/News--Events/news/news-details/2026/Klarna-Expands-Further-Into-Agentic-Commerce-Offering-Flexible-Payments-to-Merchants-via-Stripes-Shared-Payment-Tokens/default.aspx)
- [Amazon wins injunction vs Perplexity Comet (CNBC)](https://www.cnbc.com/2026/03/10/amazon-wins-court-order-to-block-perplexitys-ai-shopping-agent.html) · [CFAA analysis](https://www.searchenginejournal.com/amazon-vs-perplexity-the-cfaa-case-that-decides-whether-ai-agents-can-visit-your-website/575499/)
- [Rye universal checkout (US-only shipping)](https://rye.com/docs/api-v2/introduction) · [Zinc](https://www.zinc.com/)
- [Elkjøp Nordic in agentic-commerce strategy work](https://vercel.com/go/agentic-commerce-in-2026)
- [Stripe SCA guide (MIT exemption, 3DS)](https://stripe.com/guides/strong-customer-authentication) · [Mastercard PSD2 SCA exemptions](https://developer.mastercard.com/mastercard-gateway/documentation/security-and-fraud/authentication/psd2-sca-com-exem/)
- [Stripe Vault-and-Forward API](https://docs.stripe.com/payments/vault-and-forward)
- [Dustin EDI ordering for business customers](https://www.dustin.no/tjenester/kunnskapsbanken/archive/gjoer-innkjoepene-enklere-med-edi)
- [Vipps Hurtigkasse (express checkout — address/shipping/payment inside the Vipps app)](https://www.digitroll.no/tjenester/netthandel/vipps-hurtigkasse/)
- [Cloudflare Browser Rendering limits (keep_alive ≤10 min, session reuse)](https://developers.cloudflare.com/browser-rendering/platform/limits/)
