// ===========================================================
// Pricy.no ADMIN — Moderation + Users + System
// ===========================================================
const MOD_META = { review: { ic: 'star', l: 'Review' }, report: { ic: 'flag', l: 'Price report' }, correction: { ic: 'pencil-line', l: 'Correction' }, photo: { ic: 'image', l: 'Photo' } };
const MOD_ACTS = { review: ['Publish', 'Reject'], report: ['Confirm & flag offer', 'Dismiss'], correction: ['Apply change', 'Dismiss'], photo: ['Approve', 'Reject'] };

function AdminMods() {
  const A = useAdmin(); const [kind, setKind] = useState('all');
  const items = A.mods.filter(m => kind === 'all' || m.kind === kind);
  const pn = k => A.mods.filter(m => m.status === 'pending' && (k === 'all' || m.kind === k)).length;
  const prodOf = m => (A.catalog.find(r => r.id === m.prodId) || {}).name || m.prodId;
  const act = (m, ok) => {
    const verb = { review: ok ? 'Review published' : 'Review rejected', report: ok ? 'Price report confirmed — offer flagged' : 'Price report dismissed', correction: ok ? 'Correction applied' : 'Correction dismissed', photo: ok ? 'Photo approved' : 'Photo rejected' }[m.kind];
    admAct('mod.act', { row: m, ok }, () => {
      m.status = ok ? 'approved' : 'rejected';
      if (ok && m.kind === 'correction' && m.field === 'GTIN') { const r = A.catalog.find(r => r.id === m.prodId); if (r) r.gtin = m.neu; }
      AdminStore.say(verb, verb, prodOf(m) + (m.shop ? ' @ ' + m.shop : ''));
    });
  };
  return (<div className="adm-main" data-screen-label="Admin — Moderation">
    <div className="adm-bar">
      <Seg value={kind} options={[{ v: 'all', l: 'All', n: pn('all') }, { v: 'review', l: 'Reviews', n: pn('review') }, { v: 'report', l: 'Price reports', n: pn('report') }, { v: 'correction', l: 'Corrections', n: pn('correction') }, { v: 'photo', l: 'Photos', n: pn('photo') }]} onChange={setKind} />
      {A.stats.totals.spamCaught7d != null && <span className="adm-bar__count">Auto-filters caught {fmt(A.stats.totals.spamCaught7d)} spam items this week — nothing for you to do there</span>}
    </div>
    <Panel flush>
      {items.map(m => (<div key={m.id} className={'qrow' + (m.status !== 'pending' ? ' is-done' : '')}>
        <span className="qrow__ic"><Icon name={MOD_META[m.kind].ic} size={16} /></span>
        <div>
          <div className="qrow__meta">
            <Pill>{MOD_META[m.kind].l}</Pill>
            <b>{m.user}</b><span>·</span><span>{m.time}</span><span>·</span><span>{prodOf(m)}</span>
            {m.shop && <React.Fragment><span>·</span><span>at <b>{m.shop}</b></span></React.Fragment>}
            {m.rating && <span className="qrow__stars">{'★'.repeat(m.rating)}{'☆'.repeat(5 - m.rating)}</span>}
            {m.flag && <Pill kind="fail">{m.flag}</Pill>}
          </div>
          <div className="qrow__txt">{m.text}</div>
          {m.kind === 'correction' && <div className="qrow__diff"><span className="mono">{m.field}:</span><span className="old">{m.old}</span>→<span className="new">{m.neu}</span></div>}
        </div>
        <div className="qrow__acts">
          {m.status === 'pending' ? (<React.Fragment>
            <Btn size="sm" variant="primary" icon="check" onClick={() => act(m, true)}>{MOD_ACTS[m.kind][0]}</Btn>
            <Btn size="sm" variant="ghost" icon="x" onClick={() => act(m, false)}>{MOD_ACTS[m.kind][1]}</Btn>
          </React.Fragment>) : <Pill kind={m.status === 'approved' ? 'ok' : 'fail'}>{m.status}</Pill>}
        </div>
      </div>))}
      {!items.length && <div className="adm-empty">Queue is empty — nice.</div>}
    </Panel>
  </div>);
}

// ---- Users ------------------------------------------------
function AdminUsers() {
  const A = useAdmin(); const [q, setQ] = useState(''); const [arm, setArm] = useArm();
  const rows = A.users.filter(u => !q || (u.name + ' ' + u.email).toLowerCase().includes(q.toLowerCase()));
  const block = u => { const on = u.status !== 'blocked'; setArm(null); admAct('user.block', { row: u, on }, () => { u.status = on ? 'blocked' : 'active'; u.note = on ? 'Blocked manually — ' + ADMIN.me : null; AdminStore.say(u.name + (on ? ' blocked' : ' unblocked'), 'User ' + (on ? 'blocked' : 'unblocked'), u.email); }); };
  const erase = u => { setArm(null); admAct('user.erase', { row: u }, () => { const i = ADMIN.users.indexOf(u); if (i > -1) ADMIN.users.splice(i, 1); AdminStore.say('User data erased', 'GDPR erasure completed', u.email); }); };
  return (<div className="adm-main" data-screen-label="Admin — Users">
    <div className="adm-bar">
      <div className="field"><Icon name="search" size={16} style={{ color: 'var(--ink-400)', marginLeft: 12 }} /><input placeholder="Search name or e-mail…" value={q} onChange={e => setQ(e.target.value)} /></div>
      {A.stats.totals.users != null && <span className="adm-bar__count">{fmt(A.stats.totals.users)} registered — showing {rows.length}</span>}
    </div>
    <Panel flush>
      <table className="atbl">
        <thead><tr><th>User</th><th>Plan</th><th>Joined</th><th className="num">Alerts</th><th className="num">Lists</th><th className="num">Clicks · 30 d</th><th>Last active</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map(u => (<tr key={u.id}>
          <td><span className="acell"><span className="acell__t"><b>{u.name}</b><span>{u.email}</span>{u.note && <span className="unote">{u.note}</span>}</span></span></td>
          <td><Pill kind={u.plan === 'plus' ? 'plus' : ''}>{u.plan}</Pill></td>
          <td className="mono dim">{u.joined}</td>
          <td className="num">{fmt(u.alerts)}</td><td className="num">{u.lists}</td><td className="num">{u.clicks}</td>
          <td className="mono dim">{u.last}</td>
          <td><Pill kind={u.status === 'active' ? 'ok' : u.status} dot>{u.status}</Pill></td>
          <td><span className="arow-acts">
            <IBtn icon="download" title="Export user data (GDPR)" onClick={() => admAct('user.export', { row: u }, () => AdminStore.say('Data export queued — sent to ' + u.email, 'GDPR export queued', u.email))} />
            <IBtn icon={u.status === 'blocked' ? 'undo-2' : 'ban'} bad={u.status !== 'blocked'} confirm={arm === 'b' + u.id} title={u.status === 'blocked' ? 'Unblock' : arm === 'b' + u.id ? 'Click again to confirm' : 'Block user'} onClick={() => (u.status === 'blocked' || arm === 'b' + u.id) ? block(u) : setArm('b' + u.id)} />
            {u.status === 'deletion' && <IBtn icon="trash-2" bad confirm={arm === 'e' + u.id} title={arm === 'e' + u.id ? 'Click again to confirm erasure' : 'Erase all user data now'} onClick={() => arm === 'e' + u.id ? erase(u) : setArm('e' + u.id)} />}
          </span></td>
        </tr>))}</tbody>
      </table>
      {!rows.length && <div className="adm-empty">No users match</div>}
    </Panel>
  </div>);
}

// ---- System -----------------------------------------------
function AdminSystem() {
  const A = useAdmin();
  return (<div className="adm-main" data-screen-label="Admin — System">
    <div className="adm-row adm-row--2">
      <Panel title="Feature flags" hint="take effect immediately" flush>
        {A.flags.map(fl => (<div key={fl.key} className="flagrow">
          <Switch on={fl.on} onChange={v => admAct('flag.toggle', { row: fl, on: v }, () => { fl.on = v; AdminStore.say(fl.label + (v ? ' enabled' : ' disabled'), 'Flag ' + (v ? 'enabled' : 'disabled'), fl.label); })} />
          <span className="flagrow__t"><b>{fl.label}</b><span>{fl.desc}</span></span>
          <Pill kind={fl.on ? 'ok' : 'off'}>{fl.on ? 'on' : 'off'}</Pill>
        </div>))}
      </Panel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Panel title="Announcement banner" hint="shows on every page">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Switch on={A.banner.on} onChange={v => admAct('banner.set', { on: v, text: A.banner.text }, () => { A.banner.on = v; AdminStore.say('Banner ' + (v ? 'enabled' : 'disabled'), 'Banner ' + (v ? 'enabled' : 'disabled'), A.banner.text.slice(0, 40) + '…'); })} />
            <div className="f" style={{ flex: 1 }}><textarea value={A.banner.text} onChange={e => { A.banner.text = e.target.value; AdminStore.emit(); }} onBlur={() => admAct('banner.set', { on: A.banner.on, text: A.banner.text }, () => { })}></textarea></div>
          </div>
        </Panel>
        <Panel title="Admin access" flush>
          {A.admins.map(a => (<div key={a.who} className="flagrow">
            <span className="flagrow__t"><b>{a.who}</b><span>full audit trail retained</span></span>
            <Pill kind={a.role === 'Owner' ? 'plus' : ''}>{a.role}</Pill>
          </div>))}
        </Panel>
      </div>
    </div>
    <Panel title="Audit log" hint="every admin action, newest first" flush>
      <table className="atbl">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
        <tbody>{A.audit.map((a, i) => (<tr key={i}>
          <td className="mono dim" style={{ whiteSpace: 'nowrap' }}>{a.t}</td>
          <td className="mono">{a.actor}</td>
          <td>{a.action}</td>
          <td className="mono dim">{a.target}</td>
        </tr>))}</tbody>
      </table>
    </Panel>
  </div>);
}
Object.assign(window, { AdminMods, AdminUsers, AdminSystem });
