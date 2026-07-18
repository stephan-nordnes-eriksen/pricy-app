# Auto-buy for real — research & plan (2026-07-16)

Goal: armed auto-buy orders actually purchase the product when the price
crosses the user's max. Must work identically whether armed from the web
UI or from MCP. Research below; no code changed yet.

## Where we are (verified in code)

Auto-buy today has three missing legs. Everything else already exists.

1. **Trigger — missing.** Armed orders live in the `users.autobuy` JSON
   blob (`PUT /api/autobuy`). Nothing server-side ever reads them: the
   cron (`worker/index.js` `scheduled`) only ingests prices. The only
   "execution" is the client-side "Demo: trigger a drop" button.
2. **Payment — fake.** `payment: 'vipps'|'card'` is a stored string;
   receipts show hardcoded `Vipps ••481`. The fullmakt ceremony is a
   fake BankID spinner; the server trusts whatever `signed` the client
   PUTs.
3. **Fulfillment — fake.** `buy_now` (the single choke point both web
   `/api/buy` and MCP route through) picks the cheapest in-stock offer
   and inserts a `purchases` row. No shop is contacted, no money moves.
   `offers.url` (deep link per shop) is stored but unused.

Because execution would run server-side in the Worker, the MCP
requirement is nearly free: arming via MCP already works, and any
payment approval must be out-of-band (user's phone) anyway.

## Research: fulfillment options (the hard leg)

> Deep-dive and the fulfillment roadmap now live in **FULFILLMENT-PLAN.md**
> (2026-07-16); the table below is the short version.

| Option | Verdict |
|---|---|
| **ACP — Agentic Commerce Protocol** (OpenAI+Stripe, spec 2026-04-17, beta) | **The endgame.** Merchants expose standard checkout endpoints; the agent side (us) completes purchases with delegated payment tokens (Stripe Shared Payment Tokens). The spec now includes cart, orders, auth, and native MCP integration. Klarna already accepts SPTs; Elkjøp Nordic is publicly engaged in agentic-commerce strategy work. Blocked on Norwegian shop adoption — approximately zero live NO merchants today. Watch and integrate shop-by-shop as they land. |
| **Universal checkout APIs** (Rye — browser-automation checkout across 15k+ merchants; Zinc — Amazon-centric) | US-centric; no confirmed Norwegian merchant coverage, and NO shipping/VAT through a US aggregator is impractical. Re-check Rye coverage in 6 months; park. |
| **DIY checkout automation** (headless browser driving shop checkouts) | **Rejected.** The same shops already 403 our polite scrapers (Elkjøp, Komplett, Proshop, NetOnNet); checkout bots violate ToS, break constantly, and put card credentials in our automation. Not worth building even once. |
| **Affiliate deep-link handoff** (user finishes checkout at the shop) | **Works today for every shop, zero legal weight.** "Payment logic handed to the web shop" — exactly what we want, except the user must tap the link. Pairs with the trigger engine as auto-buy v1: "Price hit 4 990 kr — complete your order at Power" (push/email with `offers.url`). Adtraction deep links even earn us commission. |
| **Pricy as merchant of record** (we charge the user, we buy from the shop, ship to their address) | Viable only as a small-scale concierge: real consumer-law obligations land on us (angrerett, ehandelsloven info duties, VAT/resale status), plus refund risk when a shop order fails. This is what makes Vipps-as-stopgap meaningful (below) — but fulfillment is a human placing shop orders until ACP exists. Cap it (e.g. ≤20 orders/day) or don't do it. |

## Research: payment options (Vipps confirmed viable)

- **Vipps Recurring API v3** — supports **variable price, variable
  frequency** agreements with a user-approved `suggestedMaxAmount`.
  That is *literally our fullmakt*: sign once in the Vipps app, then we
  create event-driven charges up to the cap. Two constraints:
  charges must be created **≥1 day before due date** (user sees and can
  stop the upcoming charge — arguably a feature for auto-buy trust),
  and Vipps requires extra KYC to enable Recurring.
- **Vipps ePayment API, `userFlow: PUSH_MESSAGE`** — we hold the user's
  phone number, payment request pushes straight to their Vipps app, they
  approve there, no browser. Instant, per-purchase approval. Works when
  the trigger fires from a cron or an MCP conversation alike.
- **ACP delegated payment / Stripe SPT** — the payment story that comes
  bundled with ACP fulfillment later; nothing to do now.
- Card-on-file (Stripe/Adyen off-session): possible, but Vipps is the
  Norwegian default, is what the UI already promises, and one provider
  is enough. Skip.

Prerequisite for any Vipps work: pricy (org) onboards as a Vipps
merchant — ePayment first, then order Recurring (extra KYC).

## The plan

### Phase AB-1 — Trigger engine + deep-link handoff (no money moves)

The 80% feature, buildable now with zero external dependencies.

- Cron, after `ingest()`: scan `users.autobuy` blobs, compare each
  active order's `max` against the fresh best in-stock offer (respect
  the order's shop scope + expiry). `ingest` already computes per-product
  best price — hang the check there.
- On hit: mark the order triggered (idempotently — an order fires once),
  record a `purchases` row with a real `status` column
  (`triggered` → later `completed`), and notify the user (Email Service
  binding when live; the watch-hit email path is the pattern) with the
  shop's `offers.url` deep link.
- Data fixes required on the way: real expiry timestamps (today it's a
  display string), order ids stable enough for idempotency, and the
  hydration in `boot.jsx` mapping the new statuses.
- Web "Buy now" stays as is (records the intent, links out).
- Honest UI wording upstream in Claude Design: "we'll notify you the
  moment it hits — one tap to buy at the shop" until AB-3 makes it
  hands-free.

> **2026-07-16, superseded in part:** fulfillment direction settled on
> the checkout runner (FULFILLMENT-PLAN.md F6) — the user pays the
> *shop* via Vipps in the shop's own checkout, so AB-2/AB-3 (pricy as
> Vipps merchant, MoR, Recurring fullmakt) are shelved. AB-1 (trigger
> engine) is unchanged and still first; the fullmakt ceremony survives
> as agency-consent + name/address/phone collection.

### Phase AB-2 — Vipps merchant onboarding + real "Buy now" (ePayment PUSH_MESSAGE)

Only if we accept the concierge/MoR model at small scale; otherwise skip
straight to AB-4 and let AB-1 carry auto-buy.

- Onboard pricy as Vipps merchant; store the user's phone number
  (account setting).
- `buy_now` gains a real payment step: create ePayment with
  `PUSH_MESSAGE`, user approves in the app, webhook/poll confirms →
  `purchases.status = 'paid'`. Fulfillment is manual ops (we place the
  shop order, daily cap), `status = 'completed'` when ordered.
- This also gives MCP `buy_now` real teeth: Claude says "approve in
  Vipps", user taps their phone, done.

### Phase AB-3 — Real fullmakt = Vipps Recurring variable agreement

Replaces the fake BankID ceremony with the real thing.

- FullmaktCeremony (upstream Claude Design change) becomes "sign the
  agreement in Vipps": create a variable-amount/variable-frequency
  agreement with `suggestedMaxAmount` = the user's cap; store the
  agreement id where `signedAt` lives today.
- Trigger engine, on hit: create a charge (due T+1 per Vipps rules),
  notify "auto-buy fires tomorrow at 4 990 kr — cancel anytime in
  Vipps", on capture → place the shop order (manual until AB-4).
  The 1-day delay is the price of hands-free; a "buy now instead" link
  in the notification covers users who can't wait.
- The fake BankID button stays for login (per PLAN.md); only the
  fullmakt signing switches to Vipps.

### Phase AB-4 — ACP agent-side integration (per-shop, as adoption lands)

- Implement the ACP client half: merchant checkout endpoints + Stripe
  Shared Payment Tokens; slot it behind the same `buy_now` choke point
  so web and MCP get it for free. Fulfillment goes API-driven
  shop-by-shop; manual ops and (eventually) the Vipps MoR wrapper
  retire per shop.
- Track: Norwegian ACP adoption (Elkjøp first candidate), Klarna-via-SPT
  for shops that use Klarna checkout, Rye/Zinc European coverage as a
  fallback.

### Order & rationale

AB-1 is pure us-code and makes auto-buy honest immediately. AB-2/AB-3
need Vipps merchant onboarding (weeks of KYC — start the application
early if we want them) and commit us to merchant-of-record duties;
decide deliberately. AB-4 is the destination but on someone else's
timeline. AB-1 → decide MoR question → (AB-2, AB-3) → AB-4.

### Legal/compliance notes (for the MoR phases only)

- Angrerett (14 days) — the UI already shows it; as MoR we actually owe
  it, including return logistics.
- Ehandelsloven/markedsføringsloven info duties at point of sale;
  VAT/resale registration questions — get a real answer before AB-2
  ships to anyone but ourselves.
- Never automate against shop checkouts without permission (mirrors the
  existing "never scrape comparison sites" rule).

## Sources

- [Vipps Recurring API guide](https://developer.vippsmobilepay.com/docs/APIs/recurring-api/recurring-api-guide/) · [payment agreements (variable price/frequency)](https://developer.vippsmobilepay.com/docs/APIs/recurring-api/how-it-works/payment-agreement/) · [FAQ (1-day charge notice, KYC)](https://developer.vippsmobilepay.com/docs/APIs/recurring-api/recurring-api-faq/)
- [Vipps ePayment create payment (PUSH_MESSAGE)](https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/create/)
- [Agentic Commerce Protocol spec](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) · [Stripe ACP docs](https://docs.stripe.com/agentic-commerce/acp) · [Stripe×OpenAI Instant Checkout](https://stripe.com/newsroom/news/stripe-openai-instant-checkout)
- [Klarna via Stripe Shared Payment Tokens](https://investors.klarna.com/News--Events/news/news-details/2026/Klarna-Expands-Further-Into-Agentic-Commerce-Offering-Flexible-Payments-to-Merchants-via-Stripes-Shared-Payment-Tokens/default.aspx)
- [Elkjøp Nordic in agentic-commerce strategy work (Vercel)](https://vercel.com/go/agentic-commerce-in-2026)
- [Rye Universal Checkout API](https://rye.com/products/universal-checkout-api) · [Zinc](https://www.zinc.com/)
