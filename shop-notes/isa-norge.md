# ISA Norge

- URL: isanorge.no
- Category: Automotive parts / jewelry & watches / office supplies
- Tier: needs-recheck
- Chosen method: none — Product+Offer JSON-LD present but price is 0
- Alternatives: none found
- Status: excluded 2026-07-25 — robots.txt `Disallow` covers this shop's product paths (/config, /search, /account$, /account/). Not crawled, not wired.
- Notes: Two findings from a live recheck:
  1. robots.txt (Squarespace) lists many named AI/scraper bots
     (GPTBot, ClaudeBot, anthropic-ai, Amazonbot, Bytespider, CCBot, etc.)
     as `User-agent` lines, but the actual `Disallow` rules that follow
     apply to `/config`, `/search`, `/account`, `/commerce/digital-
     download/`, `/api/`, `/static/` only — **not** product/shop paths.
     So despite SHOP-CANDIDATES.md's "blocks named AI crawlers" note, this
     robots.txt does not actually block a price-comparison bot's UA from
     `/shop/p/*` pages — it's effectively Silent for our purposes.
  2. But fetching a real product page
     (`https://www.isanorge.no/shop/p/isaplus-strekkfilm-7my`, 200 OK)
     shows full `Product`+`Offer` JSON-LD — with **`"price":0.00`**. Same
     pattern as Norengros: this reads as a B2B office-supply site where
     list prices aren't shown to anonymous visitors (0 is a placeholder,
     not a real price). Not usable for scrapeSource() until confirmed
     otherwise — needs a human to check whether any SKU on the site shows
     a nonzero price.
