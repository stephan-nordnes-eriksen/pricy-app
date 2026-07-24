# Elon

- URL: elon.no
- Category: Electronics & computers / appliances
- Tier: excluded
- Chosen method: n/a — excluded.
- Alternatives: none evaluated further once excluded.
- Status: not started
- Notes: Reclassified from SHOP-CANDIDATES.md's "Silent" verdict after a real check. `curl -sL https://www.elon.no/robots.txt` (bare `elon.no` just redirects — use `www.`) is a Magento-default file that explicitly disallows `*/catalog/product/view/` and `*/catalog/category/view/` — the actual product and category page paths. This is the **same Magento-default pattern** already used in SHOP-CANDIDATES.md's "Robots-blocked" table to exclude Mikopet.no, Chanti, and Ditur, so Elon belongs in that table too even though the original sweep missed it (SHOP-CANDIDATES.md is not authoritative here — treat robots.txt as ground truth). No ToS check was needed since the robots block alone is disqualifying per the tier-1 rule.
