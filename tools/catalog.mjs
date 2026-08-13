// Paged replacement for GET /api/catalog.json, which dies with exceededCpu
// past ~50k rows (PROBLEMS.md #15; gpc-llm.mjs pioneered the pattern): walk
// the all-heads listing 400 rows at a time. Bearer requests bypass the edge
// cache both ways, so pages are fresh. Rows are the LEAN list shape — heads
// only, no specs; detail-fetch `ids=` where a tool needs those.
export async function fetchHeads(base, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const products = [];
  for (let off = 0, total = Infinity; off < total; off += 400) {
    const page = async () => fetch(`${base}/api/products?limit=400&offset=${off}&cb=${Date.now()}`, { headers });
    let res = await page();
    if (!res.ok) res = await page(); // one retry rides over a transient 503
    if (!res.ok) throw new Error(`page @${off}: HTTP ${res.status}`);
    const { products: rows, meta } = await res.json();
    total = meta.products;
    if (!rows.length) break; // never spin if the total drifts mid-walk
    products.push(...rows);
  }
  return products;
}
