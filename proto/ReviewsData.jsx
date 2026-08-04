// ===========================================================
// Pricy.no — Reviews layer data: shop trust metadata, seeded
// product reviews, ReviewStore (same emit/sub as WatchStore)
// ===========================================================

// Per-shop trust profile. CDON deliberately weak so the signal matters.
const SHOP_META = {
  'Elkjøp':      { rating: 4.5, count: 12840, delivery: 4.6, service: 4.3, returns: 4.5, since: '2013', physical: true },
  'Power':       { rating: 4.4, count: 9310,  delivery: 4.5, service: 4.2, returns: 4.4, since: '2014', physical: true },
  'Komplett':    { rating: 4.6, count: 15620, delivery: 4.8, service: 4.4, returns: 4.5, since: '2013', physical: false },
  'NetOnNet':    { rating: 4.2, count: 5470,  delivery: 4.3, service: 4.0, returns: 4.2, since: '2015', physical: true },
  'Clas Ohlson': { rating: 4.7, count: 11080, delivery: 4.6, service: 4.7, returns: 4.8, since: '2014', physical: true },
  'Proshop':     { rating: 4.3, count: 4890,  delivery: 4.5, service: 4.1, returns: 4.1, since: '2016', physical: false },
  'CDON':        { rating: 3.6, count: 7240,  delivery: 3.4, service: 3.5, returns: 3.8, since: '2015', physical: false },
  'Dustin':      { rating: 4.0, count: 3120,  delivery: 4.2, service: 3.9, returns: 4.0, since: '2017', physical: false },
};

// Seeded reviews — canonical Audio set + xm5/iphone/ps5. Other products: empty state.
const PRODUCT_REVIEWS = [
  { id: 'r1', prodId: 'xm5', author: 'Håkon L.', rating: 5, date: '3 dager siden', title: 'Beste ANC jeg har hatt', body: 'Byttet fra XM3. Støydempingen på trikken er natt og dag, og batteriet holder hele uka.', helpful: 24, verified: true },
  { id: 'r2', prodId: 'xm5', author: 'Ingrid S.', rating: 5, date: '1 uke siden', title: 'Verdt hver krone på tilbud', body: 'Kjøpte da prisen falt under 3000. Komforten er suveren, klemmer ikke selv med briller.', helpful: 18, verified: true },
  { id: 'r3', prodId: 'xm5', author: 'Jonas F.', rating: 4, date: '2 uker siden', title: 'God lyd, litt plastisk bygg', body: 'Lyden og appen er topp. Trekker ett poeng for at de ikke kan foldes sammen som XM4.', helpful: 11, verified: true },
  { id: 'r4', prodId: 'xm5', author: 'Marte K.', rating: 5, date: '1 mnd siden', title: 'Perfekt på hjemmekontor', body: 'Mikrofonen er den beste jeg har testet i Teams-møter. Kollegaene hører ikke barna i bakgrunnen.', helpful: 9, verified: false },
  { id: 'r5', prodId: 'xm5', author: 'Sindre A.', rating: 3, date: '2 mnd siden', title: 'Bra, men berøringsflaten irriterer', body: 'Skrur opp volumet når jeg justerer dem på hodet. Ellers helt kurant lyd.', helpful: 6, verified: true },
  { id: 'r6', prodId: 'xm5', author: 'Eva T.', rating: 4, date: 'Mai 2026', title: 'Solid reisefølge', body: 'Brukt på fire flyturer nå. Casen er stor, men dempingen tar hele motorduren.', helpful: 4, verified: true },
  { id: 'r7', prodId: 'airpods', author: 'Amalie R.', rating: 5, date: '5 dager siden', title: 'Sømløst med iPhone', body: 'Parer på sekundet. Transparensmodus er magisk — hører kassadama uten å ta dem ut.', helpful: 15, verified: true },
  { id: 'r8', prodId: 'airpods', author: 'Petter H.', rating: 4, date: '2 uker siden', title: 'Små og lette', body: 'Sitter godt på løpetur. Skulle ønske batteriet var bedre enn 5–6 timer.', helpful: 8, verified: true },
  { id: 'r9', prodId: 'airpods', author: 'Live N.', rating: 5, date: '3 uker siden', title: 'USB-C endelig', body: 'Én kabel til alt nå. Lyden er merkbart bedre enn forrige generasjon.', helpful: 7, verified: true },
  { id: 'r10', prodId: 'airpods', author: 'Espen D.', rating: 4, date: '1 mnd siden', title: 'Bra, men dyre uten tilbud', body: 'Vent på pristupp under 2500 — de dukker opp nesten hver måned.', helpful: 12, verified: false },
  { id: 'r11', prodId: 'airpods', author: 'Nora W.', rating: 5, date: 'April 2026', title: 'Beste kjøp i år', body: 'Bruker dem hver dag på jobb og trening. Null problemer etter tre måneder.', helpful: 5, verified: true },
  { id: 'r12', prodId: 'bose-ultra', author: 'Kristoffer M.', rating: 5, date: '1 uke siden', title: 'ANC-kongen', body: 'Marginalt bedre demping enn Sony etter test av begge. Immersive Audio er gimmick, resten er topp.', helpful: 10, verified: true },
  { id: 'r13', prodId: 'bose-ultra', author: 'Silje O.', rating: 4, date: '3 uker siden', title: 'Komfort i særklasse', body: 'Letteste over-ear jeg har eid. Batteriet på 24 timer er midt på treet.', helpful: 6, verified: true },
  { id: 'r14', prodId: 'bose-ultra', author: 'Anders B.', rating: 4, date: '1 mnd siden', title: 'Dyr men god', body: 'Prisen svinger mye — jeg betalte 3490 og er fornøyd. Ikke kjøp til fullpris.', helpful: 9, verified: true },
  { id: 'r15', prodId: 'bose-ultra', author: 'Tuva E.', rating: 5, date: 'Juni 2026', title: 'Endelig riktig kjøp', body: 'Tredje hodetelefonen på to år. Denne blir værende.', helpful: 3, verified: false },
  { id: 'r16', prodId: 'senn-m4', author: 'Ole Kristian V.', rating: 5, date: '4 dager siden', title: '60 timer batteri er vanvittig', body: 'Lader annenhver uke. Lyden er varmere enn Sony — liker den bedre.', helpful: 13, verified: true },
  { id: 'r17', prodId: 'senn-m4', author: 'Hanne G.', rating: 4, date: '2 uker siden', title: 'Undervurdert', body: 'Får ikke samme hype som Bose og Sony, men lyden er minst like god.', helpful: 7, verified: true },
  { id: 'r18', prodId: 'senn-m4', author: 'Fredrik J.', rating: 4, date: '1 mnd siden', title: 'God verdi på tilbud', body: 'Til 2790 er dette et røverkjøp. ANC hakket bak Sony.', helpful: 5, verified: true },
  { id: 'r19', prodId: 'senn-m4', author: 'Ida P.', rating: 5, date: 'Mai 2026', title: 'Kjempekomfortabel', body: 'Glemmer at jeg har dem på. Appen er enkel og ryddig.', helpful: 4, verified: true },
  { id: 'r20', prodId: 'sonos-ace', author: 'Magnus T.', rating: 4, date: '1 uke siden', title: 'Nydelig design', body: 'Byggkvaliteten slår alt annet. TV-swap med Arc funker overraskende bra.', helpful: 6, verified: true },
  { id: 'r21', prodId: 'sonos-ace', author: 'Camilla F.', rating: 3, date: '3 uker siden', title: 'Bra lyd, tynn programvare', body: 'Venter fortsatt på funksjonene som ble lovet i appen.', helpful: 8, verified: true },
  { id: 'r22', prodId: 'sonos-ace', author: 'Henrik S.', rating: 4, date: '2 mnd siden', title: 'God førstegenerasjon', body: 'Litt tung på hodet etter to timer, men lyden er presis.', helpful: 4, verified: false },
  { id: 'r23', prodId: 'sonos-ace', author: 'Mari L.', rating: 5, date: 'April 2026', title: 'Perfekt til hjemmekino', body: 'Kjøpt for sene kvelder uten å vekke huset. Gjør akkurat det.', helpful: 5, verified: true },
  { id: 'r24', prodId: 'jbl-tour2', author: 'Stian K.', rating: 4, date: '5 dager siden', title: 'Mye for pengene', body: 'Til under 2000 er dette kupp. ANC er godkjent, ikke mer.', helpful: 9, verified: true },
  { id: 'r25', prodId: 'jbl-tour2', author: 'Julie A.', rating: 4, date: '2 uker siden', title: 'Solid hverdagshodetelefon', body: 'Pendler daglig med dem. Batteriet holder to uker.', helpful: 5, verified: true },
  { id: 'r26', prodId: 'jbl-tour2', author: 'Thomas N.', rating: 3, date: '1 mnd siden', title: 'Grei nok', body: 'Litt basstung ut av boksen. Måtte inn i EQ-en.', helpful: 3, verified: true },
  { id: 'r27', prodId: 'jbl-tour2', author: 'Vilde H.', rating: 5, date: 'Juni 2026', title: 'Positivt overrasket', body: 'Kjøpte på impuls og angrer ikke. Komfort på topp.', helpful: 2, verified: true },
  { id: 'r28', prodId: 'airpods4', author: 'Sander E.', rating: 5, date: '2 dager siden', title: 'ANC i åpen design funker', body: 'Trodde ikke på det før jeg prøvde. Demper kontorstøy merkbart.', helpful: 11, verified: true },
  { id: 'r29', prodId: 'airpods4', author: 'Emilie B.', rating: 4, date: '1 uke siden', title: 'Sitter endelig godt', body: 'Formen er bedre enn AirPods 3. Faller ikke ut på løpetur.', helpful: 6, verified: true },
  { id: 'r30', prodId: 'airpods4', author: 'Oskar R.', rating: 4, date: '3 uker siden', title: 'Velg ANC-varianten', body: 'Prisdifferansen er liten — ANC-versjonen er verdt det.', helpful: 7, verified: true },
  { id: 'r31', prodId: 'airpods4', author: 'Selma D.', rating: 5, date: '1 mnd siden', title: 'Knallbra til prisen', body: 'Betalte 1690. Lyd og lommekomfort i toppklasse.', helpful: 4, verified: true },
  { id: 'r32', prodId: 'airpods4', author: 'Mathias W.', rating: 3, date: 'Mai 2026', title: 'Case uten trådløs lading', body: 'Savner MagSafe på standardmodellen. Ellers fine.', helpful: 5, verified: false },
  { id: 'r33', prodId: 'beats-pro', author: 'Adrian M.', rating: 4, date: '1 uke siden', title: 'Bassen sitter', body: 'Trening og pendling — gjør jobben. USB-C-lyd er et pluss.', helpful: 5, verified: true },
  { id: 'r34', prodId: 'beats-pro', author: 'Frida O.', rating: 3, date: '3 uker siden', title: 'Komforten trekker ned', body: 'Klemmer over ørene etter en time. Lyden er ellers fin.', helpful: 6, verified: true },
  { id: 'r35', prodId: 'beats-pro', author: 'Elias G.', rating: 4, date: '2 mnd siden', title: 'Funker like godt på Android', body: 'Sjelden vare fra Apple-familien. Paring like god på Pixel.', helpful: 3, verified: true },
  { id: 'r36', prodId: 'beats-pro', author: 'Sofie J.', rating: 4, date: 'April 2026', title: 'Stilige og solide', body: 'Tåler å bli slengt i sekken. Batteri helt ok.', helpful: 2, verified: false },
  { id: 'r37', prodId: 'iphone', author: 'Martin H.', rating: 5, date: '3 dager siden', title: 'Trygg oppgradering', body: 'Fra iPhone 12. Kamera og batteri er største løftet. Dynamic Island er kjekkere enn ventet.', helpful: 14, verified: true },
  { id: 'r38', prodId: 'iphone', author: 'Lene S.', rating: 4, date: '2 uker siden', title: 'God, men vent på tilbud', body: 'Prisen svinger 800 kr mellom butikkene. Fikk min 700 under veil.', helpful: 10, verified: true },
  { id: 'r39', prodId: 'iphone', author: 'Daniel K.', rating: 5, date: '1 mnd siden', title: 'USB-C gjør hverdagen enklere', body: 'Én lader til Mac, iPad og mobil. Skjermen er nydelig.', helpful: 8, verified: true },
  { id: 'r40', prodId: 'iphone', author: 'Kaja M.', rating: 4, date: '2 mnd siden', title: '60 Hz merkes', body: 'Savner ProMotion fra Pro-modellen, ellers null klager.', helpful: 12, verified: true },
  { id: 'r41', prodId: 'iphone', author: 'Vetle A.', rating: 5, date: 'Mars 2026', title: 'Batteri hele dagen', body: 'Lader hver natt, aldri tom før leggetid. Anbefales.', helpful: 4, verified: true },
  { id: 'r42', prodId: 'ps5', author: 'Jørgen B.', rating: 5, date: '4 dager siden', title: 'Slim er stillegående', body: 'Byttet fra launch-PS5. Merkbart mindre viftestøy og tar halve plassen.', helpful: 16, verified: true },
  { id: 'r43', prodId: 'ps5', author: 'Andrea T.', rating: 5, date: '2 uker siden', title: 'Endelig på lager overalt', body: 'Kjøpte til under 6000 med to spill. Sønnen er i himmelen.', helpful: 9, verified: true },
  { id: 'r44', prodId: 'ps5', author: 'Robin L.', rating: 4, date: '1 mnd siden', title: 'Husk stativet', body: 'Vertikalt stativ selges separat på Slim — irriterende. Konsollen i seg selv er rå.', helpful: 11, verified: true },
  { id: 'r45', prodId: 'ps5', author: 'Maja F.', rating: 5, date: '2 mnd siden', title: 'Grafikken imponerer fortsatt', body: 'Spider-Man 2 i 60 fps er vilt. Rask lasting overalt.', helpful: 6, verified: true },
  { id: 'r46', prodId: 'ps5', author: 'Simen N.', rating: 4, date: 'Mai 2026', title: 'Lagringen fylles fort', body: '1 TB høres mye ut. Det er det ikke. Regn inn en SSD til.', helpful: 7, verified: false },
];

const ReviewStore = {
  items: PRODUCT_REVIEWS.slice(), ls: new Set(), voted: new Set(),
  emit() { this.items = [...this.items]; this.ls.forEach(f => f()); },
  sub(f) { this.ls.add(f); return () => this.ls.delete(f); },
  list(prodId) { return this.items.filter(r => r.prodId === prodId); },
  add(r) { this.items = [{ id: 'r' + Date.now().toString(36), helpful: 0, verified: false, date: 'Nå nettopp', ...r }, ...this.items]; this.emit(); },
  vote(id) { const r = this.items.find(x => x.id === id); if (!r) return; if (this.voted.has(id)) { this.voted.delete(id); r.helpful--; } else { this.voted.add(id); r.helpful++; } this.emit(); },
};

Object.assign(window, { SHOP_META, PRODUCT_REVIEWS, ReviewStore });
