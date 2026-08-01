// Facet VALUES derived from the product name — the other half of
// worker/facets.json (which only declares which filters a category has).
//
// Why derived, and why here: 13,705 of 14,118 catalog rows were auto-promoted
// from crawls that carry a name, a brand and nothing else. No spec sheet, no
// meta.facets. A registry entry alone therefore renders an empty filter column
// (plans/facets-for-the-new-categories.md), and hand-enriching five-figure row
// counts is not a plan. The product name is the only per-product signal we
// actually hold, so every rule below reads it.
//
// Applied in shapeRows, NOT at ingest: no backfill, no migration, and a rule
// improvement takes effect for all 14k rows on the next deploy instead of
// needing 14k admin PATCHes. Explicit meta.facets always wins over a derived
// value (see shapeRows), so hand enrichment stays authoritative.
//
// Rules are matched against the lowercased name only. A rule that doesn't
// match yields no value, and Results hides a facet group with <2 distinct
// values — so an over-eager category list costs nothing but a miss, while a
// wrong value is visible. Prefer leaving a product untyped.
//
// ponytail: regex scan per row per query (≤PAGE_MAX rows × ~5 rules, measured
// ~4 ms for a 400-row slice). Store into meta at ingest if a query ever has to
// return more rows than that.

// first pattern wins — order specific before general
const opt = (...pairs) => (s) => pairs.find(([re]) => re.test(s))?.[1];
const flag = (re) => (s) => re.test(s) || undefined;
const dec = (x) => Math.round(parseFloat(String(x).replace(',', '.')) * 100) / 100;
// first capture as a number, optionally scaled by the unit captured second
const num = (re, scale = {}) => (s) => {
  const m = re.exec(s);
  return m ? dec(dec(m[1]) * (scale[m[2]] ?? 1)) : undefined;
};

const COLOR = opt(
  [/svart|\bsort\b|\bblack\b/, 'Black'],
  [/hvit|\bwhite\b|offwhite/, 'White'],
  [/\bgrå|\bgrey\b|\bgray\b|antrasitt|charcoal/, 'Grey'],
  [/\bblå|\bblue\b|\bnavy\b|marine|turkis|petrol|denim/, 'Blue'],
  [/grønn|\bgreen\b|oliven|\bolive\b|khaki|\blime\b/, 'Green'],
  [/\brød|\bred\b|bordeaux|burgunder|\bvinr/, 'Red'],
  [/\brosa\b|\bpink\b|cerise|\bpudder/, 'Pink'],
  [/\bbrun|\bbrown\b|cognac|\bcamel\b|mocca|\btaupe\b/, 'Brown'],
  [/beige|\bsand\b|\bnatur\b|\bcream\b|\bkrem\b|\bnude\b|ivory/, 'Beige'],
  [/\bgul\b|\bgult\b|\byellow\b|senneps/, 'Yellow'],
  [/lilla|\bpurple\b|\bviolet|syrin|\bplomme/, 'Purple'],
  [/oransje|\borange\b|korall/, 'Orange'],
  [/\bgull|\bgold\b|\bgolden\b|messing|\bbrass\b/, 'Gold'],
  [/sølv|\bsilver\b|\bkrom\b|chrome/, 'Silver'],
  [/\bmulti\b|flerfarget|\bmix\b/, 'Multicolour'],
);

const AUDIENCE = opt(
  [/\bdame|\bwomen|\bwmns\b|\bw's\b|\bkvinne/, 'Women'],
  [/\bherre|\bmen\b|\bmens\b|\bm's\b/, 'Men'],
  [/\bbarn|\bkids\b|\bjunior\b|\bjr\b|\bbaby|\bgutt|\bjente|\byouth\b|\bchild/, 'Kids'],
);

// "125 ml", "1,5 l" → millilitres; "4 kg", "600 g" → kilos
const VOLUME = num(/(\d+(?:[.,]\d+)?)\s?(ml|cl|dl|l|liter)\b/, { cl: 10, dl: 100, l: 1000, liter: 1000 });
const WEIGHT = num(/(\d+(?:[.,]\d+)?)\s?(kg|g|gram)\b/, { g: 0.001, gram: 0.001 });
const PACK = num(/(\d+)[\s-]?(?:stk|pk\b|pack\b|pakning|pcs\b)/);
const INCH = num(/(\d{2,3}(?:[.,]\d)?)\s?(?:"|”|″|tommer\b)/);
const STORAGE = num(/(\d+)\s?(gb|tb)\b/, { tb: 1024 });
const CM = num(/(\d{2,3}(?:[.,]\d)?)\s?cm\b/);
const WATERPROOF = flag(/gore-?tex|\bgtx\b|\btex\b|vanntett|waterproof|\bdwr\b|\bip6[78]\b/);

// Clothing sizes only where the shop actually writes them: "onesize", a
// trailing letter size ("… Dame M"), an explicit "str 40", or the Norwegian
// kids size some shops append after a dash ("… Navy - 62"). The dash is
// required: a bare trailing number is an article number far more often than a
// size (measured on Shoes, where every match was one).
const SIZE = (s) => {
  const t = s.trim();
  const letter = /(?:\bstr\.?\s*)?\b(xxs|xs|s|m|l|xl|xxl|xxxl|3xl)$/.exec(t);
  const str = /\bstr\.?\s*(\d{2,3})\b/.exec(t);
  const kids = /-\s*(\d{2,3})$/.exec(t);
  if (/\bone[\s-]?size\b/.test(t)) return 'One size';
  if (letter) return letter[1].toUpperCase();
  if (str) return str[1];
  if (kids && +kids[1] >= 44 && +kids[1] <= 176) return kids[1];
  return undefined;
};

// Sub-category (`type`) values follow the canonical vocabulary in
// ENRICHMENT.md for the five categories that already had one — never invent a
// near-duplicate of an existing value, each spelling becomes its own option.
const RULES = {
  Audio: {
    type: opt(
      // Accessories first, like Phones: "Wall Mount for Sonos Beam" must not
      // answer Soundbars off "beam". Stand terms are COMPOUND only — the bare
      // "stativ" leaf "Stativ/kompakt høyttaler" is real stand-mount speakers.
      [/kabel|cable|høyttalerstativ|hodetelefonstativ|\bstand\b|\bshelf\b|\bmount|feste|bracket|adapter|deksel|\bcase\b|pads|bøyle|ørepute|tilbehør/, 'Accessories'],
      [/soundbar|\bbeam\b|\barc\b|\bsub\b|subwoofer/, 'Soundbars'],
      [/\bbuds\b|earbud|ørepropp|in-ear|airpods|true wireless|øreplugg/, 'Earbuds'],
      [/hodetelefon|headphone|headset|over-?ear|on-?ear|quietcomfort|momentum|\bwh-/, 'Headphones'],
      [/høyttaler|\bspeaker|sonos|partybox|party\b|boombox|\bera\b|\bhome\b/, 'Speakers'],
      [/forsterker|receiver|amplifier|\bdac\b|streamer|platespiller|turntable/, 'Amplifiers'],
      [/mikrofon|\bmic\b|podcast/, 'Microphones'],
    ),
    wireless: flag(/trådløs|wireless|bluetooth|\btws\b/),
    color: COLOR,
  },
  Phones: {
    type: opt(
      [/deksel|\bcase\b|cover|skjermbeskytt|panzerglass|\bskin\b|lader|kabel|powerbank|holder|\bmount|magsafe/, 'Accessories'],
      [/telefon|\bphone\b|iphone|galaxy|pixel|redmi|xperia|\bmoto\b|nokia|\bdoro\b/, 'Phones'],
    ),
    storage: STORAGE,
    used: flag(/refurbished|\bsecond\b|brukt\b|b-vare/),
    color: COLOR,
  },
  TV: {
    type: opt(
      [/tv-benk|tv-bord|tv-møbel|\bbenk\b|mediaoppbevaring/, 'TV furniture'],
      [/feste|brakett|\bmount|\bvesa\b|veggfeste|takfeste/, 'Mounts'],
      [/\btv\b|oled|qled|qned|bravia|\buhd\b|smart tv/, 'TVs'],
    ),
    size: INCH,
    panel: opt(
      [/neo qled|\bqled\b/, 'QLED'],
      [/\bqned\b/, 'QNED'],
      [/\boled\b/, 'OLED'],
      [/mini[\s-]?led/, 'Mini LED'],
      [/\bled\b|\blcd\b/, 'LED'],
    ),
    res: opt([/\b8k\b/, '8K'], [/\b4k\b|\buhd\b/, '4K'], [/full hd|\bfhd\b|1080p/, 'Full HD'], [/\bhd\b|720p/, 'HD']),
    platform: opt(
      [/google tv|android tv/, 'Google TV'],
      [/tizen|samsung tv/, 'Tizen'],
      [/webos|\blg\b/, 'webOS'],
      [/roku/, 'Roku'],
      [/ambilight/, 'Ambilight'],
    ),
  },
  Projectors: {
    type: opt(
      [/prosjektor|projector|beamer|nebula|capsule|\bpico\b/, 'Projectors'],
      [/lerret|\bscreen\b|projeksjonsduk/, 'Screens'],
      [/bilde|tavle|canvas|fototapet|plakat|poster|ramme/, 'Wall art'],
    ),
    res: opt([/\b4k\b|\buhd\b/, '4K'], [/full hd|\bfhd\b|1080p/, 'Full HD'], [/\b720p\b|\bhd\b/, 'HD']),
    lumens: num(/(\d{3,5})\s?(?:ansi|lumen)/),
  },
  Gaming: {
    type: opt(
      [/brettspill|board game|kortspill|\brpg\b|pathfinder|dungeons|terning|\bdice\b|expansion/, 'Board games'],
      [/enkeltkort|samlekort|booster|\bmagic\b|pokemon|\btcg\b|trading card/, 'Trading cards'],
      [/warhammer|miniatyr|vallejo|citadel|warpaints|\bprimer\b|speedpaint|\bpaint\b/, 'Miniatures'],
      [/playstation|\bps5\b|\bps4\b|xbox|nintendo switch|\bswitch\b|konsoll|console/, 'Consoles'],
      [/steam deck|steamdeck|håndholdt|handheld/, 'Handhelds'],
      [/controller|kontroller|joy-con|gamepad|\bratt\b|\bmus\b|\bmouse\b|tastatur|keyboard|headset|gamingstol|musematte/, 'Controllers'],
      [/gaming-?pc|hovedkort|grafikkort|kabinett|\brtx\b|\bssd\b|kjøler|\bpsu\b/, 'PC hardware'],
      [/\bspill\b|\bgame\b|edition|\bdlc\b/, 'Games'],
    ),
    disc: flag(/disc|\bblu-?ray\b/),
    color: COLOR,
  },
  Computers: {
    type: opt(
      [/macbook|laptop|notebook|vivobook|ultrabook|bærbar|\bzenbook\b|thinkpad/, 'Laptops'],
      [/\bipad\b|nettbrett|tablet|galaxy tab|\btab\s?s\d/, 'Tablets'],
      [/monitor|skjerm\b|\bqd-oled\b/, 'Monitors'],
      [/grafikkort|geforce|radeon|\brtx\b\s?\d{4}|\bgpu\b/, 'Graphics cards'],
      [/kjøler|vannkjøling|cpu-vifte/, 'Cooling'],
      [/(?<!surround )prosessor|\bcpu\b|ryzen\s?\d|core i\d|core ultra|threadripper/, 'Processors'],
      [/hovedkort|motherboard/, 'Motherboards'],
      [/ddr\d|\bdimm\b|sodimm|minnebrikke/, 'Memory'],
      [/ekstern harddisk|portable ssd|usb-minne|minnepenn|minnekort|micro-?sd|harddiskkabinett/, 'External storage'],
      [/\bssd\b|nvme|m\.2\b|harddisk|\bhdd\b/, 'Internal storage'],
      [/strømforsyning|\bpsu\b/, 'Power supplies'],
      [/kabinett/, 'Cases'],
      [/tastatur|keyboard|\bmus\b|\bmouse\b|\bdock\b|webkamera|headset|\bhub\b|kabel|adapter|veske|\bcase\b/, 'Peripherals'],
      [/stasjonær|desktop|gaming-?pc|\bnuc\b|mini-?pc/, 'Desktops'],
    ),
    size: INCH,
    storage: STORAGE,
    color: COLOR,
  },
  'E-readers': {
    type: opt(
      [/kindle|\bkobo\b|e-?reader|lesebrett|paperwhite|\bclara\b|\blibra\b/, 'E-readers'],
      [/deksel|\bcover\b|sleepcover|\bcase\b|lader|penn/, 'Accessories'],
    ),
    storage: STORAGE,
    size: INCH,
  },
  Home: {
    type: opt(
      [/støvsuger|robotstøvsuger|\bvacuum\b|støvsugerpose|gulvvask|moppe/, 'Vacuums'],
      [/\bhue\b|smartpære|smart lys|lightstrip|smartplugg|\bzigbee\b/, 'Smart lighting'],
      [/luftrenser|\bvifte\b|luftfukter|varmeovn|avfukter|klima/, 'Climate'],
      [/teppe|gulvteppe|ullteppe|løper\b|dørmatte/, 'Rugs'],
      [/gardin|rullegardin|plissegardin|\bpliss\b|gardinstang/, 'Curtains'],
      [/pute\b|pyntepute|putetrekk|pynteputetrekk|\bpledd\b/, 'Cushions & throws'],
      [/sengesett|sengetøy|laken|\bdyne\b|dynetrekk|putevar|\bsateng\b/, 'Bedding'],
      [/håndkl|badematte|dusjforheng|badekåpe|toalett|\bbad\b/, 'Bath'],
      [/oppbevaring|\bkurv\b|\bboks\b|\bkasse\b|\bhylle\b|knagg/, 'Storage'],
      [/duftlys|stearinlys|\bvase\b|dekorasjon|\bramme\b|\bspeil\b|romspray|\bpynt/, 'Decor'],
      [/kaffetrakter|vannkoker|brødrister|\bmixer\b|strykejern/, 'Small appliances'],
      [/kamera|dørklokke|alarm|\bsensor\b|\blås\b/, 'Security'],
      [/chromecast|apple tv|streaming|mediaspiller/, 'Media streamers'],
    ),
    color: COLOR,
    material: opt(
      [/\bull\b|\bwool\b|merino/, 'Wool'],
      [/bomull|\bcotton\b|\blin\b|\blinen\b/, 'Cotton & linen'],
      [/\bskinn\b|\blær\b|leather/, 'Leather'],
      [/\bglass\b|krystall/, 'Glass'],
      [/\bstål|metall|aluminium|\bjern\b/, 'Metal'],
      [/\btre\b|\beik\b|\bfuru\b|bambus|rotting/, 'Wood'],
    ),
  },
  Kitchen: {
    type: opt(
      [/kaffe|espresso|moccamaster|barista|kapsel|\bmelitta\b|\bwilfa\b/, 'Coffee makers'],
      [/airfryer|air fryer|frityr/, 'Air fryers'],
      [/mikrobølge|stekeovn|\bovn\b/, 'Microwaves'],
      [/multicooker|slowcooker|trykkoker|\bfoodi\b/, 'Multicookers'],
      [/stekepanne|\bpanne\b|\bgryte|\bkjele\b|støpejern|\bwok\b|kasserolle/, 'Cookware'],
      [/tallerken|\bkopp\b|\bkrus\b|\bglass\b|bestikk|serveringsfat|\bskål\b|\bbolle\b|\bmugge\b|karaffel|servise|\bfat\b/, 'Tableware'],
      [/\bkniv\b|skjærebrett|rivjern|slikkepott|\bvisp\b|øse\b|kjøkkenredskap|\bsleiv\b|pepperkvern/, 'Utensils'],
      [/bakeform|kakeform|avkjølingsrist|\bkakebo|muffins|\bdeig/, 'Baking'],
      [/kjøkkenhåndkle|grytevott|grillvott|\bforkle\b|\bduk\b|serviett/, 'Kitchen textiles'],
      [/blender|kjøkkenmaskin|vannkoker|brødrister|\bjuicer\b|food processor|\bmixer\b/, 'Small appliances'],
    ),
    material: opt(
      [/støpejern|\bcast iron\b/, 'Cast iron'],
      [/rustfritt|\bstål\b|\bsteel\b/, 'Stainless steel'],
      [/keramikk|porselen|stentøy/, 'Ceramic'],
      [/\bglass\b/, 'Glass'],
      [/\btre\b|bambus|\beik\b|akasie/, 'Wood'],
      [/silikon/, 'Silicone'],
    ),
    color: COLOR,
  },
  Appliances: {
    type: opt(
      [/vaskemaskin|\bwasher\b|vask-?tørk/, 'Washing machines'],
      [/tørketrommel|\bdryer\b/, 'Dryers'],
      [/oppvaskmaskin|dishwasher/, 'Dishwashers'],
      [/kjøleskap|\bfryser\b|kombiskap|fridge/, 'Fridges & freezers'],
      [/komfyr|stekeovn|induksjonstopp|platetopp|koketopp|\bovn\b/, 'Cookers & hobs'],
      [/ventilator|kjøkkenvifte|hood/, 'Extractor hoods'],
    ),
    width: CM,
  },
  Furniture: {
    type: opt(
      // TV units first: `benk` alone read every TV-benk as seating, and the
      // TV-bord crumb as a table — they are storage furniture
      [/tv-?\s?benk|mediabenk|tv-?skap|mediamøb/, 'Storage'],
      [/sofabord|spisebord|skrivebord(?!s?stol)|sidebord|nattbord|salongbord|konsollbord|\bbord\b/, 'Tables'],
      [/sofa|hjørnesofa|sovesofa|sjeselong|\bdivan\b/, 'Sofas'],
      [/spisestol|lenestol|hvilestol|recliner|barstol|kontorstol|\bstol\b|\bstoler\b|\bkrakk\b|\bpuff\b|benk\b/, 'Chairs'],
      [/kontinentalseng|sengeramme|sengegavl|hodegavl|\bseng\b|køyeseng|sengepakke/, 'Beds'],
      [/madrass|overmadrass|toppmadrass|\btopper\b/, 'Mattresses'],
      [/bokhylle|\bhylle\b|\breol\b|vitrine/, 'Shelving'],
      [/garderobe|kommode|skjenk|highboard|\bskap\b|skotrekk|oppbevaring/, 'Storage'],
      [/\bspeil\b|\bmirror\b/, 'Mirrors'],
      [/romdeler|\bskjermvegg\b/, 'Room dividers'],
      [/putetrekk|\btrekk\b|\bpute\b/, 'Covers & cushions'],
    ),
    material: opt(
      [/\beik\b|\boak\b/, 'Oak'],
      [/\bfuru\b|heltre|valnøtt|\bbøk\b|\btre\b|\bwood\b|rotting|bambus/, 'Wood'],
      [/\bskinn\b|\blær\b|leather/, 'Leather'],
      [/\bstoff\b|tekstil|bouclé|fløyel|velour|\bchenille\b|\bcanvas\b/, 'Fabric'],
      [/\bstål|metall|aluminium|\bjern\b/, 'Metal'],
      [/\bglass\b|marmor/, 'Glass & stone'],
    ),
    dim: (s) => /\b(\d{2,3})\s?x\s?(\d{2,3})\b/.exec(s)?.slice(1).join('x'),
    // (?<!\d[,.]): a "2,5-seter" must not read as 5 seats — the half-seat
    // sofas simply carry no seat count rather than a wrong one
    seats: num(/(?<!\d[,.])(\d)[\s-]?(?:seter|seters|sits)\b/),
    color: COLOR,
  },
  Lighting: {
    type: opt(
      [/taklampe|takpendel|\bpendel\b|lysekrone|plafond|takarmatur/, 'Ceiling lights'],
      [/bordlampe|table lamp/, 'Table lamps'],
      [/gulvlampe|floor lamp/, 'Floor lamps'],
      [/vegglampe|vegg-|wall light|\bapplikk\b/, 'Wall lights'],
      [/lyspære|led-?pære|\bpære\b|lyskilde|\bbulb\b|lysrør/, 'Bulbs'],
      [/lyslenke|lysslynge|\bstring\b|julelys|lysnett/, 'String lights'],
      [/telysholder|lysestake|kubbelys|kronelys|\btelys\b|stearinlys|duftlys|lyslykt|\blykt\b|lanterne/, 'Candles & holders'],
      [/utelampe|utendørs|solcellelampe|hagelys|\bip44\b|\bip65\b/, 'Outdoor lighting'],
      [/skinne|spotlight|\bspot\b|downlight/, 'Spots & tracks'],
    ),
    socket: opt([/\be27\b/, 'E27'], [/\be14\b/, 'E14'], [/\bgu10\b/, 'GU10'], [/\bg9\b/, 'G9'], [/\bgx53\b/, 'GX53']),
    led: flag(/\bled\b|led-/),
    smart: flag(/\bsmart\b|\bhue\b|zigbee|\bwifi\b|\bwiz\b/),
    dimmable: flag(/dimbar|dimmer|dimmable/),
    color: COLOR,
  },
  Garden: {
    type: opt(
      [/gressklipper|robotgressklipper|\btrimmer\b|kantklipper|løvblåser/, 'Lawn care'],
      [/hagestol|hagebord|hagemøbel|hagepute|setepute|solseng|\bparasoll\b|hagegruppe|spisegruppe|\bpergola\b|hagestue|drivhus/, 'Garden furniture'],
      [/\bplante\b|blomst|\bkrukke\b|\bpotte\b|\bjord\b|\bfrø\b|gjødsel|plantekasse/, 'Plants & pots'],
      [/\bgrill\b|gassgrill|kullgrill|briketter/, 'Grills'],
      [/\bslange\b|vanning|vannkanne|spreder/, 'Watering'],
      [/\bspade\b|\brake\b|hagesaks|\bøks\b|\bsag\b|hageredskap|\bfiskars\b/, 'Garden tools'],
      [/solcellelampe|utelys|hagelys|\bfakkel\b/, 'Outdoor lighting'],
      [/basseng|boblebad|\bpool\b/, 'Pools'],
    ),
    power: opt([/batteri|\bakku\b|cordless|\bbattery\b/, 'Battery'], [/bensin|\bpetrol\b/, 'Petrol'], [/elektrisk|\b230v\b|\bstrøm\b/, 'Electric'], [/solcelle|\bsolar\b/, 'Solar']),
    color: COLOR,
  },
  Tools: {
    type: opt(
      [/\bdrill\b|bormaskin|skrutrekker|skrujern|multiverktøy|vinkelsliper|\bsag\b|\bhammer\b|\btang\b|skiftenøkkel|pusse/, 'Hand & power tools'],
      [/\bskrue|treskrue|\bbolt\b|\bmutter\b|\bspiker\b|\bplugg\b|\bstrips\b|\bkrok\b|beslag/, 'Fasteners'],
      [/maling|\bbeis\b|\blakk\b|\bgrunning\b|\bpensel\b|malerull|sparkel/, 'Paint & decorating'],
      [/\bbatteri\b|\blader\b|\bcelle\b/, 'Batteries'],
      [/\bbor\b|betongbor|\bbits\b|sagblad|slipepapir|\bblad\b|\bfres\b/, 'Bits & blades'],
      [/målebånd|\bvater\b|\blaser\b|\btommestokk\b|\bmåle/, 'Measuring'],
      [/verneutstyr|vernebriller|hjelm|hørselvern|arbeidshansker|støvmaske/, 'Safety'],
      [/\blim\b|\btape\b|silikon|fugemasse|\bsparkel\b/, 'Adhesives & sealants'],
      [/koblingsboks|\bkabel\b|stikkontakt|\bbryter\b|\bsikring\b|skjøteledning|\blyskilde\b/, 'Electrical'],
      [/dusjslange|\bkran\b|\bpakning\b|\brør\b|\bsluk\b|vannlås/, 'Plumbing'],
    ),
    power: opt([/batteri|\bakku\b|cordless/, 'Cordless'], [/elektrisk|\b230v\b/, 'Corded'], [/manuell|\bhånd/, 'Manual']),
    volt: num(/\b(\d{1,2})\s?v\b/),
    pack: PACK,
  },
  Auto: {
    type: opt(
      [/\bdekk\b|\btyre\b|\btire\b/, 'Tyres'],
      [/\bslange\b|\btube\b|ventil/, 'Tubes & valves'],
      [/\bfelg\b|\bhjul\b|\bwheel\b/, 'Wheels'],
      [/bilpleie|\bvoks\b|mikrofiber|\bshampoo\b|rens/, 'Car care'],
      [/\btakstativ\b|\bfeste\b|holder|futteral/, 'Racks & mounts'],
    ),
    size: INCH,
    season: opt([/vinter|winter|pigg/, 'Winter'], [/sommer|summer/, 'Summer'], [/helår|all[\s-]?season/, 'All season']),
  },
  Bikes: {
    type: opt(
      [/sykkelhjelm|\bhjelm\b|helmet/, 'Helmets'],
      [/\bdekk\b|\bslange\b|tubeless|ventilkjerne|\btyre\b/, 'Tyres & tubes'],
      [/\bbrems|bremseskive|bremsehåndtak|kaliper|bremsekloss/, 'Brakes'],
      [/\bgir\b|bakgir|girspak|girøre|kassett|\bkjede\b|krank|\bdrev\b|\bpedal|\bfordeler\b|\bsram\b|shimano|\bxtr\b/, 'Drivetrain'],
      [/framhjul|bakhjul|\bhjul\b|\bfelg\b|\beiker\b|\bnav\b|framnav|baknav/, 'Wheels'],
      [/\bsete\b|setepinne|\bstyre\b|\bstem\b|spacer|frempinne|\bgrep\b|\bsadel\b/, 'Cockpit & saddle'],
      [/sykkeltrøye|sykkelshorts|sykkeljakke|benvarmere|sykkelsko|\bbriller\b|hansker|\bbib\b/, 'Apparel'],
      [/barnesykkel|elsykkel|\bmtb\b|landevei|gravel|treningssykkel|airbike|komplett sykkel/, 'Bikes'],
      [/sykkellås|\blås\b|\bpumpe\b|\blykt\b|\blys\b|bagasjebrett|skjerm|sykkelveske|barnesete|computer|\bverktøy\b/, 'Accessories'],
    ),
    wheel: INCH,
    discipline: opt([/\bmtb\b|terreng|trail|\bdh\b|enduro/, 'MTB'], [/landevei|\broad\b|\baero\b/, 'Road'], [/gravel|\bcx\b|cyclocross/, 'Gravel'], [/\bbarn\b|\bkids\b|junior/, 'Kids']),
  },
  Sport: {
    type: opt(
      [/\bski\b|langrenn|\balpin\b|skisko|skifeste|skistav|smøring|\bglider\b|\bklister\b|\bvoks\b|rulleski|snowboard/, 'Ski & snow'],
      [/tredemølle|treningssykkel|romaskin|crosstrainer|ellipse/, 'Cardio machines'],
      [/\bvekt\b|manual|kettlebell|vektstang|weightvest|styrke|\bstang\b|\bbenk\b/, 'Strength'],
      [/boksesekk|boksehansk|\bboxing\b|kampsport/, 'Boxing'],
      [/\byoga\b|pilates|\bmatte\b|balanse|foam roll/, 'Yoga & recovery'],
      [/fotball|håndball|basketball|volleyball|\bball\b|\bmål\b/, 'Ball sports'],
      [/løpesko|\bløping\b|running|joggesko/, 'Running'],
      [/\bgolf\b|\btennis\b|\bpadel\b|badminton|squash/, 'Racket & golf'],
      [/svøm|badedrakt|\bdykke|snorkel/, 'Swimming'],
      [/hockey|skøyter|\bkølle\b/, 'Hockey & skating'],
      [/\bdisc\b|frisbee|innova/, 'Disc golf'],
      [/trøye|tights|shorts|jakke|sokker|beanie|\bcap\b|pannebånd|\bvotter\b/, 'Apparel'],
    ),
    audience: AUDIENCE,
    color: COLOR,
  },
  Outdoor: {
    type: opt(
      // trousers before jackets: "Shell Pants"/"Bib Pants" are trousers, the
      // `shell` fabric word only speaks when no pant/bukse noun does. pants?
      // (singular too): "Zip-Off Pant" derived nothing.
      [/\bbukse|\bpants?\b|\btights\b|shorts?\b(?![ -]?sleeve)|\bknicker/, 'Trousers'],
      [/jakker?\b|jacket|anorakk|windbreaker|\bshell\b|\bparkas\b/, 'Jackets'],
      // sleeping before bags: "Sleeping Bag" is not a bag. (?<!\d[- ])pack\b:
      // a "3-pack" of socks or carabiners is not a backpack either.
      [/sovepose|sleeping bag|liggeunderlag/, 'Sleeping'],
      [/ryggsekk|backpack(?!er)|\bsekk\b|\bbag\b|duffel|(?<!\d[- ])\bpack\b/, 'Backpacks & bags'],
      [/\btelt\b|\btent\b|tarp\b|\bpresenning\b/, 'Tents'],
      [/sko\b|\bboots\b|støvl|\bshoe\b|sandal/, 'Footwear'],
      // headwear before the material words: a wool beanie is Accessories, not
      // a baselayer
      [/lue(r)?\b|beanie|balaclava|\bcap\b|\bhat\b|headband|pannebånd|\bgaiter\b|hansker|gloves|\bvotter\b|\bbelte\b|sokker|socks|skjerf|\bbuff\b/, 'Accessories'],
      [/genser|fleece|midlayer|hoodie|\btee\b|\bshirt\b|singlet|\bull|\bwool\b|baselayer|undertøy/, 'Tops & baselayers'],
      [/fiskestang|\bsluk\b|\bagn\b|\bfluer?\b|rapala|\bsnelle\b|\bfiske/, 'Fishing'],
      [/\bkniv\b|\bøks\b|\bhodelykt\b|kokeapparat|\btermos\b|\bstormkjøkken\b|\bkompass\b|\blighter\b/, 'Camping gear'],
      [/\bstaver\b|\bstav\b|\btrekking\b|\bmeis\b/, 'Hiking gear'],
    ),
    audience: AUDIENCE,
    material: opt(
      [/merino|\bwool\b|\bull\b/, 'Wool'],
      [/\bdown\b|\bdun\b/, 'Down'],
      [/fleece/, 'Fleece'],
      [/softshell/, 'Softshell'],
      [/gore-?tex|\bgtx\b/, 'Gore-Tex'],
    ),
    waterproof: WATERPROOF,
    color: COLOR,
  },
  Fashion: {
    type: opt(
      // garment nouns before fabric words: "Joggebukse Lou Sweat" is trousers,
      // "Shorts … Loose Sweat" is shorts — `sweat`/`strikk` only speak when no
      // garment noun does. jakker?\b (suffix): dunjakke/skalljakke/fleecejakke.
      [/t-skjorte|t-shirt|\btee\b|\btopp\b|singlet/, 'T-shirts & tops'],
      [/\bshorts\b/, 'Shorts'],
      [/jakker?\b|jacket|anorakk|\bkåpe\b|\bfrakk\b|\bvest\b|\bparkas\b/, 'Jackets'],
      [/\bbukse|\bpants\b|\bjeans\b|joggebukse|\btights\b|leggings|\bchinos\b/, 'Trousers'],
      [/\bskjorte\b|\bshirt\b|\bbluse\b/, 'Shirts & blouses'],
      [/\bkjole\b|\bdress\b|\bskjørt\b|festdrakt|\bbunad\b|\bjumpsuit\b/, 'Dresses & skirts'],
      [/lue(r)?\b|beanie|balaclava|\bcaps\b|\bhatt\b|skjerf|hansker|\bvotter\b|\bbelte\b|\bveske\b|lommebok|solbriller|pannebånd|headband/, 'Accessories'],
      [/genser|sweater|hoodie|\bsweat\b|collegegenser|\btrøye\b|cardigan|\bstrikk/, 'Knitwear & hoodies'],
      [/sokker|\bsock\b|strømpe|strømpebukse|\bleggings\b/, 'Socks & hosiery'],
      [/undertøy|\bbody\b|\btruse\b|\bbh\b|\bboxer\b|\bpysjamas\b|nattøy/, 'Underwear & nightwear'],
      [/badetøy|badedrakt|bikini|badeshorts/, 'Swimwear'],
      [/\bdress\b|\bblazer\b|\bslips\b/, 'Suits'],
    ),
    audience: AUDIENCE,
    size: SIZE,
    material: opt(
      // \bull (prefix): ullsokker/ullgenser/ulldress carry no \b after "ull" —
      // but NOT ull\b, which would read the "ull" inside bomull as wool
      [/merino|\bull|\bwool\b|\balpakka\b/, 'Wool'],
      [/bomull|\bcotton\b|\bbambus\b|\blin\b/, 'Cotton & linen'],
      [/\bdun\b|\bdown\b/, 'Down'],
      [/fleece/, 'Fleece'],
      [/\bskinn\b|\blær\b|leather/, 'Leather'],
      [/softshell|\bgore-?tex\b|\bgtx\b|\btex\b/, 'Shell'],
    ),
    color: COLOR,
  },
  Shoes: {
    type: opt(
      [/sneaker|joggesko|løpesko|\btrainer\b/, 'Sneakers'],
      [/støvel|\bboot\b|\bboots\b|støvlett|vintersko/, 'Boots'],
      [/sandal|\bslip-?ins?\b|\bslide\b|flip-?flop/, 'Sandals'],
      [/\btøfler\b|\btøffel\b|slippers|\bclogs\b|innesko/, 'Slippers & clogs'],
      [/ballerina|\bpumps\b|høyhælt|\bhæl\b/, 'Heels & flats'],
      [/skotrekk|\bsåle\b|innleggssåle|skopleie|\bpolish\b|skolisser|\bimpregnering\b/, 'Shoe care'],
      [/\bsko\b|\bshoe\b/, 'Shoes'],
    ),
    audience: AUDIENCE,
    waterproof: WATERPROOF,
    color: COLOR,
  },
  Watches: {
    type: opt(
      [/smartklokke|smartwatch|\bgarmin\b|galaxy watch|apple watch|pixel watch|\bfenix\b|vivoactive|forerunner|\bgps\b/, 'Smartwatches'],
      [/herreklokke|dameklokke|barneklokke|armbåndsur|\bklokke\b|\bwatch\b|\bur\b/, 'Wristwatches'],
      [/vekkerklokke|\balarm\b/, 'Alarm clocks'],
      [/veggur|wall clock|bordur/, 'Clocks'],
      [/\brem\b|klokkerem|\bstrap\b|\blenke\b|spenne/, 'Straps'],
      [/lommeur|pocket watch/, 'Pocket watches'],
      [/klokkeboks|\beske\b|\bvinder\b|verktøy/, 'Cases & tools'],
    ),
    audience: AUDIENCE,
    material: opt(
      [/\btitan\b|titanium/, 'Titanium'],
      [/\bstål\b|\bsteel\b|rustfritt/, 'Steel'],
      [/\bgull\b|\bgold\b|forgylt|gullfarget/, 'Gold'],
      [/\bsølv\b|\bsilver\b/, 'Silver'],
      [/\bskinn\b|\blær\b|leather/, 'Leather'],
      [/silikon|\brubber\b|\bgummi\b/, 'Silicone'],
      [/keramikk|ceramic/, 'Ceramic'],
    ),
    movement: opt([/automatic|automatisk|mekanisk/, 'Automatic'], [/eco-?drive|\bsolar\b|solcelle/, 'Solar'], [/kvarts|quartz/, 'Quartz'], [/\bdigital\b/, 'Digital']),
    case: num(/\b(\d{2})\s?mm\b/),
    color: COLOR,
  },
  Jewelry: {
    type: opt(
      [/øredobb|ørepynt|øreringer?|earring|\børeringe\b|\børedobb\b/, 'Earrings'],
      [/armbånd|armring|bracelet|bangle/, 'Bracelets'],
      [/halssmykke|halskjede|\bkjede\b|necklace|\bcollier\b/, 'Necklaces'],
      [/\banheng\b|vedheng|\bcharm\b|pendant/, 'Pendants & charms'],
      [/\bring\b|\bringer\b/, 'Rings'],
      [/\bbrosje\b|\bsølje\b|\bnål\b|mansjettknapp|slipsnål/, 'Brooches & pins'],
      [/smykkeskrin|smykkeeske|\beske\b|\bpuss\b|\brens\b/, 'Boxes & care'],
    ),
    material: opt(
      [/forgylt|gullforgylt|gullfarget|\bvermeil\b/, 'Gold plated'],
      [/\bgull\b|\bgold\b|\bgult\b|\bhvitt\b/, 'Gold'],
      [/\b925\b|\bsølv\b|sterling|\bsilver\b/, 'Silver'],
      [/\bstål\b|\bsteel\b/, 'Steel'],
      [/\btitan\b|titanium/, 'Titanium'],
      [/\bskinn\b|\blær\b|\bperlemor\b/, 'Other'],
    ),
    stone: opt(
      [/diamant|diamond|\bpavé?\b/, 'Diamond'],
      [/\bperle\b|\bperler\b|\bpearl\b|ferskvannsperle/, 'Pearl'],
      [/topas|safir|rubin|smaragd|ametyst|månesten|turmalin|\bopal\b|\bonyx\b|aventurine|labradorit|\bkvarts\b|gemstone|\bstein\b/, 'Gemstone'],
      [/zirkonia|krystall|\bcrystal\b|\bcubic\b/, 'Crystal'],
    ),
  },
  Beauty: {
    type: opt(
      [/eau de parfum|eau de toilette|\bparfyme\b|\bparfum\b|fragrance|\bedt\b|\bedp\b|body mist/, 'Fragrance'],
      [/shampoo|sjampo|conditioner|balsam|\bhair\b|\bhår|hårspray|\bmousse\b|hårkur|\bstyling\b/, 'Hair care'],
      [/foundation|concealer|\bpowder\b|\bpudder\b|\bblush\b|bronzer|highlighter|\bprimer\b/, 'Face makeup'],
      [/lipstick|\blip\b|leppestift|\bgloss\b|leppe/, 'Lips'],
      [/mascara|eyeliner|eyeshadow|\bbrow\b|\beye\b|øyenskygge|øyebryn/, 'Eyes'],
      [/\bnail\b|neglelakk|\bpolish\b|\bnegle/, 'Nails'],
      [/cleanser|\bwash\b|\brens\b|\btoner\b|micellar|makeup remover|\bpeeling\b|\bscrub\b/, 'Cleansing'],
      [/\bmask\b|\bmaske\b|\bsheet\b/, 'Masks'],
      [/\bserum\b|\bessence\b|\boil\b|\bolje\b|\bampoule\b/, 'Serums & oils'],
      [/\bcream\b|\bkrem\b|moisturis|moisturiz|\blotion\b|\bbutter\b|\bbalm\b|fuktighet/, 'Moisturisers'],
      [/\bspf\b|solkrem|sunscreen|\bsun\b|after sun/, 'Sun care'],
      [/deodorant|antiperspirant|\bdusjsåpe\b|shower gel|\bsåpe\b|body wash/, 'Body & bath'],
      [/\bbrush\b|\bpensel\b|\bsponge\b|\bbørste\b|\bpinsett\b|tweezer|\bsaks\b|\bføner\b|krølltang|rettetang/, 'Tools'],
    ),
    volume: VOLUME,
    spf: num(/\bspf\s?(\d{1,2})/),
  },
  Health: {
    type: opt(
      [/tannkrem|tannbørste|tanntråd|munnskyll|oral-?b|\btann/, 'Dental'],
      [/vitamin|kosttilskudd|\btilskudd\b|omega|magnesium|protein|\bcasein\b|mineral|\bpulver\b/, 'Supplements'],
      [/plaster|bandasje|kompress|\btape\b|knestøtte|støtte|\bskinne\b|actimove|\bbind\b/, 'First aid & supports'],
      [/desinfeksjon|antibac|håndsprit|\bhanske\b|munnbind|\bsprit\b/, 'Hygiene'],
      [/nesespray|hostesaft|nicorette|nikotin|smertestillende|\btabletter\b|\bsalve\b/, 'Medicine'],
      [/termometer|blodtrykk|\bmåler\b|\bvekt\b|pulsoksy/, 'Devices'],
      [/lesebrille|\bbriller\b|kontaktlinse/, 'Eyewear'],
      [/bleier|inkontinens|attends|\btruser\b/, 'Incontinence'],
      [/\bkondom\b|glidemiddel|intim/, 'Intimate'],
    ),
    pack: PACK,
    volume: VOLUME,
  },
  Pets: {
    animal: opt(
      [/\bhund|\bdog\b|\bvalp\b|\bpuppy\b|canin\b|\bhunder\b/, 'Dog'],
      [/\bkatt|\bcat\b|kitten|feline/, 'Cat'],
      [/akvarium|\bfisk|aquarium|\btetra\b|\beheim\b|\bjuwel\b|\bfluval\b|\bciklide\b/, 'Fish'],
      [/kanin|gnager|marsvin|hamster|\brabbit\b|\bhøy\b|\bmus\b/, 'Small pets'],
      [/\bfugl\b|\bbird\b|papegøye|\bundulat\b/, 'Bird'],
      [/\bhest\b|\bhorse\b|equine|\bponni\b/, 'Horse'],
      [/reptil|terrarium|exo terra|\bslange\b|\bskilpadde\b/, 'Reptile'],
    ),
    type: opt(
      [/tørrfôr|våtfôr|\bfôr\b|\bfoder\b|\bfood\b|\bdry\b|\bwet\b|\bmousse\b|\bpaté\b/, 'Food'],
      [/godbit|\bsnack\b|\btreat\b|tyggeben|\bbein\b|\btygge/, 'Treats'],
      [/\bleke\b|\bleker\b|\btoy\b|hundeleke|katteleke|\bball\b|\bkong\b/, 'Toys'],
      [/hundeseng|\bseng\b|\bkurv\b|\bpute\b|\bteppe\b|\bmadrass\b/, 'Beds'],
      [/halsbånd|\bbånd\b|\bsele\b|\bkobbel\b|\bleash\b|\bharness\b/, 'Leads & harnesses'],
      [/\bbur\b|\bhus\b|transport|\bcarrier\b|\bgrind\b|kattehus/, 'Housing & transport'],
      [/shampoo|\bbørste\b|klosaks|grooming|pelspleie|\bkam\b/, 'Grooming'],
      [/kattesand|\bstrø\b|bleier|kattedo|avfallspose/, 'Litter & hygiene'],
      [/veterinary|prescription|\bdiet\b|\bmedisin\b|\bormekur\b|flåttmiddel/, 'Veterinary'],
      [/\bfilter\b|\bpumpe\b|\bvarmer\b|\blampe\b|dekorasjon|\bslange\b/, 'Tank & habitat'],
    ),
    weight: WEIGHT,
  },
  Baby: {
    type: opt(
      [/bleier|engangsbleier|\bbleie\b|\bstoffbleie\b/, 'Diapers'],
      [/\bsmokk|tåteflaske|\bflaske\b|\bsugerør\b|\btutt\b|\bamming\b|brystpumpe/, 'Feeding'],
      [/babysko|babystøvler|\bsko\b|\bsokker\b/, 'Shoes & socks'],
      [/\bbody\b|\bdress\b|jumpsuit|\bklær\b|\bgenser\b|\bbukse\b|\blue\b/, 'Clothing'],
      [/sengesett|hettehåndkle|fleecepledd|\bpledd\b|\bhåndkle\b|\bsoveposer?\b/, 'Textiles'],
      [/\bleke\b|\brangle\b|aktivitet|\bbitering\b|\bmobil\b/, 'Toys'],
      [/\bkrem\b|\bolje\b|shampoo|\bbalsam\b|\bpleie\b|\bvåtserviett/, 'Care'],
      [/barnevogn|\bvogn\b|bilstol|bæresele|\bbæremeis\b|\bstol\b|\bseng\b/, 'Gear'],
    ),
    age: num(/\b(\d{1,2})\s?mnd\b/),
    size: SIZE,
    color: COLOR,
  },
  Toys: {
    type: opt(
      [/\blego\b|byggesett|building|technic|\bduplo\b|creator|ninjago|\bcity\b|\bbricks?\b/, 'Building sets'],
      [/brettspill|board game|kortspill|puslespill|\bpuzzle\b|\bjigsaw\b|\bspill\b/, 'Games & puzzles'],
      [/squishmallows|kosedyr|\bplush\b|\bbamse\b|\bmyke\b|\btøydyr\b/, 'Soft toys'],
      // figures BEFORE cards: `pokemon` alone does not mean trading cards, and a
      // "Pokemon Battle Feature Figure" typed as Trading cards was half of the
      // reported bug (plans/category-misclassification.md). A booster pack has
      // no figure word, so it still falls through to the card rule below.
      [/\bfigur|\bfigure\b|karakter|\bdukke\b|\bdoll\b|barbie|action figure|\bsamlefigur\b/, 'Figures & dolls'],
      [/enkeltkort|samlekort|booster|\bpokemon\b|trading card|\btcg\b/, 'Trading cards'],
      [/\bbil\b|racerbane|\brc\b|fjernstyrt|\bdrone\b|\btog\b|\btraktor\b/, 'Vehicles'],
      [/\bperler\b|\bslim\b|kreativ|\btegne|\bmale\b|\bpysselarbeid\b|\bhobby\b/, 'Creative'],
      [/utendørs|\bhusker?\b|sandkasse|\bbasseng\b|trampoline|\bvannpistol\b|\bsparkesykkel\b/, 'Outdoor toys'],
      [/\bbaby\b|\brangle\b|aktivitetsleke|\bbitering\b/, 'Baby toys'],
    ),
    // biter/brikkene/stk/pcs: the eval measured 0 of 300 puzzle rows carrying a
    // count because the commonest Norwegian words weren't here
    pieces: num(/\b(\d{2,5})\s?(?:deler|brikker|brikkene|biter|pieces|klosser|stk|pcs)\b/),
    age: num(/\b(\d{1,2})\s?(?:år|\+)\b/),
    color: COLOR,
  },
  Books: {
    format: opt(
      [/\bpocket\b|paperback|\bheftet\b/, 'Paperback'],
      [/innbundet|hardcover|hardback|\bcollectors?\b/, 'Hardcover'],
      [/graphic novel|tegneserie|\bmanga\b|\bcomic\b|\bvol\.?\b|\bvolume\b/, 'Comics & graphic novels'],
      [/lydbok|audiobook/, 'Audiobook'],
      [/\bebok\b|\bebook\b|\bkindle\b/, 'E-book'],
      [/\bkalender\b|\bkort\b|\bdeck\b|\bpuzzle\b/, 'Non-book'],
    ),
    genre: opt(
      [/fantasy|\bdragon\b|\bmagic\b/, 'Fantasy'],
      [/sci-?fi|science fiction|\bstar wars\b|\bspace\b/, 'Sci-fi'],
      [/\bkrim\b|\bthriller\b|\bmystery\b|\bmurder\b/, 'Crime & thriller'],
      [/\bromance\b|romantic|\bkjærlighet\b/, 'Romance'],
      [/\bhorror\b|\bhell\b|\bdeath\b|\bvampire\b/, 'Horror'],
      [/\bbarnebok\b|\bchildren\b|\bkids\b|\bpicture book\b/, "Children's"],
      [/\bcookbook\b|\bkokebok\b|\bguide\b|\bhistory\b|\bart of\b|\bhandbook\b/, 'Non-fiction'],
    ),
  },
  Office: {
    type: opt(
      [/blekkpatron|\btoner\b|\bblekk\b|\bpatron\b|\bcartridge\b/, 'Ink & toner'],
      [/\bpapir\b|servietter|konvolutt|notatbok|\bdagbok\b|\bblokk\b|\bark\b/, 'Paper'],
      [/\bpenn\b|\bblyant\b|\btusj\b|\bmarker\b|fountain pen|blekkpenn|\bkulepenn\b/, 'Pens & pencils'],
      [/\bperm\b|\bmappe\b|\barkiv|dokumentboks|\bregister\b/, 'Filing'],
      [/kontorstol|skrivebord|\bpult\b|laptopstøtte|ståmatte|sitteball|skjermbord|\bhev\b/, 'Desks & chairs'],
      [/kalkulator|makulator|laminering|stiftemaskin|hullemaskin|\bskriver\b|\bprinter\b/, 'Machines'],
      [/\btape\b|\bsaks\b|\blim\b|\bstifter\b|\bbinders\b|\bteip\b/, 'Desk supplies'],
    ),
    color: COLOR,
    pack: PACK,
  },
  Hobby: {
    type: opt(
      [/\bgarn\b|\byarn\b|strikkepinne|heklenål|\bull\b|\bcotton\b|\bmerino\b/, 'Yarn & knitting'],
      [/akvarell|\bakryl\b|\bolje\b|\bgouache\b|\bpigment\b|\bmaling\b|\bpaint\b|\bfarge\b|\bcolors?\b/, 'Paint'],
      [/\bpensel\b|\bbrush\b|\bpalett\b|staffeli|\blerret\b|blindramme|\bmalerkasse\b/, 'Painting supplies'],
      [/\btusj\b|\bmarker\b|\bcopic\b|multiliner|\bpastell\b|\bblyant\b|\bfineliner\b/, 'Markers & pens'],
      [/klistremerker|\bsticker\b|scrapbooking|\bstempel\b|\bkartong\b|\bpapir\b|\bblokk\b/, 'Paper craft'],
      [/\bperler\b|\bbeads\b|smykkeutstyr|\bnål\b|\btråd\b/, 'Beads & jewellery making'],
      [/\bknapp\b|glidelås|\bstoff\b|symaskin|\bsytilbehør\b|\bsew\b|\bsaks\b/, 'Sewing'],
      [/\blim\b|dekorvoks|diamond dotz|støpeform|\bresin\b|\bmodell\b|\bhobby/, 'Craft supplies'],
    ),
    color: COLOR,
  },
  Photo: {
    type: opt(
      [/objektiv|\blens\b|nikkor|fujinon|\bmm f\/|zoomobjektiv/, 'Lenses'],
      [/\bkamera\b|\bcamera\b|\beos\b|\bdslr\b|systemkamera|\bpolaroid\b|\bgopro\b/, 'Cameras'],
      [/stativ|tripod|monopod|\bgimbal\b/, 'Tripods'],
      [/\bfilter\b|\bcpl\b|\bnd\b|step-?up|adapterring|filterholder/, 'Filters'],
      [/\bblits\b|\bflash\b|softbox|\bled\b|belysning|\bstudio\b|\bparaply\b|\bgodox\b/, 'Lighting'],
      [/\bbatteri\b|\blader\b|\bbattery\b|charger|powerbank/, 'Power'],
      [/minnekort|\bmemory\b|sandisk|\bsd\b|\bcfexpress\b/, 'Memory cards'],
      [/bilderamme|\balbum\b|fototapet|\blerret\b|\bramme\b|\bprint\b/, 'Frames & prints'],
      [/\bfilm\b|\bilford\b|\bkodak\b|fremkalling/, 'Film'],
      [/\bveske\b|\bbag\b|\brem\b|\bstrap\b|\bcage\b|\brig\b|\bgrip\b|\bclip\b|\bholder\b|\bdeksel\b|\bhus\b/, 'Bags & rigs'],
    ),
    color: COLOR,
  },
};

// Accessories outrank the host product's own words in EVERY category (the
// Audio lesson generalized): a row the shop itself files under tilbehør /
// reservedeler / spare parts must not type as the thing it attaches to.
// Word-START anchors only — "sytilbehør" is Hobby's own Sewing vocabulary,
// and \b never anchors before ø/å (ASCII), so no trailing anchor either.
// The lookbehind drops the INCLUSION sense: "Romskip med tilbehør og lyd",
// "Sparkesykler og tilbehør", "startsett m/lader" hold the real deal;
// "Sonos tilbehør" and "Tilbehør til dør" hold accessories. ponytail:
// conjunction ≈ mixed menu — misreads accessory-only "X & tilbehør" leaves,
// whose rows just fall through to the per-cat rules instead.
const NOT_INCL = /(?<!(?:\bmed|\bog|\bm|\bu|\binkl[\w.]*|\bincl[\w.]*|&|\+|\band|\bwith|\bw)[\s/])/.source;
// Strong tier: words that MEAN accessory (the shop's own filing) plus nouns
// that are accessories in every category (a deksel is never the product).
const ACC_RE = new RegExp(NOT_INCL + String.raw`(?:\btilbehør|\baccessor|\bdeksel|skjermbeskytt|screen ?protector|panzerglass|\bhylster)|\breservedel|\bspare ?parts?\b|\breplacement\b`, 'i');
// Fallback tier, consulted only when the category's own rules stay silent:
// nouns that are usually an accessory but sometimes the product itself —
// "Case of the Trampled Garden" is a Magic card (typed Trading cards by
// Gaming's rules first), "Cable" is an X-Men comic (Books has no type
// rules, so no ACC pass at all), a camera veske is Photo's own Bags & rigs.
// ponytail: \bveske misses Norwegian compounds (reiseveske) — most such
// rows carry another noun or a typed leaf; widen only against a measured miss.
const ACC_NOUN_RE = new RegExp(NOT_INCL + String.raw`(?:\blader\b|\bcharger|kabel|\bcable\b|\badapter|\bcase\b|\bcover\b|\betui\b|\bveske\b|(?<!\blong\s|\bshort\s)\bsleeve\b|\bstrap\b|\breim\b|\barmbånd)`, 'i');

// Facets a category's rules can produce, for build.js's registry check.
export const RULE_KEYS = Object.fromEntries(Object.entries(RULES).map(([cat, r]) => [cat, Object.keys(r)]));

// Facet values readable off `name` — plus `srcCat`, the shop's own category path
// for the product. Both, not either: the ablation in "Don't Classify, Translate"
// (arXiv 1812.05774, 94M items) found name unigrams COMBINED with navigational
// breadcrumbs the best feature set, and measured here srcCat lifts rows with a
// derived `type` from 7,099 to 8,319 (+17%) — Sport 169 → 386 — for no new data.
// Values stay undefined when the category has no rules or nothing matched.
export function deriveFacets({ name, cat, srcCat, brand }) {
  const rules = RULES[cat];
  if (!rules || !name) return undefined;
  // Segments in priority order: name, then the srcCat LEAF, then its parents —
  // the same leaf-first walk classify() does. One concatenated blob let a
  // parent crumb ("Bukser, shorts og skjørt > Shorts") answer Trousers before
  // the leaf, and having srcCat after the name broke every $-anchored rule
  // (SIZE derived on ~1% of rows that had a srcCat).
  const b = brand ? String(brand).toLowerCase() : '';
  const nm = String(name).toLowerCase();
  const crumbs = srcCat
    ? String(srcCat).toLowerCase().split(/\s*(?:>|›|»|\||::|\/)\s*/).map(c => c.trim()).filter(Boolean).reverse()
    : [];
  const texts = [nm, ...crumbs].map(t => ` ${t} `);
  // COLOUR only reads brand-free text: "Black Diamond" is a brand on a parka,
  // not the parka's colour (18 wrong values in one eval shard). Every other
  // facet keeps the brand — LEGO → Building sets is the brand ON PURPOSE.
  const colorTexts = b ? [nm.split(b).join(' '), ...crumbs.filter(c => c !== b)].map(t => ` ${t} `) : texts;
  const out = {};
  for (const [k, f] of Object.entries(rules)) {
    let v;
    const ts = k === 'color' ? colorTexts : texts;
    // ACC only reads the name and the LEAF (i < 2): a parent crumb like
    // "Skrivere og tilbehør > Laserskrivere" is a menu that holds the
    // printers too — only the shop's own leaf filing proves accessory.
    for (let i = 0; i < ts.length; i++) {
      v = k === 'type' && i < 2 && ACC_RE.test(ts[i]) ? 'Accessories' : f(ts[i]);
      if (v !== undefined) break;
    }
    // Noun fallback LAST: only a row the category's own vocabulary can't
    // place gets typed by its accessory noun — so the per-cat rules shield
    // every "the noun IS the product" case for free.
    if (v === undefined && k === 'type' && ts.slice(0, 2).some(t => ACC_NOUN_RE.test(t))) v = 'Accessories';
    if (v !== undefined && v === v) out[k] = v; // NaN guard: a bad number is no value
  }
  return Object.keys(out).length ? out : undefined;
}
