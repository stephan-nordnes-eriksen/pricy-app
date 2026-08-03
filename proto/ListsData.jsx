// ===========================================================
// Pricy.no — ListStore: named lists layered OVER WatchStore.
// Watch/alert state lives in WatchStore and is never touched here.
// List shape: { id, name, icon, items:[prodId], shared: null|{role,people,gift}, bought:{[prodId]:{by,at}}, createdAt }
// Owner views must never render bought[id].by — member views may.
// ===========================================================

const ListStore = {
  lists: [
    { id: 'hytta-2026', name: 'Hytta 2026', icon: 'mountain-snow', items: ['roborock', 'hue', 'jet85', 'mocca'], shared: { role: 'owner', people: [{ name: 'Jonas Berg', initials: 'JB' }, { name: 'Silje Vik', initials: 'SV' }], gift: false }, bought: {}, createdAt: '2026-05-02' },
    { id: 'julegaver', name: 'Julegaver', icon: 'gift', items: ['lego-xwing', 'airpods', 'kindle', 'brio', 'ninja'], shared: { role: 'owner', people: [{ name: 'Jonas Berg', initials: 'JB' }, { name: 'Anne Sofie Vik', initials: 'AV' }], gift: true }, bought: { 'lego-xwing': { by: 'Jonas Berg', at: '2026-07-28' }, airpods: { by: 'Anne Sofie Vik', at: '2026-07-30' } }, createdAt: '2026-06-20' },
  ],
  ls: new Set(),
  emit() { this.lists = [...this.lists]; this.ls.forEach(f => f()); },
  sub(f) { this.ls.add(f); return () => this.ls.delete(f); },
  // System list mirroring WatchStore ids — computed on read, never stored
  watchList() { return { id: 'watch', system: true, name: 'Overvåket', icon: 'bookmark', items: WatchStore.items.map(w => w.id), shared: null, bought: {} }; },
  all() { return [this.watchList(), ...this.lists]; },
  get(id) { return id === 'watch' ? this.watchList() : this.lists.find(l => l.id === id); },
  sum(l) { return l.items.reduce((s, id) => { const p = WatchStore.prod(id); return s + (p && p.best ? p.best : 0); }, 0); },
  boughtCount(l) { return l.items.filter(id => l.bought && l.bought[id]).length; },
  has(id, prodId) { const l = this.get(id); return !!l && l.items.includes(prodId); },
  create(name) { const l = { id: 'l' + Date.now().toString(36), name: (name || 'Ny liste').trim(), icon: 'list', items: [], shared: null, bought: {}, createdAt: new Date().toISOString().slice(0, 10) }; this.lists = [...this.lists, l]; this.emit(); return l; },
  rename(id, name) { const l = this.get(id); if (!l || l.system || !String(name).trim()) return; l.name = String(name).trim(); this.emit(); },
  remove(id) { this.lists = this.lists.filter(l => l.id !== id); this.emit(); },
  addTo(id, prodId) { const l = this.get(id); if (!l || l.system || l.items.includes(prodId)) return; l.items = [...l.items, prodId]; this.emit(); },
  removeFrom(id, prodId) { const l = this.get(id); if (!l || l.system) return; l.items = l.items.filter(x => x !== prodId); if (l.bought) { l.bought = { ...l.bought }; delete l.bought[prodId]; } this.emit(); },
  toggleIn(id, prodId) { this.has(id, prodId) ? this.removeFrom(id, prodId) : this.addTo(id, prodId); },
  // Marks bought by `byName`; calling again on a bought item clears it (check-off toggle)
  markBought(id, prodId, byName) { const l = this.get(id); if (!l || l.system) return; l.bought = { ...(l.bought || {}) }; if (l.bought[prodId]) delete l.bought[prodId]; else l.bought[prodId] = { by: byName || 'Ukjent', at: new Date().toISOString().slice(0, 10) }; this.emit(); },
  share(id) { const l = this.get(id); if (!l || l.system) return null; if (!l.shared) { l.shared = { role: 'owner', people: [], gift: false }; this.emit(); } return 'pricy.no/l/h7k2f'; },
  setGift(id, v) { const l = this.get(id); if (!l || l.system) return; l.shared = l.shared ? { ...l.shared, gift: !!v } : { role: 'owner', people: [], gift: !!v }; this.emit(); },
};

function useListStore() {
  const [, tick] = useState(0);
  useEffect(() => ListStore.sub(() => tick(t => t + 1)), []);
  return ListStore.lists;
}

Object.assign(window, { ListStore, useListStore });
