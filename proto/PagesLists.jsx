// ===========================================================
// Pricy.no — Lists v2: index, detail, share modal, save-to-list popover
// Layered over WatchStore via ListStore (ListsData.jsx)
// ===========================================================

function AvStack({ people, max = 3 }) {
  if (!people || !people.length) return null;
  return <span className="avstack">{people.slice(0, max).map(p => <span key={p.initials} className="avchip" title={p.name}>{p.initials}</span>)}{people.length > max && <span className="avchip avchip--more">+{people.length - max}</span>}</span>;
}
function GiftTag() { return <span className="gift-tag"><Icon name="gift" size={10} /> Gave</span>; }

// ---- save-to-list popover (chevron next to bookmark, or labelled trigger) ----
function SaveMenu({ p, label, align }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nm, setNm] = useState('');
  const ref = useRef(null);
  useListStore(); useWatchStore();
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCreating(false); } };
    const k = e => { if (e.key === 'Escape') { setOpen(false); setCreating(false); } };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  const create = () => { const v = nm.trim(); if (!v) return; const l = ListStore.create(v); ListStore.addTo(l.id, p.id); setNm(''); setCreating(false); };
  return (
    <span className={'savemenu' + (open ? ' is-open' : '') + (align === 'left' ? ' savemenu--left' : '')} ref={ref} onClick={e => e.stopPropagation()}>
      {label ? (
        <button type="button" className="savemenu__lbl" onClick={() => setOpen(o => !o)}><Icon name="list-plus" size={15} /> {label} <Icon name="chevron-down" size={13} /></button>
      ) : (
        <button type="button" className="savemenu__chev" title="Lagre i liste…" aria-label="Lagre i liste" onClick={() => setOpen(o => !o)}><Icon name="chevron-down" size={13} /></button>
      )}
      {open && (
        <div className="lpop">
          <div className="lpop__h">Lagre i liste</div>
          <button type="button" className={'lpop__row' + (WatchStore.has(p.id) ? ' is-on' : '')} onClick={() => WatchStore.toggle(p.id, Math.round((p.best || 0) * 0.92 / 10) * 10)}>
            <span className="lpop__box"><Icon name="check" size={12} /></span><Icon name="bookmark" size={13} /><span className="lpop__name">Overvåket</span><span className="lpop__n">{WatchStore.items.length}</span>
          </button>
          {ListStore.lists.map(l => (
            <button type="button" key={l.id} className={'lpop__row' + (l.items.includes(p.id) ? ' is-on' : '')} onClick={() => ListStore.toggleIn(l.id, p.id)}>
              <span className="lpop__box"><Icon name="check" size={12} /></span><Icon name={l.icon} size={13} /><span className="lpop__name">{l.name}</span><span className="lpop__n">{l.items.length}</span>
            </button>
          ))}
          {creating ? (
            <div className="lpop__create"><input autoFocus placeholder="Navn på listen" value={nm} onChange={e => setNm(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} /><button type="button" onClick={create} aria-label="Opprett liste"><Icon name="check" size={13} /></button></div>
          ) : (
            <button type="button" className="lpop__new" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> Ny liste</button>
          )}
        </div>
      )}
    </span>
  );
}

// ---- share modal (link, people, gift note, view-as toggle) ----
function ShareModal({ l, viewAs, setViewAs, onClose }) {
  const [toast, setToast] = useState(false);
  const link = 'pricy.no/l/h7k2f';
  const copy = () => { try { navigator.clipboard && navigator.clipboard.writeText('https://' + link).catch(() => {}); } catch (e) {} setToast(true); setTimeout(() => setToast(false), 2200); };
  const gift = l.shared && l.shared.gift;
  const people = (l.shared && l.shared.people) || [];
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pmodal" role="dialog" aria-label={'Del ' + l.name}>
        <div className="pmodal__head">
          <div><span className="t-label" style={{ color: 'var(--green-300)' }}>Delt liste</span><h2>{l.name}</h2></div>
          <button className="x" onClick={onClose} aria-label="Lukk"><Icon name="x" size={20} /></button>
        </div>
        <div className="pmodal__body">
          <div className="share__linkrow">
            <span className="share__link"><Icon name="link" size={14} /> {link}</span>
            <Btn variant="primary" icon="copy" onClick={copy}>Kopier</Btn>
          </div>
          <div className="share__people">
            <span className="t-label">Invitert ({people.length})</span>
            {people.length === 0 && <div className="share__person" style={{ color: 'var(--ink-600)' }}>Ingen inviterte ennå — del lenken over.</div>}
            {people.map(pp => <div key={pp.initials} className="share__person"><span className="avchip">{pp.initials}</span><span className="share__pname">{pp.name}</span><span className="share__prole">Medlem</span></div>)}
            <div className="share__rolenote">Medlemmer ser priser og kan huke av kjøp. Bare du kan endre listen.</div>
          </div>
          {gift && <div className="share__gift"><Icon name="gift" size={15} /><span>Overraskelsen er trygg — eieren ser ikke hvem som har kjøpt hva.</span></div>}
          <div className="share__viewas">
            <div><b>Se som mottaker</b><span>Forhåndsvis hva de du deler med ser.</span></div>
            <Toggle on={viewAs === 'member'} onChange={v => setViewAs(v ? 'member' : 'owner')} />
          </div>
        </div>
      </div>
      {toast && <Toast>Lenke kopiert</Toast>}
    </div>
  );
}

// ---- list cards (index) ----
function ListCard({ l, go }) {
  const n = l.items.length, sum = ListStore.sum(l), gift = l.shared && l.shared.gift, b = ListStore.boughtCount(l);
  return (
    <div className="lcard" onClick={() => l.system ? go('alerts') : go('lists', { id: l.id })}>
      <span className="lcard__ic"><Icon name={l.icon} size={20} /></span>
      {l.system && <span className="lcard__sys">Prisvarsler</span>}
      <div className="lcard__name">{l.name} {gift && <GiftTag />}</div>
      <div className="lcard__meta">{n} {n === 1 ? 'vare' : 'varer'}{gift ? ' · ' + b + ' av ' + n + ' kjøpt' : ''}{l.system ? ' · med prismål' : ''}</div>
      <div className="lcard__foot">
        <span className="lcard__sum">kr {fmt(sum)}</span>
        {l.shared ? <AvStack people={l.shared.people} /> : <span className="lcard__priv" title={l.system ? 'Bare deg' : 'Privat liste'}><Icon name="lock" size={13} /></span>}
      </div>
    </div>
  );
}

function ListsIndex({ go }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const create = () => { const v = name.trim(); if (!v) return; ListStore.create(v); setName(''); setCreating(false); };
  return (
    <React.Fragment>
      <div className="al__head">
        <div>
          <h1>Lister</h1>
          <div className="sub">{ListStore.lists.length + 1} lister · del med familien — prisene følger med</div>
        </div>
        <Btn variant="primary" icon="plus" onClick={() => setCreating(true)}>Ny liste</Btn>
      </div>
      <div className="lcards">
        {ListStore.all().map(l => <ListCard key={l.id} l={l} go={go} />)}
        <div className={'lcard lcard--new'} onClick={() => !creating && setCreating(true)}>
          {creating ? (
            <div className="lcard__create" onClick={e => e.stopPropagation()}>
              <input autoFocus placeholder="Navn på listen" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="primary" size="sm" onClick={create}>Opprett</Btn>
                <Btn variant="ghost" size="sm" onClick={() => { setCreating(false); setName(''); }}>Avbryt</Btn>
              </div>
            </div>
          ) : (
            <React.Fragment>
              <span className="lcard__ic lcard__ic--new"><Icon name="plus" size={20} /></span>
              <div className="lcard__name">Ny liste</div>
              <div className="lcard__meta">Samle produkter — for hytta, gavene, oppussingen.</div>
            </React.Fragment>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

// ---- detail rows: Alerts row anatomy minus target-price controls ----
function ListRow({ l, pid, viewAs, go }) {
  const p = WatchStore.prod(pid);
  if (!p) return null;
  const gift = l.shared && l.shared.gift;
  const bought = gift && l.bought ? l.bought[pid] : null;
  const owner = viewAs !== 'member';
  const mine = bought && bought.by === 'Du';
  return (
    <div className={'lrow' + (bought ? ' is-bought' : '')}>
      <div className="wrow__img"><ProdImg p={p} fill size={24} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="alrow__name" onClick={() => go('product', { id: p.id })}>{p.name}</div>
        <div className="alrow__meta">
          <span>{p.brand}</span><span>{p.shops} shops</span>
          {bought && (owner
            ? <span className="tag" style={{ fontSize: 9 }}>Kjøpt</span>
            : <span className="tag tag--best" style={{ fontSize: 9 }}>Kjøpt av {mine ? 'deg' : bought.by}</span>)}
        </div>
      </div>
      <div>
        <div className="alrow__lbl">Best nå</div>
        <Price value={p.best} size={17}></Price>
      </div>
      <div className="lrow__delta">{p.drop > 0 ? <Delta pct={-p.drop} /> : null}</div>
      <div className="lrow__act">
        {!owner && gift && (!bought || mine) && (
          <button type="button" className={'ckoff' + (bought ? ' is-on' : '')} onClick={() => ListStore.markBought(l.id, pid, 'Du')}>
            <Icon name="check" size={13} /> {bought ? 'Kjøpt av deg' : 'Huk av'}
          </button>
        )}
        {owner && <button className="iconbtn danger" title="Fjern fra listen" onClick={() => ListStore.removeFrom(l.id, pid)}><Icon name="x" size={16} /></button>}
      </div>
    </div>
  );
}

function ListDetail({ l, go }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(l.name);
  const [share, setShare] = useState(false);
  const [viewAs, setViewAs] = useState('owner');
  const gift = l.shared && l.shared.gift;
  const n = l.items.length, b = ListStore.boughtCount(l);
  const hasOptimizer = !!window.OptimizerPage;
  const saveName = () => { ListStore.rename(l.id, name); setRenaming(false); };
  return (
    <React.Fragment>
      <a className="quietlink" onClick={() => go('lists')}><Icon name="arrow-left" size={13} /> Alle lister</a>
      <div className="li__head">
        <div className="li__title">
          <span className="lcard__ic"><Icon name={l.icon} size={20} /></span>
          {renaming ? (
            <span className="li__rename">
              <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()} aria-label="Nytt navn" />
              <button onClick={saveName} aria-label="Lagre navn"><Icon name="check" size={16} /></button>
            </span>
          ) : (
            <h1 onClick={() => { setName(l.name); setRenaming(true); }} title="Gi listen nytt navn">{l.name} <Icon name="pencil" size={15} /></h1>
          )}
          {gift && <GiftTag />}
        </div>
        <div className="sub">{n} {n === 1 ? 'vare' : 'varer'} · sum best-pris kr {fmt(ListStore.sum(l))}{gift ? ' · ' + b + ' av ' + n + ' kjøpt' : ''}</div>
        <div className="li__actions">
          {l.shared && <AvStack people={l.shared.people} />}
          <Btn icon="share-2" onClick={() => { ListStore.share(l.id); setShare(true); }}>Del</Btn>
          <span className="li__gift"><span className="t-label">Gavemodus</span><Toggle on={!!gift} onChange={v => ListStore.setGift(l.id, v)} /></span>
          {hasOptimizer && <Btn variant="primary" onClick={() => go('optimizer', { id: l.id })}>Optimaliser kjøpet →</Btn>}
        </div>
      </div>
      {viewAs === 'member' && (
        <div className="undo-bar">
          <span>Du ser listen som mottaker — huk av det du har kjøpt. Eieren ser bare antallet.</span>
          <a onClick={() => setViewAs('owner')}>Tilbake til eier</a>
        </div>
      )}
      {n === 0 ? (
        <div className="empty">
          <div className="empty__ic"><Icon name="list-plus" size={40} /></div>
          <h2>Listen er tom</h2>
          <p>Finn et produkt og velg «Lagre i liste» fra bokmerke-knappen.</p>
          <Btn variant="primary" icon="search" onClick={() => go('browse')}>Bla i kategorier</Btn>
        </div>
      ) : (
        <div className="watchlist">
          {l.items.map(pid => <ListRow key={pid} l={l} pid={pid} viewAs={viewAs} go={go} />)}
        </div>
      )}
      {gift && viewAs !== 'member' && <div className="li__giftnote"><Icon name="eye-off" size={13} /> Gavemodus på — du ser hvor mange som er kjøpt, men aldri hvem som kjøpte hva.</div>}
      {share && <ShareModal l={l} viewAs={viewAs} setViewAs={setViewAs} onClose={() => setShare(false)} />}
    </React.Fragment>
  );
}

function ListsPage({ go, params }) {
  useListStore(); useWatchStore();
  const l = params && params.id ? ListStore.get(params.id) : null;
  const detail = l && !l.system;
  return (
    <div className="screen" data-screen-label={detail ? 'List: ' + l.name : 'Lists'}>
      <AppHeader go={go} active="alerts" onLogout={() => go('landing')} />
      <div className="page li">
        {detail ? <ListDetail key={l.id} l={l} go={go} /> : <ListsIndex go={go} />}
      </div>
    </div>
  );
}

Object.assign(window, { ListsPage, SaveMenu, AvStack, GiftTag });
