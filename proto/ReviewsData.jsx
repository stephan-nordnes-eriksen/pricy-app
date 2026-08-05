// ===========================================================
// Pricy.no — Folkedommen (07C): tre faste påstander + valgfrie
// pluss/minus-punkter + kjøpsinfo. Ingen tallkarakterer noe sted.
// SHOP_META = kundenes dom per butikk (utsagn, ikke snitt).
// reviewStats(p) aggregerer ekte omtaler, eller syntetiserer
// deterministisk fra p.rating (kun internt frø — vises aldri).
// ===========================================================

const CLAIMS = [
  { key: 'worth', label: 'Verdt prisen', low: 'verdt prisen' },
  { key: 'durable', label: 'Tåler bruk', low: 'tåler bruk' },
  { key: 'described', label: 'Som beskrevet', low: 'som beskrevet' },
];
const CLAIM_NEG = { worth: 'ikke verdt prisen', durable: 'tåler ikke bruk', described: 'ikke som beskrevet' };

// category-driven suggestions for step two ("sett farge på det")
const TRAIT_POOL = {
  Audio: { plus: ['God lyd', 'Lang batteritid', 'God komfort', 'Tett støydemping'], minus: ['Blir varm', 'Klemmer', 'Stor case'] },
  Gaming: { plus: ['Stillegående', 'Rask lasting', 'Enkelt oppsett'], minus: ['Viftestøy', 'Lite lagring', 'Tilbehør koster ekstra'] },
  Phones: { plus: ['Godt kamera', 'Batteri hele dagen', 'Nydelig skjerm'], minus: ['Blir varm', 'Treg lading', 'Glatt uten deksel'] },
  TV: { plus: ['Nydelig bilde', 'God til gaming', 'Enkelt oppsett'], minus: ['Spinkel lyd', 'Treg meny', 'Reflekser i dagslys'] },
  Home: { plus: ['Gjør jobben selv', 'God app', 'Lett å tømme'], minus: ['Bråker', 'Setter seg fast', 'Dyre filtre'] },
  Computers: { plus: ['Rask i bruk', 'Lang batteritid', 'God skjerm'], minus: ['Blir varm', 'Få porter', 'Viftestøy'] },
  Toys: { plus: ['Morsom å bygge', 'Solid kvalitet', 'God manual'], minus: ['Skjøre deler', 'Klistremerker krøller'] },
  'E-readers': { plus: ['Behagelig skjerm', 'Lett i hånda', 'Batteri i ukevis'], minus: ['Treg meny', 'Dyrt tilbehør'] },
  Kitchen: { plus: ['Enkel i bruk', 'Lett å rengjøre', 'God kapasitet'], minus: ['Bråker', 'Tar mye plass'] },
  _: { plus: ['Gjør jobben', 'Solid kvalitet', 'Som forventet'], minus: ['Skuffende kvalitet', 'Upresis beskrivelse'] },
};

// Per-shop kundedom. CDON deliberately weak so the signal matters.
const SHOP_WORD = { pos: 'trygg handel', mid: 'stort sett greit', neg: 'folk advarer' };
const _asp = (q, quote, v, tone) => ({ q, quote, v, tone });
const SHOP_META = {
  'Elkjøp': { count: 12840, since: '2013', physical: true, tone: 'pos', word: SHOP_WORD.pos, aspects: [_asp('Levering', 'Kommer når lovet', 'Bred enighet', 'pos'), _asp('Kundeservice', 'Lett å nå', 'Flertallet enig', 'pos'), _asp('Retur', 'Uproblematisk i butikk', 'Bred enighet', 'pos')] },
  'Power': { count: 9310, since: '2014', physical: true, tone: 'pos', word: SHOP_WORD.pos, aspects: [_asp('Levering', 'Rask og sporbar', 'Bred enighet', 'pos'), _asp('Kundeservice', 'Svarer raskt', 'Flertallet enig', 'pos'), _asp('Retur', 'Går greit', 'Flertallet enig', 'pos')] },
  'Komplett': { count: 15620, since: '2013', physical: false, tone: 'pos', word: SHOP_WORD.pos, aspects: [_asp('Levering', 'Ofte dagen etter', 'Bred enighet', 'pos'), _asp('Kundeservice', 'Ryddig på e-post', 'Flertallet enig', 'pos'), _asp('Retur', 'Enkel retur', 'Bred enighet', 'pos')] },
  'NetOnNet': { count: 5470, since: '2015', physical: true, tone: 'mid', word: SHOP_WORD.mid, aspects: [_asp('Levering', 'Stort sett i rute', 'Flertallet enig', 'pos'), _asp('Kundeservice', 'Varierer', 'Delte meninger', 'mix'), _asp('Retur', 'Litt friksjon', 'Delte meninger', 'mix')] },
  'Clas Ohlson': { count: 11080, since: '2014', physical: true, tone: 'pos', word: SHOP_WORD.pos, aspects: [_asp('Levering', 'Hent i butikk samme dag', 'Bred enighet', 'pos'), _asp('Kundeservice', 'Hyggelige i butikk', 'Bred enighet', 'pos'), _asp('Retur', 'Norges enkleste', 'Bred enighet', 'pos')] },
  'Proshop': { count: 4890, since: '2016', physical: false, tone: 'mid', word: SHOP_WORD.mid, aspects: [_asp('Levering', 'Tar noen dager', 'Delte meninger', 'mix'), _asp('Kundeservice', 'Ok på e-post', 'Flertallet enig', 'pos'), _asp('Retur', 'Går greit', 'Flertallet enig', 'pos')] },
  'CDON': { count: 7240, since: '2015', physical: false, tone: 'neg', word: SHOP_WORD.neg, aspects: [_asp('Levering', 'Kommer senere enn lovet', 'Flertallet uenig', 'neg'), _asp('Kundeservice', 'Vanskelig å nå', 'Flertallet uenig', 'neg'), _asp('Retur', 'Tungvint via markedsplass', 'Delte meninger', 'mix')] },
  'Dustin': { count: 3120, since: '2017', physical: false, tone: 'mid', word: SHOP_WORD.mid, aspects: [_asp('Levering', 'I rute', 'Flertallet enig', 'pos'), _asp('Kundeservice', 'Treg i perioder', 'Delte meninger', 'mix'), _asp('Retur', 'Standard', 'Flertallet enig', 'pos')] },
};

// Seeded reviews — claims: 'y'/'n'/'u' i rekkefølgen verdt prisen · tåler bruk · som beskrevet.
// author 'Du' = the signed-in user's own reviews (editable/deletable)
const R = (id, prodId, author, date, c, plus, minus, helpful, title, body, x) => ({ id, prodId, author, date, claims: { worth: c[0], durable: c[1], described: c[2] }, plus, minus, helpful, title, body, verified: true, ...x });
const PRODUCT_REVIEWS = [
  R('rm1', 'xm5', 'Du', '2 uker siden', 'yuy', ['Tett støydemping'], ['Blir varm'], 3, 'Imponerende ANC, litt varme puter', 'Kjøpt etter prisvarsel her på Pricy. Dempingen er rå på kontoret, men putene blir varme etter et par timer.', { shop: 'Komplett', paid: 2990, showPaid: true }),
  R('rm2', 'ps5', 'Du', '1 mnd siden', 'yyy', ['Stillegående'], [], 5, 'Kupp da prisen traff målet', 'Ventet til den falt under 6000 og slo til. Stille, rask og tar mindre plass enn ventet.', { shop: 'Power', paid: 5990, showPaid: false }),
  R('r1', 'xm5', 'Håkon L.', '3 dager siden', 'yyy', ['Tett støydemping', 'Lang batteritid'], [], 24, 'Beste ANC jeg har hatt', 'Byttet fra XM3. Støydempingen på trikken er natt og dag, og batteriet holder hele uka.'),
  R('r2', 'xm5', 'Ingrid S.', '1 uke siden', 'yyy', ['God komfort'], [], 18, 'Verdt hver krone på tilbud', 'Kjøpte da prisen falt under 3000. Komforten er suveren, klemmer ikke selv med briller.', { shop: 'Komplett', paid: 2790, showPaid: true }),
  R('r3', 'xm5', 'Jonas F.', '2 uker siden', 'yny', ['God lyd'], ['Plastisk bygg'], 11, 'God lyd, litt plastisk bygg', 'Lyden og appen er topp. Trekker for at de ikke kan foldes sammen som XM4.'),
  R('r4', 'xm5', 'Marte K.', '1 mnd siden', 'yuy', ['God mikrofon'], [], 9, 'Perfekt på hjemmekontor', 'Mikrofonen er den beste jeg har testet i Teams-møter. Kollegaene hører ikke barna i bakgrunnen.', { verified: false }),
  R('r5', 'xm5', 'Sindre A.', '2 mnd siden', 'uyy', [], ['Upresis berøringsflate'], 6, 'Bra, men berøringsflaten irriterer', 'Skrur opp volumet når jeg justerer dem på hodet. Ellers helt kurant lyd.'),
  R('r6', 'xm5', 'Eva T.', 'Mai 2026', 'yyy', ['Tett støydemping'], ['Stor case'], 4, 'Solid reisefølge', 'Brukt på fire flyturer nå. Casen er stor, men dempingen tar hele motorduren.'),
  R('r7', 'airpods', 'Amalie R.', '5 dager siden', 'yuy', ['Sømløs paring'], [], 15, 'Sømløst med iPhone', 'Parer på sekundet. Transparensmodus er magisk — hører kassadama uten å ta dem ut.'),
  R('r8', 'airpods', 'Petter H.', '2 uker siden', 'yyy', ['Sitter godt'], ['Kort batteritid'], 8, 'Små og lette', 'Sitter godt på løpetur. Skulle ønske batteriet var bedre enn 5–6 timer.'),
  R('r9', 'airpods', 'Live N.', '3 uker siden', 'yyy', ['God lyd'], [], 7, 'USB-C endelig', 'Én kabel til alt nå. Lyden er merkbart bedre enn forrige generasjon.'),
  R('r10', 'airpods', 'Espen D.', '1 mnd siden', 'uyy', [], ['Dyre til fullpris'], 12, 'Bra, men dyre uten tilbud', 'Vent på pristupp under 2500 — de dukker opp nesten hver måned.', { verified: false }),
  R('r11', 'airpods', 'Nora W.', 'April 2026', 'yyy', ['God komfort'], [], 5, 'Beste kjøp i år', 'Bruker dem hver dag på jobb og trening. Null problemer etter tre måneder.'),
  R('r12', 'bose-ultra', 'Kristoffer M.', '1 uke siden', 'yyy', ['Tett støydemping'], ['Immersive er gimmick'], 10, 'ANC-kongen', 'Marginalt bedre demping enn Sony etter test av begge. Immersive Audio er gimmick, resten er topp.'),
  R('r13', 'bose-ultra', 'Silje O.', '3 uker siden', 'yyy', ['God komfort'], ['Middels batteritid'], 6, 'Komfort i særklasse', 'Letteste over-ear jeg har eid. Batteriet på 24 timer er midt på treet.'),
  R('r14', 'bose-ultra', 'Anders B.', '1 mnd siden', 'yyy', [], ['Dyr til fullpris'], 9, 'Dyr men god', 'Prisen svinger mye — jeg slo til på tilbud og er fornøyd. Ikke kjøp til fullpris.', { shop: 'Elkjøp', paid: 3490, showPaid: true }),
  R('r15', 'bose-ultra', 'Tuva E.', 'Juni 2026', 'yuy', ['God komfort'], [], 3, 'Endelig riktig kjøp', 'Tredje hodetelefonen på to år. Denne blir værende.', { verified: false }),
  R('r16', 'senn-m4', 'Ole Kristian V.', '4 dager siden', 'yyy', ['Lang batteritid', 'God lyd'], [], 13, '60 timer batteri er vanvittig', 'Lader annenhver uke. Lyden er varmere enn Sony — liker den bedre.'),
  R('r17', 'senn-m4', 'Hanne G.', '2 uker siden', 'yyy', ['God lyd'], [], 7, 'Undervurdert', 'Får ikke samme hype som Bose og Sony, men lyden er minst like god.'),
  R('r18', 'senn-m4', 'Fredrik J.', '1 mnd siden', 'yyy', [], ['ANC hakket bak'], 5, 'God verdi på tilbud', 'Til 2790 er dette et røverkjøp. ANC hakket bak Sony.', { shop: 'Proshop', paid: 2790, showPaid: true }),
  R('r19', 'senn-m4', 'Ida P.', 'Mai 2026', 'yuy', ['God komfort'], [], 4, 'Kjempekomfortabel', 'Glemmer at jeg har dem på. Appen er enkel og ryddig.'),
  R('r20', 'sonos-ace', 'Magnus T.', '1 uke siden', 'yuy', ['Solid byggkvalitet'], [], 6, 'Nydelig design', 'Byggkvaliteten slår alt annet. TV-swap med Arc funker overraskende bra.'),
  R('r21', 'sonos-ace', 'Camilla F.', '3 uker siden', 'uun', [], ['Lovede funksjoner mangler'], 8, 'Bra lyd, tynn programvare', 'Venter fortsatt på funksjonene som ble lovet i appen.'),
  R('r22', 'sonos-ace', 'Henrik S.', '2 mnd siden', 'uyy', ['God lyd'], ['Tung på hodet'], 4, 'God førstegenerasjon', 'Litt tung på hodet etter to timer, men lyden er presis.', { verified: false }),
  R('r23', 'sonos-ace', 'Mari L.', 'April 2026', 'yyy', ['Perfekt til TV-kvelder'], [], 5, 'Perfekt til hjemmekino', 'Kjøpt for sene kvelder uten å vekke huset. Gjør akkurat det.'),
  R('r24', 'jbl-tour2', 'Stian K.', '5 dager siden', 'yyy', [], ['ANC bare godkjent'], 9, 'Mye for pengene', 'Til under 2000 er dette kupp. ANC er godkjent, ikke mer.', { shop: 'Power', paid: 1990, showPaid: true }),
  R('r25', 'jbl-tour2', 'Julie A.', '2 uker siden', 'yyy', ['Lang batteritid'], [], 5, 'Solid hverdagshodetelefon', 'Pendler daglig med dem. Batteriet holder to uker.'),
  R('r26', 'jbl-tour2', 'Thomas N.', '1 mnd siden', 'uyu', [], ['Basstung ut av boksen'], 3, 'Grei nok', 'Litt basstung ut av boksen. Måtte inn i EQ-en.'),
  R('r27', 'jbl-tour2', 'Vilde H.', 'Juni 2026', 'yuy', ['God komfort'], [], 2, 'Positivt overrasket', 'Kjøpte på impuls og angrer ikke. Komfort på topp.'),
  R('r28', 'airpods4', 'Sander E.', '2 dager siden', 'yyy', ['Tett støydemping'], [], 11, 'ANC i åpen design funker', 'Trodde ikke på det før jeg prøvde. Demper kontorstøy merkbart.'),
  R('r29', 'airpods4', 'Emilie B.', '1 uke siden', 'yyy', ['Sitter godt'], [], 6, 'Sitter endelig godt', 'Formen er bedre enn AirPods 3. Faller ikke ut på løpetur.'),
  R('r30', 'airpods4', 'Oskar R.', '3 uker siden', 'yyy', [], [], 7, 'Velg ANC-varianten', 'Prisdifferansen er liten — ANC-versjonen er verdt det.'),
  R('r31', 'airpods4', 'Selma D.', '1 mnd siden', 'yyy', ['God lyd'], [], 4, 'Knallbra til prisen', 'Slo til på tilbud. Lyd og lommekomfort i toppklasse.', { shop: 'Elkjøp', paid: 1690, showPaid: true }),
  R('r32', 'airpods4', 'Mathias W.', 'Mai 2026', 'uuy', [], ['Mangler trådløs lading'], 5, 'Case uten trådløs lading', 'Savner MagSafe på standardmodellen. Ellers fine.', { verified: false }),
  R('r33', 'beats-pro', 'Adrian M.', '1 uke siden', 'yyy', ['God bass'], [], 5, 'Bassen sitter', 'Trening og pendling — gjør jobben. USB-C-lyd er et pluss.'),
  R('r34', 'beats-pro', 'Frida O.', '3 uker siden', 'uyy', [], ['Klemmer'], 6, 'Komforten trekker ned', 'Klemmer over ørene etter en time. Lyden er ellers fin.'),
  R('r35', 'beats-pro', 'Elias G.', '2 mnd siden', 'yuy', ['Funker på Android'], [], 3, 'Funker like godt på Android', 'Sjelden vare fra Apple-familien. Paring like god på Pixel.'),
  R('r36', 'beats-pro', 'Sofie J.', 'April 2026', 'yyy', ['Tåler røff bruk'], [], 2, 'Stilige og solide', 'Tåler å bli slengt i sekken. Batteri helt ok.', { verified: false }),
  R('r37', 'iphone', 'Martin H.', '3 dager siden', 'yyy', ['Godt kamera', 'Batteri hele dagen'], [], 14, 'Trygg oppgradering', 'Fra iPhone 12. Kamera og batteri er største løftet. Dynamic Island er kjekkere enn ventet.'),
  R('r38', 'iphone', 'Lene S.', '2 uker siden', 'yuy', [], ['Prisen svinger mye'], 10, 'God, men vent på tilbud', 'Prisen svinger 800 kr mellom butikkene. Fikk min godt under veil.'),
  R('r39', 'iphone', 'Daniel K.', '1 mnd siden', 'yyy', ['Nydelig skjerm'], [], 8, 'USB-C gjør hverdagen enklere', 'Én lader til Mac, iPad og mobil. Skjermen er nydelig.'),
  R('r40', 'iphone', 'Kaja M.', '2 mnd siden', 'yyy', [], ['Bare 60 Hz'], 12, '60 Hz merkes', 'Savner ProMotion fra Pro-modellen, ellers null klager.'),
  R('r41', 'iphone', 'Vetle A.', 'Mars 2026', 'yyy', ['Batteri hele dagen'], [], 4, 'Batteri hele dagen', 'Lader hver natt, aldri tom før leggetid. Anbefales.'),
  R('r42', 'ps5', 'Jørgen B.', '4 dager siden', 'yyy', ['Stillegående', 'Tar liten plass'], [], 16, 'Slim er stillegående', 'Byttet fra launch-PS5. Merkbart mindre viftestøy og tar halve plassen.'),
  R('r43', 'ps5', 'Andrea T.', '2 uker siden', 'yyy', [], [], 9, 'Endelig på lager overalt', 'Kjøpte med to spill. Sønnen er i himmelen.', { shop: 'Elkjøp', paid: 5990, showPaid: true }),
  R('r44', 'ps5', 'Robin L.', '1 mnd siden', 'yyy', [], ['Stativ selges separat'], 11, 'Husk stativet', 'Vertikalt stativ selges separat på Slim — irriterende. Konsollen i seg selv er rå.'),
  R('r45', 'ps5', 'Maja F.', '2 mnd siden', 'yyy', ['Rask lasting'], [], 6, 'Grafikken imponerer fortsatt', 'Spider-Man 2 i 60 fps er vilt. Rask lasting overalt.'),
  R('r46', 'ps5', 'Simen N.', 'Mai 2026', 'yyu', [], ['Lite lagring'], 7, 'Lagringen fylles fort', '1 TB høres mye ut. Det er det ikke. Regn inn en SSD til.', { verified: false }),
];

const ReviewStore = {
  items: PRODUCT_REVIEWS.slice(), ls: new Set(), voted: new Set(),
  emit() { this.items = [...this.items]; this.ls.forEach(f => f()); },
  sub(f) { this.ls.add(f); return () => this.ls.delete(f); },
  list(prodId) { return this.items.filter(r => r.prodId === prodId); },
  add(r) { this.items = [{ id: 'r' + Date.now().toString(36), helpful: 0, verified: false, date: 'Nå nettopp', plus: [], minus: [], ...r }, ...this.items]; this.emit(); },
  update(id, patch) { const i = this.items.findIndex(x => x.id === id); if (i < 0) return; this.items[i] = { ...this.items[i], ...patch, edited: true }; this.emit(); },
  remove(id) { this.items = this.items.filter(x => x.id !== id); this.emit(); },
  mine() { return this.items.filter(r => r.author === 'Du'); },
  vote(id) { const r = this.items.find(x => x.id === id); if (!r) return; if (this.voted.has(id)) { this.voted.delete(id); r.helpful--; } else { this.voted.add(id); r.helpful++; } this.emit(); },
};

// ---- verdict language (never numbers) ----------------------
function claimVerdict(y, n, u) {
  const d = y + n;
  if (d < 3) return { label: 'For få svar', tone: 'mix' };
  const s = y / d;
  return s >= .85 ? { label: 'Bred enighet', tone: 'pos' } : s >= .6 ? { label: 'Flertallet enig', tone: 'pos' } : s >= .4 ? { label: 'Delte meninger', tone: 'mix' } : s >= .15 ? { label: 'Flertallet uenig', tone: 'neg' } : { label: 'Bred misnøye', tone: 'neg' };
}
function verdictWord(score) {
  return score >= .85 ? { tier: 3, score, tone: 'pos', short: 'Svært fornøyde', tiny: 'svært fornøyde', head: 'Folk er svært fornøyde' }
    : score >= .6 ? { tier: 2, score, tone: 'pos', short: 'Stort sett fornøyde', tiny: 'fornøyde', head: 'Folk er stort sett fornøyde' }
    : score >= .4 ? { tier: 1, score, tone: 'mix', short: 'Delte meninger', tiny: 'delte meninger', head: 'Folk er delte' }
    : { tier: 0, score, tone: 'neg', short: 'Folk advarer', tiny: 'advarer', head: 'Folk advarer' };
}
const DOM_TIERS = [{ v: 3, label: 'Svært fornøyde' }, { v: 2, label: 'Fornøyde eller bedre' }, { v: 1, label: 'Uten advarsler' }];

// ---- aggregation -------------------------------------------
const _rs = (n) => { const x = Math.sin(n * 127.1 + 3.7) * 43758.5453; return x - Math.floor(x); };
const _r10 = (v) => Math.round(v / 10) * 10;
const _statsCache = new Map();
function reviewStats(p) {
  if (!p || !p.id) return null;
  const ver = ReviewStore.items;
  const hit = _statsCache.get(p.id);
  if (hit && hit.ver === ver) return hit.s;
  const s = _calcStats(p);
  _statsCache.set(p.id, { ver, s });
  return s;
}
function _calcStats(p) {
  const real = ReviewStore.items.filter(r => r.prodId === p.id);
  const pool = TRAIT_POOL[p.cat] || TRAIT_POOL._;
  const idn = p.idn || String(p.id).split('').reduce((a, c) => a + c.charCodeAt(0), 7);
  if (!real.length && p.rating == null) return null;
  let claims, traits, paid = null, n;
  if (real.length) {
    claims = CLAIMS.map(c => {
      let y = 0, nn = 0, u = 0;
      real.forEach(r => { const v = (r.claims || {})[c.key] || 'u'; v === 'y' ? y++ : v === 'n' ? nn++ : u++; });
      return { ...c, y, n: nn, u, verdict: claimVerdict(y, nn, u) };
    });
    const tm = new Map();
    real.forEach(r => { (r.plus || []).forEach(t => tm.set('+' + t, (tm.get('+' + t) || 0) + 1)); (r.minus || []).forEach(t => tm.set('-' + t, (tm.get('-' + t) || 0) + 1)); });
    traits = [...tm.entries()].map(([k, c]) => ({ t: k.slice(1), pos: k[0] === '+', c, share: c / real.length })).sort((a, b) => b.c - a.c);
    const paids = real.filter(r => r.paid > 0).map(r => r.paid);
    if (paids.length) paid = { lo: Math.min(...paids), hi: Math.max(...paids), n: paids.length };
    n = Math.max(p.reviews || 0, real.length);
  } else {
    n = p.reviews || 0;
    const base = Math.max(.08, Math.min(.96, .5 + (p.rating - 4) * .55));
    const mk = (off, uf, seed) => {
      const share = Math.max(.05, Math.min(.97, base + off + (_rs(idn * 3 + seed) - .5) * .1));
      const u = Math.round(n * Math.max(.04, Math.min(.4, uf + (_rs(idn * 5 + seed) - .5) * .06)));
      const dec = n - u, y = Math.round(dec * share);
      return { y, n: dec - y, u };
    };
    claims = [{ ...CLAIMS[0], ...mk(0, .07, 1) }, { ...CLAIMS[1], ...mk(.02, .24, 2) }, { ...CLAIMS[2], ...mk(.05, .12, 3) }].map(c => ({ ...c, verdict: claimVerdict(c.y, c.n, c.u) }));
    const rot = idn % pool.plus.length;
    const pShares = [.42, .26, .14], mShares = base < .68 ? [.22, .11] : [.13];
    traits = pShares.map((sh, i) => ({ t: pool.plus[(rot + i) % pool.plus.length], pos: true, c: Math.round(n * sh), share: sh }))
      .concat(mShares.map((sh, i) => ({ t: pool.minus[(idn + i) % pool.minus.length], pos: false, c: Math.round(n * sh), share: sh })));
    if (p.best && n >= 40) paid = { lo: _r10(p.best * .93), hi: _r10(p.best * 1.12), n: Math.round(n * .3) };
  }
  const shares = claims.map(c => { const d = c.y + c.n; return d ? c.y / d : .5; });
  const score = shares.reduce((a, b) => a + b, 0) / shares.length;
  return { n, nReal: real.length, real, claims, traits, paid, verdict: verdictWord(score) };
}
const domScore = (p) => { const s = reviewStats(p); return s ? s.verdict.score : undefined; };
const domTier = (p) => { const s = reviewStats(p); return s ? s.verdict.tier : null; };
const fmtNok = (v) => fmt(v) + ',–';

Object.assign(window, { CLAIMS, CLAIM_NEG, TRAIT_POOL, SHOP_META, PRODUCT_REVIEWS, ReviewStore, claimVerdict, verdictWord, DOM_TIERS, reviewStats, domScore, domTier, fmtNok });
