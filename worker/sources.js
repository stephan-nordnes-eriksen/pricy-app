// Price sources (Phase 4d): every source yields rows in ingest()'s shape —
// { product_id, shop, price, ship, stock, eta, url } — and collectRows()
// dispatches per shop from env.SOURCES (a JSON var in wrangler.jsonc:
// { "Komplett": { "type": "adtraction" },
//   "Power":    { "type": "scrape", "urls": { "airpods": "https://…" } } }).
// Adtraction feed URLs (they embed the channel token) live in the secret
// ADTRACTION_FEEDS: { "Komplett": "https://…" }.
// Never scrape competing comparison services (Prisjakt etc.) — first-party
// shop pages and licensed feeds only.

import eans from './eans.json' with { type: 'json' };

const UA = 'pricy.no price watcher (kontakt@pricy.no)';

// digits only, leading zeros dropped, so a 12-digit UPC and its 13-digit
// zero-padded EAN form land on the same key
const eanKey = (s) => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
const EAN_TO_PRODUCT = {};
for (const [productId, list] of Object.entries(eans)) {
  for (const e of list) EAN_TO_PRODUCT[eanKey(e)] = productId;
}

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

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (_, e) => XML_ENTITIES[e] ?? String.fromCodePoint(e.slice(1)));

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
      const product_id = EAN_TO_PRODUCT[eanKey(pick(f, 'ean', 'gtin', 'gtin13', 'barcode'))];
      const price = parsePrice(pick(f, 'price', 'priceinclvat'));
      if (!product_id || !price) continue; // not ours / junk row
      rows.push({
        product_id, shop, price,
        ship: pick(f, 'shippingcost', 'shipping', 'shippingprice') ?? null,
        stock: truthyStock(pick(f, 'instock', 'availability', 'stock')) ? 1 : 0,
        eta: null,
        url: pick(f, 'trackingurl', 'producturl', 'url', 'deeplink') ?? null,
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

// First-party scrape of a shop's own product pages via their schema.org
// JSON-LD (Product → Offer/AggregateOffer). cfg.urls maps product id → page.
export async function scrapeSource(shop, cfg) {
  const rows = await Promise.all(Object.entries(cfg.urls || {}).map(async ([product_id, url]) => {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const offer = productOffer(await res.text());
      const price = parsePrice(offer?.price ?? offer?.lowPrice);
      if (!price) throw new Error('no JSON-LD offer price');
      return {
        product_id, shop, price,
        ship: null,
        stock: /instock|limitedavailability/i.test(String(offer.availability || '')) ? 1 : 0,
        eta: null,
        url,
      };
    } catch (e) {
      console.warn(`ingest: ${shop}/${product_id} scrape failed: ${e.message}`);
      return null; // this product freezes; the rest of the shop still updates
    }
  }));
  return rows.filter(Boolean);
}

// first Offer-ish object inside any JSON-LD block (handles @graph and arrays)
function productOffer(html) {
  for (const [, body] of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let doc;
    try { doc = JSON.parse(body.trim()); } catch { continue; }
    const nodes = [doc, ...(Array.isArray(doc) ? doc : []), ...(doc['@graph'] || [])];
    for (const n of nodes) {
      const o = [n?.offers].flat().find(o => o && (o.price != null || o.lowPrice != null));
      if (o) return o;
    }
  }
  return null;
}

const SOURCES = { adtraction: adtractionSource, scrape: scrapeSource };

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
