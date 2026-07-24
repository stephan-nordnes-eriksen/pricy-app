# Zooplus

- URL: zooplus.no
- Category: Baby, kids & toys / groceries & pet supplies
- Tier: phase2b-other-network
- Chosen method: Awin — confirmed via SHOP-CANDIDATES.md ("Confirmed Awin NO") and directly verified: Awin's merchant directory has a distinct "Zooplus NO affiliate-program" merchant profile (ui.awin.com/merchant-profile-terms/23604/affiliate). Scrape verdict is Silent, but no JSON-LD signal was found in pass 1, so Awin is the only confirmed path. No Awin adapter exists yet in worker/sources.js — needs a contract (apply via Awin) AND new code (an awinSource()-style feed parser, likely CSV/XML product feed export, analogous to adtractionSource() but Awin's feed format differs).
- Alternatives: a scrape spot-check (Silent verdict, so legally plausible) is worth trying in Phase B before building an Awin adapter, given no adapter currently exists for that network — cheaper to confirm JSON-LD than to write new integration code.
- Status: not started
- Notes: Pet food & supplies — no existing pricy.no category covers pets; would need a new "Pets" category (icon suggestion: paw-print or similar) if onboarded. Awin feed-format docs: https://ui.awin.com/merchant-profile-terms/23604/affiliate (terms/program page — actual feed export format is inside the Awin publisher dashboard once approved, not publicly documented).
