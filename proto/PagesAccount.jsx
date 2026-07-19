// ===========================================================
// Pricy.no — Account & settings (signed in)
// Sections: Profile · Notifications · Plan & billing · Privacy
// ===========================================================

const ACCT_SECTIONS = [
  { id: 'profile',       label: 'Profile',        icon: 'user' },
  { id: 'notifications', label: 'Notifications',  icon: 'bell' },
  { id: 'plan',          label: 'Plan & billing', icon: 'sparkles' },
  { id: 'privacy',       label: 'Privacy & data', icon: 'shield' },
];

function AcctField({ label, value, onChange, type = 'text' }) {
  return (
    <div className="formfield" style={{ marginBottom: 'var(--s-4)' }}>
      <label>{label}</label>
      <div className="field" style={{ height: 46, boxShadow: 'none' }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ padding: '0 14px' }} />
      </div>
    </div>
  );
}

function ChangePasswordForm({ hasPassword, onChangePassword, onDone, onToast }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    Promise.resolve(onChangePassword(current, next))
      .then(() => { onToast(hasPassword ? 'Password changed' : 'Password set'); onDone(); })
      .catch(e => setErr(e.message || 'Could not change password'))
      .finally(() => setSaving(false));
  };
  return (
    <form onSubmit={submit} style={{ marginTop: 'var(--s-4)', paddingTop: 'var(--s-4)', borderTop: '1px solid var(--ink-100)' }}>
      {hasPassword && <AcctField label="Current password" value={current} onChange={setCurrent} type="password" />}
      <AcctField label="New password" value={next} onChange={setNext} type="password" />
      {err && <div className="formhint err"><Icon name="alert-triangle" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{err}</div>}
      <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={saving}><Icon name="check" size={16} /> {hasPassword ? 'Update password' : 'Set password'}</button>
      </div>
    </form>
  );
}

function ProfileSection({ onToast, initialName, onSave, hasPassword, onChangePassword }) {
  const [name, setName] = useState(initialName || (USER.name + ' Hansen'));
  const [email, setEmail] = useState(USER.email);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const set = (fn) => (v) => { fn(v); setDirty(true); };
  const save = () => {
    setSaving(true);
    Promise.resolve(onSave ? onSave(name) : null)
      .then(() => { setDirty(false); onToast('Profile saved'); })
      .catch(() => onToast('Could not save profile'))
      .finally(() => setSaving(false));
  };
  return (
    <div className="asec">
      <div className="asec__head"><h2>Profile</h2><span className="hint">{USER.createdAt ? 'Member since ' + new Date(USER.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Member'}</span></div>
      <div className="asec__body">
        <div style={{ display: 'flex', gap: 'var(--s-5)', alignItems: 'flex-start', marginBottom: 'var(--s-4)' }}>
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{USER.initials}</div>
          <div style={{ flex: 1 }}>
            <AcctField label="Full name" value={name} onChange={set(setName)} />
            <AcctField label="Email" value={email} onChange={set(setEmail)} type="email" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'flex-end' }}>
          {!changingPw && <Btn variant="ghost" icon="key-round" onClick={() => setChangingPw(true)}>{hasPassword ? 'Change password' : 'Set password'}</Btn>}
          <Btn variant={dirty ? 'primary' : ''} icon="check" disabled={saving} onClick={save}>Save changes</Btn>
        </div>
        {changingPw && (
          <ChangePasswordForm
            hasPassword={hasPassword}
            onChangePassword={onChangePassword}
            onToast={onToast}
            onDone={() => setChangingPw(false)}
          />
        )}
      </div>
    </div>
  );
}

function NotifSection({ onToast, openPaywall, initial, onSave }) {
  const plan = usePlan();
  const [n, setN] = useState({ email: true, push: false, hits: true, lows: true, weekly: false, digest: 'instant', threshold: 'any', ...initial });
  const set = (k, v) => {
    const next = { ...n, [k]: v };
    setN(next);
    Promise.resolve(onSave ? onSave(next) : null)
      .then(() => onToast('Preference saved'))
      .catch(() => onToast('Could not save preference'));
  };
  const chip = (k, val, label) => (
    <a className={'cchip' + (n[k] === val ? ' is-on' : '')} onClick={() => set(k, val)}>{label}</a>
  );
  return (
    <React.Fragment>
      <div className="asec">
        <div className="asec__head"><h2>Channels</h2></div>
        <div className="arow">
          <div className="arow__txt"><b>Email alerts</b><p>Price drops and target hits, sent to {USER.email}.</p></div>
          <Toggle on={n.email} onChange={v => set('email', v)}></Toggle>
        </div>
        <div className="arow">
          <div className="arow__txt"><b>Push notifications</b><p>Instant alerts in your browser or on your phone.</p></div>
          <Toggle on={n.push} onChange={v => set('push', v)}></Toggle>
        </div>
        <div className="arow">
          <div className="arow__txt"><b>Weekly summary</b><p>Every Monday: what your watched products did last week.</p></div>
          <Toggle on={n.weekly} onChange={v => set('weekly', v)}></Toggle>
        </div>
        <div className={'arow' + (plan === 'plus' ? '' : ' is-locked')}>
          <div className="arow__txt">
            <b>AI deal digest <PlusTag></PlusTag> <SoonTag></SoonTag></b>
            <p>A short daily read on your watchlist: what to grab, what to wait for.</p>
          </div>
          {plan === 'plus'
            ? <Toggle on={n.hits} onChange={v => set('hits', v)}></Toggle>
            : <Btn size="sm" icon="lock" onClick={openPaywall}>Coming soon</Btn>}
        </div>
      </div>

      <div className="asec">
        <div className="asec__head"><h2>When to alert</h2></div>
        <div className="arow">
          <div className="arow__txt"><b>Timing</b><p>How fast should we tell you about a drop?</p></div>
          <div className="chipset">{chip('digest', 'instant', 'Instantly')}{chip('digest', 'daily', 'Daily digest')}{chip('digest', 'weekly', 'Weekly')}</div>
        </div>
        <div className="arow">
          <div className="arow__txt"><b>Minimum drop</b><p>Ignore noise below this size.</p></div>
          <div className="chipset">{chip('threshold', 'any', 'Any drop')}{chip('threshold', '5', 'Over 5%')}{chip('threshold', '10', 'Over 10%')}</div>
        </div>
        <div className="arow">
          <div className="arow__txt"><b>All-time lows</b><p>Always alert when a watched product hits its lowest price ever.</p></div>
          <Toggle on={n.lows} onChange={v => set('lows', v)}></Toggle>
        </div>
      </div>
    </React.Fragment>
  );
}

function PlanSection({ openPaywall, onToast }) {
  const plan = usePlan();
  const isPlus = plan === 'plus';
  return (
    <React.Fragment>
      <div className="asec">
        <div className="asec__head"><h2>Your plan</h2></div>
        <div className="asec__body">
          <div className={'planbox' + (isPlus ? ' is-plus' : '')}>
            <div>
              <div className="planbox__name">Current plan</div>
              <h3>{isPlus ? 'Pricy Plus (preview)' : 'Free'}</h3>
            </div>
            <div className="spacer"></div>
            {isPlus ? (
              <React.Fragment>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green-300)' }}>Preview · pricing subject to change</span>
                <Btn variant="ghost" style={{ color: 'var(--paper)' }} onClick={() => { window.setPlan && window.setPlan('free'); onToast('Subscription cancelled'); }}>Cancel</Btn>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-600)' }}>10 watches · standard alerts</span>
                <Btn variant="primary" icon="sparkles" onClick={openPaywall}>Preview Plus</Btn>
              </React.Fragment>
            )}
          </div>
        </div>
        {PLUS_FEATURES.map(f => (
          <div key={f.name} className={'arow' + (isPlus ? '' : ' is-locked')}>
            <div className="arow__txt">
              <b><Icon name={f.icon} size={15} /> {f.name} <PlusTag></PlusTag> <SoonTag></SoonTag></b>
              <p>{f.desc}</p>
            </div>
            {isPlus
              ? <span className="tag tag--best">Preview</span>
              : <span style={{ color: 'var(--ink-400)', display: 'flex' }}><Icon name="lock" size={16} /></span>}
          </div>
        ))}
      </div>
    </React.Fragment>
  );
}

function PrivacySection({ onToast, go, initialMarketing, onSaveMarketing }) {
  const [marketing, setMarketing] = useState(!!initialMarketing);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const doDelete = async () => {
    if (!window.deleteAccount) { go('landing'); return; }
    setDeleting(true);
    try { await window.deleteAccount(); go('landing'); }
    catch (e) { setDeleting(false); onToast('Could not delete account: ' + ((e && e.message) || 'unknown error')); }
  };
  const set = (v) => {
    setMarketing(v);
    Promise.resolve(onSaveMarketing ? onSaveMarketing(v) : null)
      .then(() => onToast('Preference saved'))
      .catch(() => onToast('Could not save preference'));
  };
  return (
    <React.Fragment>
      <div className="asec">
        <div className="asec__head"><h2>Privacy &amp; data</h2></div>
        <div className="arow">
          <div className="arow__txt"><b>Marketing emails</b><p>Occasional product news from pricy. Never from shops — we don't share your data.</p></div>
          <Toggle on={marketing} onChange={set}></Toggle>
        </div>
        <div className="arow">
          <div className="arow__txt"><b>Export my data</b><p>Watchlist, alert history and settings as JSON.</p></div>
          <Btn size="sm" icon="download" onClick={() => { if (window.exportData) { window.exportData(); onToast('Export downloaded'); } else { onToast('Export sent to ' + USER.email); } }}>Export</Btn>
        </div>
      </div>
      <div className="asec asec--danger">
        <div className="asec__head"><h2>Danger zone</h2></div>
        <div className="arow">
          <div className="arow__txt"><b>Delete account</b><p>{confirm ? 'Are you sure? This deletes your watchlist and history permanently.' : 'Permanently delete your account and all data.'}</p></div>
          {confirm ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" disabled={deleting} onClick={() => setConfirm(false)}>Keep account</Btn>
              <Btn size="sm" variant="dark" disabled={deleting} style={{ background: 'var(--up-600)', borderColor: 'var(--up-600)' }} onClick={doDelete}>{deleting ? 'Deleting…' : 'Yes, delete'}</Btn>
            </div>
          ) : (
            <Btn size="sm" icon="trash-2" onClick={() => setConfirm(true)}>Delete…</Btn>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

function AccountPage({ go, tab: tab0, me, onSaveProfile, onSaveSettings, onChangePassword }) {
  const settings = (me && me.settings) || {};
  const [tab, setTab] = useState(ACCT_SECTIONS.some(s => s.id === tab0) ? tab0 : 'profile');
  const [toast, setToast] = useState('');
  const [paywall, setPaywall] = useState(false);
  const tRef = useRef(null);
  const onToast = (msg) => { setToast(msg); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToast(''), 2200); };
  const openPaywall = () => setPaywall(true);
  return (
    <div className="screen" data-screen-label="Account & settings">
      <AppHeader go={go} active="account" onLogout={() => go('landing')} />
      <div className="page acct">
        <h1>Account</h1>
        <div className="acct__grid">
          <nav className="acct__nav">
            {ACCT_SECTIONS.map(s => (
              <a key={s.id} className={tab === s.id ? 'is-on' : ''} onClick={() => setTab(s.id)}>
                <Icon name={s.icon} size={15} /> {s.label}
              </a>
            ))}
          </nav>
          <div>
            {tab === 'profile' && <ProfileSection onToast={onToast} initialName={me && me.user && me.user.name} onSave={onSaveProfile} hasPassword={me && me.user && me.user.hasPassword} onChangePassword={onChangePassword} />}
            {tab === 'notifications' && <NotifSection onToast={onToast} openPaywall={openPaywall} initial={settings} onSave={onSaveSettings} />}
            {tab === 'plan' && <PlanSection openPaywall={openPaywall} onToast={onToast} />}
            {tab === 'privacy' && <PrivacySection onToast={onToast} go={go} initialMarketing={settings.marketing} onSaveMarketing={onSaveSettings ? (v) => onSaveSettings({ marketing: v }) : undefined} />}
          </div>
        </div>
      </div>
      {toast && <Toast>{toast}</Toast>}
      {paywall && <PlusModal onClose={() => setPaywall(false)} go={go} />}
    </div>
  );
}

Object.assign(window, { AccountPage });
