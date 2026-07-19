# Auto-buy copy promises an engine (and a legal entity) that don't exist

Marketing audit 2026-07-19. Building auto-buy is AUTOBUY-PLAN's job —
this plan is only about what the UI *claims* until AB-1 ships.

The claims:

- BankID hint (proto/index.html:2334): "pricy can purchase for you the
  moment a price drops below your max." Present tense.
- Fullmakt document (:3812–3831): presents as a signed legal agreement
  with a fabricated org.nr ("Pricy AS, org.nr. 923 456 789"), a
  hardcoded counterparty "«{USER.name} Hansen» (f. 14.03.1991)" —
  invented surname and birthdate — and §-promises of immediate email +
  push receipts on every completed purchase.

Reality: `PUT /api/autobuy` stores a JSON blob (worker/index.js:811–816);
the AB-1 trigger engine is planned, not built (comments at
worker/index.js:171,202). No automatic purchase ever happens, no receipt
email/push exists, and the "signature" is the fake BankID button.

## Why the fullmakt matters more than the rest

A fabricated org number on a quasi-legal Norwegian fullmakt is worse
than optimistic marketing — it reads as a real contract with a company
that doesn't exist under that number. Until there's a real org.nr,
don't print one.

## Plan

1. **Upstream**: BankID hint and auto-buy entry points get future
   tense + a "Coming soon" / beta tag: "BankID will unlock auto-buy —
   pricy purchases for you the moment a price drops below your max."
2. **Upstream, fullmakt doc**: use the session user's actual name (no
   invented "Hansen"/birthdate — take it from the account, omit
   birthdate entirely); replace the org.nr with "org.nr. —" or drop the
   line until a real number exists; the receipt clause (§ email+push
   varsling) promises only what will be true at launch — leave it in
   the doc but keep the whole ceremony behind the coming-soon gate so
   the doc is a preview, not a live contract.
3. **When AB-1 + FULFILLMENT land**: restore present tense, real
   org.nr, and wire the receipt promise to an actual purchase
   confirmation email (fold into FULFILLMENT scope).

## Upstream (Claude Design) prompt — paste-ready

> In the pricy prototype, auto-buy copy claims a live system. Make it
> honest until the engine ships:
> 1. The BankID login hint "BankID unlocks auto-buy — pricy can
>    purchase for you the moment a price drops below your max" gets a
>    small "Coming soon" tag and future tense ("will unlock").
> 2. The fullmakt document: take the signer's name from the logged-in
>    account as-is (remove the hardcoded "Hansen" surname and the
>    "f. 14.03.1991" birthdate line), and remove the invented org
>    number "923 456 789" — render "org.nr. —" until a real one exists.
> 3. The fullmakt ceremony and auto-buy pages get a visible "Beta —
>    coming soon" banner so the signed document reads as a preview of
>    the agreement, not an active contract.
> Keep the fake BankID button working (parked per PLAN.md).

## Dependencies

None for the copy pass. Restoring the strong claims: AUTOBUY-PLAN AB-1
(trigger engine) + FULFILLMENT (receipts), and a real org.nr.
