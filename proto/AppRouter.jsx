const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "homeLayout": "dashboard",
  "loginLayout": "centered",
  "resultsView": "list",
  "filterLayout": "rail",
  "density": "comfy",
  "sparklines": true,
  "animations": true,
  "plan": "free"
}/*EDITMODE-END*/;

class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e){ return { e }; }
  render(){ if (this.state.e) return <pre style={{padding:24,font:"13px monospace",color:"#c0362c",whiteSpace:"pre-wrap"}}>{String(this.state.e.stack||this.state.e)}</pre>; return this.props.children; }
}

function App(){
  const [t,setTweak]=useTweaks(TWEAK_DEFAULTS);
  const [screen,setScreen]=useState({name:"results",params:{cat:"Audio"}});
  const go=(name,params={})=>{ setScreen({name,params}); if(typeof window!=='undefined') window.scrollTo(0,0); };
  const {name,params}=screen;
  useEffect(()=>{ if(window.lucide) window.lucide.createIcons(); });
  useEffect(()=>{ document.getElementById("root").classList.toggle("no-anim", !t.animations); },[t.animations]);
  window.PLAN = t.plan;
  window.setPlan = (v)=>setTweak("plan",v);
  let view;
  if(name==="login") view=<Login onAuthed={(email,opts)=>go(opts&&opts.signup?"onboarding":"home")} go={go} layout={t.loginLayout} />;
  else if(name==="landing") view=<Landing go={go} />;
  else if(name==="results") view=<Results go={go} query={params.query} cat={params.cat} view={t.resultsView} filterLayout={t.filterLayout} density={t.density} sparklines={t.sparklines} />;
  else if(name==="product") view=<ProductPage go={go} id={params.id} />;
  else if(name==="browse") view=<BrowsePage go={go} />;
  else if(name==="alerts") view=<AlertsPage go={go} tab={params.tab} />;
  else if(name==="account") view=<AccountPage go={go} tab={params.tab} />;
  else if(name==="autobuy") view=<AutobuyPage go={go} />;
  else if(name==="onboarding") view=<Onboarding go={go} />;
  else if(name==="about") view=<AboutPage go={go} section={params.section} />;
  else view=<SignedHome go={go} onLogout={()=>go("landing")} layout={t.homeLayout} />;
  return (<React.Fragment>
    <div key={name+JSON.stringify(params)+t.loginLayout+t.homeLayout+t.resultsView+t.filterLayout+t.density+t.sparklines+t.plan}>{view}{!({login:1,landing:1,about:1,onboarding:1})[name] && <Footer go={go} />}</div>
    <TweaksPanel>
      <TweakSection label="Preview" />
      <TweakSelect label="Screen" value={name} options={[{value:"results",label:"Search results"},{value:"product",label:"Product / compare"},{value:"home",label:"Signed-in home"},{value:"browse",label:"Categories browse"},{value:"alerts",label:"Alerts / watchlist"},{value:"autobuy",label:"Auto-buy orders"},{value:"account",label:"Account & settings"},{value:"onboarding",label:"Onboarding"},{value:"login",label:"Login"},{value:"landing",label:"Public landing"},{value:"about",label:"About (public)"}]} onChange={(v)=>go(v, v==="results"?{cat:"Audio"}:v==="product"?{id:"xm5"}:{})} />
      <TweakSection label="Subscription" />
      <TweakRadio label="Plan" value={t.plan} options={[{value:"free",label:"Free"},{value:"plus",label:"Plus"}]} onChange={(v)=>{setTweak("plan",v);}} />
      <TweakSection label="Search results" />
      <TweakRadio label="View" value={t.resultsView} options={[{value:"list",label:"List"},{value:"grid",label:"Grid"}]} onChange={(v)=>{setTweak("resultsView",v);}} />
      <TweakRadio label="Filters" value={t.filterLayout} options={[{value:"rail",label:"Left rail"},{value:"topbar",label:"Top bar"}]} onChange={(v)=>{setTweak("filterLayout",v);}} />
      <TweakRadio label="Density" value={t.density} options={[{value:"comfy",label:"Comfy"},{value:"compact",label:"Compact"}]} onChange={(v)=>{setTweak("density",v);}} />
      <TweakToggle label="Price sparklines" value={t.sparklines} onChange={(v)=>setTweak("sparklines",v)} />
      <TweakSection label="Index layout" />
      <TweakRadio label="Signed-in home" value={t.homeLayout} options={[{value:"dashboard",label:"Dashboard"},{value:"search",label:"Search-first"},{value:"feed",label:"Feed"}]} onChange={(v)=>{setTweak("homeLayout",v);go("home");}} />
      <TweakSection label="Login" />
      <TweakRadio label="Layout" value={t.loginLayout} options={[{value:"centered",label:"Centered"},{value:"split",label:"Split"}]} onChange={(v)=>{setTweak("loginLayout",v);go("login");}} />
      <TweakSection label="Motion" />
      <TweakToggle label="Entrance animations" value={t.animations} onChange={(v)=>setTweak("animations",v)} />
    </TweaksPanel>
  </React.Fragment>);
}
ReactDOM.createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
