// Price sources (Phase 4d): every source yields rows in ingest()'s shape —
// { product_id, shop, price, name, brand, ship, stock (0=out 1=in 2=unknown),
// eta, url } (name/brand feed discovery: unknown-EAN rows get an `ean-<digits>`
// product_id and ingest auto-creates the product hidden) — and collectRows()
// dispatches per shop from env.SOURCES (a JSON var in wrangler.jsonc:
// { "Komplett": { "type": "adtraction" },
//   "Power":    { "type": "scrape", "urls": { "airpods": "https://…" } } }).
// Adtraction feed URLs (they embed the channel token) live in the secret
// ADTRACTION_FEEDS: { "Komplett": "https://…" }.
// Never scrape competing comparison services (Prisjakt etc.) — first-party
// shop pages and licensed feeds only.

export const UA = 'pricy.no price watcher (kontakt@pricy.no)';
// Some shops (NetOnNet) 403 every non-browser UA, honest or not. Opt in per
// shop with cfg.ua = 'browser'; the honest UA stays the default everywhere.
export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// digits only, leading zeros dropped, so a 12-digit UPC and its 13-digit
// zero-padded EAN form land on the same key
export const eanKey = (s) => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

// "2 990,50", "2990.50 NOK", "2990" → øre-less integer NOK; null if unparsable
export function parsePrice(raw) {
  let s = String(raw ?? '').replace(/[\s ]/g, '').replace(/[^0-9.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  const sep = Math.max(lastDot, lastComma);
  // a separator followed by exactly 1–2 digits is a decimal mark; anything
  // else (1.299 / 1,299,000) is grouping
  const decimals = sep >= 0 && s.length - sep - 1 <= 2 ? s.slice(sep + 1) : null;
  const whole = (decimals != null ? s.slice(0, sep) : s).replace(/[.,]/g, '');
  if (!/^\d+$/.test(whole)) return null;
  const n = Number(whole) + (decimals ? Number(decimals) / 10 ** decimals.length : 0);
  return n > 0 ? Math.round(n) : null;
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', deg: '°', trade: '™', reg: '®', copy: '©' };
// Also used on scraped JSON-LD text: plenty of shops emit HTML-escaped names
// ("Schwalbe 26&quot;", "Eikenø&#248;kkel") straight into their JSON-LD, which
// otherwise reaches the UI verbatim and mangles every derived slug id.
export const decodeXml = (s) => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#'
    ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    : XML_ENTITIES[e.toLowerCase()] ?? m);

// flat <product> element → lowercased tag→text map
function xmlFields(el) {
  const out = {};
  for (const [, tag, body] of el.matchAll(/<(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
    out[tag.toLowerCase()] = decodeXml(body).trim();
  }
  return out;
}

const pick = (f, ...names) => names.map(n => f[n]).find(v => v != null && v !== '');
const truthyStock = (v) => /^(yes|true|1|in ?stock)$/i.test(String(v ?? '').trim());

// Adtraction per-brand product feed: XML, one flat <product> element per
// offer. Field names vary a bit per brand, so match by candidate names and
// verify against the first real feed. Stream-parsed: feeds run to tens of
// MB and the Worker has 128 MB — never buffer the whole document.
export async function adtractionSource(shop, _cfg, env) {
  const feedUrl = JSON.parse(env.ADTRACTION_FEEDS || '{}')[shop];
  if (!feedUrl) throw new Error(`no ADTRACTION_FEEDS entry for ${shop}`);
  const res = await fetch(feedUrl, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`feed fetch ${res.status}`);

  const rows = [];
  let buf = '';
  const scan = () => {
    let m;
    // capture only the element's inner content — xmlFields on the full
    // element would match the outer <product> tag and swallow every field
    while ((m = buf.match(/<product(?:\s[^>]*)?>([\s\S]*?)<\/product>/i))) {
      buf = buf.slice(m.index + m[0].length);
      const f = xmlFields(m[1]);
      const key = eanKey(pick(f, 'ean', 'gtin', 'gtin13', 'barcode'));
      const name = pick(f, 'name', 'productname', 'title');
      // every EAN row rides its derived id — ingest's eans table re-maps known
      // EANs to their product and auto-creates the rest hidden; same EAN from
      // another shop lands on the same row
      const product_id = key && name ? `ean-${key}` : null;
      const price = parsePrice(pick(f, 'price', 'priceinclvat'));
      if (!product_id || !price) continue; // no EAN+name / junk row
      rows.push({
        product_id, shop, price,
        name: name ?? null,
        brand: pick(f, 'brand', 'manufacturer') ?? null,
        srcCat: pick(f, 'category', 'categoryname', 'producttype', 'productcategory') ?? null,
        ship: pick(f, 'shippingcost', 'shipping', 'shippingprice') ?? null,
        stock: (v => v == null ? 2 : truthyStock(v) ? 1 : 0)(pick(f, 'instock', 'availability', 'stock')),
        eta: null,
        url: pick(f, 'trackingurl', 'producturl', 'url', 'deeplink') ?? null,
        image: pick(f, 'imageurl', 'image', 'graphicurl', 'productimage') ?? null,
      });
    }
    // keep the tail (a possibly half-received <product>) bounded
    if (buf.length > 1 << 20) buf = buf.slice(-(1 << 19));
  };
  for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
    buf += chunk;
    scan();
  }
  return rows;
}

// Shared page → row extraction (schema.org Product/Offer JSON-LD), used by
// both the curated-URL scrapeSource() and the sitemap-driven discoverSource()
// below. Throws on anything that isn't a usable, NOK-priced offer.
function scrapeRow(html) {
  const { offer, image, name, brand, category, ean } = productOffer(html) ?? {};
  // no Product.category (Power, NetOnNet): the page's BreadcrumbList leaf is
  // the shop's own category label — unless it's the product itself (Power
  // ends crumbs with the product name), then the crumb before it
  const srcCat = category ?? breadcrumbCat(html, name);
  const sd = shippingInfo(html);
  // NetOnNet nests price in offer.priceSpecification instead of offer.price;
  // some shops (Christiania Belysning) nest it one level deeper as {amount}
  const spec = [offer?.priceSpecification].flat().find(s => s?.price != null);
  const unwrapPrice = (v) => v && typeof v === 'object' ? (v.amount ?? v.value) : v;
  const price = parsePrice(unwrapPrice(offer?.price ?? offer?.lowPrice ?? spec?.price));
  if (!price) throw new Error('no JSON-LD offer price');
  // money path: multi-country shops (clasohlson.com/se, cdon SE mirrors)
  // serve the same JSON-LD shape in SEK — never ingest those as NOK.
  // Skoringen sends a lowercase "nok" — compare case-insensitively
  const currency = offer.priceCurrency ?? spec?.priceCurrency;
  if (currency && currency.toUpperCase() !== 'NOK') throw new Error(`currency ${currency}, want NOK`);
  return {
    price,
    name: name ? decodeXml(name).trim() : null,
    brand: brand ? decodeXml(brand).trim() : null,
    ean: ean ?? null,
    srcCat: srcCat ? decodeXml(srcCat).trim() : null,
    ship: sd?.ship ?? null,
    stock: offer.availability ? (/instock|limitedavailability/i.test(String(offer.availability)) ? 1 : 0) : 2,
    eta: sd?.eta ?? null,
    image,
  };
}

// First-party scrape of a shop's own product pages via their schema.org
// JSON-LD (Product → Offer/AggregateOffer). cfg.urls maps product id → page.
export async function scrapeSource(shop, cfg) {
  const rows = await Promise.all(Object.entries(cfg.urls || {}).map(async ([product_id, url]) => {
    try {
      // some shops (Kicks) serve a real Product page with a non-2xx status —
      // don't gate on res.ok, scrapeRow()'s "no JSON-LD offer price" check
      // already rejects genuinely empty/error pages
      const res = await fetch(url, { headers: { 'user-agent': cfg.ua === 'browser' ? BROWSER_UA : UA, accept: 'text/html' } });
      const html = await res.text();
      const { ean: _ean, ...row } = scrapeRow(html);
      return { product_id, shop, url, ...row };
    } catch (e) {
      console.warn(`ingest: ${shop}/${product_id} scrape failed: ${e.message}`);
      return null; // this product freezes; the rest of the shop still updates
    }
  }));
  return rows.filter(Boolean);
}

// Fallback product identity for the many shops (most Shopify and small
// WooCommerce stores) that publish no gtin at all — Ringo and Kidsdreamstore
// both sampled 0/30, which is why discovery yielded nothing there. brand+name,
// normalised: it still merges offers across shops when two shops name a product
// the same way, and when they don't we get a real, live, single-shop product
// instead of nothing. EAN stays preferred — this is only reached without one.
// ponytail: name-keyed, so a shop renaming a product strands the old row; the
// upgrade path is POST /api/admin/alias, same as any other mis-keyed row.
const NO_CHARS = { æ: 'ae', ø: 'o', å: 'a', ä: 'a', ö: 'o', ü: 'u', é: 'e' };
export const slugId = (brand, name) => {
  const slug = [brand, name].filter(Boolean).join(' ').toLowerCase()
    .replace(/[æøåäöüé]/g, c => NO_CHARS[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
  return slug ? `p-${slug}` : null;
};

// Pure: <loc> URLs out of a sitemap/sitemap-index XML document, plus whether
// it's an index (needs one more hop into the listed sitemaps) or a leaf
// (the URLs are real pages). Exported for unit testing without a network hop.
export function parseSitemapXml(xml) {
  return {
    isIndex: /<sitemapindex[\s>]/i.test(xml),
    // [\s\S]*? (not [^<]+) since a CDATA-wrapped <loc> starts with its own `<`
    locs: [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map(m => decodeXml(m[1]).trim()),
  };
}

// Walks a shop's sitemap index one level deep — most Norwegian shops run
// WooCommerce/Yoast or Shopify, both of which split product/page/blog/
// category URLs into separate named sub-sitemaps, so filtering the INDEX
// entries by name (sitemapFilter) already isolates the product sub-sitemap(s)
// without needing a per-shop URL-path pattern.
async function sitemapUrls(sitemapUrl, { pathFilter, sitemapFilter = /product|vare|artikkel/i, maxSitemaps = 40 } = {}) {
  const res = await fetch(sitemapUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`sitemap fetch ${res.status}`);
  const { isIndex, locs } = parseSitemapXml(await res.text());
  if (isIndex) {
    // Bounded: a big shop (Hobbii — one sub-sitemap per yarn colour) can list
    // hundreds of sub-sitemaps, and walking them all downloaded so much XML
    // the crawl simply never reached a product page. We only ever sample
    // `limit` URLs out of the result anyway, so more sub-sitemaps buys
    // nothing but wall-clock.
    const all = locs.filter(u => sitemapFilter.test(u));
    const subs = all.slice(0, maxSitemaps);
    if (all.length > subs.length) console.warn(`ingest: ${sitemapUrl} lists ${all.length} sub-sitemaps, walking the first ${subs.length}`);
    const nested = await Promise.all(subs.map(u => sitemapUrls(u, { pathFilter, sitemapFilter, maxSitemaps })));
    return [...new Set(nested.flat())];
  }
  return [...new Set(pathFilter ? locs.filter(u => pathFilter.test(u)) : locs)];
}

// Sitemap-driven discovery: no pre-known product_id per URL (unlike
// scrapeSource()) — the page's own JSON-LD gtin becomes the id, same
// convention adtractionSource() uses. ingest() already auto-creates/
// auto-promotes ean-* rows regardless of which source emitted them, so this
// needs no Worker-side change. cfg: { sitemap, pathFilter?, sitemapFilter?,
// limit?, ua?, delayMs? } — pathFilter/sitemapFilter are regex source
// strings (JSON can't hold a RegExp literal).
export async function discoverSource(shop, cfg) {
  const pathFilter = cfg.pathFilter ? new RegExp(cfg.pathFilter, 'i') : undefined;
  const sitemapFilter = cfg.sitemapFilter ? new RegExp(cfg.sitemapFilter, 'i') : undefined;
  const all = await sitemapUrls(cfg.sitemap, { pathFilter, sitemapFilter });
  // when capped, spread the pick evenly over the whole sitemap instead of
  // taking the head — sitemaps are usually sorted, so the first N URLs are one
  // alphabetical corner of one category, which is the worst possible sample
  const stride = Math.max(1, Math.ceil(all.length / (cfg.limit ?? Infinity)));
  const urls = stride > 1 ? all.filter((_, i) => i % stride === 0) : all;
  const rows = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': cfg.ua === 'browser' ? BROWSER_UA : UA, accept: 'text/html' } });
      const html = await res.text();
      const { ean, ...row } = scrapeRow(html);
      // a name is mandatory on the slug path: some shops publish priced
      // brand/landing pages whose Product node carries a brand but no name,
      // which would key on the brand alone (p-aiaiai) and can never become a
      // product — ingest rejects the whole POST over one of them
      const product_id = ean ? `ean-${ean}` : (row.name ? slugId(row.brand, row.name) : null);
      if (!product_id) throw new Error('no gtin and no name — nothing to key a discovered row on');
      rows.push({ product_id, shop, url, ...row });
    } catch (e) {
      console.warn(`ingest: ${shop} discover ${url} failed: ${e.message}`);
    }
    // sequential with a pause, not Promise.all — this can be thousands of
    // pages, and hammering a shop's server in parallel is how Proshop's
    // rate-limit block happens
    await new Promise(r => setTimeout(r, cfg.delayMs ?? 500));
  }
  return rows;
}

// BreadcrumbList → the shop's category label for the page: the last crumb,
// or the one before it when the last is the product itself
function breadcrumbCat(html, productName) {
  for (const [, body] of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let doc;
    try { doc = JSON.parse(body.trim()); } catch { continue; }
    for (const n of [doc, ...(Array.isArray(doc) ? doc : []), ...(doc['@graph'] || [])]) {
      if (n?.['@type'] !== 'BreadcrumbList' || !Array.isArray(n.itemListElement)) continue;
      const names = n.itemListElement.map(i => i?.name ?? i?.item?.name).filter(n => typeof n === 'string');
      const cat = names.at(-1) === productName ? names.at(-2) : names.at(-1);
      if (cat) return cat;
    }
  }
  return null;
}

// schema.org image: string | [string] | ImageObject | [ImageObject]
const imageUrl = (v) => { const i = [v].flat()[0]; return typeof i === 'string' ? i : i?.url ?? null; };

// first Offer-ish object inside any JSON-LD block (handles @graph and arrays),
// plus the owning node's product image/name/brand (brand: string | Brand node)
function productOffer(html) {
  for (const [, body] of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let doc;
    try { doc = JSON.parse(body.trim()); } catch { continue; }
    const top = [doc, ...(Array.isArray(doc) ? doc : []), ...(doc['@graph'] || [])];
    // ProductGroup shops (KappAhl, Skomani, Maanesten) carry no offer of their
    // own — the price lives on a hasVariant entry, which inherits name/brand/
    // image/category from the group when it doesn't repeat them itself
    const nodes = top.flatMap(n => Array.isArray(n?.hasVariant)
      ? n.hasVariant.map(v => ({ ...v, name: v.name ?? n.name, brand: v.brand ?? n.brand, image: v.image ?? n.image, category: v.category ?? n.category }))
      : [n]);
    for (const n of nodes) {
      const o = [n?.offers].flat().find(o => o && (o.price != null || o.lowPrice != null || o.priceSpecification));
      if (o) {
        const brand = typeof n.brand === 'string' ? n.brand : n.brand?.name;
        // category: string | [string] — enough shops send it to feed CATMAP
        const category = [n.category].flat().find(c => typeof c === 'string');
        // gtin13/gtin/gtin12/gtin8 are the schema.org-fixed field names (no
        // per-shop naming variance like the Adtraction feeds have) — this is
        // the only stable cross-shop product identity a scrape ever gets
        const gtin = n.gtin13 ?? n.gtin ?? n.gtin12 ?? n.gtin8 ?? null;
        return { offer: o, image: imageUrl(n.image), name: typeof n.name === 'string' ? n.name : null, brand: brand ?? null, category: category ?? null, ean: gtin ? eanKey(gtin) : null };
      }
    }
  }
  return null;
}

// First OfferShippingDetails anywhere in the page's JSON-LD → display strings
// { ship, eta }. It may live in a different block than the offer (CDON), so
// scan every block. Delivery = handlingTime + transitTime, assumed DAY units
// (all shops seen send unitCode DAY). ponytail: one shipping policy per page
// in practice; first usable hit wins.
function shippingInfo(html) {
  const dig = (o, out) => {
    if (o && typeof o === 'object') {
      if (o['@type'] === 'OfferShippingDetails') out.push(o);
      for (const v of Object.values(o)) dig(v, out);
    }
    return out;
  };
  for (const [, body] of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let doc;
    try { doc = JSON.parse(body.trim()); } catch { continue; }
    for (const d of dig(doc, [])) {
      const t = d.deliveryTime;
      const lo = (t?.handlingTime?.minValue ?? 0) + (t?.transitTime?.minValue ?? 0);
      const hi = (t?.handlingTime?.maxValue ?? 0) + (t?.transitTime?.maxValue ?? 0);
      const rate = d.shippingRate?.currency && d.shippingRate.currency !== 'NOK' ? null : d.shippingRate?.value;
      const ship = rate == null ? null : Number(rate) === 0 ? 'Free shipping' : `kr ${rate} shipping`;
      const eta = t && hi > 0 ? (lo === hi ? `${hi} days` : `${lo}–${hi} days`) : null;
      if (ship || eta) return { ship, eta };
    }
  }
  return null;
}

const SOURCES = { adtraction: adtractionSource, scrape: scrapeSource, discover: discoverSource };

// One failed source = that shop's offers freeze at their last stored price
// (ingest only upserts rows it receives); it never aborts the other shops.
// No sources configured (current prod state, manual-crawl interim) = no
// rows: the cron is a no-op and POST /api/ingest is the only price writer.
export async function collectRows(env) {
  const config = typeof env.SOURCES === 'string' ? JSON.parse(env.SOURCES) : (env.SOURCES || {});
  const shops = Object.entries(config);
  if (!shops.length) return [];
  const settled = await Promise.allSettled(shops.map(async ([shop, cfg]) => {
    const run = SOURCES[cfg.type];
    if (!run) throw new Error(`unknown source type ${cfg.type}`);
    const rows = await run(shop, cfg, env);
    console.log(`ingest: ${shop} (${cfg.type}) ${rows.length} rows`);
    return rows;
  }));
  settled.forEach((s, i) => {
    if (s.status === 'rejected') console.error(`ingest: ${shops[i][0]} failed, offers frozen: ${s.reason?.message || s.reason}`);
  });
  return settled.flatMap(s => s.status === 'fulfilled' ? s.value : []);
}
