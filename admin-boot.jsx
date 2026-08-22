// ===========================================================
// admin-boot.jsx — repo-owned, NOT synced (plans/admin-console.md).
// build.js slots this right after AdminData.jsx in dist/admin.js: the mock
// ADMIN arrays are emptied before any component can render them, the page
// gates on a users.admin session (granted manually via wrangler d1
// execute), and the store hydrates from the real admin API.
// Upstream is hookable (synced 2026-08-22): window.onAdminProducts drives
// the Products table server-side, and window.onAdminAction receives every
// mutating control — true = proceed, a string = error toast. Kinds without
// a real backend yet return an honest error instead of a fake success.
// ===========================================================
(() => {
  // ---- no mock data ever renders --------------------------------
  for (const k of ['catalog', 'users', 'mods', 'merchants', 'crawlers', 'flags', 'audit', 'admins']) ADMIN[k].length = 0;
  ADMIN.stats.kpi.length = 0;
  ADMIN.stats.searches.length = 0;
  ADMIN.stats.health.length = 0;
  ADMIN.stats.clicks14 = []; // upstream renders "No analytics yet" for < 2 points
  ADMIN.stats.issues = [];
  // null hides each hardcoded count line / panel hint upstream
  ADMIN.stats.totals = { products: null, users: null, webstoresLive: null, spamCaught7d: null };
  ADMIN.stats.clicksHint = null; ADMIN.stats.searchesHint = null; ADMIN.stats.healthHint = null;
  ADMIN.banner.on = false; ADMIN.banner.text = '';
  window.ADMIN_ENV = 'PROD';

  const minsAgo = (t) => t ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
  const rel = (t) => agoM(minsAgo(t));
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const fmtDur = (ms) => ms == null ? '—' : ms >= 60000 ? Math.floor(ms / 60000) + ' m ' + Math.round(ms % 60000 / 1000) + ' s' : Math.round(ms / 1000) + ' s';
  const j = async (path) => {
    const r = await fetch(path, { headers: { accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('unauthorized'), { auth: true });
    if (!r.ok) throw new Error(path + ' → ' + r.status);
    return r.json();
  };
  // write helper shaped like admAct's verdict: true, or an error string
  const w = async (path, method, body) => {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.ok) return true;
    const b = await r.json().catch(() => ({}));
    return (b.error || method + ' failed (' + r.status + ')');
  };

  const mapRow = (p, hidden) => ({
    id: p.id, name: p.name, brand: p.brand || '—',
    cat: p.cat, icon: p.icon || 'package',
    gtin: p.ean || '—', offers: p.shops, best: p.best,
    upd: minsAgo(Math.max(0, ...(p.offers || []).map(o => o.updated_at || 0)) || null),
    // real vocabulary: live = served with a brick, draft = Ukategorisert,
    // hidden = the demoted/junk backlog
    status: hidden ? 'hidden' : (p.brick ? 'live' : 'draft'),
    specs: p.specs && p.specs.groups ? {} : (p.specs || {}),
    offerRows: (p.offers || []).map(o => ({ shop: o.shop, price: o.price, updated_at: o.updated_at })),
  });

  // built in hydrate: display segment name → GPC code, and the fixed counts
  let SEG = null, COUNTS = null;

  // ---- server-driven Products table ------------------------------
  // Honest queries only. q rides searchIds (the blob search, ≤100 rows, no
  // true total — total = what matched). Lists ride the filterless fast path:
  // draft = node=uncat, a category = node=<its segment>. live = the default
  // list with drafts dropped client-side and the REAL total from overview —
  // node=<every stocked segment> was measured at 8.5 s live (thousands of
  // bricks → dozens of chunked D1 queries), so pages just under-fill a bit.
  // flagged/dupe have no server-side machinery — truly empty. hidden = the
  // 200-row backlog listing, filtered client-side.
  // upstream ignores a null resolution (superseded-call semantics) and never
  // catches a rejection — so a failed fetch resolves null with a toast
  window.onAdminProducts = (qry) => adminProducts(qry).catch(e => { AdminStore.say(String(e.message || e)); return null; });
  async function adminProducts({ q, cat, status, page }) {
    const base = '/api/products?admin=1';
    if (status === 'flagged' || status === 'dupe') return { rows: [], total: 0, counts: COUNTS };
    if (status === 'hidden') {
      let rows = (await j(base + '&hidden=1')).products.map(p => mapRow(p, true));
      if (cat !== 'all') rows = rows.filter(r => r.cat === cat);
      if (q) rows = rows.filter(r => (r.name + ' ' + r.brand + ' ' + r.gtin).toLowerCase().includes(q.toLowerCase()));
      return { rows, total: rows.length, counts: COUNTS };
    }
    if (q) {
      let rows = (await j(base + '&q=' + encodeURIComponent(q))).products.map(p => mapRow(p, false));
      if (cat !== 'all') rows = rows.filter(r => r.cat === cat);
      if (status !== 'all') rows = rows.filter(r => r.status === status);
      return { rows, total: rows.length, counts: COUNTS };
    }
    let node = '';
    if (cat === 'Ukategorisert' || (status === 'draft' && cat === 'all')) node = 'uncat';
    else if (status === 'draft') return { rows: [], total: 0, counts: COUNTS }; // uncategorized rows have no category
    else if (cat !== 'all') node = (SEG && SEG[cat]) || '';
    const d = await j(base + (node ? '&node=' + node : '') + (page ? '&offset=' + page * 400 : ''));
    let rows = d.products.map(p => mapRow(p, false));
    let total = d.meta.total ?? rows.length;
    if (status === 'live' && !node) { rows = rows.filter(r => r.status === 'live'); total = COUNTS ? COUNTS.live : rows.length; }
    return { rows, total, counts: COUNTS };
  }

  // ---- actions ---------------------------------------------------
  window.onAdminAction = async (kind, payload) => {
    const row = payload && payload.row;
    switch (kind) {
      case 'product.save': {
        const { fields, specs } = payload;
        if (fields.cat !== row.cat) return 'category is a GPC brick pin — clear it via PATCH brick, not this select';
        const patch = {};
        if (fields.name.trim() && fields.name !== row.name) patch.name = fields.name;
        if (fields.brand.trim() && fields.brand !== row.brand && fields.brand !== '—') patch.brand = fields.brand;
        if (JSON.stringify(specs) !== JSON.stringify(row.specs || {})) patch.specs = specs;
        if (fields.status !== row.status) {
          if (row.status === 'hidden' && fields.status === 'live') patch.hidden = null;
          else if (fields.status === 'hidden') patch.hidden = 1;
          else return 'only hidden ⇄ live is a real transition (draft = uncategorized, the GPC resolver owns it)';
        }
        const g = digits(fields.gtin);
        if (g && g !== digits(row.gtin)) {
          const r = await w('/api/admin/alias', 'POST', { ean: g, product_id: row.id });
          if (r !== true) return 'GTIN alias: ' + r;
        }
        if (Object.keys(patch).length) {
          const r = await w('/api/admin/products/' + encodeURIComponent(row.id), 'PATCH', patch);
          if (r !== true) return r;
        }
        return true;
      }
      case 'mod.act': // v1: every queue row is a review; publish = keep visible
        return w('/api/admin/reviews/' + row.rid, 'PATCH', { hidden: payload.ok ? 0 : 1 });
      case 'user.block':
        return w('/api/admin/users/' + row.uid, 'PATCH', { blocked: payload.on ? 1 : 0 });
      case 'merchant.reject':
        return w('/api/admin/joins/' + row.jid, 'DELETE');
      case 'user.export':
        return 'not wired — the user can self-export under Account';
      case 'merchant.advance': {
        const r = await w('/api/admin/joins/' + row.jid, 'PATCH', { stage: payload.to });
        // upstream's apply() only sets stage/crawl/liveSince — a feed-stage
        // card renders issues.length, so attach it before the re-render
        if (r === true && payload.to === 'feed') row.issues = row.issues || [];
        return r;
      }
      case 'merchant.revalidate':
        return 'feed validation is a manual step (ONBOARDING.md)';
      case 'flag.toggle':
        return 'flags are deploy-time (wrangler.jsonc + TWEAK_DEFAULTS)';
      case 'banner.set':
        return 'the announcement banner is not built yet';
      default: // product.merge/publish/resolve, offer.unlink, crawler.*, user.erase
        return 'not wired yet (plans/admin-console.md)';
    }
  };

  async function hydrate(email) {
    if (email) { ADMIN.me = email; }
    const [ov, page, joins, reviews, users, audit, crawlers] = await Promise.all([
      j('/api/admin/overview'),
      j('/api/products?admin=1'), // one PAGE_MAX page — cats select, prodOf, tree
      j('/api/admin/joins'),
      j('/api/admin/reviews'),
      j('/api/admin/users'),
      j('/api/admin/audit'),
      j('/api/admin/crawlers'),
    ]);
    // segment display-name → code, from the served taxonomy tree roots
    SEG = {};
    for (const n of page.meta.tree || []) SEG[n.name] = n.code;
    COUNTS = { all: ov.products, live: ov.products - ov.uncat, draft: ov.uncat, flagged: 0, dupe: 0, hidden: ov.hidden };
    const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
    ADMIN.stats.kpi.push(
      { l: 'Products', v: ov.products, d: ov.uncat + ' uncategorized', k: ov.uncat ? '' : 'ok' },
      { l: 'Offers tracked', v: ov.offers, d: ov.freshOffers + ' refreshed < 1 h' },
      { l: 'Shops with offers', v: ov.shops },
      { l: 'Registered users', v: ov.users, d: ov.watches + ' active watches' },
      { l: 'Reviews', v: ov.reviews },
      { l: 'Alerts sent · 24 h', v: ov.alerts24h },
    );
    // the health panel's disp is a hardcoded % suffix upstream — shares only
    ADMIN.stats.health.push(
      { l: 'Offers refreshed < 1 h', v: pct(ov.freshOffers, ov.offers), k: 'ok' },
      { l: 'Uncategorized products', v: pct(ov.uncat, ov.products), k: 'warn' },
      { l: 'Hidden backlog', v: pct(ov.hidden, ov.products + ov.hidden), k: 'warn' },
      { l: 'GPC queue unresolved', v: pct(ov.gpcQueued, ov.products), k: ov.gpcQueued ? 'warn' : 'ok' },
    );
    ADMIN.stats.totals.products = ov.products;
    ADMIN.stats.totals.users = ov.users;
    // real triage state only — no invented incidents
    if (ov.joins) ADMIN.stats.issues.push({ ic: 'store', t: ov.joins + ' merchant application' + (ov.joins > 1 ? 's' : '') + ' waiting', d: 'review under Webstores', tab: 'webstores' });
    if (ov.imagesFailed) ADMIN.stats.issues.push({ ic: 'image-off', k: 'warn', t: ov.imagesFailed + ' product images failed to fetch', d: 'drain retries queued-before-failed hourly', tab: 'overview' });
    if (ov.gpcQueued) ADMIN.stats.issues.push({ ic: 'package-search', k: 'warn', t: ov.gpcQueued + ' GTINs awaiting GPC resolution', d: 'cron drains hourly; POST /api/admin/gpc for a backfill', tab: 'products' });
    if (ov.hidden) ADMIN.stats.issues.push({ ic: 'eye-off', t: ov.hidden + ' rows in the hidden backlog', d: 'demoted + junk — triage under Products › Hidden', tab: 'products' });
    ADMIN.catalog.push(...page.products.map(p => mapRow(p, false)));
    // stage is a real column now (NULL = applied). The card shapes upstream
    // requires per stage: feed reads issues[] (none tracked — the manual
    // ONBOARDING.md check gates the advance), crawl reads a crawl object —
    // filled from a crawl_runs match on the domain's shop name, else honest
    // zeros (done: false blocks "Go live" until a real run lands).
    const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    ADMIN.merchants.push(...joins.map(m => {
      const stage = m.stage || 'applied';
      const row = {
        id: 'm' + m.id, jid: m.id, stage, name: m.domain, domain: m.domain,
        org: '—', contact: '—', email: m.email, applied: rel(m.created_at),
        products: null, feed: m.method, feedUrl: m.feed || '—',
      };
      if (stage === 'feed') row.issues = [];
      if (stage === 'crawl') {
        const key = fold(m.domain.split('.')[0]);
        const cr = crawlers.find(c => { const k = fold(c.shop); return k && key && (k === key || k.includes(key) || key.includes(k)); });
        const run = cr && cr.runs[0];
        row.crawl = run
          ? { done: true, items: run.rows, errs: run.errs, dur: fmtDur(run.dur_ms) }
          : { done: false, pct: 0, items: 0, errs: 0 };
      }
      if (stage === 'live') row.liveSince = '';
      return row;
    }));
    ADMIN.mods.push(...reviews.map(r => ({
      id: 'q' + r.id, rid: r.id, kind: 'review', user: r.user, time: rel(r.created_at),
      // prodId doubles as the display fallback in prodOf() — the name reads
      // better than an id for rows outside the loaded catalog page
      prodId: r.product || r.product_id,
      text: (r.title ? r.title + ' — ' : '') + r.body,
      status: r.hidden ? 'rejected' : 'pending',
    })));
    ADMIN.users.push(...users.users.map(u => ({
      id: 'u' + u.id, uid: u.id, name: u.name, email: u.email,
      plan: u.admin ? 'admin' : '—',
      joined: u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      alerts: u.watches, lists: u.lists, clicks: null,
      last: u.session_until ? rel(u.session_until - 30 * 864e5) : '—', // session mint time
      status: u.blocked ? 'blocked' : 'active',
    })));
    // ponytail: admins come off the 200-row users listing (newest first) —
    // fine while admins are a handful of recent manual grants; give the
    // listing an admin-first ORDER BY if the roster ever outgrows a page
    ADMIN.admins.push(...users.users.filter(u => u.admin === 1).map(u => ({ who: u.email, role: 'Admin' })));
    ADMIN.audit.push(...audit.map(a => ({ t: rel(a.at), actor: a.actor, action: a.action, target: a.target })));
    // Crawlers: shopStats (offers, freshness) + the shop's crawl_runs history.
    // Everything served — sched is '—' (crawls are manual tools/crawl.mjs
    // runs, there is no schedule), and a shop with no run history counts in
    // no status bucket rather than pretending to be healthy.
    const logT = (t) => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
    ADMIN.crawlers.push(...crawlers.map((c, i) => {
      const last = c.runs[0];
      return {
        id: 'cr' + i, shop: c.shop, kind: (last && last.kind) || 'crawler', sched: '—',
        last: minsAgo(c.updated), dur: fmtDur(last && last.dur_ms), items: c.offers,
        changed: null, errs: last ? last.errs : null,
        status: !last ? '—' : last.errs && !last.rows ? 'fail' : last.errs ? 'warn' : 'ok',
        url: '', ok: c.runs.slice().reverse().map(r => r.errs ? 0 : 1),
        note: (last && last.note) || undefined,
        log: c.runs.map(r => [logT(r.started_at),
          (r.pages == null ? '' : r.pages + ' pages → ') + (r.rows ?? '?') + ' rows, ' + (r.errs ?? '?') + ' errors (' + fmtDur(r.dur_ms) + ')' + (r.note ? ' — ' + r.note : ''),
          r.errs ? 'e' : undefined]),
      };
    }));
    AdminStore.emit();
  }

  function gate() {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:999;background:var(--paper-50,#F3F1E9);display:flex;align-items:center;justify-content:center';
    d.innerHTML = '<form style="display:flex;flex-direction:column;gap:10px;width:280px">'
      + '<b style="font-size:15px">pricy.no — admin</b>'
      + '<input name="email" type="email" placeholder="E-mail" required autocomplete="username" style="padding:10px;border:1px solid var(--ink-300,#ccc);border-radius:8px">'
      + '<input name="password" type="password" placeholder="Password" required autocomplete="current-password" style="padding:10px;border:1px solid var(--ink-300,#ccc);border-radius:8px">'
      + '<button style="padding:10px;border-radius:8px;border:0;background:var(--ink-900,#111);color:#fff;cursor:pointer">Log in</button>'
      + '<span data-err style="color:#c0362c;font-size:12px"></span></form>';
    document.body.appendChild(d);
    d.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: f.email.value, password: f.password.value }) });
      const b = await r.json().catch(() => ({}));
      if (r.ok && b.user && b.user.admin) { d.remove(); hydrate(b.user.email).catch(err => AdminStore.say(String(err))); }
      else f.querySelector('[data-err]').textContent = r.ok ? 'not an admin account' : (b.error || 'login failed');
    };
  }

  (async () => {
    try {
      const me = await j('/api/me');
      if (me.user && me.user.admin) return await hydrate(me.user.email);
    } catch (e) { if (!e.auth) console.error(e); }
    gate();
  })();
})();
