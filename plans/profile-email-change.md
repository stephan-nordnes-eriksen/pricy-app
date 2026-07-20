# Profile email field is silently dropped

## Current state

The Profile section renders an editable email input
(proto/index.html:4483, :4503) but `onSave` only passes `name` (:4490)
— the user edits their email, sees "Profile saved", and nothing
happened. Worst kind of fake: looks real, lies on save.

## Done looks like

Short term: the field doesn't lie. Long term: real email change with
verification.

## Plan

**Phase 1 (DONE 2026-07-20):** email field is read-only upstream with
the hint "Your email is your login — changing it isn't available yet."
Synced; UI test asserts readOnly + hint.

**Phase 2 (after Email Service is live):** real change flow —
`POST /api/account/email` sends a verification link to the *new*
address (magic-link pattern, `email_change` token carrying old+new);
clicking it updates `users.email`. Never change on the strength of a
session alone — the email is the login identity. Uniqueness check
against existing accounts.

## Upstream (Claude Design) prompt — paste-ready (Phase 1)

> In the pricy prototype's Profile section, the email input is editable
> but only the name is saved. Make the email field read-only (keep the
> value visible, styled as non-editable) with a small hint underneath:
> "Your email is your login — changing it isn't available yet."

## Dependencies

Phase 2 needs the Email Service binding (PLAN.md Phase 2).
