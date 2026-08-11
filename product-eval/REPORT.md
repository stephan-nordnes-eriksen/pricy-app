# Product audit — pricy.no live catalog

Shards: 29 · products checked: 8049 · clean: 4381 · with findings: 3668 (45.6%)


## Findings by kind

| kind | findings | high | med | low |
|---|---|---|---|---|
| brand | 1479 | 9 | 907 | 563 |
| facets | 1125 | 204 | 316 | 605 |
| category | 797 | 442 | 353 | 2 |
| name | 609 | 5 | 326 | 278 |
| variant | 461 | 0 | 239 | 222 |
| duplicate | 76 | 14 | 59 | 3 |
| icon | 71 | 0 | 0 | 71 |
| junk | 42 | 10 | 32 | 0 |
| image | 12 | 0 | 0 | 12 |
| metadata | 7 | 0 | 5 | 2 |
| price | 6 | 1 | 3 | 2 |

## Findings by category

| category | checked | with findings | high-severity rows |
|---|---|---|---|
| Beauty | 600 | 228 | 35 |
| Fashion | 2363 | 885 | 252 |
| Furniture | 1065 | 416 | 128 |
| NOCAT | 19 | 19 | 0 |
| Outdoor | 1355 | 405 | 111 |
| Toys | 2647 | 1715 | 134 |

## Category re-classifications proposed

790 rows. Most common moves:

| from → to | rows |
|---|---|
| Furniture → Home | 102 |
| Fashion → Shoes | 95 |
| Toys → Hobby | 78 |
| Toys → Books | 58 |
| Fashion → Baby | 38 |
| Fashion → Home | 37 |
| Outdoor → Pets | 37 |
| Outdoor → Shoes | 30 |
| Toys → Home | 30 |
| Toys → Gaming | 25 |
| Toys → Pets | 18 |
| Furniture → Garden | 17 |
| Toys → Sport | 13 |
| Toys → Fashion | 13 |
| Furniture → Tools | 12 |
| null → Phones | 12 |
| Fashion → Beauty | 10 |
| Outdoor → Sport | 10 |
| Toys → Kitchen | 9 |
| Beauty → Fashion | 8 |
| Fashion → Toys | 8 |
| Beauty → Home | 7 |
| Beauty → Jewelry | 7 |
| Fashion → Pets | 7 |
| null → Computers | 7 |
| Outdoor → Fashion | 7 |
| Outdoor → Watches | 7 |
| Toys → Office | 7 |
| Fashion → Sport | 6 |
| Fashion → Jewelry | 4 |

## Rule gaps reported (vocabulary / facetrules work)

- "uten parfyme" / "Fragrance Free" sets facets.type=Fragrance — the negation is ignored, so fragrance-FREE products are typed as perfume (3 rows here)
- "Mousse" in a sun product ("Sun Body Mousse SPF30 solkrem") wins over "solkrem" and sets type=Hair care
- "Cat Eye" (a magnetic gel-polish effect) sets type=Eyes on nail polish even when srcCat is "Sminke > Negler > Neglelakk > Gellack"
- the Norwegian jewellery vocabulary is not consulted for Beauty rows: "Armbånd"/"Ringer" under "Smykker & tilbehør" still land in Beauty (7 DARK rows)
- "Duftpinner" (reed diffuser) and "Duftlys" (scented candle) under Innredning/Hjem land in Beauty instead of Home
- dog-grooming crumbs ("Hund > Pelspleie", "Hundepleie > Shampoo og balsam") lose to the shampoo/care wording and land in Beauty instead of Pets
- facets.type is derived for only 254 of 300 rows; the 46 misses are mostly soap/body wash, press-on nails, false lashes, eyebrow pencils and gift sets
- CAT_RULES: the crumb 'Ansiktsmasker' (balaclavas/face masks under KLÆR) resolves to Beauty — cost a Helly Hansen merino balaclava
- CAT_RULES: a 'Primer' leaf crumb sends building primer (Mørtel og støp) and miniature-paint primer to Beauty
- CAT_RULES: household rows sold by beauty shops (laundry dryer balls, fabric/room freshener, scented candles, silk pillowcase, hot water bottle) stay in Beauty — 'Renhold/Klesvask', 'Romspray', 'Duftlys' should win over the shop floor
- facetrules Beauty: 'Blush' / 'Cream' / 'Wash' anywhere in the name derive type regardless of the product (sunglasses 'Gold Blush' → Face makeup, cream eyeshadow → Moisturisers, mesh wash bag → Cleansing, sake face wash → Hair care)
- facetrules Beauty: løsvipper / lashes / øyenbrynsblyant rows derive no type at all (7 rows here) — 'Løsvipper', 'Lashes', 'Øyenbryn' should map to Eyes
- facetrules Beauty: SPF/sun rows only derive spf, not type=Sun care ('Ambre Solaire', 'Daily UV Fluid', 'Solprodukter')
- scrape: every Kicks row arrives with no srcCat and with the variant label appended twice to the name ('… 50 ml 50 ml', '… Mod Mod') — 24 rows in this shard
- Footwear falls through to Fashion whenever the breadcrumb is missing or unreadable: 'løpesko', 'piggsko', 'vintersko', 'sneakers', 'støvel/støvler', 'gummistøvler', 'damesko', 'badesko', 'boots' should all resolve to Shoes in CAT_RULES — 20 rows in this shard alone (Foss Sport and Skoringen have no usable srcCat, Junior Barneklær publishes the junk crumb 'Home')
- facetrules type derivation matches the whole srcCat string instead of leaf-first: the crumb 'Bukser, shorts og skjørt > Shorts' hits 'bukser' and yields Trousers for a pair of shorts (6 rows), and 'Gensere og Skjorter > Skjorter' yields Knitwear for a shirt
- the name should beat the crumb for an unambiguous garment word: 'Jacket'/'Hoodie'/'Shirt'/'Shorts'/'Dress' in the product name lost to a 'Gensere og T-Skjorter' breadcrumb on 8 rows
- 'håndkle'/'badehåndkle' (towel) is unmapped and lands in Fashion — 6 rows from Kid Interiør, Rum21 and KappAhl
- Norwegian jacket words don't derive facets.type=Jackets: 'dunjakke', 'vinterjakke', 'skalljakke', 'fleecejakke', 'pilefleece' (9 rows); same for 'vott/vante/hanske' → Accessories and 'bluse' → Shirts & blouses
- a size range or dual size in the name keeps only its last token: '47-49' → 49, 'S/M' → M — the row then misses its own size filter
- 'imitert … skinn' (imitation leather) derives material=Leather; the material rules have no negation
- the brand token 'Gull' in 'Gullkorn' derives colour Gold on 6 rows — the colour vocabulary must not read the brand, and Norwegian compound colours (askeblå, stormblå, frostrosa, bringebær) need word-internal matching
- in deriveFacets the srcCat parent crumb beats the leaf AND the name: 'Bukser / shorts / skjørt > Shorts' yields Trousers (4 rows), 'Gensere og t-skjorter > Gensere' yields T-shirts & tops for rows literally named Hoodie/Sweatshirt (11 rows), 'Ullundertøy & fleece > Fleeceklær' yields Underwear for a fleecebukse — facet derivation should walk leaf-first the way classify() already does
- type is derived from the product name only: Norwegian srcCat leaves (Skalljakker, Hverdagsjakker, Dun- og isolasjonsjakker, Skallbukser, Kamuflasjebukser, Tweedbukser, Luer, Capser, Fleecejakker) leave type empty on ~28 rows here
- 'håndkle'/'gjestehåndkle' and srcCat 'Baderom > Håndklær og kluter' / 'Baderomtekstiler' land in Fashion instead of Home (6 rows from Kid Interiør and Rum21)
- baby-gear vocabulary is missing: bæresele, ammepute, gravidpute, nattpose, samsovingsmadrass and srcCats 'Bæresjal / Bæresele', 'Ammeputer/Gravidputer', 'Stelle' all land in Fashion instead of Baby
- 'lue' and 'regnfrakk' match clothing inside non-clothing product names (Espegard Bålbrenner Lue = a fire-pit lid, Grilltrekk regnfrakk = a barbecue cover); both shops' srcCat was a brand name or 'Grilltrekk', so the name decided unchecked
- 'støvletter' and srcCat 'Dame|Herre / Støvletter / …' resolve to Fashion, not Shoes
- facetrules.js never derives `size` for Fashion even though ~200 rows end in an explicit size token ('- 104', '- 56', '- 24-27', '- 9-12 mnd', '- 48cm', '- Onesize') — 4 of 300 rows carry a size facet, so the Size filter is effectively dead on this shard
- `audience` is derived on ~15% of rows although nearly the whole shard is children's wear (Guttelus / Junior Barneklær / Newbie, sizes 50-134 cm and '0-1 år'); a body/heldress in cm sizes should imply audience Kids
- Norwegian '-dress' compounds mean suit/overall, not dress: 'Joggedress', 'Heldress', 'Vinterdress', 'Ulldress', 'Regndress' — 'Joggedress' currently derives type 'Dresses & skirts'
- headwear vocabulary is missing from the Fashion type rules: 'balaclava', 'lue' (beanie, currently derives Knitwear via 'strikket'), 'solhatt', 'sydvest', 'bonnet', 'hat', 'neck warmer', 'buff', 'votter', 'hårbøyle' all fall through to no type or to Knitwear
- the knitwear rule outranks the garment noun: 'Strikket Kjole' → Knitwear not Dresses, 'Sweat Denim Bukse' → Knitwear not Trousers, 'Shorts ... Loose Sweat' → Knitwear not Shorts; the garment noun at the end of the name should win
- footwear nouns in a clothing feed are not caught: 'sandaler', 'flip flops', 'badesko', 'tøfler', 'pensko', 'bunadsko', 'piggsko', 'løpesko', 'støvletter' all stayed in Fashion — CAT_RULES should let a shoe noun in the NAME override a clothing breadcrumb
- the same product from two shops splits into two `p-` slugs when the shops name it differently (Keb Trousers M Reg vs Keb Trousers turbukse herre; Inner:Pure Merino Half Zip Men as both ean-* and p-*) — slugId matches on the full name, so no-EAN shops never merge
- Norwegian footwear nouns don't route to Shoes: 'løpesko', 'støvletter', 'vinterstøvel', 'badesandaler', 'babytøfler' all stayed in Fashion (5 rows here, incl. a whole Skoringen shoe shop)
- Kids' non-clothing from kids-clothing shops (Guttelus, Lässig/Liewood/Konges Sløjd) all lands in Fashion: 'matboks', 'drikkeflaske', 'tutekopp', 'kopp', 'skål', 'spisesett', 'mattermos', 'stellesekk', 'barnservise' need a Baby vocabulary (18 rows here)
- Kid Interiør's bathroom/kitchen textiles land in Fashion: 'håndkle', 'badelaken', 'klut'/'vaskeklut' (→ Home) and 'forkle' (→ Kitchen) are unmapped (5 rows here)
- facetrules: 'ull' is only matched as a separate word, so the compounds 'ullsokker', 'ulldress', 'ullongs', 'ullpysj', 'ullvotter', 'ullmiks/ullmix' derive no material (13 rows); a breadcrumb leaf of 'Ullundertøy'/'Ullgensere' should also imply Wool
- facetrules: fabric words beat garment nouns — 'Sweat' in 'Joggebukse Lou Sweat' / 'Skinny Sweat Pants' types trousers as Knitwear & hoodies, and 'Dress Blues' (a colourway) types a baby Body as Dresses & skirts
- facetrules: a name containing 'Shorts' still derives type Trousers (5 rows); the shorts rule must win over the trouser rule
- facetrules: the outdoor feeds' Norwegian breadcrumb leaves don't derive type — '…jakker' (Dunjakker/Hybridjakker/Fleecejakker/Hverdagsjakker/Jaktvester) leaves type empty on 11 rows, while 'Mellomlag og Fleecetrøyer'/'Gensere'/'Hettegensere og Hoodies' wrongly derive T-shirts & tops on 9 rows including two rows whose name says 'Jacket'
- facetrules: 'Multi' inside a model name ('Kombi Multi Mission') derives color Multicolour
- Brand strings are not normalised across feeds, so the brand rail lists the same label twice: ALL-CAPS from Sport 1/Intersport ('PATAGONIA', 'THE NORTH FACE', 'ICEBREAKER', also BERGANS/KOMBI/LYCKE/JOTUNHEIM/ADIDAS/UMBRO with no lower-case twin in this shard), 'Levis' vs "Levi's" from Junior Barneklær (23 rows), and one row storing the shop name 'guttelus' as the brand
- size is never derived: ~130 Guttelus/Mamalicious rows end in an explicit size ("- 92", "- 50-56", "- S", "- 34-39cm", "- 1-3 år") and only 3 rows in the whole shard carry facets.size — the Fashion size facet is effectively empty
- audience is missing on most kids rows: Guttelus and Junior Barneklær sell nothing but children's wear (sizes 50-116) yet audience:Kids is set on well under half of their rows
- no variant wiring at all: every "<product> <colourway> - <size>" row is a separate top-level product with no vlabel/family; 11 obvious colour families in this shard alone
- "Til herre" / "Til dame" resolve to Fashion before a real crumb is reached — Bjørklund's "Hjem > Smykker > Til herre > Mansjettknapper" lost Jewelry that way; they belong in CAT_WEAK
- "støvlett"/"støvletter" (ankle boots) and "tøffel"/"tøfler"/"ulltøfler"/"skinntøfler" (slippers) are unmapped and land in Fashion instead of Shoes
- "håndkle" (towel) and "matboks" (lunch box) are unmapped in the Home / Kitchen vocabulary
- colour-name and fabric words leak into facets.type: "Navy Blazer" made a bow tie a Suit, "Sweat" makes "Bukse ... Sweat" knitwear instead of trousers, "Strikk" (elastic) makes a hair bow knitwear
- facets.type prefers a parent crumb over the leaf for shorts: 4 rows whose name AND srcCat leaf both say "Shorts" still store type "Trousers" while other rows get "Shorts"
- brand casing is not normalised: Intersport/Sport 1 feeds emit ALL-CAPS (BERGANS, HAGLÖFS, RAB, LUNDHAGS) alongside the same brand title-cased from other feeds, splitting the brand filter
- No footwear vocabulary: 'støvlett/støvel/vinterstøvel/sneaker(s)/sneax/piggsko/booties/hunting boot' all stay in Fashion — 22 rows here, 15 of them from Skoringen, which is a pure shoe retailer and has no CATMAP '*' floor
- Norwegian '…jakke/…jakker' leaves ('Skalljakker', 'Dunjakker og isolasjonsjakker', 'Fleecejakke', 'Vinterjakker', 'Regnjakke') do not derive facets.type Jackets, while the English 'Jacket' does — ~23 rows
- Ull-compounds ('Ullsokker', 'Ullongs', 'Ullbukse', 'Ulljakke', 'Ullbody', 'Ulltrøye', 'ullsett') do not derive material Wool, while 'Ull' as a separate word does — ~25 rows, all Name It/Guttelus
- 'Shorts' derives facets.type Trousers whenever the breadcrumb is 'Bukser … > Shorts', so shorts are invisible under the Shorts filter that other rows populate
- Bathroom/home textiles ('håndkle', 'gjestehåndkle', 'klut/vaskeklut', 'kjøkkenhåndkle', breadcrumb 'Baderom > Håndklær') land in Fashion instead of Home
- Baby feeding gear ('tåteflaske', 'kopper og tutekopper') and bath toys ('badeleker', 'sandleke') are unmapped, so Guttelus rows fall through to Fashion instead of Baby/Toys
- Substring matching on hosiery/sock words misfires: 'Pippi Langstrømpe' (an umbrella) → Socks & hosiery, and a ski harness shelved under 'Varmesokker …' → Socks & hosiery
- Ingest accepts placeholder EANs: 'ean-1' is a live product merging a kr 329 baby hat with an unrelated kr 1724 Bikeshop row
- CAT_RULES: 'sko/vintersko/støvel/støvlett(er)/sneaker/badesko' resolve to Fashion, not Shoes — 23 rows here, the whole Skoringen shop plus Reima and SlipStop footwear sit in Fashion
- CAT_RULES: 'Barnevogntilbehør' (pram accessories), 'Tapeter' (wallpaper), 'Reisehåndklær' (travel towels) and 'Badeleker' (bath toys) resolve to nothing and fall through to the shop's Fashion floor
- facetrules Fashion: a srcCat leaf of 'Gensere'/'Ullgensere' derives type 'T-shirts & tops' instead of 'Knitwear & hoodies' (5 rows)
- facetrules Fashion: 'lue'/'Strikkelue'/beanie derives type 'Knitwear & hoodies' instead of 'Accessories' (3 rows)
- facetrules Fashion: 'jakke/dunjakke/Jkt' and 'bukse/turbukse' in the NAME derive no type when the srcCat leaf is a sub-category name — ~25 rows in this shard have an empty or partial type on an obvious jacket or trouser; only the clearest were filed individually
- facetrules Fashion: colour words inside a model name leak into facets.color (Columbia 'Silver Ridge' → color Silver, twice here)
- Norwegian footwear words (Vintersko, Overgangssko, Fjellsko/fjellstøvler, Støvletter, Løpesko, bare 'sko') don't route to Shoes — 7 shoe rows sit in Fashion
- a garment named 'Shorts' is typed 'Trousers' whenever the shop crumb says bukser or the name adds a qualifier ('Long Shorts', '6in Shorts') — 6 rows
- the crumbs 'Gensere', 'Ullgensere' and 'Mellomlag og Fleecetrøyer' derive type 'T-shirts & tops', so fleece midlayers, wool sweaters and hoodies (even one named 'Jacket') land in the tee group
- no type rule fires on 'Jakker'/'Dunjakker'/'Vinterjakke'/'Skalljakke'/'regnjakke' crumbs — ~15 jackets, parkas and coats carry no type facet at all
- dog-apparel and dog-equipment rows (Hurtta, Trixie, VGW, srcCat under 'Hund') are read as human clothing and land in Fashion instead of Pets
- baby skincare under the crumb 'Stelle' (solkrem, babysåpe) lands in Fashion — 4 rows
- 'W' / 'W's' / 'Wmns' / 'Woman' in the name does not derive audience Women (9 rows), though most sibling rows do get it
- headwear and hand-wear words (cap, hat, balaclava, bandana, vinterhanske) don't derive type 'Accessories'
- bed linen (laken, dyne, putevar, putetrekk, sengesett, kreppsengesett) under the bare JYSK/Kid crumb 'Soverom' resolves to Furniture — 15 rows here; 'Soverom' alone should not imply Furniture and the linen vocabulary should route to Home
- 'N,5-seter' / 'N,5 seter' stores the decimal digit as the seat count: 2,5-seter and 3,5-seter and 1,5 seter all became seats=5 (3 rows)
- 'skrivebordsstol' contains 'bord', so every Kontorstol row is typed Tables instead of Chairs (6 rows); same class of bug puts 'Bordlampe' in Furniture, 'TV-benk' in Chairs and a sofa 'med bord' in Tables
- furniture fittings from hardware retailers (hylleknekt, hyllevinkel, møbelhjul, bordben, møbelknotter, håndtak — kr 20–100) all land in Furniture; only the Rum21 rows have a real 'Møbler' crumb, the Jernia/Obs Bygg ones do not
- 'Spisegruppe' (dining set) types as Tables or Chairs depending on which token the regex hits first — 6 rows Chairs vs 6 rows Tables for the same kind of product
- the Fagmøbler feed sets brand = first token of the product name (Ida, Ivy, Jesper, Karmøy, Køln, Judson, Jackson, Lamego, Harmony), and once produced the brand 'Parasoller'
- Bedroom textiles (dyne, laken, putevar, sengeteppe, pledd, madrassbeskytter, pute) land in Furniture because the shop crumb is only 'Soverom'/'Innredning' — the name-level vocabulary needs these words routed to Home before the room crumb is consulted
- 'matte'/'teppe' with srcCat 'Wiltontepper' (rugs) resolves to Furniture instead of Home
- 'benk' in 'TV-benk' derives facet type=Chairs; TV benches are Tables/Storage
- 'kontorstol'/'skrivebordsstol' derives facet type=Tables (the 'bord'/'skrive' stem wins over 'stol')
- seats regex reads '3,5-seters' as 5 — a comma decimal must not be split
- srcCat crumb 'rammemadrass' makes bed frames (rammeseng) type=Mattresses
- brand-name words leak into the material facet: 'Leather Master' -> material=Leather on wood-care products
- Fagmøbler rows take the model name as brand ('Lina', 'Linea', 'Lugano', 'Nobel', 'Nora'), and one took the category word 'Parasoller'
- Spisegruppe/matgruppe (table + chairs sets) derive type inconsistently — Chairs on some rows, Tables on others
- JYSK's flat 'Soverom' breadcrumb resolves to Furniture, so the entire bedroom TEXTILE range (sengesett, laken, overmadrasslaken, putetrekk, dynetrekk) lands in Furniture — 22 rows in this shard alone; 'laken', 'sengesett', 'putetrekk', 'putevar', 'dynetrekk' should route to Home before the bed vocabulary is consulted
- 'X,5-seter' / 'X,5 seter' is read as 5 seats by the seats rule (5 rows here: every 1,5- / 2,5- / 3,5-seter sofa says seats 5) — the seat rule must not take the digit after a decimal comma
- rug words ('teppe', 'ryeteppe', 'wiltonteppe', 'bomullsteppe', 'matte') and 'poster' resolve to Furniture; both are Home decor (10 rows here)
- 'møbelmaling' (furniture paint) beats the 'Mal & tegn > Maling' breadcrumb and lands craft paint in Furniture
- three-number sizes (105x32,6x105 / 87x48,5x46) are cut at the decimal comma, so dim stores width x HEIGHT instead of the footprint
- 'ask'/'ash' is missing from the material vocabulary, so ash-wood furniture derives no material
- 'benk' in 'TV-benk' derives type Chairs even when the breadcrumb says Oppbevaring (storage)
- the srcCat crumb 'Seng og madrass' outvotes 'madrass' in the name, so every Wonderland mattress/overmadrass derives type 'Beds' while identical rows from other shops derive 'Mattresses' — the name should win for madrass/overmadrass
- the crumb 'Sengegavl / Benk' matches 'benk' and derives type 'Chairs' for every hodegavl (headboard) — should be Beds
- 'TV-benk'/'TV-skap' derive type 'Chairs' (benk = bench = seating); all 7 TV units in this shard are mis-typed, they are Storage
- 'hylleblomst' (elderflower) matches the 'hylle' (shelf) vocabulary — a 5 kg sports-drink powder was promoted into Furniture
- 'Takspotlight'/'spot' is unmapped, so a GU10 ceiling spotlight landed in Furniture instead of Lighting
- bed/home textiles (dyne, sengeteppe, putetrekk/putevar, ullteppe, saueskinn) resolve to Furniture; 7 rows here belong in Home
- Swedish spellings (Trädgårdsstol, Väggpanel, Hörnbäddsoffa) derive no type/material, and 'stoffsofa' derives no material Fabric
- three-axis dimensions ('180x76x37') yield no dim value
- variant CHILD rows (`head~combo`) are created with cat/brand/icon all null instead of inheriting the head's values — every row in this shard is such a child, so the whole class of rows is uncategorised
- ingest stores a shop's internal SKU in the `ean` field when the feed publishes no GTIN (1059111, 1059105, 1057118, and family id `ean-1062441`) — such ids can never merge offers across shops and should fall back to `p-<slug>` rather than `ean-<sku>`
- facetrules colour is derived from BRAND and product-LINE words: every 'Black Diamond' row got color=Black (13 of 22 wrong, incl. 'No Color' and 'Light Gray'), every Patagonia 'Black Hole' duffel got Black, and 'Blue Fox' got Blue — the colour matcher must not read tokens that are part of the brand or of a known line name, only the trailing colourway
- 'Wool'/'Merino'/'Fleece' in a HEADWEAR name derives type 'Tops & baselayers': beanies, balaclavas and neck gaiters land in the baselayer bucket (7 rows) — headwear nouns (beanie, balaclava, gaiter, hue, lue, pannebånd, headband, cap, hat) must win over the material word and map to Accessories
- 'Bag' inside 'Sleeping Bag' derives type 'Backpacks & bags' (2 rows) — 'sleeping bag'/'sovepose' must be matched before the generic bag rule
- 'Shell' derives type 'Jackets' even when the name says Pants (Breheimen 2L Shell Pants Women) — the garment noun must beat the fabric word
- no type is derived for headbands at all (3 rows: Active Headband, Allround Thin Merino Headband, Aclima LightWool Headband) — 'headband'/'pannebånd' is missing from the Accessories vocabulary
- 'Jacka' (Swedish for jacket) is not in the type vocabulary
- brand-only breadcrumbs ('Adidas', '2XU', 'Casall', 'Abilica', 'Varemerker > X', 'Start') carry no category signal, so 26 rows landed on the Fjellsport/Milrab/Widforss Outdoor floor: gym gear, underwear, dog harnesses, a horse rug, a sausage stuffer, nail scissors and a briefcase are all live as Outdoor. A CAT_RULES vocabulary can't fix a crumb that is just a brand name — either the floors for these general outdoor retailers are too broad, or name-level rules (sele+dog brand, boxer, gymmat, chin up bar, pølsestapper, neglesaks) need to override the floor
- Intersport's FRILUFT feed publishes ALL CAPS brand and name (Sufix, Remen, Rapala, Storm, Sølvkroken, Okuma, Sea to Summit, Eagle Products, House of Hygge) — Abu Garcia, Okuma and Sea to Summit each now exist in two casings and split the brand facet; the ingest should title-case a fully-uppercase brand
- Widforss' dog department is entirely unmapped - 'Vinterdekken', 'Halsbånd', 'Peilehalsbånd', 'Seler', 'Kjøleputer', 'Pelspleie', 'Kobbel', 'Godbiter' resolve to nothing and 13 dog products fell through to the shop's Outdoor floor; add them to the Pets vocabulary
- a brand-only srcCat crumb ('Black Diamond', 'Varemerker > Garmin', 'Crocs', 'Fjällräven') gives classify nothing, so the shop floor decides - and worse, deriveFacets reads the crumb as text: 'Black Diamond' set color=Black on a skin lotion and on an Aqua headlamp. Skip pure brand crumbs in both classify and deriveFacets
- audience vocabulary misses the singular/abbreviated forms 'Wmn', 'Woman', 'Man', Swedish 'Dam' and 'Toddler' (6 rows in this shard)
- sleeping-bag leaves '3-sesongsposer'/'4-sesongsposer' and the mug leaf 'Termokopper' derive no type, while their siblings 'Liggeunderlag'/'Termos' do
- Swedish colour words from Widforss ('Röd') and Norwegian compounds ('Skyggesort') are not folded into the colour table
- an 'N-pack'/'Backpacker' token in the name derives type 'Backpacks & bags' — it mislabelled 2-pack socks, a 3-pack of carabiners, reflective arm bands and a Backpacker Mug in this shard alone
- Norwegian/Swedish dog vocabulary is unmapped (kobbel/koppel, halsbånd, apporteringsleker, vinterdekken, a 'Hund' crumb) so hunting-shop dog gear lands in Outdoor instead of Pets — 7 rows here
- footwear breadcrumbs resolve to Outdoor rather than Shoes: 'SKO > Fjell-, jakt- og hikingsko > Hikingsko', 'Tursko', 'Vintersko', even 'Hverdagssko'
- 'fiske' matches inside 'Fiskegaffel' (a silver fish FORK), putting a Mestergull cutlery row in Outdoor with type Fishing
- leaf-first breadcrumb walking takes 'Ryggsekk' over its parent 'Fototilbehør > Kameraveske', so a Lowepro camera backpack is Outdoor, not Photo
- bag breadcrumbs 'Dagstursekker'/'Tursekker'/'Turbag'/'Hoftevesker' do not derive type 'Backpacks & bags' — about a dozen packs in this shard have no type at all
- singular garment nouns don't derive type where plurals do ('Zip-Off Pant', 'M Glove' get nothing; 'Pants'/'Gloves' work)
- audience abbreviations 'Wmn' and "Juniors'" derive nothing where 'Wmns'/'Kids'/'Youth' work
- singular 'Pant' / 'Short' derive no facets.type (only the plurals 'Pants'/'Shorts' do) — ~10 rows here (M's Superior Pant, Veir Tur Pant, Comici Wmns Pant, Comici Mens Short, Senja Flex1 Trackster Pant …) show no Type at all
- 'Headband' / 'pannebånd' maps to no type; a headband should derive type Accessories like beanies and caps do
- the colour rule reads the BRAND: Black Diamond rows come out color=Black regardless of colourway (M's Recon Bibs Tundra, M's Vision Down Parka Dark Crimson)
- Norwegian dog vocabulary is unmapped — 'Kobbel' (leash), collar/bowl/dog-vest names and the brands Non-stop Dogwear / OllyDog / Flexi all land in Outdoor instead of Pets
- Norwegian shoe crumbs 'Hverdagssko' (everyday shoes) and 'Fritidssko' (leisure shoes) resolve to Outdoor instead of Shoes
- 'Pants' in a Bergans name still loses to an earlier 'Shell'/'Jacket'-ish token on some rows (Nordmarka 2L Shell Pants Men, Oppdal Insulated Shell Pants Women both derive type Jackets)
- 'Shell Pants'/'Bib Pants' derive type=Jackets — 'shell'/'bib' outrank 'pant(s)' in the Outdoor type rules (7 rows in this shard alone)
- the brand token 'Black Diamond' leaks into facets.color=Black, and 'Black Iris' does the same (3 rows)
- 'Fold-Down' in a name derives material=Down
- '… Bag' derives type=Backpacks & bags even when srcCat leaf is 'Soveposer' (sleeping bag)
- Patagonia's 'Cap' (Capilene) derives type=Accessories as if it were headwear
- the shop's 'W ' women's prefix (no apostrophe-s) does not derive audience=Women, while 'W's' does
- Swedish 'byxor/byxa/friluftsbyxa' and singular 'Trouser' are missing from the Trousers vocabulary
- footwear crumbs (Fjellsko, Lave Fjellsko, Hverdagssko, Fritidssko) resolve to Outdoor instead of Shoes, so hiking boots and sandals never reach the Shoes category
- the crawler writes the SHOP'S OWN SECTION into `brand`: Gamezone rows get Brettspill/Samlekort/Rollespill/Puslespill/Miniatyrhobby/Byggesett/Airbrush/Gadgets/'Nintendo Switch', Panduro gets 'Oklassificerat' and Kidsdreamstore gets its own shop name - 78 of 300 rows in this shard alone. discoverSource/scrapeRow should only accept JSON-LD Product.brand, never the breadcrumb/section label
- Outland's non-toy sections are all promoted into Toys: 'Manga' (should be Books, 6 rows here), 'Musikk' (K-pop CDs and a T-shirt - no valid target category exists for recorded music) and 'Godteri, mat & drikke' (a cheddar snack). CAT_RULES needs manga/manga-adjacent vocabulary and a hard skip for the food crumb
- `pieces` is declared for Toys but derived on 0 of 300 rows, although at least 17 names state a count ('500 biter', '30 stk', '60 brikkene', '(31)', '6 PCS', '5-pakk'). One facetrules.js number+unit rule would fill the whole category
- colour is derived from title words with no colour context: 'Brass' Birmingham -> Gold, 'Black' Eagle/'Black' Ops -> Black, Space 'Marines' -> Blue, 'Golden' Temple -> Gold
- `type` is derived from licence/adjective tokens rather than the object: every 'Barbie' towel and blanket becomes 'Figures & dolls', 'EKSTRA MYKE' swim armbands become 'Soft toys', the 'Bamse' board game becomes 'Soft toys'
- Ringo titles arrive uppercased, with a trailing period and hard-truncated at 40 chars (9 rows cut mid-word here); Lekeverden titles carry SEO keyword stuffing plus the shop name; Kidsdreamstore titles are still Swedish with wholesale SKU tails
- srcCat 'Manga' is unmapped and lands in Toys — 6 manga/light-novel/picture-book rows should be Books
- PS4/PS5 game rows land in Toys: neither the 'Gaming > Spillkonsoll > … > PS4 spill' breadcrumb nor a '(for) PS4/PS5' name suffix resolves to Gaming
- under a pet breadcrumb the leaf 'Leker' wins over the animal crumb ('Hjem > Katt > Leker', 'Hjem > Villfugl > Leker'), and a bare 'Leke'/'Katteleke' in the name promotes pet toys to Toys
- 'Figurer' as the leaf of a decor breadcrumb ('Hjem > Interiør og dekor > Dekorasjon > Figurer, pynt og annen dekor') reads as toy figures
- the whole shard derives facets.pieces on 0 of 300 rows — '1000 biter', 'N stk', 'N deler', '2x20' are never read
- facets.age is derived only from the 'N-M år' form; '2-3 YEARS', '(4-6)', 'S (4-6)' are missed
- bamse/kosebamse/varmebamse/gosedyr/mjukisdyr and srcCat 'Bamser' do not derive type=Soft toys
- facetrules colour matches 'grønn' inside 'grønnsakshage' (vegetable garden) — needs a word boundary
- srcCat 'TV- og filmkarakterer' derives type=Figures & dolls for everything under it, including backpacks
- scrapeRow stores raw HTML entities: 3 Lekeverden rows carry '&amp;' in the name
- no category covers physical film/music media (one Blu-ray row sits in Toys)
- srcCat 'Manga' is unmapped, so Outland's manga/light-novel volumes land on the shop's toy floor instead of Books (9 rows here)
- a 'Leker' leaf under a pet path ('Hjem > Katt > Leker', PetXL) resolves to Toys - pet-department crumbs (Katt/Hund/Smadyr) must beat the toy leaf
- console-game rows (empty srcCat, name ending 'Switch 2'/'PS5', brand set to the platform) stay in Toys - the platform suffix should route to Gaming
- colour derivation fires on non-colour words: 'GOLDEN RETRIEVER' -> Gold, 'Grey Knights' -> Grey, 'the White Wizard' -> White, and English 'Sort & Match' -> Black (Norwegian sort)
- 'lyseblaa' and 'azure' are missing from the colour vocabulary while '/Blue' in the same shard resolves
- 'plysj' and 'gosedjur' are missing from the type vocabulary (kosedyr and plush both resolve), so ~6 plush rows here carry no type
- srcCat 'Kortspill & samlekort' derives type 'Games & puzzles' for ~60 Magic/Pokemon singles and sealed card products that should be 'Trading cards'
- miniature paints, flock, inks, airbrush parts and scale model kits (Gamezone's Miniatyrhobby/Airbrush/Byggesett shelves) all promote into Toys instead of Hobby
- srcCat 'Manga' is unmapped and falls through to Toys - manga/comics should resolve to Books
- leaf-first classify takes 'Leker'/'Katteleker' as Toys even when a parent crumb is 'Katt'/'Hund'; animal crumbs (and the pet-shop floors Zooservice/PetXL/Dyrekassen) must win over a generic 'Leker' leaf
- the colour rule fires on proper nouns inside names: 'Rodhette', 'Snohvit', 'RED BULL', 'Marine', 'Plommeblomst' all produced a colour the product does not have
- the declared 'pieces' facet is derived on 0 of 300 rows although 'N biter' / 'N stk' appear in names; 'age' only fires on greeting-card birthday numbers
- '(Enkeltkort)' single collectible cards get type 'Games & puzzles' instead of 'Trading cards'
- Ringo listing titles are ALL CAPS (142 of 300 rows) with a trailing period and a hard 40-character cap - the scrape should read the JSON-LD/og:title product name instead
- Lekeverden product names are raw SEO page titles ending in ' - Lekeverden'; scrapeRow should prefer JSON-LD Product.name over <title>
- a shop page with no gtin makes slugId use the shop name as brand (13 'Kids Dream Store' rows) - fall back to null brand rather than the retailer
- age ranges in Norwegian titles ('for barn 4-12 år') derive the UPPER bound into facets.age; an age filter needs the minimum age (12 rows)
- colour words matched inside proper nouns: 'lilla' inside the doll name 'Lillan' (3 rows), 'Red' from 'Red Bull' (2 rows), 'Rød' from 'Rødhette' — colour rules need word boundaries plus a sponsor/name blocklist
- 'sand' derives colour Beige and beat the explicit 'oransje' in the same name; an explicit colour word must outrank a material word
- piece counts written '200 stk' or '46 PCS' are not recognised, only 'deler'
- slug ids built from the shop's own title duplicate LEGO sets already held as ean-* rows (8 pairs here); the 5-digit set number in the name is a free dedupe key
- a breadcrumb crumb equal to the product name is only dropped on an exact match, so Ringo's ALL-CAPS / curly-apostrophe variants survive (srcCat "LITTLE ME – JULIE", "Liliana's Defeat (Enkeltkort)")
- brand is taken from the shop's shelf label (Gamezone: 'Brettspill'/'Byggesett'/'Samlekort'/'Nintendo Switch') or from the shop name itself (Kids Dream Store, 22 rows)
- Lekeverden titles are stored as the full SEO string ending '- Lekeverden' (20 rows); Ringo titles are ALL CAPS and hard-truncated at 40 characters (12 unusable here)
- srcCat 'Manga' is unmapped and every Outland manga volume lands in Toys instead of Books (9 rows here)
- facetrules derives type 'Games & puzzles' for everything under 'Kortspill & samlekort'; single cards, boosters, tins and display boxes should derive 'Trading cards' (48 rows here)
- Gamezone stores its shelf name in the feed's brand field ('Brettspill', 'Rollespill', 'Airbrush', 'Miniatyrhobby', 'Gadgets', 'Samleobjekter') and its console shelves ('Nintendo Switch', 'PlayStation 5') double as both the brand AND the only category signal, so PS5/Switch games land in Toys instead of Gaming
- Kidsdreamstore and Guttelus feeds put the SHOP NAME in brand (27 rows); scrapeSource should drop a brand equal to the shop
- Ringo's feed truncates every product name at exactly 40 characters, cutting ~10 names mid-word here with no recovery path from the stored data
- Kidsdreamstore publishes only the shop root 'Home' as srcCat, so its blankets, towels, notebooks and lunch items all inherit the Toys floor
- Magic/TCG singles: 60 of 62 '(Enkeltkort)' rows derive type 'Games & puzzles' instead of 'Trading cards' (the 2 rows whose srcCat is just the product name get it right, so the 'Kortspill & samlekort' branch is what is wrong)
- brand extraction takes the SHOP or the shop's own menu label as brand: 38 Kidsdreamstore rows say brand 'Kids Dream Store', 28 Gamezone rows say 'Brettspill'/'Samlekort'/'Rollespill'/'Byggesett'/'Airbrush'/'Miniatyrhobby'/'Gadgets'/'PlayStation 5' - 66 of 300 rows in this shard
- colour is derived from words that are not colours: 'Marines' -> Blue (marine), 'white-tailed' -> White, 'Black Series'/'Silver Bullet'/'Silver Dragon' -> line and creature names; needs a word-boundary + known-line-name guard
- facets.pieces only fires on 'N brikker': misses 'N XXL', 'NP'/'N P', 'N biter', 'N brikkene' - 14 puzzle rows in this shard state a count the facet does not carry
- Lekeverden product names are raw SEO titles: pipe-separated keyword lists ending in '- LEKEVERDEN'/'- Lekeverden' (14 rows), and their brand (Clementoni/Ravensburger/So Slime) is left Unspecified even though the name states it
- Ringo names are ALL CAPS with a trailing period and hard-truncated at 40 characters (3 rows here are cut mid-word); its Norwegian brands (Schleich x10, Silverlit x3, Rastar x2, So Slime x2, RainBoCorns, Real FX, Wham-O) are never extracted
- srcCat 'Musikk' (recorded music) has no valid target among the 31 categories and lands in Toys
- Lekeverden ships its SEO page title as the product name — every row ends in ": Kjøp myke og myke squishmallows på nett"; strip a trailing ": Kjøp …" clause at scrape time (114 rows here).
- Ringo names are ALL CAPS and hard-truncated at 40 characters mid-word ("… SIR FRED PITBUL", "… TOVE MOTHM"), and its breadcrumb is often just the product name repeated — those rows can never be title-matched or deduped against another shop.
- brand is never derived from the name: 168 rows literally start with "Squishmallows" and still carry brand "Unspecified".
- shop shelf labels are being stored as brands: "Kids Dream Store" (the shop), Gamezone's "Brettspill"/"Samlekort"/"Rollespill"/"Miniatyrspill"/"Byggesett" (Norwegian product types), Obs' "ANDRE MERKEVARER" ("other brands").
- facetrules.js has no "Trading cards" rule for "(Enkeltkort)" / srcCat "Kortspill & samlekort" — 27 single cards are typed "Games & puzzles".
- the colour rule fires on animal breeds and character names: "Red Panda" → Red, "Golden Retriever" → Gold, "Green Lantern" → Green. Require the colour word to not be followed by a known animal/character token.
- Outland's srcCat "Manga" and Gamezone's Black Library "(Paperback)"/"(Hardback)" rows land in Toys — both should resolve to Books.
- srcCat 'Manga' resolves to Toys — 11 rows in this shard are manga/light-novel volumes that belong in Books; one CAT_RULES word fixes Outland's whole manga aisle
- pet-shop breadcrumbs whose LEAF is a toy word ('Hjem > Hund > Kosedyr og bamser', 'Start > Hund > … > Hundeleker > Myke Leker', 'Hjem > Katt > Leker') resolve to Toys; the 'Hund'/'Katt'/'Valp' crumb should dominate the leaf and send them to Pets
- Gamezone rows put the shop's shelf label into `brand` (Brettspill, Puslespill, Samlekort, Rollespill, Miniatyrhobby, Byggesett, Airbrush) — 45 rows here; scrapeSource should not fall back to the category as brand. Same class: 'Kids Dream Store'/'guttelus' (shop name) and Obs' 'ANDRE MERKEVARER' placeholder
- facetrules.js parses 'brikker', 'pieces' and 'deler' but not 'biter' — the commonest Norwegian word for puzzle pieces; 6 rows here state a piece count the rule missed
- srcCat 'Kortspill & samlekort' derives type 'Games & puzzles' for ~40 Magic/Topps singles; 'Trading cards' (already a live value, see WORLD CUP 2026 BOOSTER) is the right one — not flagged per-row since the current value is imprecise rather than contradicted
- video games (PS5/Xbox/Switch) reaching us via toy/game shops land in Toys instead of Gaming — the platform word in the name is a reliable signal
- miniature paint/primer/varnish/pigment/brush lines (Vallejo, Army Painter Warpaints, Wargamer) are catalogued as Toys; a name/shelf rule for these ranges would move ~30 rows here to Hobby

## High-severity rows

660 rows. Full list in `fixes.jsonl`; first 100:

| id | name | issue | fix |
|---|---|---|---|
| `ean-5710441281238` | Chim Chim Duft Diffuser, Lys beige | category: Beauty → Home | {"patch":{"cat":"Home","icon":"flame"}} |
| `ean-7319861021448` | Cosmica Sun Body Mousse SPF30 solkrem 150 ml | facets: Hair care → Sun care | {"patch":{"facets":{"type":"Sun care"}}} |
| `ean-784228595486` | D.S. & DURGA Breakfast Leipzig Candle 200g | category: Beauty → Home | {"patch":{"cat":"Home","icon":"flame","brand":"D.S. & DURGA"}} |
| `ean-7028210117434` | DARK Crystal Heart Bracelet Gold | category: Beauty → Jewelry | {"patch":{"cat":"Jewelry","icon":"gem"}} |
| `ean-7028210129598` | DARK Crystal Ring Broad Silver Size 1 | category: Beauty → Jewelry | {"patch":{"cat":"Jewelry","icon":"gem"}} |
| `ean-7028210117489` | DARK Heart Signet Ring Gold Size 3 | category: Beauty → Jewelry | {"patch":{"cat":"Jewelry","icon":"gem"}} |
| `ean-7028210011749` | DARK Leather Stud Bracelet Mini Chocolate Brown | category: Beauty → Jewelry | {"patch":{"cat":"Jewelry","icon":"gem"}} |
| `ean-7028210117830` | DARK Metal Bead Bracelet with Stone Beads & Pearls Maroon | category: Beauty → Jewelry | {"patch":{"cat":"Jewelry","icon":"gem"}} |
| `ean-7028210130273` | DARK Tweed Mini Pouch Dark Navy Blue | category: Beauty → Fashion | {"patch":{"cat":"Fashion","icon":"shopping-bag"}} |
| `ean-7028210143594` | DARK Woven Friendship Bracelet "C'est La Vie" White W/Country Blue & Gold | category: Beauty → Jewelry | {"patch":{"cat":"Jewelry","icon":"gem"}} |
| `ean-7028210033673` | DARK Woven Friendship Bracelet C'est La Vie Sand | category: Beauty → Jewelry | {"patch":{"cat":"Jewelry","icon":"gem"}} |
| `ean-73209744` | Depend Gel IQ Cat Eye 10119 Mars 10119 Mars | facets: Eyes → Nails | {"patch":{"facets":{"type":"Nails"}}} |
| `ean-73212997` | Depend Gel iQ Cat Eye Divine Whisper 5ml | facets: Eyes → Nails | {"patch":{"facets":{"type":"Nails"}}} |
| `p-ozami-detangler-curved` | Detangler Curved | category: Beauty → Pets | {"patch":{"cat":"Pets","icon":"paw-print"}} |
| `ean-70120868` | Dr. Greve Pharma antiperspirant uten parfyme 50 ml | facets: Fragrance → Body & bath | {"patch":{"facets":{"type":"Body & bath"}}} |
| `ean-5712350540628` | ECOOKING Night Cream Fragrance Free 50ml | facets: Fragrance → Moisturisers | {"patch":{"facets":{"type":"Moisturisers"},"brand":"Ecooking"}} |
| `ean-5712350500530` | ECOOKING Wet Wipes Fragrance Free 25pcs | facets: Fragrance → Cleansing | {"patch":{"facets":{"type":"Cleansing"},"brand":"Ecooking"}} |
| `ean-748406001299` | Espree Perfect Calm Lavendel og kamille 355 ml | category: Beauty → Pets | {"patch":{"cat":"Pets","icon":"paw-print"}} |
| `ean-7391593004401` | Five Oceans Wool Dryer Balls 4pcs | category: Beauty → Home | {"patch":{"cat":"Home"}} |
| `p-miniatyrhobby-gamemaster-primer-desert-arid-wastes` | GameMaster Primer Desert & Arid Wastes | category: Beauty → Hobby | {"patch":{"cat":"Hobby","brand":"GameMaster"}} |
| `ean-7350170173985` | GLAS Cornelia Gold Blush Sunglasses 0,0 + | category: Beauty → Fashion | {"patch":{"cat":"Fashion"}} |
| `ean-7350142348748` | GLAS Ella Gold Sunglasses Strength 0 + | category: Beauty → Fashion | {"patch":{"cat":"Fashion"}} |
| `ean-7350142348755` | GLAS Ella Gold Sunglasses Strength 1.0 + | category: Beauty → Fashion | {"patch":{"cat":"Fashion"}} |
| `ean-7350142348779` | GLAS Ella Gold Sunglasses Strength 2.0 + | category: Beauty → Fashion | {"patch":{"cat":"Fashion"}} |
| `ean-7350142348847` | GLAS Ella Silver Readers Strength 3.0 + | category: Beauty → Fashion | {"patch":{"cat":"Fashion"}} |
| `ean-7350170173657` | GLAS Jennifer Gold Sunglasses 2,0 + | category: Beauty → Fashion | {"patch":{"cat":"Fashion"}} |
| `ean-7350031365887` | Great Earth Magnesiumpulver 200g | category: Beauty → Health | {"patch":{"cat":"Health"}} |
| `p-helly-hansen-workwear-helly-hansen-work-hh-lifa-merino-balaclava-camo` | Helly Hansen Work HH Lifa Merino Balaclava Camo | category: Beauty → Fashion | {"patch":{"cat":"Fashion"}} |
| `ean-7350124790848` | Hickap Fire Eyes Cream Shadow Stardust 4,5g | facets: Moisturisers → Eyes | {"patch":{"facets":{"type":"Eyes"}}} |
| `ean-5060339331256` | Holistic Silk Pure Mulberry Silk Anti-Ageing Pillowcase - White | category: Beauty → Home | {"patch":{"cat":"Home"}} |
| `ean-5060339331225` | Holistic Silk Velvet Hot Water Bottle - Jade | category: Beauty → Home | {"patch":{"cat":"Home"}} |
| `ean-5060945315923` | ICONIC LONDON Lip Mousse Cloud Kiss Matte Show Off Show Off | facets: Hair care → Lips | {"patch":{"name":"ICONIC LONDON Lip Mousse Cloud Kiss Matte Show Off","facets":{"type":"Li |
| `p-isola-isola-g-primer-1l-flaske` | Isola G-primer - 1l flaske | category: Beauty → Tools | {"patch":{"cat":"Tools"}} |
| `ean-7350022453333` | K9 Competition Copperness Shampoo Fargeforsterkende hvit 300 ml | category: Beauty → Pets | {"patch":{"cat":"Pets"}} |
| `ean-4971650801506` | Kiku-Masamune Sake Skin Care Foaming Face Wash 200g | facets: Hair care → Cleansing | {"patch":{"facets":{"type":"Cleansing"}}} |
| `p-icebug-metro2-bugrip-piggsko-herre-sort` | - IceBug Metro2 BUGrip Piggsko Herre- Sort | category: Fashion → Shoes | {"patch":{"cat":"Shoes","brand":"Icebug","name":"Icebug Metro2 BUGrip Piggsko Herre - Sort |
| `p-icebug-torne-2-biosole-gtx-vintersko-herre-gra` | - IceBug Torne 2 Biosole GTX Vintersko Herre - Grå | category: Fashion → Shoes | {"patch":{"cat":"Shoes","brand":"Icebug","name":"Icebug Torne 2 Biosole GTX Vintersko Herr |
| `p-seleverkstedet-fleece-potesokker-4pk-gra` | - Seleverkstedet Fleece Potesokker 4pk - Grå | category: Fashion → Pets | {"patch":{"cat":"Pets","brand":"Seleverkstedet","name":"Seleverkstedet Fleece Potesokker 4 |
| `ean-7391998577463` | 861179 | name: 861179 →  | {"patch":{"hidden":1}} |
| `p-fjallraven-abisko-hybrid-trail-shorts-w` | Abisko Hybrid Trail Shorts W | facets: Trousers → Shorts | {"patch":{"facets":{"type":"Shorts","audience":"Women"}}} |
| `p-aclima-aclima-lightwool-hoodie-man-insignia-blue-blithe` | Aclima Lightwool Hoodie Man Insignia Blue/Blithe | facets: T-shirts & tops → Knitwear & hoodies | {"patch":{"facets":{"type":"Knitwear & hoodies","audience":"Men"}}} |
| `p-aclima-aclima-w-s-woolshell-sport-jacket-jet-black` | Aclima W's WoolShell Sport Jacket Jet Black | facets: T-shirts & tops → Jackets | {"patch":{"facets":{"type":"Jackets"}}} |
| `p-adidas-adidas-run-70s-2-0-sneakers-maroon-jq9589` | adidas Run 70s 2.0 Sneakers Maroon JQ9589 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","name":"adidas Run 70s 2.0 Sneakers Maroon","icon":"footprints"}} |
| `p-adidas-adidas-sneakers-lilla-if1533-pureboost-23-w` | adidas Sneakers Lilla IF1533 PUREBOOST 23 W | category: Fashion → Shoes | {"patch":{"cat":"Shoes","name":"adidas Sneakers Lilla PUREBOOST 23 W","icon":"footprints"} |
| `p-adidas-adidas-vl-court-3-0-sneaker-solv` | adidas VL Court 3.0 Sneaker Sølv | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `p-laksen-alex-organic-cotton-shirt` | Alex Organic Cotton Shirt | facets: Knitwear & hoodies → Shirts & blouses | {"patch":{"facets":{"type":"Shirts & blouses"}}} |
| `ean-8435384426306` | Asi Dukker - Dukkeklær Hoodie Sjøgrønn - feil tittel og produkt - Onesize | junk:  → 1 | {"patch":{"hidden":1}} |
| `ean-8435384427402` | Asi Dukker - Leo Dukke 46 cm med Hvit Body - Onesize | category: Fashion → Toys | {"patch":{"cat":"Toys"}} |
| `ean-4571633340543` | Asics Dame Løpesko Gel-Nimbus 28 37,5 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `ean-4571633743535` | Asics Dame Løpesko Novablast 6 38 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `ean-4571633483981` | Asics Dame Løpesko Trabuco Max 5 38 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `ean-4571633790836` | Asics Herre Løpesko Gel-Nimbus 28 45 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `ean-4571633482090` | Asics Herre Løpesko Trabuco Max 5 42 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `p-b-co-b-co-damesko-sort-5269100110` | B&CO damesko sort 5269100110 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","name":"B&CO damesko sort","icon":"footprints"}} |
| `ean-7317680211569` | BabyBjörn - Bæresele Mini Svart - Onesize | category: Fashion → Baby | {"patch":{"cat":"Baby"}} |
| `ean-7391998150246` | Badehåndkle | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `ean-7023770155506` | Bamboo eksemhansker til barn: 5-6 år | category: Fashion → Health | {"patch":{"cat":"Health"}} |
| `p-kid-bird-gjestehandkle-gronn` | Bird gjestehåndkle grønn | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `p-black-amethyst-semi-permanent-hair-dye-100-ml` | Black Amethyst Semi Permanent Hair Dye 100 ml | category: Fashion → Beauty | {"patch":{"cat":"Beauty"}} |
| `p-bugatti-bugatti-chelsea-stovel-brun-325ate355900` | Bugatti Chelsea Støvel Brun 325ATE355900 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","name":"Bugatti Chelsea Støvel Brun","icon":"footprints"}} |
| `p-bugatti-bugatti-vinterstovel-brun-321auf501200` | Bugatti Vinterstøvel Brun 321AUF501200 | category: Fashion → Shoes | {"patch":{"cat":"Shoes","name":"Bugatti Vinterstøvel Brun","icon":"footprints"}} |
| `p-kid-bumblebee-flower-handkle-hvit` | Bumblebee Flower håndkle hvit | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `p-hoka-carbon-x-2-lopesko-herre` | CARBON X 2 Løpesko herre | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `p-carhartt-workwear-carhartt-m-s-rigby-rugged-cargo-short-dark-khaki` | Carhartt M's Rigby Rugged Cargo Short Dark Khaki | facets: Trousers → Shorts | {"patch":{"facets":{"type":"Shorts"}}} |
| `p-celavi-celavi-foret-gummistovler` | Celavi Foret Gummistøvler | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `p-celavi-celavi-gummistovler-hest` | Celavi Gummistøvler - Hest | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `p-celavi-celavi-stovler-rainbow` | Celavi Støvler Rainbow | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `p-celavi-celavi-stovler-short` | Celavi Støvler Short | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `p-kid-celia-handkle-brun` | Celia håndkle brun | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `p-kid-celia-handkle-marinebla` | Celia håndkle marineblå | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `p-kid-celia-handkle-sand` | Celia håndkle sand | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `p-chamois-butt-r-chamois-buttr-original-235-ml-dame-krem` | Chamois Buttr Original 235 ml Dame Krem | category: Fashion → Beauty | {"patch":{"cat":"Beauty"}} |
| `ean-7340194808178` | Cleo Håndkle 50x70 cm, Beige | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `p-mountain-equipment-comici-wmn-s-short-ombre-blue` | Comici Wmn's Short Ombre Blue | facets: Trousers → Shorts | {"patch":{"facets":{"type":"Shorts","audience":"Women"}}} |
| `p-copenhagen-copenhagen-cowboy-boots-cognac-dove` | Copenhagen Cowboy Boots - Cognac Dove | category: Fashion → Shoes | {"patch":{"cat":"Shoes","icon":"footprints"}} |
| `p-craft-core-soul-sweatshorts-m` | Core Soul Sweatshorts M | facets: Trousers → Shorts | {"patch":{"facets":{"type":"Shorts"}}} |
| `p-pinewood-cornwall-shirt-dark-copper-suede-brown` | Cornwall Shirt Dark Copper/Suede Brown | facets: Knitwear & hoodies → Shirts & blouses | {"patch":{"facets":{"type":"Shirts & blouses"}}} |
| `p-creamie-creamie-shorts-sweat` | Creamie Shorts Sweat | facets: Knitwear & hoodies → Shorts | {"patch":{"facets":{"type":"Shorts"}}} |
| `p-sweet-protection-crusader-primaloft-jacket-w` | Crusader Primaloft Jacket W | facets: T-shirts & tops → Jackets | {"patch":{"facets":{"type":"Jackets","audience":"Women"}}} |
| `ean-7640144829544` | Curli Vest Harness Clasp Air-Mesh - Step i svart XXX-Small | category: Fashion → Pets | {"patch":{"cat":"Pets","icon":"paw-print"}} |
| `p-real-socks-dress-for-success-sock` | Dress for Success Sock | facets: Dresses & skirts → Socks & hosiery | {"patch":{"facets":{"type":"Socks & hosiery"}}} |
| `ean-7090011250108` | Easygrow - Amme- og Samsovingsmadrass - Onesize | category: Fashion → Baby | {"patch":{"cat":"Baby"}} |
| `ean-7090019667541` | Easygrow - Gravidpute, ammepute og babynest Mum & Me Blå - Onesize | category: Fashion → Baby | {"patch":{"cat":"Baby"}} |
| `p-ecco-ecco-herrestovletter-svart-82431459749-ult-trn-m` | ECCO Herrestøvletter Svart 82431459749  ULT-TRN M | category: Fashion → Shoes | {"patch":{"cat":"Shoes","name":"ECCO Herrestøvletter Svart ULT-TRN"}} |
| `p-ecco-ecco-korte-damestovletter-svart-22201301001-metropole` | ECCO Korte damestøvletter Svart 22201301001  METROPOLE | category: Fashion → Shoes | {"patch":{"cat":"Shoes","name":"ECCO Korte damestøvletter Svart METROPOLE"}} |
| `ean-7325708501981` | Embroidery Håndkle 70x140 cm Hvit | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `ean-1220000200029` | Ergobaby - Bæresele Embrace Heather Grey - Onesize | category: Fashion → Baby | {"patch":{"cat":"Baby"}} |
| `ean-8451970327710` | Ergobaby - Bæresele Omni Classic Grå - Onesize | category: Fashion → Baby | {"patch":{"cat":"Baby"}} |
| `p-espegard-espegard-balbrenner-lue-40-metall` | Espegard Bålbrenner Lue 40 Metall | category: Fashion → Garden | {"patch":{"cat":"Garden","facets":{}}} |
| `p-jotunheim-fondsbu-strikkebukse-mini` | Fondsbu strikkebukse Mini | facets: Knitwear & hoodies → Trousers | {"patch":{"facets":{"type":"Trousers"}}} |
| `p-newbie-girlander` | Girlander | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `p-newbie-girlander-luftballonger` | Girlander luftballonger | category: Fashion → Home | {"patch":{"cat":"Home"}} |
| `ean-7028640111361` | Grilltrekk regnfrakk til Freda | category: Fashion → Garden | {"patch":{"cat":"Garden"}} |
| `ean-7072816693021` | Gullkorn - Genser Villvette Askeblå - 86 | facets: Gold → Blue | {"patch":{"facets":{"color":"Blue"}}} |
| `ean-7072816693328` | Gullkorn - Genser Villvette Askeblå LTD - 86 | facets: Gold → Blue | {"patch":{"facets":{"color":"Blue"}}} |
| `ean-7072816634154` | Gullkorn - Jona Fleece-sett Stormblå - 86-92 | facets: Gold → Blue | {"patch":{"facets":{"color":"Blue"}}} |
| `ean-7072816571480` | Gullkorn - Kjole Cleve Bringebær - 92 | facets: Gold → Red | {"patch":{"facets":{"color":"Red"}}} |
| `ean-7072816703744` | Gullkorn - Perik Treningsdress Frostrosa - 98 | facets: Gold → Pink | {"patch":{"facets":{"color":"Pink"}}} |
| `ean-7072816630712` | Gullkorn - Ullue Baby Trax Stormblå - 9-18 mnd | facets: Gold → Blue | {"patch":{"facets":{"color":"Blue","material":"Wool"}}} |
| `p-kid-happy-bird-gjestehandkle-hvit` | Happy Bird gjestehåndkle hvit | category: Fashion → Home | {"patch":{"cat":"Home"}} |

## Per-shard summaries

| shard | checked | ok | issues | notes |
|---|---|---|---|---|
| Beauty-02 | 300 | 152 | 148 | Category accuracy is high for real cosmetics (288/300 correct); the outliers are all one shop filing non-cosmetics under a beauty-ish crumb. The dominant defect is not classification but a Kicks scraper bug: 52 of the 56 Kicks rows repeat the variant/size label verbatim at the end of the product name. Shade variants are pervasive and completely unwired (18 families, 47 rows). Volume and SPF derivation is flawless (0 misses in 300). Half the shard (150/300) still has no image, consistent with the sampled-crawl state. |
| Beauty-03 | 300 | 220 | 80 | Core Blivakker/Parfymeri beauty rows are in good shape; nearly all damage is non-beauty stock that beauty shops carry (eyewear, laundry, candles, dog shampoo, building primer) plus the Kicks feed’s duplicated name suffix and missing breadcrumbs. Half the shard still has no product image (img:0), which is a crawl/approval gap rather than a per-product fix. |
| Fashion-01 | 300 | 172 | 128 | Structurally the shard is sound — the Fashion assignment itself is right for ~90% of rows and the Kappahl/Sport 1/Intersport feeds are clean. Almost all damage comes from two places: shops whose breadcrumb is absent or junk ('Home', 'Klær', 'Sneax / Nyheter / Dame') dump footwear, towels, a doll, a baby carrier, a dog harness and two cosmetics into Fashion, and facets.type is derived from the whole breadcrumb path rather than the leaf, so shorts read as trousers and jackets as t-shirts. Only 2 rows deserve demotion. Worth noting separately: 129 of 300 rows still have no image, and the Foss Sport and Guttelus feeds publish one row per size with the size in the title and no variant wiring at all (~30 rows), which will keep manufacturing near-duplicate products. |
| Fashion-02 | 300 | 173 | 127 | Core apparel is healthy — most rows are correctly Fashion with sensible type/audience/material. The damage is at the edges: 25 rows are not apparel at all (bath towels, baby carriers and nursing pillows, ankle boots, a kr 29k mountain bike, a barbecue cover, a fire-pit lid, interior garlands, a chibi figure, ski boots), and two systematic derivation bugs (brand-derived 'Gold' on Gullkorn, srcCat parent crumb overriding leaf and name) account for most facet errors. Two shard-wide observations not filed per row: 140 of 300 rows have img 0 (sampled shops with no crawl approval), and ~90 rows from Foss Sport, Guttelus and Outland carry a size inside the product name with no vlabel/family — a feed-shape issue, since each is a distinct SKU rather than a groupable family. |
| Fashion-03 | 300 | 184 | 116 | Broadly healthy: 300 rows, all auto-promoted, and the Fashion cat is right for ~94% of them. The real damage is concentrated in three places — (1) 9 footwear rows and 6 outright non-clothing rows (2 bath towels, a dog vest, a blanket, hair dye, garden gloves, 2 baby bibs, swim goggles) sitting in Fashion, (2) the type facet, where a knitwear/material keyword beats the actual garment noun, and (3) a large low-quality feed from Junior Barneklær (~70 rows) whose titles are brand + garment type with no model or colour ('Hust&Claire Bukse', 'Hust&Claire Bukser', 'Hust&Claire Pants', 'HustClaire Pants'), which both blocks any variant/duplicate matching and gave us one pure duplicate from a shop typo. Brand fragmentation is visible across shops for the same label (Hust and Claire / Hust & Claire / Hust&Claire; Hummel / Hummel Barn) and several ALL-CAPS shop brand strings (HELLY HANSEN, KARI TRAA, FJÄLLRÄVEN) — only the 'Hummel Barn' case is patched here since the others need a canonical-brand table rather than per-row fixes. Image coverage is roughly 55%, and every row's icon is the Fashion default 'shirt' including the towels and the dog vest. |
| Fashion-04 | 300 | 158 | 142 | Clothing classification itself is solid — nearly every mismatch is a NON-clothing row (footwear, kids' tableware, bath towels, an apron, a bracelet, doll and bath toys) that a clothing-shop breadcrumb dragged into Fashion; of 34 category findings 32 are high. Two more shard-wide facts were left out of the per-row findings deliberately: 118 of 300 rows have no image (every Skoringen/Legero row and most Guttelus ean-* rows), and almost every Guttelus/Konges Sløjd/Lil'Atelier/Levi's row carries a size or colour suffix in the name ('- 92', '- Onesize') with no vlabel or family — a per-row variant flag there would have been ~100 findings, so it is recorded here instead. Rows moving out of Fashion still carry icon 'shirt' (every row in the shard does); the cat patches do not set icon, so a follow-up icon pass is worth one bulk PATCH. |
| Fashion-05 | 300 | 225 | 75 | Overall healthy — the shard really is almost all Fashion and the shop breadcrumbs are being read well. The damage is concentrated: 15 rows are not apparel at all (2 ankle boots, 4 slippers, 2 cufflinks, a lunch box, a towel, a marker pen, 2 make-up items, baby oil, a ferret santa hat), 19 rows carry a wrong facets.type (mostly colour/fabric words leaking into the type rule), and roughly 40% of rows still have no product image (every Guttelus and most Widforss rows are img=0). Nothing in the shard deserves demotion. |
| Fashion-06 | 300 | 185 | 115 | Category assignment inside Fashion is fine (clothing is clothing), but everything adjacent to clothing leaks in: 22 shoe rows, 8 towels, 5 baby-feeding items, 2 toys, PPE, a sewing notion and a bike protector — 43 of the 115 findings. Structurally, ~90 Guttelus/KappAhl rows are one EAN per size+colour with the variant suffix in the name and no vlabel/family, and the Junior Barneklær and Ralph Lauren blocks all publish srcCat 'Home' plus the brand repeated at the head of every name; neither is worth per-row fixes but both are why so many facets are empty. Images are missing on ~45% of rows, expected for sampled shops. |
| Fashion-07 | 300 | 211 | 89 | Clothing rows are largely correct; the damage is concentrated at the edges — footwear (23 rows, mostly the whole Skoringen shop) and four non-apparel srcCats that fall through to a Fashion floor. Foss Sport publishes one row per size (~25 rows whose name ends in 'L'/'XS'/'152') with no variant wiring, and 144 of 300 rows still have no image. |
| Fashion-08 | 263 | 170 | 93 | Tail-end Fashion shard in decent shape — 65% clean and the clothing rows are mostly right. The real damage is 16 rows that are not clothing at all (7 shoes, 4 baby sunscreens/soap, 3 dog items, a sippy-cup straw set, a bicycle gear-cable housing read as hosiery), plus a type-facet vocabulary that systematically mislabels shorts, fleece midlayers and jackets. Two shop-wide patterns are noted here rather than per row: Guttelus/Junior Barneklær/Wheat rows repeat the brand at the start of the name and carry a size or colourway suffix ('- 98', '- Navy') with no vlabel/family, and Intersport/Sport 1 publish some names in ALL CAPS. |
| Furniture-03 | 300 | 210 | 90 | Core furniture (sofas, beds, tables, storage) is classified correctly and the shard is healthy on the whole; nearly all damage is at the edges — bed linen and decor that should be Home, five outdoor/garden accessories, and a handful of single-row escapees (a table lamp in Lighting, a cat tree in Pets, an infrared therapy mat in Health, an INTEX pool float in Toys). Every row carries icon 'sofa' (the Furniture default), so the icon is uninformative for beds, handles, lamps and mirrors alike — a category-level issue, not flagged per row. 138 of 300 rows have no image, consistent with these shops being sampled rather than approved for a full crawl. The ~50 DREAMZONE Kontinentalseng rows are one huge un-wired variant family (same model across 7 sizes, 2 colours and 4 firmnesses); grouping them is a data-modelling job rather than 50 individual fixes, so it is reported here once instead. |
| Furniture-04 | 300 | 168 | 132 | Structurally sound for real furniture (Fagmøbler/Trademax/Chilli/Møbelringen rows are well classified), but the shard is polluted by ~35 non-furniture rows — bedroom textiles, rugs, decor, parasols, hardware and two grocery items — and by 21 unwired variant families, most of them Fagmøbler's Odel bed range listed once per size. 76 of 300 rows still have no product photo. |
| Furniture-05 | 300 | 198 | 105 | Category-wise the shard is mostly sound for actual furniture; the damage is concentrated in three imports — JYSK bedroom textiles, Trademax rugs/posters, and a handful of non-furniture strays (bollard lamp, post lantern, thermos, PEMF therapy mat, craft paint, parasol, gazebo, parasol base). Variant hygiene is the other systematic weakness: 42 rows are plainly colour/size options of another row in the same shard, and the JYSK 'Rammemadrass'/'Regulerbar seng' blocks (32 further rows) are one multi-axis family each (size x base x fabric x firmness) that no single-axis grouping can express — worth a dedicated pass. Two cosmetic things not filed per row: every one of the 300 rows carries icon 'sofa' (the cats.json default), which is wrong for mattresses, rugs, posters and mirrors but is a registry issue not a per-product one; and Kid Interiør prices are all round hundreds while Fagmøbler brands are all just the first token of the product name (Orwel, Oviedo, Portland, Ryan, Selma, Sengehylle) — both look like per-shop scraper artifacts worth checking at the source. |
| Furniture-07 | 165 | 73 | 92 | Category assignment is broadly right (11 of 165 rows are outright in the wrong category: a spotlight, a dog ramp, pool chemicals, a greenhouse, wood oil, a sports drink, decor and a noticeboard); the real damage is the derived `type` facet, wrong or missing on ~50 rows because the shop breadcrumb outvotes the product name, plus 16 size/colour variant families sitting as separate top-level rows (Wonderland alone accounts for 9). 66 of 165 rows have no image and every row carries the default `sofa` icon, both of which are pipeline-level, not per-row, issues. |
| NOCAT-01 | 19 | 0 | 19 | Homogeneous shard: 19 phone/tablet/laptop variant children from NetOnNet/Power/CDON, all correctly wired to a family+vlabel and all with plausible prices — the only real defect is that none of them carries cat, brand or icon, which is one upstream bug in child-row creation rather than 19 independent classification mistakes; secondary issues are 12 rows with no product photo and 4 non-GTIN ean/family ids. Nothing here warrants demotion. |
| Outdoor-01 | 300 | 195 | 105 | Data is broadly healthy for real outdoor gear (195/300 clean) and image coverage is about 55%, but three machine-made defects dominate: brand-derived colour facets (18 wrong values, 13 of them from the string 'Black Diamond'), material-over-noun type facets on headwear, and 26 rows that are not outdoor products at all — pet gear (7), gym/training equipment (5), underwear (3), footwear (4) — all arriving through brand-only breadcrumbs. Also 7 Bergans canoe spare parts ('2/3/4/5-Cross Rib', 'C-Clips') are live with names no shopper can read, and 33 rows are ungrouped colour/size/capacity siblings of another row in this same shard. |
| Outdoor-02 | 300 | 202 | 98 | Genuinely-outdoor rows (Bergans/Fjällräven/Devold apparel, Rapala tackle, packs, tents) are in good shape; almost all damage is at the edges - a shop floor absorbing another department (13 dog products, 6 Garmin wearables, 6 casual/running shoes, a laptop backpack, a pencil case) and Bergans/Fjellsport feeds shipping duplicate SKU rows (11 rows across 8 variant families). Two shard-wide cosmetics not reported per row: every row carries the category-default icon 'tent' (a fishing lure and a beanie both show a tent), and 141 of 300 rows have no image at all, concentrated in the Milrab/Widforss/Fjellsport sampled crawls. |
| Outdoor-03 | 300 | 238 | 62 | Broadly healthy — most rows are correctly-categorised outdoor gear with sane brands and facets; the damage is concentrated in three leaks into Outdoor (dog gear from hunting shops, footwear from shoe departments, one camera bag and one silver fish fork) plus a bag-facet rule that fires on any 'N-pack'. Shard-wide, non-per-row observations: every one of the 300 rows carries the category default icon 'tent' (a beanie, a lure and a sleeping bag all show a tent), no row has any variant wiring even though most names end in a colourway, ~95 rows have no image (the sampled-shop policy), Fjellsport rows all repeat the brand at the head of the name, and Intersport/Sport 1 rows are ALL CAPS — none of these are worth 300 individual findings but all four are visible on the category page. |
| Outdoor-04 | 300 | 247 | 53 | Healthy shard overall — 300 machine-promoted rows from six outdoor retailers, Outdoor is right for the large majority and the derived colour/audience/material facets are mostly sound. The two real problems are the dog-gear block (8 Non-stop Dogwear / OllyDog / Flexi rows sitting in Outdoor) and facet derivation: 165 of 300 rows have no type at all, largely because singular 'Pant'/'Short' and headwear words like 'Headband' aren't in the rules. Not flagged per row but worth knowing: 122 of 300 rows have no product photo (the sampled-crawl gap, all shops here are unapproved), no row has a rating or a second offer so every 'best price' is a single shop, and the Sport 1 / Intersport fishing rows carry ALL-CAPS abbreviated trade names ('MØRESILDA HOLO 32G SØ/SV') which are terse but readable to a fishing shopper, so I left them alone. Nearly every row ends in a colourway with no vlabel/family; only the eight groups above are the same product twice in this shard. |
| Outdoor-07 | 155 | 84 | 71 | Structurally healthy — every row is a real, identifiable outdoor product with an offer, and no junk/demotion candidates were found. The damage is concentrated in derived facets (43 of 71 findings) and in one category boundary: 10 footwear rows sit in Outdoor because the Norwegian shoe crumbs are unmapped. Two shard-wide data-quality patterns are noted once here rather than per row: 61 of 155 rows still have no image (all from sampled Milrab/Widforss/Fjellsport crawls), and Fjellsport/Intersport publish brand-prefixed or ALL-CAPS names that the ingest stores verbatim. |
| Toys-01 | 300 | 131 | 169 | Category accuracy for genuine toys is good - almost every mis-file is a non-toy that a toy retailer's own shelf swept in (manga, video games, pet-shop cage toys, towels/blankets, model paint, a cap, a T-shirt, a snack). The dominant defect is metadata, not classification: 78 rows carry a shop section or the shop name as `brand` and another 45 leave a brand the name plainly states as 'Unspecified', 115 of 300 rows have no photo, only 1 row of 300 has more than one offer, and 0 rows carry `pieces` despite the facet being declared. |
| Toys-02 | 300 | 145 | 155 | Category accuracy is decent: 32 of 300 rows are misfiled (18 clearly so — manga->Books, PS4/PS5 games->Gaming, pet toys->Pets, Hoptimist decor->Home; the softer ones are Citadel/Army Painter paints and modelling supplies->Hobby and disc-golf gear->Sport). The dominant defect is metadata, not classification: 85 rows store a shop, shelf or placeholder word in `brand` ('Kids Dream Store' on all 46 Kidsdreamstore rows, 'Brettspill'/'Samlekort'/'Rollespill'/'Byggesett'/'Puslespill'/'Miniatyrhobby'/'PlayStation 5' on 37 Gamezone+Obs+Lekia rows, 'ANDRE MERKEVARER' on 2), plus 9 rows missing a brand the name states and 4 carrying the wrong one — brand filtering and 'more from this brand' are effectively broken for two whole shops. Name quality is second: 16 rows are hard-truncated mid-word (Ringo at 40 chars and ALL CAPS, Gamezone ~40, Lekia ~60), 6 Lekeverden rows are keyword-stuffed SEO titles up to 265 chars ending in the shop's own name, and 3 carry a raw '&amp;'. 59 of the 300 rows are Magic: The Gathering singles at kr 2-10 from one shop, all out of stock — legitimate but heavy catalog bloat for a comparison site. 117 of 300 rows have no image (the known sampled-crawl gap), so that is not reported per row. |
| Toys-03 | 300 | 161 | 139 | Broadly healthy - the toy rows really are toys and prices look sane. The dominant defect is brand hygiene: 55 rows carry the selling shop or the shop's own category as brand (Kids Dream Store, Brettspill, Miniatyrhobby, Byggesett, PlayStation 5) and ~40 more leave brand Unspecified while the name spells it out (Hama, Hape, Kinetic Sand, Hot Wheels, LEGO). Also worth knowing but not fixable from this shard: 134 of 300 rows have no image (sampled $discover shops) and Ringo's feed truncates titles at ~40 chars. |
| Toys-04 | 300 | 19 | 281 | Toys-04 is 80% LEGO from two shops: brand is unset on 240 of 300 rows despite every name starting with 'LEGO', and the same six LEGO sets exist twice (a Lekeverden ean-* row and an EAN-less Ringo p- row) instead of two offers on one product. Category is right for 287 of 300; the real misses are three manga volumes, four KONG/cat pet products and a handful of Kids Dream Store non-toys. Nothing warrants demotion. 78 rows still have no image. |
| Toys-05 | 300 | 112 | 188 | Half LEGO, and the products themselves are real and overwhelmingly correct in Toys — the damage is metadata, not classification: ~85 LEGO rows carry brand 'Unspecified' and 25 more carry 'LEGO®', 22 Kids Dream Store rows carry the shop name as brand, 20 names are raw Lekeverden SEO strings, 12 Ringo titles are cut off mid-word, and 8 LEGO sets exist twice under both an ean-* and a slug id. Only 22 rows sit in the wrong category (manga, Xbox/Switch games, bedding, towel, socks, model kits) and just one (a loose LR44 cell) should not be live at all; 101 of 300 rows still have no image. |
| Toys-06 | 300 | 84 | 216 | Category accuracy is decent (29/300 wrong, and 9 of those are one unmapped 'Manga' crumb), but metadata is weak across the board: half the shard has a placeholder or shop-name brand, 48 trading-card rows carry the wrong type facet, and 40% of rows have no image because the feed shops are sampled rather than fully crawled. |
| Toys-07 | 300 | 97 | 203 | Product identity is mostly right - this shard is genuinely Toys and the category rules did well (28 category findings, half of them the same three shops: disc golf discs whose breadcrumb root is SPORT, Outland manga/model paint, and Kidsdreamstore party/textile/accessory rows filed under the vague 'Home' crumb). The damage is concentrated in metadata: 110 brand findings on 300 rows, two thirds of them a shop or menu label stored as the brand, which makes brand filtering and 'other offers for this product' unusable across Gamezone and Kidsdreamstore. Image coverage is 63% (110 of 300 have none), worst on the Outland card singles. Every Ringo price in the shard is a round number (60/80/100/.../1500), which suggests the scraper is reading a rounded display price rather than the real one - worth checking before trusting Ringo as a cheapest-offer source. |
| Toys-08 | 300 | 50 | 250 | Two feeds dominate the shard: 114 Lekeverden Squishmallows rows (good images and prices, but SEO-polluted names and no brand) and ~55 Ringo Squishmallows rows (ALL CAPS, 26 hard-truncated at 40 chars, most with no image). Categories are otherwise solid — only 9 real mismatches, mostly licensed non-toys (headphones, lunch box, umbrella, LED lamp, swim diaper) and 4 novels. 66 of 300 rows still have no stored image, consistent with the sampled-crawl limit rather than a data error, so it is not reported per row. |
| Toys-09 | 247 | 133 | 114 | Data is mostly honest and prices are plausible, but the shard is dominated by two ingest-level defects rather than one-off errors: 45 rows carry a shop shelf label as `brand`, and ~50 rows sit in Toys because a breadcrumb leaf outranked the product (manga, dog/cat toys, model paint, a disc golf putter, three video games). Two further shard-wide observations kept out of the per-row findings to avoid noise: Ringo publishes every name in ALL CAPS with a trailing period (~35 rows here) and Lekeverden appends an SEO blurb plus its own name, both of which want a normalisation at ingest, not 35 patches; and 96 of 247 rows have no image, consistent with the sampled-crawl state. 38 rows are single Magic cards at kr 2-20 from Outland — genuine products, but they are 15% of this shard and will drown category browsing. |
