// ===========================================================
// Product image gallery: PDP carousel + fullscreen lightbox
// ===========================================================

// Views per product: real images (p.imgs / p.img) when present,
// otherwise deterministic icon-based placeholder views.
function productViews(p) {
  if (p.imgs && p.imgs.length) return p.imgs.map((src, i) => ({ img: src, label: 'View ' + (i + 1) }));
  if (p.img) return [{ img: p.img, label: 'Front' }];
  const n = 3 + ((p.id || '').length % 3); // 3–5 views
  return [
    { icon: p.icon, label: 'Front' },
    { icon: p.icon, label: 'Side', tf: 'scaleX(-1) rotate(7deg)' },
    { icon: p.icon, label: 'Detail', tf: 'scale(2.4) translate(6%, 9%)' },
    { icon: p.icon, label: 'Angle', tf: 'rotate(-11deg) scale(1.08)' },
    { icon: p.icon, label: 'In the box', box: true },
  ].slice(0, n);
}

function ViewArt({ view, name, size }) {
  if (view.img) return <img src={view.img} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />;
  if (view.box) return <span className="pgal__boxart" style={{ width: Math.round(size * 1.15), height: Math.round(size * 1.15) }}><Icon name={view.icon} size={Math.round(size * 0.52)} /></span>;
  return <span style={{ display: 'flex', transform: view.tf || 'none' }}><Icon name={view.icon} size={size} /></span>;
}

function GalleryThumbs({ views, idx, onIdx, name, dark }) {
  return (
    <div className={'pgal__thumbs' + (dark ? ' pgal__thumbs--dark' : '')} role="tablist" aria-label="Product images">
      {views.map((vw, i) => (
        <button key={i} type="button" role="tab" aria-selected={i === idx} title={vw.label} className={'pgal__thumb' + (i === idx ? ' is-on' : '')} onClick={() => onIdx(i)}>
          <ViewArt view={vw} name={name} size={26} />
        </button>
      ))}
    </div>
  );
}

function Lightbox({ views, idx, onIdx, onClose, title, sub }) {
  const many = views.length > 1;
  const step = d => onIdx((idx + d + views.length) % views.length);
  const [zoom, setZoom] = useState(false);
  const [org, setOrg] = useState('50% 50%');
  useEffect(() => { setZoom(false); setOrg('50% 50%'); }, [idx]);
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && many) step(-1);
      else if (e.key === 'ArrowRight' && many) step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, views.length]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const move = e => {
    if (!zoom) return;
    const r = e.currentTarget.getBoundingClientRect();
    setOrg(Math.round(((e.clientX - r.left) / r.width) * 100) + '% ' + Math.round(((e.clientY - r.top) / r.height) * 100) + '%');
  };
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={title + ' — images'}>
      <div className="lb__head">
        <div className="lb__title">{title}{sub ? <span className="lb__sub">· {sub}</span> : null}<span className="lb__count">{idx + 1} / {views.length}</span></div>
        <button type="button" className="lb__btn" aria-label="Close (Esc)" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      <div className="lb__body" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        {many && <button type="button" className="lb__btn lb__btn--nav" aria-label="Previous image" onClick={() => step(-1)}><Icon name="chevron-left" size={20} /></button>}
        <div className={'lb__stage' + (zoom ? ' is-zoom' : '')} onClick={() => setZoom(z => !z)} onMouseMove={move} title={zoom ? 'Click to zoom out' : 'Click to zoom in'}>
          <div className="lb__art" style={{ transform: zoom ? 'scale(2)' : 'none', transformOrigin: org }}>
            <ViewArt view={views[idx]} name={title} size={240} />
          </div>
          <span className="lb__label">{views[idx].label}</span>
        </div>
        {many && <button type="button" className="lb__btn lb__btn--nav" aria-label="Next image" onClick={() => step(1)}><Icon name="chevron-right" size={20} /></button>}
      </div>
      {many && <div className="lb__foot"><GalleryThumbs views={views} idx={idx} onIdx={onIdx} name={title} dark /></div>}
    </div>
  );
}

function ProductGallery({ p, vlabel }) {
  const views = useMemo(() => productViews(p), [p]);
  const [idx, setIdx] = useState(0);
  const [lb, setLb] = useState(false);
  useEffect(() => { setIdx(0); }, [p.id]);
  const many = views.length > 1;
  const step = d => setIdx(i => (i + d + views.length) % views.length);
  return (
    <div className="pgal">
      <div className="pdp__gallery pgal__stage" role="button" tabIndex={0} aria-label="Open image fullscreen" onClick={() => setLb(true)} onKeyDown={e => { if (e.key === 'Enter') setLb(true); else if (e.key === 'ArrowLeft' && many) step(-1); else if (e.key === 'ArrowRight' && many) step(1); }}>
        <ViewArt view={views[idx]} name={p.name} size={120} />
        {vlabel ? <span className="pdp__vtag">{vlabel}</span> : null}
        <span className="pgal__view">{views[idx].label}</span>
        <span className="pgal__zoom" aria-hidden="true"><Icon name="maximize-2" size={14} /></span>
        {many && <button type="button" className="pgal__nav pgal__nav--l" aria-label="Previous image" onClick={e => { e.stopPropagation(); step(-1); }}><Icon name="chevron-left" size={18} /></button>}
        {many && <button type="button" className="pgal__nav pgal__nav--r" aria-label="Next image" onClick={e => { e.stopPropagation(); step(1); }}><Icon name="chevron-right" size={18} /></button>}
      </div>
      {many && <GalleryThumbs views={views} idx={idx} onIdx={setIdx} name={p.name} />}
      {lb && <Lightbox views={views} idx={idx} onIdx={setIdx} onClose={() => setLb(false)} title={p.name} sub={vlabel} />}
    </div>
  );
}

Object.assign(window, { productViews, ProductGallery, Lightbox });
