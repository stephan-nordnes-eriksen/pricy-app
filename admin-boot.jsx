// ===========================================================
// admin-boot.jsx — repo-owned, NOT synced (plans/admin-console.md).
// build.js slots this right after AdminData.jsx in dist/admin.js, so the
// mock ADMIN arrays are emptied before any component can render them.
// Gate: a users.admin session (granted manually via wrangler d1 execute).
// Hydration is the READ side only — the page's action buttons still mutate
// local state and toast until upstream grows action hooks (see the plan's
// upstream prompt); the served data is real, the writes are not yet.
// ===========================================================
(() => {
  // ---- no mock data ever renders --------------------------------
  for (const k of ['catalog', 'users', 'mods', 'merchants', 'crawlers', 'flags', 'audit', 'admins']) ADMIN[k].length = 0;
  ADMIN.stats.kpi.length = 0;
  ADMIN.stats.searches.length = 0;
  ADMIN.stats.health.length = 0;
  ADMIN.stats.clicks14 = [0]; // Cols needs a finite max; renders one empty bar
  ADMIN.banner.on = false;

  const minsAgo = (t) => t ? Math.max(0, Math.round((Date.now() - t) / 60000)) : NaN;
  const rel = (t) => t ? agoM(minsAgo(t)) : '—';
  const j = async (path) => {
    const r = await fetch(path, { headers: { accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('unauthorized'), { auth: true });
    if (!r.ok) throw new Error(path + ' → ' + r.status);
    return r.json();
  };

  const mapRow = (p, hidden) => ({
    id: p.id, name: p.name, brand: p.brand || '—',
    cat: p.cat, icon: p.icon || 'package',
    gtin: p.ean || '—', offers: p.shops, best: p.best,
    upd: minsAgo(Math.max(0, ...(p.offers || []).map(o => o.updated_at || 0))),
    // real vocabulary: live = served with a brick, draft = Ukategorisert,
    // hidden = the demoted/junk backlog (visible under the "All" seg only)
    status: hidden ? 'hidden' : (p.brick ? 'live' : 'draft'),
    specs: p.specs && p.specs.groups ? {} : (p.specs || {}),
  });

  async function hydrate() {
    const [ov, page, hiddenPage, joins, reviews, users] = await Promise.all([
      j('/api/admin/overview'),
      j('/api/products?admin=1'), // one PAGE_MAX page, ranked by offer count
      j('/api/products?hidden=1'),
      j('/api/admin/joins'),
      j('/api/admin/reviews'),
      j('/api/admin/users'),
    ]);
    const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
    ADMIN.stats.kpi.push(
      { l: 'Products', v: ov.products, d: ov.uncat + ' uncategorized', k: ov.uncat ? '' : 'ok' },
      { l: 'Offers tracked', v: ov.offers, d: ov.freshOffers + ' refreshed < 1 h' },
      { l: 'Shops with offers', v: ov.shops },
      { l: 'Registered users', v: ov.users, d: ov.watches + ' active watches' },
      { l: 'Reviews', v: ov.reviews },
      { l: 'Alerts sent · 24 h', v: ov.alerts24h },
    );
    // the panel's disp is hardcoded to a % suffix upstream — percentages only
    ADMIN.stats.health.push(
      { l: 'Offers refreshed < 1 h', v: pct(ov.freshOffers, ov.offers), k: 'ok' },
      { l: 'Uncategorized products', v: pct(ov.uncat, ov.products), k: 'warn' },
      { l: 'Hidden backlog', v: pct(ov.hidden, ov.products + ov.hidden), k: 'warn' },
      { l: 'GPC queue unresolved', v: pct(ov.gpcQueued, ov.products), k: ov.gpcQueued ? 'warn' : 'ok' },
    );
    ADMIN.catalog.push(
      ...page.products.map(p => mapRow(p, false)),
      ...hiddenPage.products.map(p => mapRow(p, true)),
    );
    ADMIN.merchants.push(...joins.map(m => ({
      id: 'm' + m.id, stage: 'applied', name: m.domain, domain: m.domain,
      org: '—', contact: '—', email: m.email, applied: rel(m.created_at),
      products: null, feed: m.method, feedUrl: m.feed || '—',
    })));
    ADMIN.mods.push(...reviews.map(r => ({
      id: 'q' + r.id, rid: r.id, kind: 'review', user: r.user, time: rel(r.created_at),
      // prodId doubles as the display fallback in prodOf() — the name reads
      // better than an id for rows outside the loaded catalog page
      prodId: r.product || r.product_id,
      text: (r.title ? r.title + ' — ' : '') + r.body,
      status: r.hidden ? 'rejected' : 'pending',
    })));
    ADMIN.users.push(...users.users.map(u => ({
      id: 'u' + u.id, name: u.name, email: u.email,
      plan: u.admin ? 'admin' : '—',
      joined: u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      alerts: u.watches, lists: u.lists, clicks: null,
      last: u.session_until ? rel(u.session_until - 30 * 864e5) : '—', // session mint time
      status: 'active',
    })));
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
      if (r.ok && b.user && b.user.admin) { d.remove(); hydrate().catch(err => AdminStore.say(String(err))); }
      else f.querySelector('[data-err]').textContent = r.ok ? 'not an admin account' : (b.error || 'login failed');
    };
  }

  (async () => {
    try {
      const me = await j('/api/me');
      if (me.user && me.user.admin) return await hydrate();
    } catch (e) { if (!e.auth) console.error(e); }
    gate();
  })();
})();
