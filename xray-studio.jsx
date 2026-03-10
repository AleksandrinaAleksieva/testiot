import { useState, useMemo, useRef, useCallback } from "react";

// ── Point this at your proxy server ──────────────────────────────────────────
const PROXY_URL  = "http://localhost:3001";
const JIRA_DOMAIN = "shellyusa.atlassian.net";

// ── Test data (QAT-118 subtasks) ──────────────────────────────────────────────
const ALL_TESTS = [
  { key:"QAT-120", summary:"Self-test",                                                             status:"Passed",  feature:"General" },
  { key:"QAT-121", summary:"Device broadcasts AP",                                                  status:"Fixed",   feature:"General" },
  { key:"QAT-123", summary:"Wi-Fi reconnects automatically after reboot",                           status:"Open",    feature:"Wi-Fi" },
  { key:"QAT-124", summary:"[Bluetooth] Pair with Blu device (e.g., Blu Button, Blu H&T)",         status:"Open",    feature:"Bluetooth" },
  { key:"QAT-125", summary:"[Matter] can be enabled/disabled",                                      status:"Open",    feature:"Matter" },
  { key:"QAT-126", summary:"[Matter] Device pairs",                                                 status:"Open",    feature:"Matter" },
  { key:"QAT-127", summary:"[Matter] Toggle ON/OFF via Matter interface",                           status:"Open",    feature:"Matter" },
  { key:"QAT-128", summary:"[Matter] Status update is synchronized",                                status:"Open",    feature:"Matter" },
  { key:"QAT-129", summary:"[ZigBee] can be enabled/disabled",                                      status:"Open",    feature:"ZigBee" },
  { key:"QAT-130", summary:"[ZigBee] Device still connects to AP when ZigBee disabled",             status:"Open",    feature:"ZigBee" },
  { key:"QAT-131", summary:"[ZigBee] Device pairs",                                                 status:"Open",    feature:"ZigBee" },
  { key:"QAT-132", summary:"[ZigBee] Wi-Fi works along with ZigBee connected",                      status:"Open",    feature:"ZigBee" },
  { key:"QAT-133", summary:"[ZigBee] Toggle ON/OFF via ZigBee",                                     status:"Open",    feature:"ZigBee" },
  { key:"QAT-134", summary:"[ZigBee] Status update is synchronized",                                status:"Open",    feature:"ZigBee" },
  { key:"QAT-135", summary:"[Ethernet] Reconnects automatically after reboot",                      status:"Open",    feature:"Ethernet" },
  { key:"QAT-136", summary:"Web UI loads",                                                          status:"Open",    feature:"Web UI" },
  { key:"QAT-137", summary:"Device name is correct in web UI",                                      status:"Open",    feature:"Web UI" },
  { key:"QAT-138", summary:"Execute simple webhook",                                                status:"Open",    feature:"Web UI" },
  { key:"QAT-139", summary:"Factory reset works",                                                   status:"Open",    feature:"General" },
  { key:"QAT-140", summary:"Cloud connection is successful",                                        status:"Open",    feature:"General" },
  { key:"QAT-141", summary:"Verify all fields in shelly.getdeviceinfo",                             status:"Open",    feature:"General" },
  { key:"QAT-142", summary:"[Outputs] ON/OFF via Web UI",                                           status:"Open",    feature:"Outputs" },
  { key:"QAT-143", summary:"[Outputs] ON/OFF via associated Input",                                 status:"Open",    feature:"Outputs" },
  { key:"QAT-144", summary:"[Inputs] Button Mode registers - Single Push",                          status:"Open",    feature:"Inputs" },
  { key:"QAT-145", summary:"[Inputs] Button Mode registers - Double Push",                          status:"Open",    feature:"Inputs" },
  { key:"QAT-146", summary:"[Inputs] Button Mode registers - Triple Push",                          status:"Open",    feature:"Inputs" },
  { key:"QAT-147", summary:"[Inputs] Button Mode registers - Long Push",                            status:"Open",    feature:"Inputs" },
  { key:"QAT-148", summary:"[Inputs] Switch Mode registers - ON/OFF",                               status:"Open",    feature:"Inputs" },
  { key:"QAT-149", summary:"[Power Metering] Voltage, Current, Power readings are present",         status:"Open",    feature:"Power Metering" },
  { key:"QAT-150", summary:"[Power Metering] Power metering values within expected accuracy range", status:"Open",    feature:"Power Metering" },
  { key:"QAT-151", summary:"[Light, RGB, RGBW, CCT] Smooth dimming across 0-100%",                 status:"Open",    feature:"Light/RGB" },
  { key:"QAT-152", summary:"[Light, RGB, RGBW, CCT] No flicker or steps",                          status:"Open",    feature:"Light/RGB" },
  { key:"QAT-153", summary:"[Light, RGB, RGBW, CCT] No audible noise",                             status:"Open",    feature:"Light/RGB" },
  { key:"QAT-154", summary:"[Light, RGB, RGBW, CCT] Single input dimming works",                   status:"Open",    feature:"Light/RGB" },
  { key:"QAT-155", summary:"[Light, RGB, RGBW, CCT] Dual input dimming works",                     status:"Open",    feature:"Light/RGB" },
  { key:"QAT-156", summary:"[Light, RGB, RGBW, CCT] Calibration is successful",                    status:"Open",    feature:"Light/RGB" },
  { key:"QAT-157", summary:"[Cover devices] Calibration is successful",                             status:"Open",    feature:"Cover Devices" },
  { key:"QAT-158", summary:"[Cover devices] Go to specific position works",                         status:"Open",    feature:"Cover Devices" },
  { key:"QAT-159", summary:"[Cover devices] Control from inputs work",                              status:"Open",    feature:"Cover Devices" },
  { key:"QAT-160", summary:"[Energy metering] Voltage, Current, Power, Frequency readings present", status:"Open",   feature:"Energy Metering" },
  { key:"QAT-161", summary:"[Energy metering] EM values within expected accuracy range",            status:"Open",    feature:"Energy Metering" },
  { key:"QAT-162", summary:"[Energy metering] EM data is stored",                                   status:"Open",    feature:"Energy Metering" },
  { key:"QAT-163", summary:"[Energy metering] Change profiles",                                     status:"Open",    feature:"Energy Metering" },
  { key:"QAT-164", summary:"[Energy metering] Change current transformers CT",                      status:"Open",    feature:"Energy Metering" },
  { key:"QAT-165", summary:"[Specific wiring] Test with/without N wire (device-specific)",          status:"Open",    feature:"Specific Wiring" },
  { key:"QAT-166", summary:"[Add-on] Test with add-on (device-specific)",                           status:"Open",    feature:"Add-on" },
  { key:"QAT-167", summary:"[Protocol changing] Change FW: Matter to ZigBee - Sys button",         status:"Open",    feature:"Protocol Changing" },
  { key:"QAT-168", summary:"[Protocol changing] Change FW: ZigBee to Matter - Sys button",         status:"Open",    feature:"Protocol Changing" },
  { key:"QAT-169", summary:"[Protocol changing] Change FW: Matter to ZigBee - WebUI",              status:"Open",    feature:"Protocol Changing" },
  { key:"QAT-170", summary:"[Protocol changing] Change FW: ZigBee to Matter - WebUI",              status:"Open",    feature:"Protocol Changing" },
  { key:"QAT-171", summary:"[OTA Matrix] Matter (enabled) - Matter main",                           status:"Open",    feature:"OTA Matrix" },
  { key:"QAT-172", summary:"[OTA Matrix] Matter (enabled) - ZigBee main",                           status:"Open",    feature:"OTA Matrix" },
  { key:"QAT-173", summary:"[OTA Matrix] ZigBee (enabled) - ZigBee main",                           status:"Open",    feature:"OTA Matrix" },
  { key:"QAT-174", summary:"[OTA Matrix] ZigBee (enabled) - Matter main",                           status:"Open",    feature:"OTA Matrix" },
  { key:"QAT-175", summary:"OTA - Gen2",                                                             status:"Open",    feature:"OTA Matrix" },
  { key:"QAT-176", summary:"DUT data",                                                               status:"Open",    feature:"General" },
];

const FEAT_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16","#06b6d4","#a855f7","#64748b","#e11d48","#0891b2","#059669","#d946ef"];
const STATUS_MAP  = {
  Passed:{ bg:"#052e16",text:"#4ade80",border:"#14532d" },
  Fixed: { bg:"#172554",text:"#60a5fa",border:"#1e3a5f" },
  Failed:{ bg:"#450a0a",text:"#f87171",border:"#7f1d1d" },
  Open:  { bg:"#0f172a",text:"#818cf8",border:"#1e1b4b" },
};

// ── Proxy API calls ────────────────────────────────────────────────────────────
async function proxyGet(path) {
  const r = await fetch(`${PROXY_URL}${path}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function proxyPost(path, body) {
  const r = await fetch(`${PROXY_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:#080c14}
::-webkit-scrollbar-thumb{background:#1c2430;border-radius:2px}
body{background:#060910}
.app{min-height:100vh;background:#060910;font-family:'Syne',sans-serif;color:#c9d4e0}
.nav{height:46px;background:#080c14;border-bottom:1px solid #0f1726;display:flex;align-items:center;padding:0 14px;position:sticky;top:0;z-index:100;gap:2px}
.bmark{width:22px;height:22px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}
.bname{font-size:10px;font-weight:800;letter-spacing:3px;color:#e2e8f0;margin-left:7px;margin-right:16px;white-space:nowrap}
.nsep{width:1px;height:20px;background:#0f1726;margin:0 4px}
.ntab{height:46px;padding:0 11px;font-size:10px;font-weight:800;letter-spacing:1px;cursor:pointer;border:none;background:none;color:#243040;transition:color .15s;display:flex;align-items:center;gap:5px;border-bottom:2px solid transparent;font-family:'Syne',sans-serif;white-space:nowrap}
.ntab:hover:not(:disabled){color:#4b5a6e}
.ntab.on{color:#3b82f6;border-bottom-color:#3b82f6}
.ntab:disabled{opacity:.2;cursor:default}
.nfill{flex:1}
.ninfo{display:flex;align-items:center;gap:5px;font-size:10px;font-family:'JetBrains Mono',monospace;color:#243040;flex-shrink:0}
.pulse{width:5px;height:5px;border-radius:50%;background:#22c55e;box-shadow:0 0 5px #22c55e80;flex-shrink:0}
.layout{display:flex;height:calc(100vh - 46px);overflow:hidden}
.sidebar{width:198px;background:#080c14;border-right:1px solid #0f1726;overflow-y:auto;flex-shrink:0;padding:10px 8px}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.sh{font-size:8px;font-weight:800;letter-spacing:2px;color:#1c2430;padding:0 4px;margin-bottom:6px}
.fi{padding:5px 8px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;margin-bottom:1px;transition:background .1s}
.fi:hover{background:#0c1420}
.fi.on{background:#0a1428}
.fdot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.fname{font-size:10px;flex:1;line-height:1.3}
.fcnt{font-size:9px;font-family:'JetBrains Mono',monospace;color:#243040}
.fpb{height:2px;background:#0f1726;border-radius:1px;margin:0 0 4px 20px;overflow:hidden}
.fpbf{height:100%;border-radius:1px;background:linear-gradient(90deg,#1d4ed8,#3b82f6);transition:width .3s}
.fsb{margin:0 0 6px 20px;padding:1px 6px;font-size:8px;font-weight:800;font-family:'Syne',sans-serif;background:transparent;border:1px solid #1c2430;border-radius:3px;color:#243040;cursor:pointer;letter-spacing:.5px;transition:all .1s}
.fsb:hover{border-color:#3b82f6;color:#3b82f6}
.div{height:1px;background:#0f1726;margin:8px 0}
.tb{padding:7px 11px;border-bottom:1px solid #0f1726;display:flex;gap:7px;align-items:center;background:#080c14;flex-wrap:wrap}
.si{background:#060910;border:1px solid #1c2430;color:#c9d4e0;border-radius:4px;padding:6px 10px;font-size:11px;font-family:'Syne',sans-serif;outline:none;transition:border .12s;width:160px}
.si:focus{border-color:#3b82f6}
.si::placeholder{color:#1c2430}
.tlist{flex:1;overflow-y:auto}
.tr{display:flex;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid #080c14;cursor:pointer;transition:background .08s}
.tr:hover{background:#090e1a}
.tr.sel{background:rgba(29,78,216,.06)}
.ck{width:13px;height:13px;border-radius:3px;border:1.5px solid #1c2430;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .1s}
.ck.on{background:#1d4ed8;border-color:#1d4ed8}
.tkey{font-family:'JetBrains Mono',monospace;font-size:10px;color:#3b82f6;width:65px;flex-shrink:0}
.tsum{flex:1;font-size:11px;min-width:0}
.sp{padding:2px 7px;border-radius:20px;font-size:9px;font-weight:800;flex-shrink:0;white-space:nowrap}
.page{max-width:640px;margin:0 auto;padding:24px 18px;overflow-y:auto;height:100%}
.card{background:#080c14;border:1px solid #0f1726;border-radius:8px}
.ch{padding:11px 15px;border-bottom:1px solid #0f1726;display:flex;align-items:center;gap:8px}
.cb{padding:15px}
.inp{background:#060910;border:1px solid #1c2430;color:#c9d4e0;border-radius:4px;padding:8px 11px;font-size:12px;font-family:'Syne',sans-serif;outline:none;transition:border .12s;width:100%}
.inp:focus{border-color:#3b82f6}
.inp::placeholder{color:#1c2430}
.lbl{font-size:8px;font-weight:800;letter-spacing:1.5px;color:#243040;display:block;margin-bottom:5px}
.btn{padding:8px 15px;border-radius:4px;font-size:11px;font-weight:800;font-family:'Syne',sans-serif;cursor:pointer;border:none;transition:all .12s;letter-spacing:.5px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.bb{background:#1d4ed8;color:#fff}
.bb:hover{background:#2563eb}
.bb:disabled{background:#0f1726;color:#1c2430;cursor:not-allowed}
.bg{background:transparent;color:#4b5a6e;border:1px solid #1c2430}
.bg:hover{background:#0c1420;border-color:#243040;color:#7a8a9e}
.bn{background:#14532d;color:#d1fae5}
.bn:hover:not(:disabled){background:#166534}
.bn:disabled{background:#0f1726;color:#1c2430;cursor:not-allowed}
.bsm{padding:5px 10px;font-size:10px}
.alert{padding:10px 13px;border-radius:5px;font-size:11px;display:flex;gap:8px;line-height:1.6}
.ai{background:#04091a;border:1px solid #1e3a5f;color:#7dd3fc}
.ao{background:#031a0a;border:1px solid #14532d;color:#6ee7b7}
.ae{background:#1a0505;border:1px solid #450a0a;color:#fca5a5}
.aw{background:#120f00;border:1px solid #3f2e00;color:#fde68a}
.log{background:#030508;border:1px solid #0f1726;border-radius:5px;padding:10px 13px;font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.9;max-height:200px;overflow-y:auto}
.log .hi{color:#3b82f6}
.log .ok{color:#22c55e}
.log .er{color:#ef4444}
.log .wn{color:#fbbf24}
.steps{display:flex;align-items:center;margin-bottom:22px}
.step{display:flex;align-items:center;gap:7px}
.sn{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;flex-shrink:0}
.sl{flex:1;height:1px;background:#0f1726;min-width:16px}
.step.done .sn{background:#14532d;color:#d1fae5}
.step.act  .sn{background:#1d4ed8;color:#fff}
.step.idle .sn{background:#0f1726;color:#243040}
.step.done .snl{color:#4ade80;font-size:10px;font-weight:800}
.step.act  .snl{color:#93c5fd;font-size:10px;font-weight:800}
.step.idle .snl{color:#243040;font-size:10px;font-weight:800}
.rc{background:#031a0a;border:1px solid #14532d;border-radius:8px;padding:20px}
.rk{font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:700;color:#4ade80;letter-spacing:1px}
.ir{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #071a10;font-size:11px}
.ir:last-child{border-bottom:none}
.prox-banner{background:#030a18;border:1px solid #1e3a5f;border-radius:7px;padding:14px;margin-bottom:18px}
.cdot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.pb{height:4px;background:#0f1726;border-radius:2px;overflow:hidden;margin-top:8px}
.pbf{height:100%;background:linear-gradient(90deg,#1d4ed8,#22c55e);border-radius:2px;transition:width .3s}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fin{animation:fadeUp .18s ease-out}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{display:inline-block;width:11px;height:11px;border:2px solid #1c2430;border-top-color:#3b82f6;border-radius:50%;animation:spin .7s linear infinite}
`;

// ── Proxy status banner ────────────────────────────────────────────────────────
function ProxyBanner({ proxyUser, proxyErr, proxyUrl, onCheck, checking }) {
  if (proxyUser) return (
    <div className="prox-banner">
      <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
        <div className="cdot" style={{background:"#22c55e",boxShadow:"0 0 5px #22c55e60"}}/>
        <span style={{color:"#4ade80",fontWeight:700}}>Proxy connected — {proxyUser}</span>
        <span style={{flex:1}}/>
        <button className="btn bg bsm" onClick={onCheck}>{checking?<span className="spin"/>:"Re-check"}</button>
      </div>
    </div>
  );
  return (
    <div className="prox-banner">
      <div style={{fontSize:10,fontWeight:800,letterSpacing:1,color:"#3b82f6",marginBottom:6}}>PROXY SERVER</div>
      <div style={{fontSize:11,color:"#2a3441",lineHeight:1.7,marginBottom:10}}>
        The portal talks to your backend proxy at <code style={{color:"#60a5fa",fontSize:10}}>{proxyUrl}</code>.
        Start the server first, then click Verify.
      </div>
      {proxyErr && <div className="alert ae" style={{marginBottom:10}}>⚠ {proxyErr}</div>}
      <button className="btn bb bsm" onClick={onCheck} disabled={checking}>
        {checking?<><span className="spin"/> Checking…</>:"Verify Proxy Connection"}
      </button>
    </div>
  );
}

export default function App() {
  const [tab,    setTab]    = useState("select");
  const [sel,    setSel]    = useState(new Set());
  const [featF,  setFeatF]  = useState(null);
  const [srch,   setSrch]   = useState("");

  // Proxy state
  const [proxyUser,  setProxyUser]  = useState(null);
  const [proxyErr,   setProxyErr]   = useState("");
  const [checking,   setChecking]   = useState(false);

  const [execName, setExecName]  = useState("");
  const [execVer,  setExecVer]   = useState("");
  const [execDesc, setExecDesc]  = useState("");

  const [phase,  setPhase]   = useState("idle");
  const [prog,   setProg]    = useState(0);
  const [result, setResult]  = useState(null);
  const [cErr,   setCErr]    = useState("");
  const [logLines, setLogLines] = useState([]);
  const logRef = useRef(null);

  const features = useMemo(()=>[...new Set(ALL_TESTS.map(t=>t.feature))],[]);
  const cmap     = useMemo(()=>Object.fromEntries(features.map((f,i)=>[f,FEAT_COLORS[i%FEAT_COLORS.length]])),[]);

  const filtered = useMemo(()=>ALL_TESTS.filter(t=>{
    if (featF && t.feature!==featF) return false;
    if (srch && !t.summary.toLowerCase().includes(srch.toLowerCase()) && !t.key.toLowerCase().includes(srch.toLowerCase())) return false;
    return true;
  }),[featF,srch]);

  const fstats = useMemo(()=>Object.fromEntries(features.map(f=>{
    const all=ALL_TESTS.filter(t=>t.feature===f);
    return [f,{total:all.length,sel:all.filter(t=>sel.has(t.key)).length}];
  })),[sel]);

  const chosen = ALL_TESTS.filter(t=>sel.has(t.key));

  const addLog = useCallback((cls,msg)=>{
    setLogLines(p=>[...p,{cls,msg}]);
    setTimeout(()=>logRef.current?.scrollTo(0,99999),40);
  },[]);

  const toggleT = key => setSel(p=>{const n=new Set(p);n.has(key)?n.delete(key):n.add(key);return n;});
  const toggleF = f   => {
    const ft=ALL_TESTS.filter(t=>t.feature===f);
    const allOn=ft.every(t=>sel.has(t.key));
    setSel(p=>{const n=new Set(p);ft.forEach(t=>allOn?n.delete(t.key):n.add(t.key));return n;});
  };

  const checkProxy = async () => {
    setChecking(true); setProxyErr(""); setProxyUser(null);
    try {
      const me = await proxyGet("/api/me");
      setProxyUser(me.displayName || me.emailAddress);
    } catch(e) {
      setProxyErr(`Cannot reach proxy at ${PROXY_URL} — is the server running? (${e.message})`);
    }
    setChecking(false);
  };

  const handleCreate = async () => {
    if (!proxyUser) return;
    const name = execName.trim() || `[Test Execution] Bundle - ${new Date().toLocaleDateString()}`;
    setPhase("creating"); setLogLines([]); setCErr(""); setProg(0);

    try {
      addLog("hi", `Sending to proxy: "${name}" with ${chosen.length} tests…`);
      setProg(5);

      const res = await proxyPost("/api/execution", {
        name,
        description: execDesc.trim() || undefined,
        fixVersion:  execVer.trim()  || undefined,
        projectKey:  "QAT",
        tests: chosen.map(t => ({ key: t.key, summary: t.summary })),
      });

      // The proxy handles creation server-side and streams back results
      addLog("ok", `✓ Execution created: ${res.execKey}`);
      res.created.forEach(c => addLog("ok", `  ✓ ${c.created}  (${c.original})`));
      res.failed.forEach(f  => addLog("wn", `  ⚠ ${f.original}: ${f.error}`));
      addLog("ok", `Done — ${res.created.length}/${res.total} tests created`);
      setProg(100);

      setResult(res);
      setPhase("done");
      setTab("result");
    } catch(e) {
      setCErr(e.message);
      addLog("er", `Error: ${e.message}`);
      setPhase("error");
    }
  };

  const reset = () => {
    setSel(new Set());setFeatF(null);setSrch("");
    setExecName("");setExecVer("");setExecDesc("");
    setPhase("idle");setLogLines([]);setResult(null);setCErr("");
    setTab("select");
  };

  const ss = s => {
    if(s==="select")    return tab==="select"?"act":(sel.size>0?"done":"idle");
    if(s==="configure") return tab==="configure"?"act":(phase==="done"?"done":"idle");
    if(s==="result")    return phase==="done"?(tab==="result"?"act":"done"):"idle";
    return "idle";
  };

  return (
    <div className="app">
      <style>{CSS}</style>

      <nav className="nav">
        <div className="bmark">⚡</div>
        <span className="bname">XRAY STUDIO</span>
        <div className="nsep"/>
        {[
          {id:"select",   icon:"☑", label:"SELECT TESTS"},
          {id:"configure",icon:"⚙", label:"CONFIGURE",    dis:sel.size===0},
          {id:"result",   icon:"✓", label:"RESULT",        dis:phase!=="done"},
        ].map(t=>(
          <button key={t.id} className={`ntab ${tab===t.id?"on":""}`} disabled={t.dis} onClick={()=>!t.dis&&setTab(t.id)}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <div className="nfill"/>
        <div className="ninfo">
          {proxyUser&&<><div className="pulse"/><span style={{color:"#22c55e"}}>{proxyUser}</span><span style={{color:"#1c2430",margin:"0 4px"}}>·</span></>}
          <span style={{color:"#3b82f6"}}>QAT-118</span>
          <span style={{color:"#1c2430",margin:"0 4px"}}>·</span>
          <span>{ALL_TESTS.length} tests</span>
          {sel.size>0&&<><span style={{color:"#1c2430",margin:"0 4px"}}>·</span><span style={{color:"#22c55e",fontWeight:700}}>{sel.size} selected</span></>}
        </div>
      </nav>

      {/* ── SELECT ── */}
      {tab==="select"&&(
        <div className="layout">
          <div className="sidebar">
            <div className="sh">FEATURES</div>
            <div className={`fi ${!featF?"on":""}`} onClick={()=>setFeatF(null)}>
              <div className="fdot" style={{background:"#3b82f6"}}/>
              <span className="fname">All features</span>
              <span className="fcnt">{sel.size}/{ALL_TESTS.length}</span>
            </div>
            <div className="div"/>
            {features.map(f=>{
              const c=cmap[f],st=fstats[f]||{total:0,sel:0},pct=st.total?(st.sel/st.total)*100:0;
              return (
                <div key={f}>
                  <div className={`fi ${featF===f?"on":""}`} onClick={()=>setFeatF(featF===f?null:f)}>
                    <div className="fdot" style={{background:c}}/>
                    <span className="fname">{f}</span>
                    <span className="fcnt">{st.sel}/{st.total}</span>
                  </div>
                  <div className="fpb"><div className="fpbf" style={{width:`${pct}%`}}/></div>
                  <button className="fsb" onClick={e=>{e.stopPropagation();toggleF(f);}}>
                    {st.sel===st.total&&st.total>0?"deselect all":"select all"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="main">
            <div className="tb">
              <input className="si" placeholder="Search tests…" value={srch} onChange={e=>setSrch(e.target.value)}/>
              <div style={{marginLeft:"auto",display:"flex",gap:7,alignItems:"center"}}>
                <span style={{fontSize:10,color:"#243040"}}><span style={{color:"#c9d4e0",fontWeight:700}}>{sel.size}</span> selected</span>
                <button className="btn bg bsm" onClick={()=>setSel(new Set(filtered.map(t=>t.key)))}>Select visible</button>
                <button className="btn bg bsm" onClick={()=>{const fk=new Set(filtered.map(t=>t.key));setSel(p=>new Set([...p].filter(k=>!fk.has(k))))}}>Clear visible</button>
                <button className="btn bn bsm" disabled={sel.size===0} onClick={()=>setTab("configure")}>Configure →</button>
              </div>
            </div>
            <div className="tlist">
              {filtered.length===0
                ?<div style={{padding:40,textAlign:"center",color:"#1c2430",fontSize:12}}>No tests match</div>
                :filtered.map(t=>{
                  const isSel=sel.has(t.key),fc=cmap[t.feature],sm=STATUS_MAP[t.status]||STATUS_MAP.Open;
                  return (
                    <div key={t.key} className={`tr ${isSel?"sel":""}`} onClick={()=>toggleT(t.key)}>
                      <div className={`ck ${isSel?"on":""}`}>
                        {isSel&&<svg width="7" height="5" viewBox="0 0 7 5"><polyline points="1,2.5 3,4.5 6,1" stroke="white" strokeWidth="1.5" fill="none"/></svg>}
                      </div>
                      <span className="tkey">{t.key}</span>
                      <span className="tsum">{t.summary}</span>
                      <span className="sp" style={{background:sm.bg,color:sm.text,border:`1px solid ${sm.border}`}}>{t.status}</span>
                      <span className="sp" style={{background:`${fc}15`,color:fc,border:`1px solid ${fc}30`}}>{t.feature}</span>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIGURE ── */}
      {tab==="configure"&&(
        <div style={{overflowY:"auto",height:"calc(100vh - 46px)"}}>
          <div className="page fin">
            <div className="steps">
              {[["select","1","Select"],["configure","2","Configure"],["result","3","Created"]].map(([id,n,label],i,arr)=>(
                <div key={id} style={{display:"contents"}}>
                  <div className={`step ${ss(id)}`}>
                    <div className="sn">{ss(id)==="done"?"✓":n}</div>
                    <span className="snl">{label}</span>
                  </div>
                  {i<arr.length-1&&<div className="sl"/>}
                </div>
              ))}
            </div>
            <h1 style={{fontSize:20,fontWeight:800,color:"#e2e8f0",marginBottom:4}}>Configure Execution</h1>
            <p style={{color:"#243040",fontSize:12,marginBottom:20}}>{sel.size} tests · {[...new Set(chosen.map(t=>t.feature))].length} features</p>

            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <ProxyBanner
                proxyUser={proxyUser}
                proxyErr={proxyErr}
                proxyUrl={PROXY_URL}
                onCheck={checkProxy}
                checking={checking}
              />

              <div className="card">
                <div className="ch"><span style={{fontWeight:800,fontSize:12}}>Execution Details</span></div>
                <div className="cb" style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div>
                    <label className="lbl">EXECUTION NAME</label>
                    <input className="inp" value={execName} onChange={e=>setExecName(e.target.value)}
                      placeholder={`[Test Execution] Bundle - ${new Date().toLocaleDateString()}`}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <label className="lbl">FIX VERSION (optional)</label>
                      <input className="inp" value={execVer} onChange={e=>setExecVer(e.target.value)} placeholder="e.g. v3.1.0"/>
                    </div>
                    <div>
                      <label className="lbl">DESCRIPTION (optional)</label>
                      <input className="inp" value={execDesc} onChange={e=>setExecDesc(e.target.value)} placeholder="e.g. Plug S Gen3"/>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="ch">
                  <span style={{fontWeight:800,fontSize:12}}>Tests by Feature</span>
                  <span style={{marginLeft:"auto",fontSize:10,color:"#243040"}}>{sel.size} total</span>
                </div>
                <div style={{padding:"6px 15px"}}>
                  {features.map(f=>{
                    const ft=chosen.filter(t=>t.feature===f);
                    if(!ft.length) return null;
                    const c=cmap[f];
                    return (
                      <div key={f} className="ir">
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          <div style={{width:6,height:6,borderRadius:"50%",background:c,flexShrink:0}}/>
                          <span style={{fontSize:11,color:c}}>{f}</span>
                        </div>
                        <span style={{fontSize:10,color:"#243040",fontFamily:"'JetBrains Mono',monospace"}}>{ft.length}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {phase==="creating"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#243040",marginBottom:4}}>
                    <span>Proxy creating issues in Jira…</span><span>{prog}%</span>
                  </div>
                  <div className="pb"><div className="pbf" style={{width:`${prog}%`}}/></div>
                </div>
              )}

              {logLines.length>0&&<div className="log" ref={logRef}>{logLines.map((l,i)=><div key={i} className={l.cls}>{l.msg}</div>)}</div>}
              {phase==="error"&&<div className="alert ae">⚠ {cErr}</div>}
              {!proxyUser&&<div className="alert aw">⚠ Verify the proxy connection above before creating.</div>}

              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <button className="btn bg" onClick={()=>setTab("select")}>← Back</button>
                <button className="btn bn" style={{flex:1}} disabled={!proxyUser||phase==="creating"} onClick={handleCreate}>
                  {phase==="creating"?<><span className="spin"/> Creating…</>:`⚡ Create in Jira — ${sel.size} tests`}
                </button>
              </div>

              <div className="alert ai" style={{fontSize:10}}>
                <span>ℹ</span>
                <span>All Atlassian API calls happen server-side in the proxy — no CORS, no browser credentials, no rate limits.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {tab==="result"&&result&&(
        <div style={{overflowY:"auto",height:"calc(100vh - 46px)"}}>
          <div className="page fin">
            <div style={{marginBottom:20}}>
              <div style={{fontSize:9,fontWeight:800,letterSpacing:2,color:"#22c55e",marginBottom:4}}>SUCCESS</div>
              <h1 style={{fontSize:22,fontWeight:800,color:"#e2e8f0"}}>Execution Created 🎉</h1>
            </div>
            <div className="rc" style={{marginBottom:14}}>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:9,color:"#166534",fontWeight:800,letterSpacing:1,marginBottom:5}}>NEW ISSUE KEY</div>
                <div className="rk">{result.execKey}</div>
              </div>
              <div className="ir" style={{borderTop:"1px solid #0e3a1e",paddingTop:8}}>
                <span style={{color:"#4ade80",opacity:.6}}>Tests created</span>
                <span style={{fontWeight:700,color:"#4ade80"}}>{result.created.length} / {result.total}</span>
              </div>
              <div className="ir">
                <span style={{color:"#4ade80",opacity:.6}}>Features covered</span>
                <span style={{fontWeight:700,color:"#4ade80"}}>{[...new Set(chosen.map(t=>t.feature))].length}</span>
              </div>
              {result.failed.length>0&&(
                <div className="ir">
                  <span style={{color:"#fbbf24",opacity:.7}}>Failed</span>
                  <span style={{fontWeight:700,color:"#fbbf24"}}>{result.failed.length}</span>
                </div>
              )}
            </div>
            {result.failed.length>0&&(
              <div className="alert aw" style={{marginBottom:14}}>
                ⚠ Failed: {result.failed.map(f=>f.original).join(", ")}
              </div>
            )}
            {logLines.length>0&&(
              <div className="log" style={{marginBottom:14,maxHeight:160}} ref={logRef}>
                {logLines.map((l,i)=><div key={i} className={l.cls}>{l.msg}</div>)}
              </div>
            )}
            <div style={{display:"flex",gap:10}}>
              <a href={`https://${JIRA_DOMAIN}/browse/${result.execKey}`} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
                <button className="btn bb">Open in Jira ↗</button>
              </a>
              <button className="btn bg" onClick={reset}>New Execution</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
