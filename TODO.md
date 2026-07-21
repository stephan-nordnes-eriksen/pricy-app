- [x] Create a robot.txt. It should disallow everything. We are not ready for being scraped yet.
- [x] The "Alert me when price drops below" in product page seems to not inherit what is set
- [x] The search autocomplete seems to be hardcoded or something. We must make it work for real
- [ ] Some kind of button to press if a product or price is incorrect. Design only for now.
- [x] We need a new "Buy now" button, which pigybacks the same system as the "Auto-buy" system.
- [ ] There should be a "convert to auto-buy" (or some other better wording) for things you have watched. Essentially allowing you to automatically buy in stead of watching for the price change
- [ ] The marketing is incorrect now. It says that we do not take any provision or whatever. For the MVP we will remove such wordings, as we are dependent on adtraction and other platforms to get our price ingestion. We will reduce our wording about "others are bad, we are good" type of thing. We shall focus on having a good product offering, and focus on the auto-buy and buy-now features.
- [x] Compare products
- [x] display properies
- [?] handle image ingestion. (unsure if this works full or not)
- [!] rate limiting on our apis(partially done. Lacks pushing to cloudflare. See plan.md 4f)
- [x] image carousel + fullscreen?
- [ ] If you type "demo", a full screen 3d demo should run
- [x] view mode (grid/list etc.)
- [x] Set up proper product discovery. None of this manual adding bs. We will suck up the json / whatever from the shops, and create all products that we haven't seen before (2026-07-21: unknown EANs auto-create hidden products at ingest; enrich via tools/enrich.mjs + extra.json)


Where to pick up tomorrow:
- In claude design, we ran out of tokens during the view mode fix. We should resume here when. Then, we sync this to the clude code side of things.
