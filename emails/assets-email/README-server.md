# Handover: e-postlogo for pricy.no

Oppgave for server-side:

1. Host `assets-email/logo-wordmark.png` (520×184 px, 2x-eksport av pricy-wordmarken) på:
   `https://pricy.no/static/email/logo-wordmark.png`
   — samme origin som nettsiden, ingen redirect, cache-headers ok å sette lange.

2. Ved utsending (mail-merge) av email_onboarding.html / email_followup.html / email_live.html:
   bytt `src="assets-email/logo-wordmark.png"` til verdien i `data-hosted-src` (og fjern data-attributtet).
   Den relative stien er kun for forhåndsvisning i dette prosjektet.

3. Behold `width="130" height="46"` og alt="pricy.no" — bildet er 2x for retina.
