const { ipcRenderer, webFrame } = require('electron');
// [LITE v10.39] Game 11/11: mục Độ phân giải (localStorage 'h5.khung'); chưa chọn → mặc định 1024×768, game chạy trong iframe của khung.html
// → client (preload ở khung trên) không đọc được trận. Đặt sẵn đúng như Hùng chọn trong Tùy chọn: Theo cửa sổ + PC, Cỡ chữ Lớn,
// Tiết kiệm pin, Ẩn người chơi khác (chỉ là thiết lập hiển thị của trình duyệt, không phải bản lưu nhân vật). Đang ở khung.html → về index.html.
try {
  if (/volamidle/.test(location.hostname)) {
    const rd = k => { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
    const kh = rd('h5.khung'), khOk = kh.res === 'win' && kh.ui === 'pc';
    if (!khOk) localStorage.setItem('h5.khung', JSON.stringify({ ...kh, res: 'win', chon: 1, ui: 'pc' }));
    const ui = rd('jxidle_ui'), want = { fs: 2, saver: true, noSk: false, noAlly: true, black: false };
    if (Object.keys(want).some(k => ui[k] !== want[k])) localStorage.setItem('jxidle_ui', JSON.stringify({ ...ui, ...want }));
    if (/khung\.html$/.test(location.pathname)) { const q = new URLSearchParams(location.search); q.delete('khung'); location.replace('index.html' + (q.toString() ? '?' + q : '') + location.hash); }
  }
} catch {}
let kiteSynthAt = 0;
let userPingAt = 0;   // [LITE v10.22] báo shell là bạn đang thao tác trong ô game (để tự về Bảng tổng sau 1 phút)
for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, e => { if (e.isTrusted && Date.now() - kiteSynthAt > 500 && Date.now() - userPingAt > 5000) { userPingAt = Date.now(); try { ipcRenderer.send('lab:user'); } catch {} } }, true);   // [LITE v10.8] cú bấm do "Chạy vòng ở Tháp" gửi — không tính là bạn đang thao tác
const userEv = e => e.isTrusted && Date.now() - kiteSynthAt > 500;
// [LITE v10.8] lệnh ẩn #vlmAuto của game (bản 990+, Manager V6.1 cũng dùng): dùng vật phẩm không cần mở túi
async function vlmApi(act, arg, ms) { return require('./tasks').vlmApi(act, arg, ms); }
const tasks = require('./tasks');
// [V11] cài đặt tự động (chung + riêng acc này: LCFG.me) cho mọi khối bên dưới
let LCFG = {}; ipcRenderer.on('lab:auto:cfg', (_e, c) => { LCFG = c || {}; });
const autoOffMe = () => !!(LCFG.me && LCFG.me.auto === false);
const quaOn = k => (LCFG.qua || {})[k] !== false;
const thuocOn = k => (LCFG.thuoc || {})[k] !== false;
// [V11] Võ Lâm Mật Tịch / Tẩy Tủy Kinh: đã dùng S.useN[t], tối đa 15 (+5 VLMT / +15 TTK mỗi lần chuyển sinh), đang có ở H5.st.amat/mats
const bookReb = () => { try { return (window.H5.st.char.reborn | 0); } catch { return 0; } };
const bookMax = t => t === 'vlmt' ? 15 + 5 * bookReb() : 15 + 15 * bookReb();
const bookUsed = t => { try { const S = window.H5.G('S'); return (S && S.useN && S.useN[t]) | 0; } catch { return 0; } };
const bookHave = t => { try { const x = window.H5.st; return ((x.amat && x.amat[t]) | 0) || ((x.mats && x.mats[t]) | 0) || ((x.mats && x.mats['misc:' + t]) | 0); } catch { return 0; } };
const booksFull = t => bookUsed(t) + bookHave(t) >= bookMax(t);
const { readGame } = require('./game-progress');
const { sleep, waitFor, waitGone, setVal, $, visible } = tasks;

const cfg = {};
// [LITE v10] CỔNG TRẠNG THÁI CHÍNH THỨC của game (bản 1013+, dành cho Manager):
// game tự gửi trạng thái 2 giây/lần qua window.postMessage {vlm:'st'}; Manager được hỏi 3 việc {vlm:'hoi', k:'f5'|'luu'|'den'}.
// Thay cho đọc giao diện / đọc file lưu (nhẹ hơn, không gãy khi game cập nhật) và thay cách chen vào cài đặt hiển thị cũ.
let labToMacBac = null;   // [LITE v10.4] dùng chung: đưa nhân vật về Luyện Công ở Mạc Bắc
const LENH = {};   // [LITE v10.45] móc cho hộp thư lệnh từ chat (các khối bên dưới tự đăng ký)
const port = { st: null, at: 0, n: 0, wait: new Map(), sentAt: 0, sentSig: '', want: null, denAt: 0 };
const portFresh = (ms = 10000) => !!port.st && Date.now() - port.at < ms;
function portAsk(k, extra, ms = 10000) {
  return new Promise(res => {
    const id = 'lab' + (++port.n), t = setTimeout(() => { port.wait.delete(id); res(null); }, ms);
    port.wait.set(id, r => { clearTimeout(t); port.wait.delete(id); res(r || {}); });
    try { window.postMessage(Object.assign({ vlm: 'hoi', id, k }, extra || {}), location.origin); } catch { clearTimeout(t); port.wait.delete(id); res(null); }
  });
}
function portSync() {   // màn hình đen theo ô đang chọn
  const s = port.st; if (!s || port.want === null) return;
  if (!!s.den !== port.want && Date.now() - port.denAt > 4000) { port.denAt = Date.now(); portAsk('den', { on: port.want }, 4000); }
}
window.addEventListener('message', e => {
  const d = e.data; if (!d || typeof d !== 'object' || e.source !== window) return;
  if (d.vlm === 'st' && d.st && typeof d.st === 'object') {
    port.st = d.st; port.at = Date.now(); portSync();
    // gửi Manager: ngay khi trạng thái quan trọng đổi, còn lại 5 giây/lần
    const s = d.st, sig = [s.o, s.lt, s.phien, (s.moi || []).length && s.moi[s.moi.length - 1].id, (s.gb || []).join(''), s.dt && s.dt[0]].join('|');
    if (sig !== port.sentSig || Date.now() - port.sentAt > 5000) { port.sentSig = sig; port.sentAt = Date.now();
      // [LITE v10.34] gửi kèm Boss H5 + nhịp Tháp nhưng không bao giờ để cổng trạng thái chết (16:36 09/11: sau khi game cập nhật, cổng ngừng → client tải lại liên tục)
      let x = s, why = '';
      try { x = JSON.parse(JSON.stringify(Object.assign({}, s, { gbH5: gbLive(), tw: towerStat() }))); } catch (er) { x = s; why = 'gói ' + (er && er.message || er); }
      try { ipcRenderer.send('lab:port', x); } catch (er) { why = 'gửi ' + (er && er.message || er); try { ipcRenderer.send('lab:port', JSON.parse(JSON.stringify(s))); } catch {} }
      if (why && !port.errLog) { port.errLog = 1; try { ipcRenderer.send('lab:auto:log', 'cổng trạng thái lỗi: ' + String(why).slice(0, 160)); } catch {} } }
  } else if (d.vlm === 'tra' && typeof d.id === 'string') port.wait.get(d.id)?.(d.r);
});
ipcRenderer.on('lab:black', (_e, on) => {
  port.want = !!on; port.denAt = 0; portSync();
  if (!port.want && !portFresh()) { const a = document.getElementById('arena'); if (a) a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }
});
ipcRenderer.on('lab:port:ask', async (_e, rid, k, extra, ms) => { const r = await portAsk(k, extra, ms || 10000); ipcRenderer.send('lab:port:reply', rid, r); });
// Ngày theo cách game tính (giờ VN, không thêm số 0: 2026-11-1) — dùng để so với dt.day / dg.day trong file lưu
// [LITE v10.12] Từ khi game chạy máy chủ mới (H5), dữ liệu thật nằm ở window.H5.st; bản lưu localStorage 'jxidle' KHÔNG còn được ghi
// (SAVE_LOCK) → đọc bản lưu cũ ra số liệu cũ (dùng thừa Tiên Thảo Lộ, sót Đồ phổ…). gameSave(): dựng lại dữ liệu kiểu cũ từ H5 (giống hàm của game),
// các trường H5 không có thì lấy từ bản lưu cũ. Chỉ đọc.
function h5Save() {
  try {
    const H = window.H5, t = H && H.st, c = t && t.char, G = H && H.oldItem;
    if (!c || typeof G !== 'function') return null;
    const one = id => { try { return G(id); } catch { return null; } };
    const eq = {}; for (const [k, id] of Object.entries(c.eq || {})) { const r = one(id); if (r) eq[k] = r; }
    const all = t.items && typeof t.items.values === 'function' ? [...t.items.values()] : [];
    const byLoc = l => all.filter(e => e && e.loc === l).map(e => one(e.id)).filter(Boolean);
    const a = c.eqsA === 1 ? 1 : 0, off = {}; for (const e of all) if (e && e.loc === 'eqs' && e.eqSlot) { const r = one(e.id); if (r) off[e.eqSlot] = r; }
    const eqs = { v: 2, a, s: [null, null] }; eqs.s[1 - a] = Object.keys(off).length ? off : null;
    const chest = (Array.isArray(t.chest) ? t.chest : []).map(x => one(x && typeof x === 'object' ? x.id : x)).filter(Boolean);
    const known = new Set(['bag', 'ep', 'eqs', 'stable']), bagIds = new Set((c.bag || []).map(String));
    const other = all.filter(e => e && !known.has(e.loc) && !bagIds.has(String(e.id)) && !Object.values(c.eq || {}).map(String).includes(String(e.id))).map(e => one(e.id)).filter(Boolean);
    const mats = { ht: {}, ore: {}, shard: {}, misc: {}, dp: {} };
    for (const [k, v] of Object.entries({ ...(t.mats || {}), ...(t.amat || {}) })) {
      if (!(v > 0)) continue; const i = k.indexOf(':'), g = i < 0 ? k : k.slice(0, i), n = i < 0 ? '' : k.slice(i + 1);
      if (g === 'ruong' || g === 'tn' || g === 'fd' || g === 'pd') continue;
      if (g === 'ht') mats.ht[n] = v; else if (g === 'manh') mats.shard[n] = v; else if (g === 'ore') mats.ore[n] = v; else if (g === 'dp') mats.dp[n] = v; else if (g === 'pdl') mats.misc['fdl' + n] = v; else mats.misc[k] = v;
    }
    const w = t.wallet || {};
    return { h5: true, name: c.name, fac: c.fac, lvl: c.lvl, inv: (c.bag || []).map(one).filter(Boolean), eq, eqs, chest: chest.length ? chest : other, epBox: byLoc('ep'), stable: byLoc('stable'),
      buf: c.buf || {}, mats, knb: w.knb | 0, knbk: w.knbk | 0, reborn: c.reborn | 0, autoLdt: !!(c.dt && c.dt.aldt),
      dg: { day: gameDay(), runs: { ...((t.used && t.used.dg) || {}) } }, ldtMua: t.ldtMua || null };
  } catch { return null; }
}
function oldSave() { try { const raw = localStorage.getItem(require('./game-progress').activeSlot()); return raw ? JSON.parse(JSON.parse(raw).d) : null; } catch { return null; } }
function gameSave() {
  const h = h5Save(), o = oldSave();
  if (!h) return o;
  const D = Object.assign({}, o || {}, h);
  D.rw = Object.assign({}, (o && o.rw) || {}); D.rw.stat = Object.assign({}, D.rw.stat || {}, { reborn: h.reborn });
  if (h.ldtMua) D.rw.ldtBuy = { d: gameDay(), n: (h.ldtMua.n | 0) };
  // [LITE v10.35] Dã Tẩu: bản lưu localStorage đứng từ khi có H5 (SAVE_LOCK) → lấy S.dt sống (H5 đồng bộ từ máy chủ, sv = tổng máy chủ). Chỉ đọc (G 1 tham số) + sao chép JSON.
  try { const G = window.H5 && window.H5.G, S = typeof G === 'function' ? G('S') : null; if (S && S.dt) D.dt = JSON.parse(JSON.stringify(S.dt)); } catch {}
  return D;
}
const gameDay = () => { const n = new Date(Date.now() + 7 * 3600e3); return `${n.getUTCFullYear()}-${n.getUTCMonth() + 1}-${n.getUTCDate()}`; };
const DUNGEONS = [['dvc', 20], ['tbk', 50], ['lal', 80], ['pdq', 110], ['kct', 140], ['mcb', 170], ['hsl', 190]], DG_RUNS = 2;
// [LITE v10.42] Phó Bản quá 90 phút trong ngày (đánh thua lặp lại — bibi-vd2 12/11 kẹt 12 giờ) → coi như hết lượt, về Tháp.
const DGT = (() => { try { const v = JSON.parse(sessionStorage.getItem('lite_dgt') || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } })();
const dgtSave = () => { try { sessionStorage.setItem('lite_dgt', JSON.stringify(DGT)); } catch {} };
let DG_MAX_MS = 90 * 60e3;   // [LITE v10.46] chỉnh từng acc qua autoCfg.dgMax[id] (phút; 0 = không giới hạn)
ipcRenderer.on('lab:dgmax', (_e, m) => { DG_MAX_MS = m === 0 ? 0 : (m > 0 ? m * 60e3 : 90 * 60e3); if (!DG_MAX_MS && DGT.cut) { DGT.cut = 0; DGT.moved = 0; try { sessionStorage.setItem('lite_dgt', JSON.stringify(DGT)); } catch {} } });
const dgCut = () => DG_MAX_MS > 0 && DGT.day === gameDay() && !!DGT.cut;
function dgLeft(D) {
  if (dgCut()) return 0;   // số lượt phó bản còn lại hôm nay (game: 2 lượt / phó bản / ngày, đủ cấp hoặc đã chuyển sinh)
  const reborn = ((D.rw && D.rw.stat && D.rw.stat.reborn) | 0) > 0, runs = (D.dg && D.dg.day === gameDay() && D.dg.runs) || {};
  return DUNGEONS.reduce((n, [id, lv]) => n + ((D.lvl | 0) >= lv || reborn ? Math.max(0, DG_RUNS - (runs[id] | 0)) : 0), 0);
}
// Khi BOT GAME bị ẩn: không khởi chạy tác vụ tự động. Giữ nguyên source và cấu hình để có thể bật lại sau.
const BOT_FEATURES_ENABLED = false;
let lastMapSignature='';
// Đọc trực tiếp dữ liệu đã được game 20/10 xử lý và cập nhật (kể cả bản đồ phụ).
function reportMaps() {
  const j=window.JW; if(!j || !Array.isArray(j.zones)) return;
  const maps=[]; j.zones.forEach((m,index)=>{
    if(!m || !m.n)return;
    maps.push({ id:m.id,name:m.n,index,altIndex:0,minLevel:m.lo,maxLevel:m.hi });
    (j.zalt?.[index]||[]).forEach((a,i)=>maps.push({id:a.id,name:a.n,index,altIndex:i+1,minLevel:a.lo??m.lo,maxLevel:a.hi??m.hi}));
  });
  const sig=JSON.stringify(maps); if(sig!==lastMapSignature && maps.length>10){lastMapSignature=sig;ipcRenderer.send('bot:maps',maps)}
}

const txt = (s) => ($(s)?.textContent || '').trim();

ipcRenderer.on('bot:cfg', (_e, c) => Object.assign(cfg, c));
ipcRenderer.on('bot:pause', (_e, p) => { tasks.state.paused = !!p; });
const {createGameCommands}=require('./game-commands');
const gameCommands=createGameCommands(document,{
  onLogoutRequested:()=>ipcRenderer.send('login:suppress'),
  onDelegated:()=>ipcRenderer.send('game:delegated'),
  onCharacterSelected:slot=>ipcRenderer.send('game:autoplay-attempt',slot),
  portState:()=>portFresh(8000)?port.st.o:null
});
// Cả nút thoát thủ công của game cũng phải chặn điền tài khoản sau khi reload.
document.addEventListener('click',e=>{
  if(e.target.closest?.('#loY,#bLogout,#utOut'))ipcRenderer.send('login:suppress');
},true);
const actionResult=(action,ok,message='')=>ipcRenderer.send('game:action-result',action,ok,message);
async function runExitAction(action, force){
  try {const message=await gameCommands.exit(action, force);actionResult(action,true,message);}
  catch(error){actionResult(action,false,error.message||String(error));}
}
ipcRenderer.on('ui:cmd', (_e, cmd) => {
  if(cmd==='logout' || cmd==='delegate'){void runExitAction(cmd);return;}
  if(cmd==='logout!'){void runExitAction('logout',true);return;}   // [LITE v10.4] đăng xuất bắt buộc do lịch
  if (cmd.startsWith('farm:')) { const parts=cmd.slice(5).split(':').map(Number); if(parts.length===2 && parts.every(Number.isInteger)) tasks.farmOnce(parts[0],parts[1]); }
  else if (cmd.startsWith('tab:')) { const t = cmd.slice(4); ($(`#u20menu [data-u="${t}"]`) || $(`#tabs [data-t="${t}"]`))?.click(); }
  else if (cmd === 'closeDialogs') for (const s of ['#u20wx', '#mClose']) { const el = $(s); if (visible(el)) el.click(); }
});

const wid = (s) => parseFloat($(s)?.style.width) || 0;
function readStatus() {
  const progress = BOT_FEATURES_ENABLED ? readGame() : null; // [LITE]
  const floorLabel = txt('#u20zn');
  const floorMatch = floorLabel.match(/(?:tháp|tầng)[^\d]{0,20}tầng\s*(\d+)|(?:·|\s)tầng\s*(\d+)/i);
  return { ...(progress || {}),
    towerFloor: floorMatch ? Number(floorMatch[1] || floorMatch[2]) : null,
    hpP: wid('#hpBar'), mpP: wid('#mpBar'), xpP: wid('#xpBar'), knb: txt('#knbTop'), mode: txt('#mswBtn b'),
    name: txt('#heroName'), fac: txt('#faction') || txt('#heroFaction') || txt('#fac'), lv: txt('#lv'), hp: txt('#hpTxt'), mp: txt('#mpTxt'), xp: txt('#xpTxt'),
    gold: txt('#gold'), map: txt('#stageLbl'),
    dialog: visible($('#u20wh')) ? txt('#u20wt') : '',
    task: tasks.state.task, paused: tasks.state.paused,
  };
}

async function autoLogin(creds, allowed=()=>true) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if(!allowed()) return false;
    // [LITE v10.6] bản 1031+: form đăng nhập chỉ hiện sau khi bấm "Bắt Đầu Trò Chơi" ở màn chào
    const st = $('#ngStart');
    if (visible(st) && !visible($('#ngU'))) { tasks.log('màn chào → bấm Bắt Đầu Trò Chơi'); st.click(); await sleep(500 + Math.random() * 400); }
    const u = await waitFor('#ngU', attempt === 1 ? 10000 : 3000);
    if (!u) {
      if (visible($('#ngStart'))) { tasks.log('bấm Bắt Đầu Trò Chơi nhưng chưa thấy form đăng nhập'); continue; }
      tasks.log('không thấy form login → đã đăng nhập sẵn'); return true;
    }
    if(!allowed())return false;
    setVal(u, creds.user);
    await sleep(300 + Math.random() * 300);
    setVal($('#ngP'), creds.pass);
    await sleep(400 + Math.random() * 300);
    if(!allowed())return false;
    $('#ngIn')?.click();
    if (await waitGone('#ngU', 10000)) {
      if (visible($('#ngStart'))) { tasks.log('đăng nhập bị trả về màn chào:', txt('#toast') || '(không có thông báo)'); await sleep(2000); continue; }
      tasks.log('đăng nhập OK'); return true;
    }
    tasks.log('login lần', attempt, 'thất bại:', txt('#toast') || '(không có thông báo)');
    await sleep(2000);
  }
  return false;
}

// V5.5: vòng điều phối theo trạng thái của UI thay cho luồng một lần sau login.
// Cho phép tải game chậm, chọn nhân vật sau khi login, reload/F5 không kích đăng nhập
// sau khi người chơi chủ động đăng xuất trong cả Manager hoặc UI game.
window.addEventListener('DOMContentLoaded', async () => {
  const creds=await ipcRenderer.invoke('bot:creds');
  if(!creds){ipcRenderer.send('bot:phase','error');return;}
  Object.assign(cfg,creds.cfg);
  tasks.state.onLog=m=>ipcRenderer.send('bot:log',m);
  setInterval(()=>{ipcRenderer.send('bot:status',readStatus());},5000); // [LITE] 1s -> 5s
  reportMaps();setInterval(reportMaps,60000); // [LITE] map list: 1s -> 60s
  let canAutoLogin=creds.autoLogin!==false, manualLoginStarted=false, loginPending=false, choseAt=0, lastPhase='',
      hadCharacter=false, manuallySignedOut=false, loginSeenAt=0;
  let lastSentAt=0; const emitPhase=p=>{if(lastPhase!==p||Date.now()-lastSentAt>30000){lastPhase=p;lastSentAt=Date.now();ipcRenderer.send('bot:phase',p)}}; // [LITE v9.7] nhắc lại mỗi 30 giây
  ipcRenderer.on('login:disable',()=>{canAutoLogin=false;manuallySignedOut=true;manualLoginStarted=false;});
  // Bật toàn bộ/Bật nhóm gửi yêu cầu trực tiếp; vẫn giữ quyền chọn nhân vật tự động
  // sau lần reload từ màn login, không phụ thuộc thời gian render của modal.
  ipcRenderer.on('game:auto-play-request',()=>{ if(!manuallySignedOut){canAutoLogin=true;tryChooseCharacter();} });
  function tryChooseCharacter(){
    if(!canAutoLogin && !manualLoginStarted)return false;
    if(gameCommands.chooseCharacter()){choseAt=Date.now();return true;}
    return false;
  }
  // Modal chọn nhân vật của game được dựng bất đồng bộ. MutationObserver đánh thức
  // bộ chọn sau khi game vừa tạo/gắn nút, bên cạnh vòng kiểm tra 500ms.
  const autoPlayObserver=new MutationObserver(()=>{
    if(gameCommands.state()==='character-select' && (canAutoLogin || manualLoginStarted))tryChooseCharacter();
  });
  const OBS_OPT={subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']};
  autoPlayObserver.observe(document.documentElement,OBS_OPT);
  let obsOn=true;   // [LITE v10.24] trong game thì ngắt observer (game đổi DOM liên tục → tốn CPU), ra màn đăng nhập / chọn NV thì bật lại
  // Chặn autologin ngay ở renderer, kể cả chuyển đổi UI không reload.
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#loY,#bLogout,#utOut')){canAutoLogin=false;manuallySignedOut=true;manualLoginStarted=false;ipcRenderer.send('login:suppress');}
    else if(e.target.closest?.('#ngIn') && !canAutoLogin){manualLoginStarted=true;}
  },true);
  async function tryLogin(){
    if(loginPending||!canAutoLogin)return;
    loginPending=true;
    try {
      const ok=await autoLogin(creds,()=>canAutoLogin);
      if(!ok)emitPhase('error');
    }finally{loginPending=false;}
  }
  function tick(){
    // [LITE v10] ưu tiên cổng trạng thái của game; màn đăng nhập / chọn nhân vật vẫn dùng cách đọc giao diện (cần cho tự đăng nhập)
    const ps=portFresh(8000)?port.st.o:null;
    const phase=ps==='game'?'ingame':ps==='uythac'&&gameCommands.state()==='delegated'?'delegated':gameCommands.state();
    { const want=phase!=='ingame'; if(want!==obsOn){ obsOn=want; if(want)autoPlayObserver.observe(document.documentElement,OBS_OPT); else autoPlayObserver.disconnect(); } }
    if(phase==='delegated'){emitPhase('delegated');return;}
    if(phase==='ingame'){
      hadCharacter=true;loginSeenAt=0;manualLoginStarted=false;emitPhase('ingame');
      return;
    }
    if(phase==='character-select' || phase==='character-select-pending'){
      loginSeenAt=0;
      emitPhase('character-select');
      // Đợi handler onclick gắn hoàn tất; observer và tick đều có thể đánh thức.
      if(canAutoLogin || manualLoginStarted)tryChooseCharacter();
      return;
    }
    if(phase==='login'||phase==='title'){   // [LITE v10.6] màn chào xử lý như màn đăng nhập
      // Phát hiện logout xảy ra bằng nút trong game, không tự đăng nhập lại.
      if(!loginSeenAt) loginSeenAt=Date.now();
      // Chỉ tự chặn một phiên đã vào game khi màn login tồn tại ổn định.
      // F5 có thể chớp màn login trong lúc game tải lại, không phải đăng xuất.
      if(hadCharacter&&!manuallySignedOut && Date.now()-loginSeenAt>2500){
        canAutoLogin=false;manuallySignedOut=true;ipcRenderer.send('login:suppress');
      }
      emitPhase(!canAutoLogin?'login-manual':'login');
      if(canAutoLogin && !loginPending){void tryLogin();}
      return;
    }
    loginSeenAt=0;
    if(!lastPhase)emitPhase('loading');
  }
  tick();setInterval(tick,500);
});

// [LITE v3] Quét đồ quý mỗi 5 phút: HKMP, Đồ phổ HK môn phái, Thần Mã
// Phạm vi: Đang mặc/cưỡi, Hành trang, Rương, Kho, Mã Trường (+ đồ phổ dạng nguyên liệu). Chỉ đọc bản lưu, không ghi gì.
(() => {
  const { activeSlot } = require('./game-progress');
  const WHERE = { inv: 'Hành trang', chest: 'Rương', epBox: 'Kho', stable: 'Mã Trường', mats: 'Nguyên liệu' };
  const isHK = it => !!(it && it.set && it.set.kind === 'gold' && Array.isArray(it.req) && it.req.some(r => Array.isArray(r) && r[0] === 39));
  // [LITE v10.5] Món quý khác: có dòng "Tất cả kỹ năng +n" (allskill_v, không gắn kỹ năng riêng) hoặc nhẫn đặc biệt của game
  const SPECIAL_RINGS = new Set(['Vô Danh Chỉ Hoàn', 'Vô Danh Giới Chỉ', 'Càn Khôn Giới Chỉ']);
  const SP_SKIP = new Set(['Nhu Tình Cân Quốc Nghê Thường']);   // áo Nhu Tình (kể cả [Cực phẩm])
  let allSkillId = null;
  const isSpecial = it => {
    const base = String(it.n || '').replace(/^\[[^\]]*\]\s*/, '').trim();
    if (SPECIAL_RINGS.has(base)) return true;
    if (SP_SKIP.has(base)) return false;   // [LITE v10.5.1] bỏ qua món có kỹ năng vốn có nhưng không quý
    if (isHK(it)) return false;   // [LITE v10.5.2] HKMP đã có mục báo riêng
    if (allSkillId == null) { try { allSkillId = Array.isArray(window.JX?.attr) ? window.JX.attr.indexOf('allskill_v') : -1; } catch { allSkillId = -1; } }
    const lines = [...(Array.isArray(it.mag) ? it.mag : []), ...(Array.isArray(it.ext) ? it.ext : [])];
    return lines.some(m => m && typeof m === 'object' && ((allSkillId >= 0 && m.a === allSkillId) || /kỹ năng vốn có|tất cả kỹ năng/i.test(m.n || '')) && Array.isArray(m.p) && !(m.p[2] > 0));
  };
  // [LITE v10.11] + nhận theo tên "Đồ phổ …" (gói Đồ phổ máy chủ gửi về); món lạ có pack/tên Đồ phổ mà không nhận ra → ghi 1 dòng chẩn đoán
  const dpName = it => String((typeof it.dp === 'string' && it.dp.trim()) || (it.pack && it.pack.k === 'dp' && (it.pack.n || it.n || 'Đồ phổ')) || (/^Đồ phổ\s/.test(String(it.n || '')) && it.n) || '').trim().replace(/^Đồ phổ\s+(?=\S)/, '');
  let diagDone = false;
  // [LITE v10.10] game nén món trong bản lưu (trường _c: tên / icon / yêu cầu… lấy theo bảng vật phẩm) → khôi phục giống game (islFull)
  let ISL = null, ISLAF = null;
  const ISL_F = [['n', 'n'], ['ic', 'i'], ['req', 'q'], ['price', 'c'], ['lvl', 'l'], ['base', 'b']];
  const islRow = (d, p) => { const J = window.JX; if (!J || !J.items) return null; if (!ISL) { ISL = {}; for (const k in J.items) { const a = ISL[k] = {}; for (const s of (J.items[k].list || [])) if (a[s.p] === undefined) a[s.p] = s; } } return (ISL[d] || {})[p]; };
  const islAffix = (m, pre) => { const J = window.JX; if (!J || !Array.isArray(J.affix)) return undefined; if (!ISLAF) { ISLAF = {}; for (const a of J.affix) (ISLAF[a.a + '|' + a.pre] = ISLAF[a.a + '|' + a.pre] || []).push(a); } const v = Array.isArray(m.p) ? m.p[0] : null; for (const a of ISLAF[m.a + '|' + pre] || []) { const r = a.p && a.p[0]; if (r && v >= Math.min(r[0], r[1]) && v <= Math.max(r[0], r[1])) return a.n; } };
  const islRev = (_k, v) => {
    if (!v || typeof v !== 'object' || typeof v._c !== 'string') return v;
    const c = v._c, row = islRow(v.d, v.p); delete v._c;
    if (row) for (const [a, s] of ISL_F) if (c.includes(s) && row[a] !== undefined) v[a] = JSON.parse(JSON.stringify(row[a]));
    if (c.includes('m') && Array.isArray(v.mag)) v.mag = v.mag.map((m, i) => { const pre = i % 2 === 0 ? 1 : 0; return { a: m.a, p: m.p, n: islAffix(m, pre), pre }; });
    return v;
  };
  function scan() {
    try {
      const h = h5Save();   // [LITE v10.12] máy chủ mới: đọc từ H5; game cũ: bản lưu localStorage
      let D = h ? gameSave() : null;
      if (!D) { const raw = localStorage.getItem(activeSlot()); if (!raw) return; D = JSON.parse(JSON.parse(raw).d, islRev); }
      if (!D || !D.fac) return;
      const out = { hk: {}, dp: {}, tm: {}, sp: {} };
      const add = (cat, name, n, where) => {
        name = String(name || 'Chưa rõ').replace(/\s*\[\d+(?::\d+){2,}\]\s*$/, '').trim();
        const e = out[cat][name] || (out[cat][name] = { n: name, c: 0, w: {} });
        e.c += n; e.w[where] = (e.w[where] || 0) + n;
      };
      // [LITE v3.1] thêm đồ đang mặc / ngựa đang cưỡi; chống đếm trùng theo uid
      const eqList = Object.entries(D.eq && typeof D.eq === 'object' ? D.eq : {}).map(([slot, it]) => [it, slot === 'horse' ? 'Đang cưỡi' : 'Đang mặc']);
      // [LITE v10.5] thêm bộ trang bị đang cất (Trang bị 1/2 không dùng)
      const eqsOff = (D.eqs && Array.isArray(D.eqs.s) ? D.eqs.s : []).flatMap((set, i) => set && typeof set === 'object' ? Object.values(set).map(it => [it, 'Trang bị ' + (i + 1)]) : []);
      const sources = [...eqList, ...eqsOff, ...['inv', 'chest', 'epBox', 'stable'].flatMap(k => (Array.isArray(D[k]) ? D[k] : []).map(it => [it, WHERE[k]]))];
      const seen = new Set();
      for (const [it, where] of sources) {
        if (!it || typeof it !== 'object') continue;
        if (it.uid != null) { if (seen.has(it.uid)) continue; seen.add(it.uid); }
        const dp = dpName(it);
        if (!dp && !diagDone && (it.pack || /Đồ phổ/.test(String(it.n || ''))) && !(it.pack && /^(shard|pdl)$/.test(it.pack.k))) { diagDone = true; try { ipcRenderer.send('lab:auto:log', 'chẩn đoán món lạ: ' + JSON.stringify({ n: it.n, d: it.d, p: it.p, dp: it.dp, pack: it.pack, k: Object.keys(it) }).slice(0, 300)); } catch {} }
        if (dp) add('dp', dp, it.pack && it.pack.k === 'dp' ? Math.max(1, +it.pack.c || 1) : 1, where);
        else if (isHK(it)) add('hk', it.n || 'Hoàng Kim Môn Phái', 1, where);
        if (it.thanma) add('tm', it.n || 'Thần Mã', 1, where);
        if (isSpecial(it)) add('sp', it.n || ('Món quý (loại ' + it.d + ' · ' + it.p + ')'), 1, where);   // [LITE v10.5] kỹ năng vốn có (Tất cả kỹ năng) / nhẫn đặc biệt
      }
      for (const [k, c] of Object.entries((D.mats && D.mats.dp) || {})) if (+c > 0) add('dp', k, +c, WHERE.mats);
      const list = cat => Object.values(out[cat]).map(e => ({ n: e.n, c: e.c,
        w: Object.entries(e.w).map(([a, b]) => b > 1 ? a + ' ×' + b : a).join(', ') }));
      const dt = D.dt || {};
      ipcRenderer.send('lab:treasure', { name: String(D.name || '').slice(0, 40), at: Date.now(), hk: list('hk'), dp: list('dp'), tm: list('tm'), sp: list('sp'), dtN: dt.n | 0, dtSv: dt.sv != null ? dt.sv | 0 : null, dgLeft: dgLeft(D) });
    } catch (e) { console.warn('[LITE] quét đồ quý lỗi', e); }
  }
  setTimeout(scan, 60000); setInterval(scan, 5 * 60000);   // [LITE v10.11] 30 → 5 phút: Đồ phổ nhặt được / món đã bán cập nhật nhanh (đọc bản lưu ~vài ms)   // [LITE v10] 5 → 30 phút; đồ mới nhặt đã có từ cổng trạng thái
  ipcRenderer.on('lab:treasure:scan', scan);
})();

// [LITE v10.25] Nhiệm vụ Dã Tẩu ở bản đồ cao hơn cấp hiện tại (vd nhận ở Vi Sơn Đảo 130+ rồi chuyển sinh về cấp 110):
// bản 1041 máy chủ không cho lên bản đồ đó → game bấm đi rồi bị trả về, lặp mãi. dtUnreach() = {zn, need, lvl} nếu đang kẹt như vậy.
function dtUnreach() {
  try {
    const G = window.H5 && window.H5.G; if (typeof G !== 'function') return null;
    const S = G('S'), Z = G('ZONES'), ZA = G('ZALT');
    const t = S && S.dt && S.dt.task; if (!t || t.zi == null || !Z || !Z[t.zi]) return null;
    const z = t.za ? (ZA && ZA[t.zi] && ZA[t.zi][t.za - 1]) : Z[t.zi]; if (!z || !(z.lo > 0)) return null;
    return (S.lvl | 0) < z.lo ? { zn: z.n, need: z.lo, lvl: S.lvl | 0 } : null;
  } catch { return null; }
}
let dtStuckNoLdt = false;
// [LITE v10.31] nhịp leo Tháp (farm Tháp không có kinh nghiệm): ghi lúc lên mỗi tầng → giây / tầng trong 30 phút gần nhất
const TW = { f: 0, at: 0, log: [] };
setInterval(() => {
  try {
    const G = window.H5 && window.H5.G; if (typeof G !== 'function') return;
    const R = G('R'), f = R && R.tower ? (R.tower.floor | 0) : 0; if (!f) return;
    const now = Date.now();
    if (f !== TW.f) { if (f > TW.f && TW.f) TW.log.push({ f, t: now }); else TW.log = [{ f, t: now }]; TW.f = f; TW.at = now; }
    TW.log = TW.log.filter(e => now - e.t < 30 * 60e3).slice(-200);
  } catch {}
}, 2000);
function towerStat() {
  let best = 0; try { const S = window.H5.G('S'); best = (S && S.rw && S.rw.stat && +S.rw.stat.towerBest) || 0; } catch {}   // kỷ lục tầng (chỉ đọc)
  if (!TW.f) return best ? { f: 0, best } : null;
  const L = TW.log, n = L.length >= 2 ? L[L.length - 1].f - L[0].f : 0;
  return { f: TW.f, best: Math.max(best, TW.f), spf: n > 0 ? Math.round((L[L.length - 1].t - L[0].t) / 1000 / n) : null, n, cur: Math.round((Date.now() - TW.at) / 1000) };
}   // kẹt mà hết Lệnh Bài → lịch bỏ qua Dã Tẩu hôm nay (không bấm Hủy vì mất chuỗi)
// [LITE v10.23] Boss HK hiện tại theo máy chủ H5 (chỉ đọc): on = Boss đợt này còn sống & nhân vật chưa hạ.
function gbLive() {
  try {
    const H = window.H5; if (!H || !H.st) return null;
    const g = H.st.gb, run = H.st.run && H.st.run.mode || '';
    let auto; try { const S = typeof H.G === 'function' ? H.G('S') : null; auto = S ? S.autoGb === true : undefined; } catch {}
    return { on: !!(g && g.key && g.ok && !g.killed), killed: !!(g && g.killed), key: g && g.key || '', n: g && g.n || '', run, autoGb: auto };
  } catch { return null; }
}
// [LITE v9] Lệnh cho "Tự chạy lịch" (Manager điều khiển). Chỉ dùng nút / ô chọn có sẵn của game.
(() => {
  const { activeSlot } = require('./game-progress');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const modalOpen = () => { const m = q('#modal'); return !!m && !m.classList.contains('hidden'); };
  const todayStr = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const readSave = () => gameSave();   // [LITE v10.12] dữ liệu máy chủ mới (H5)
  let lastUser = 0;
  for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, e => { if (userEv(e)) lastUser = Date.now(); }, true);
  // [LITE v10] info nhẹ: lấy từ cổng trạng thái + giao diện; chỉ đọc file lưu khi cần (full) hoặc game chưa có cổng
  const domMode = () => q('#mswMenu [data-msw].on')?.dataset.msw || null;
  function info(arg) {
    const kicked = !!q('#ssHere'), blocked = !!document.getElementById('tabLockBox'), idleMs = Date.now() - lastUser;
    const s = portFresh(10000) ? port.st : null;
    const full = !!(arg && arg.full) || !s;
    const D = full ? readSave() : null;
    if (s && s.o !== 'game') return { ok: false, o: s.o, kicked: kicked || s.phien === 'da', blocked, idleMs };
    if (!s && (!D || !D.fac)) return { ok: false, kicked, blocked, idleMs };
    const r = { ok: true, port: !!s, name: s ? s.ten : String(D.name || ''), mode: domMode() || (D && D.mode) || '', kicked: kicked || (s && s.phien === 'da'), blocked, idleMs,
      today: s && s.dt ? s.dt[0] | 0 : 0, cap: s && s.dt ? s.dt[1] | 0 : 0, gbArr: s && Array.isArray(s.gb) ? s.gb : null, luu: s ? s.luu : 0, lt: s ? s.lt : '', noi: s ? s.noi : '' };
    if (D) {
      const dt = D.dt || {}; if (!s) { r.today = dt.day === gameDay() ? (dt.today | 0) : 0; r.cap = (dt.du && dt.du === dt.day ? Math.min(200, dt.today | 0) : Math.min(200, 40 + (dt.extra | 0))); }
      r.ldt = (D.mats && D.mats.misc && D.mats.misc.ldt) | 0; r.autoLdt = D.autoLdt !== false; r.autoGb = D.autoGb !== false;
      r.pref = dt.pref || 'xp'; r.auto = dt.auto !== false; r.knbk = D.knbk | 0;
      r.ldtBought = (D.rw && D.rw.ldtBuy && D.rw.ldtBuy.n) | 0; r.dgLeft = dgLeft(D); r.dtTotal = dt.n | 0; r.dtSv = dt.sv != null ? dt.sv | 0 : null;
      r.gb = D.gb ? { key: D.gb.key || '', end: +D.gb.end || 0, done: D.gb.done === true } : null;
    }
    r.gbLive = gbLive();   // [LITE v10.23] Boss HK theo máy chủ H5
    r.dtStuck = dtStuckNoLdt && !!dtUnreach();   // [LITE v10.25]
    // Dã Tẩu xong: đủ 200, hoặc đạt mức hiện tại mà không còn Lệnh Bài / tắt tự dùng Lệnh Bài
    if (r.cap && r.today >= r.cap) { if (r.cap >= 200) r.done = true; else { const D2 = D || readSave(); if (D2) { const l = (D2.mats && D2.mats.misc && D2.mats.misc.ldt) | 0; r.done = l <= 0 || D2.autoLdt === false; if (!D) { r.ldt = l; r.autoLdt = D2.autoLdt !== false; } } } }
    else r.done = false;
    return r;
  }
  async function pref(v) {
    if (String(v).startsWith('ttk:')) { v = String(v).slice(4); if (!booksFull('ttk')) v = 'item'; }   // [V11] Tẩy Tủy Kinh chưa đủ → Vật phẩm (3% ra Tẩy Tủy Kinh)
    const D = readSave(), dt = (D && D.dt) || {};
    if ((dt.pref || 'xp') === v && dt.auto !== false) return { ok: true, changed: false };
    const wasOpen = document.body.classList.contains('u20win');
    let sel = q('#dtPref');
    if (!sel) {
      const b = q('#u20menu .u20mi[data-u="quest"]') || q('#tabs [data-t="quest"]'); if (b) b.click();
      await sleep(900);
      const tab = q('#t-quest [data-qt="dt"]'); if (tab && !tab.classList.contains('on')) { tab.click(); await sleep(600); }
      sel = q('#dtPref');
    }
    let ok = false;
    if (sel) {
      sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); ok = true; await sleep(300);
      const self = q('#dtSelf'); if (self && self.checked) { self.click(); await sleep(300); }
    }
    if (!wasOpen && document.body.classList.contains('u20win')) q('#u20wx')?.click();
    return { ok, changed: ok };
  }
  async function collect() {
    for (let i = 0; i < 8; i++) {
      const b = q('#offOk');
      if (b && modalOpen()) { b.click(); await sleep(500); return { ok: true, collected: true }; }
      await sleep(1000);
    }
    return { ok: true, collected: false };
  }
  // Mua tối đa Lệnh Bài Dã Tẩu ở Bảng KNB khóa. Game tự khóa nút khi hết KNB khóa hoặc đã đủ 100 lần/ngày.
  async function buyLdt(arg) {
    const before = readSave(); const n0 = (before && before.rw && before.rw.ldtBuy && before.rw.ldtBuy.n) | 0;
    // [LITE v10.42b] CHỈ acc chính (Hùng cho phép 12/11): thiếu KNB khóa để mua đủ 100 Lệnh Bài/ngày → đổi KNB thường → KNB khóa đúng phần thiếu (lệnh ẩn k2k của game)
    // [V11] vừa qua 00:00 mà game vẫn báo đã mua 100/100 (số của hôm qua, máy chủ chưa gửi ngày mới) → chưa mua được, giữ Dã Tẩu, thử lại sau
    const hh = new Date(Date.now() + 7 * 3600e3).getUTCHours(), pendK = 'lite_ldtPend_' + gameDay();
    if (n0 >= 100 && hh === 0) { try { localStorage.setItem(pendK, '1'); } catch {} return { ok: false, stale: true, err: 'game chưa sang ngày mới (vẫn báo đã mua 100/100) — 3 phút sau thử lại' }; }
    try { localStorage.removeItem(pendK); } catch {}
    let k2kMsg = '';
    if (arg && arg.k2k && n0 < 100) {
      try {
        const inf = await vlmApi('info', {}, 8000), d = inf && inf.ok !== false ? (inf.r || inf) : null;
        const gia = (d && d.gia && d.gia.ldt) | 0 || 20, mua = Math.max(0, ((d && d.ldtMax) | 0 || 100) - ((d && d.ldtMua) | 0)), need = mua * gia - ((d && d.knbk) | 0);
        if (d && need > 0) {
          const n = Math.min(need, (d.knb | 0), d.k2kCon == null ? need : (d.k2kCon | 0));
          if (n > 0) { const r = await vlmApi('k2k', { n }, 10000); const got = r && (r.n != null ? r.n : r.r && r.r.n); try { ipcRenderer.send('lab:spend', 'k2k', got != null ? got : n); } catch {} k2kMsg = `đổi ${got != null ? got : n} KNB → KNB khóa (thiếu ${need} để mua ${mua} Lệnh Bài)`; await sleep(800); }
          else k2kMsg = `thiếu ${need} KNB khóa nhưng không đủ KNB thường để đổi`;
        }
      } catch (e) { k2kMsg = 'đổi KNB khóa lỗi: ' + (e && e.message); }
      if (k2kMsg) try { ipcRenderer.send('lab:auto:log', k2kMsg); } catch {}
    }
    if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
    const open = q('#u20ktc'); if (!open) return { ok: false, err: 'không thấy nút Kỳ Trân Các' };
    open.click(); await sleep(900);
    const bang = q('#mBody [data-kb="0"]'); if (bang && !bang.classList.contains('on')) { bang.click(); await sleep(600); }
    if (!q('#mBody [data-ktc="ldt"]')) {
      for (const c of document.querySelectorAll('#mBody [data-kc]')) { c.click(); await sleep(500); if (q('#mBody [data-ktc="ldt"]')) break; }
    }
    const btn = s => { const b = q(`#mBody [${s}="ldt"]`); return b && !b.disabled ? b : null; };
    if (!q('#mBody [data-ktc="ldt"]')) { if (modalOpen()) q('#mClose')?.click(); return { ok: false, err: 'không thấy Lệnh Bài Dã Tẩu trong Kỳ Trân Các' }; }
    let clicks = 0;
    let b = btn('data-ktc100'); if (b) { b.click(); clicks++; await sleep(700); }
    for (let i = 0; i < 10 && (b = btn('data-ktc10')); i++) { b.click(); clicks++; await sleep(600); }
    for (let i = 0; i < 9 && (b = btn('data-ktc')); i++) { b.click(); clicks++; await sleep(500); }
    if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
    await sleep(11000);   // chờ game lưu
    const after = readSave(); const n1 = (after && after.rw && after.rw.ldtBuy && after.rw.ldtBuy.n) | 0;
    return { ok: true, bought: Math.max(0, n1 - n0), total: n1, knbk: (after && after.knbk) | 0, clicks };
  }
  // [LITE v9.6] Quà hằng ngày ở bảng Phần thưởng: Điểm danh, Mốc cấp, đổi Hồng Bao / Đại Hồng Bao (Tri Ân Nhà Giáo).
  // Chỉ bấm nút đang sáng của game; nút tối (không đủ điều kiện / đã nhận) thì bỏ qua.
  // [LITE v10] Kỳ Trân Các › Bảng Kim Nguyên Bảo › Đổi KNB: đổi lượng lấy KNB tới đủ 1.000 / ngày (game tự khóa nút khi đủ / thiếu lượng)
  async function buyKnb() {
    if (modalOpen()) { q('#mClose')?.click(); await sleep(400); }
    const open = q('#u20ktc'); if (!open) return { ok: false, err: 'không thấy nút Kỳ Trân Các' };
    open.click(); await sleep(1000);
    const kb = q('#mBody [data-kb="1"]'); if (kb && !kb.classList.contains('on')) { kb.click(); await sleep(700); }
    if (!q('#mBody [data-ktc="knb"]')) for (const c of document.querySelectorAll('#mBody [data-kc]')) { c.click(); await sleep(600); if (q('#mBody [data-ktc="knb"]')) break; }
    const card = () => q('#mBody [data-ktc="knb"]')?.closest('.u2card, .shoprow');
    const cnt = () => { const m = /đã đổi\s*([\d.]+)/i.exec(card()?.innerText || '') || /([\d.]+)\s*\/\s*1\.?000/.exec(card()?.innerText || ''); return m ? +m[1].replace(/\./g, '') : null; };
    if (!card()) { if (modalOpen()) q('#mClose')?.click(); return { ok: false, err: 'không thấy ô Kim Nguyên Bảo' }; }
    const n0 = cnt(); let clicks = 0;
    for (const [attr, max] of [['data-ktc100', 10], ['data-ktc10', 10], ['data-ktc', 9]]) {
      for (let i = 0; i < max; i++) {
        const b = q(`#mBody [${attr}="knb"]`); if (!b || b.disabled) break;
        const c0 = cnt(); b.click(); clicks++; await sleep(1200);
        const c1 = cnt(); if (c0 != null && c1 != null && c1 <= c0) break;   // không tăng: hết lượt / thiếu lượng
      }
    }
    const n1 = cnt();
    if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
    return { ok: true, bought: n0 != null && n1 != null ? n1 - n0 : null, total: n1, clicks };
  }
  // [LITE v10] Tri Ân Nhà Giáo: đủ 40 Bó Hoa để tặng mỗi ngày — chỉ ghép phần còn thiếu (thiếu Giấy Gói thì mua, thiếu Thiệp thì ghép), rồi bấm "Hết" ở Bó Hoa
  async function triAn() {
    const ng = sel => q(`#mBody [data-ng="${sel}"]`);
    const rowTxt = sel => (ng(sel)?.closest('.qrow')?.innerText || '');
    const num = (t, re) => { const m = re.exec(t); return m ? +m[1] : null; };
    const boRow = () => rowTxt('du:bo:1');
    const dn = num(boRow(), /hôm nay\s*(\d+)/i), cap = num(boRow(), /tối đa\s*(\d+)\s*điểm/i) || 40;
    if (dn == null) return { ok: false, err: 'không thấy dòng Bó Hoa Tri Ân' };
    const need = Math.max(0, cap - dn); if (!need) return { ok: true, done: true, msg: `Bó Hoa hôm nay đã đủ ${dn}/${cap}` };
    const parts = [];
    let bo = num(boRow(), /Bó Hoa Tri Ân:\s*(\d+)/i) | 0;
    const craft = Math.max(0, need - bo);
    if (craft) {
      const gg = num(rowTxt('gg:10'), /Giấy Gói:\s*(\d+)/i) | 0, thiep = num(rowTxt('du:thiep:1'), /Thiệp Tri Ân:\s*(\d+)/i) | 0;
      let k = 0;
      for (let i = 0; i < Math.ceil(Math.max(0, craft - gg) / 10); i++) { const b = ng('gg:10'); if (!b || b.disabled) break; b.click(); k += 10; await sleep(900); }
      if (k) parts.push(`mua ${k} Giấy Gói`);
      k = 0;
      for (let i = 0; i < Math.max(0, craft - thiep); i++) { const b = ng('gh:thiep:1'); if (!b || b.disabled) break; b.click(); k++; await sleep(350); }
      if (k) parts.push(`ghép ${k} Thiệp`);
      k = 0;
      for (let i = 0; i < craft; i++) { const b = ng('gh:bo:1'); if (!b || b.disabled) break; b.click(); k++; await sleep(350); }
      if (k) parts.push(`ghép ${k} Bó Hoa`);
      await sleep(800);
    }
    const give = ng('du:bo:1000');
    if (give && !give.disabled) { give.click(); await sleep(3500); }
    const dn2 = num(boRow(), /hôm nay\s*(\d+)/i);
    parts.push(`tặng Bó Hoa (hôm nay ${dn2 != null ? dn2 : '?'}/${cap})`);
    return { ok: true, msg: parts.join(', '), done: dn2 != null && dn2 >= cap };
  }
  // [LITE v10.9] Phúc Duyên (sau Dã Tẩu + Phó Bản, cùng lượt nhận thưởng): đóng hết Phúc Duyên chờ thành bình → dùng hết 3 loại bình
  // → mở Rương Phúc Duyên bằng toàn bộ Phúc Duyên (10 / rương). Chỉ qua lệnh ẩn của game, không mở bảng.
  async function phucDuyen() {
    let I = await vlmApi('info', {}, 8000); if (!I.ok) return '';
    const out = [];
    if (I.pdl && ((I.pdl.cho | 0) >= 10 || (I.pdl.l || []).some(n => n > 0))) {
      const r = await vlmApi('pdl', {}, 45000);
      if (r.ok && (r.dong || r.fd)) out.push(`bình Phúc Duyên: ${r.dong ? 'đóng hết, ' : ''}dùng hết (+${r.fd | 0} Phúc Duyên)`);
      else if (!r.ok) out.push('bình Phúc Duyên: ' + (r.why || 'lỗi'));
      const I2 = await vlmApi('info', {}, 8000); if (I2.ok) I = I2;
    }
    let mo = 0;
    for (let i = 0; i < 200 && (I.fd | 0) >= 10; i++) {   // [V11] mở hết (lệnh ẩn = nút 'Mở hết' của game, 10 rương/lần)
      const r = await vlmApi('ruong', { n: Math.min(10, Math.floor((I.fd | 0) / 10)) }, 45000); if (!r.ok || !r.n) { if (!r.ok) out.push('Rương Phúc Duyên: ' + (r.why || 'lỗi')); break; }
      mo += r.n; await sleep(800);
      const I2 = await vlmApi('info', {}, 8000); if (!I2.ok) break; I = I2;
    }
    if (mo) out.push(`mở ${mo} Rương Phúc Duyên`);
    return out.join(', ');
  }
  // [V11] Cống hiến bang theo số đặt từng acc (LCFG.me.gopV vạn, gopK KNB mỗi ngày). Bấm đúng ô/nút của game (#bhGopV/#bhGopVb, #bhGopK/#bhGopKb) + hộp xác nhận.
  const dayKey = k => 'lite_' + k + '_' + gameDay();
  const dayGet = k => { try { return +localStorage.getItem(dayKey(k)) || 0; } catch { return 0; } };
  const dayAdd = (k, n) => { try { localStorage.setItem(dayKey(k), String(dayGet(k) + n)); } catch {} };
  async function gopBang() {
    const me = LCFG.me || {}, wantV = Math.max(0, (me.gopV | 0) - dayGet('gopV')), wantK = Math.max(0, (me.gopK | 0) - dayGet('gopK'));
    if (!wantV && !wantK) return '';
    if (modalOpen()) { q('#mClose')?.click(); await sleep(400); }
    if (!q('#bhGopV')) { const b = q('#u20menu .u20mi[data-u="bang"]'); if (!b) return 'cống hiến bang: không thấy nút Bang'; b.click(); await sleep(1800); const t = q('[data-bht="gop"]'); if (t) { t.click(); await sleep(1500); } }
    if (!q('#bhGopV')) { if (modalOpen()) q('#mClose')?.click(); return 'cống hiến bang: chưa vào bang hoặc không mở được mục Cống hiến'; }
    const out = [];
    for (const [inp, btn, want, k, unit] of [['#bhGopV', '#bhGopVb', wantV, 'gopV', 'vạn'], ['#bhGopK', '#bhGopKb', wantK, 'gopK', 'KNB']]) {
      if (!want) continue;
      const el = q(inp), b = q(btn); if (!el || !b || b.disabled) { dayAdd(k + 'Het', 1); out.push(`${unit}: hết lượt bang hôm nay`); continue; }
      const n = Math.min(want, Math.max(0, +el.max || want)); if (!n) { dayAdd(k + 'Het', 1); out.push(`${unit}: hết lượt bang hôm nay`); continue; }
      el.value = String(n); el.dispatchEvent(new Event('input', { bubbles: true })); b.click(); await sleep(700);
      const box = q('#askBox'), yes = box && box.querySelector('[data-a="1"]');
      if (!yes || !/Góp/.test(box.innerText || '')) { if (box) box.querySelector('[data-a="0"]')?.click(); out.push(`${unit}: không thấy hộp xác nhận`); continue; }
      yes.click(); await sleep(2500); dayAdd(k, n); try { ipcRenderer.send('lab:spend', k, n); } catch {}
      out.push(`góp ${n.toLocaleString('vi-VN')} ${unit}`);
      if (!q(inp)) { const t = q('[data-bht="gop"]'); if (t) { t.click(); await sleep(1200); } }
    }
    if (modalOpen()) { q('#mClose')?.click(); await sleep(300); } else if (document.body.classList.contains('u20win')) q('#u20wx')?.click();
    return out.length ? 'cống hiến bang: ' + out.join(', ') : '';
  }
  // [V11] Lệnh Bài Sát Thủ: mua LCFG.me.st cái/ngày (100 KNB/cái, game cho tối đa 100/ngày) bằng lệnh ẩn muaLb của game (≤10/lần)
  async function muaSatThu() {
    let want = Math.max(0, ((LCFG.me || {}).st | 0) - dayGet('st')); if (!want) return '';
    let got = 0, why = '';
    for (let i = 0; i < 12 && want > 0; i++) { const r = await vlmApi('muaLb', { n: Math.min(10, want) }, 15000); const n = r && r.ok !== false ? (r.n | 0) : 0; if (!n) { why = (r && r.why) || ''; break; } got += n; want -= n; dayAdd('st', n); await sleep(600); }
    if (got) try { ipcRenderer.send('lab:spend', 'st', got); } catch {}
    return got ? `mua ${got} Lệnh Bài Sát Thủ` : (why ? 'Lệnh Bài Sát Thủ: ' + why : '');
  }
  async function daily(arg) {
    if (Date.now() - lastUser < 60000) return { ok: false, busy: true };
    const on = b => b && !b.disabled;
    const tab = async g => { const t = q(`#mBody #giftTabs button[data-g="${g}"]`); if (!t) return false; if (!t.classList.contains('on')) { t.click(); await sleep(1000); } return true; };
    const got = []; let hbPending = false, knbDone = !!(arg && arg.knbDone), triDone = !!(arg && arg.triDone);
    if (!quaOn('knb')) knbDone = true;   // [V11] tick quà
    if (autoOffMe()) return { ok: false, off: true };
    if (!knbDone) { const k = await buyKnb(); if (k.ok) { knbDone = true; if (k.bought) got.push(`đổi ${k.bought} KNB (hôm nay ${k.total})`); } else got.push('KNB: ' + (k.err || 'lỗi')); }
    if (modalOpen()) { q('#mClose')?.click(); await sleep(400); }
    const open = q('#u20gift'); if (!open) return { ok: false, err: 'không thấy nút Phần thưởng' };
    open.click(); await sleep(1500);
    if (!modalOpen() || !q('#giftTabs')) return { ok: false, err: 'không mở được bảng Phần thưởng' };
    // [LITE v10.9] Điểm danh + Mốc cấp bằng lệnh ẩn của game; game cũ → bấm bảng như trước
    const qa = quaOn('dd') ? await vlmApi('qua') : { ok: true };
    if (qa.ok) { if (qa.login) got.push('điểm danh'); if (qa.lv) got.push(`${qa.lv} mốc cấp`); }
    else if (quaOn('dd') && await tab('login')) { const b = q('#gLogin'); if (on(b)) { b.click(); await sleep(1500); got.push('điểm danh'); } }
    if (!qa.ok && quaOn('dd') && await tab('lvms')) {
      let n = 0; const all = q('#gLvAll');
      if (on(all)) { all.click(); await sleep(1500); n = -1; }
      else for (let i = 0; i < 20; i++) { const b = q('#mBody [data-lv]:not([disabled])'); if (!b) break; b.click(); n++; await sleep(900); }
      if (n) got.push(n < 0 ? 'mốc cấp (tất cả)' : `${n} mốc cấp`);
    }
    if (await tab('ng')) {
      const find = dai => [...document.querySelectorAll('#mBody button')].find(b => {
        if ((b.innerText || '').trim() !== 'Đổi') return false;
        const row = b.closest('.qrow') || b.parentElement; const t = row ? row.innerText || '' : '';
        return dai ? /Đại Hồng Bao/.test(t) : /Hồng Bao/.test(t) && !/Đại Hồng Bao/.test(t);
      });
      // [LITE v9.8] máy chủ (bản 1007) chỉ cho đổi khi hôm nay đã hạ đủ 1.000 quái — nút vẫn sáng nhưng đổi không được.
      // Đếm "x/y hôm nay" trước/sau mỗi lần bấm; không tăng = máy chủ từ chối → để lần sau thử lại.
      const cnt = dai => { const b = find(dai); const row = b && (b.closest('.qrow') || b.parentElement); const m = row && /(\d+)\s*\/\s*(\d+)\s*hôm nay/.exec(row.innerText || ''); return m ? [+m[1], +m[2]] : null; };
      for (const [dai, label] of [[true, 'Đại Hồng Bao'], [false, 'Hồng Bao']]) {
        if (!quaOn(dai ? 'dhb' : 'hb')) continue;   // [V11]
        let n = 0, refused = '';
        for (let i = 0; i < 3; i++) {
          const b = find(dai); const c0 = cnt(dai);
          if (!on(b) || (c0 && c0[0] >= c0[1])) break;
          const t0 = (q('#toast')?.innerText || '');
          b.click(); await sleep(3000);
          const c1 = cnt(dai);
          if (c0 && c1 && c1[0] > c0[0]) n++;
          else { refused = ((q('#toast')?.innerText || '') !== t0 ? (q('#toast')?.innerText || '') : '') || 'máy chủ chưa cho đổi'; break; }
        }
        if (n) got.push(`đổi ${n} ${label}`);
        const c = cnt(dai), b = find(dai);
        if (b && on(b) && !(c && c[0] >= c[1])) { hbPending = true; if (refused) got.push(`${label}: ${refused.trim().slice(0, 60)} → thử lại sau`); }
      }
      // [LITE v10.2] đổi luôn các món còn lại ở "Đổi nguyên liệu thừa" tới hết lượt hôm nay (Tiên Thảo Lộ Đặc Biệt → Tiên Thảo Lộ → Quế Hoa Tửu…)
      if (quaOn('doi')) {
        const rows = () => [...document.querySelectorAll('#mBody [data-ng^="doi:"]')].map(b => { const row = b.closest('.qrow') || b.parentElement, t = row?.innerText || ''; const m = /(\d+)\s*\/\s*(\d+)\s*hôm nay/.exec(t); return { b, k: b.dataset.ng, name: (t.split('\n')[0] || '').replace(/^\W*\d+\s*/, '').trim(), c: m ? [+m[1], +m[2]] : null }; });
        const order = r => /Đặc Biệt/.test(r.name) ? 0 : /Tiên Thảo/.test(r.name) ? 1 : 2;
        for (const r0 of rows().filter(r => !/Hồng Bao/.test(r.name)).sort((x, y) => order(x) - order(y))) {
          let n = 0;
          for (let i = 0; i < 40; i++) {
            const r = rows().find(x => x.k === r0.k); if (!r || !on(r.b) || (r.c && r.c[0] >= r.c[1])) break;
            r.b.click(); await sleep(450);
            const r2 = rows().find(x => x.k === r0.k); if (r.c && r2?.c && r2.c[0] <= r.c[0]) break;   // không tăng: thiếu nguyên liệu / hành trang đầy
            n++;
          }
          if (n) got.push(`đổi ${n} ${r0.name}`);
        }
      }
      if (!quaOn('tri')) triDone = true;
      if (!triDone) { const t = await triAn(); if (t.ok) { triDone = true; if (t.msg && !/đã đủ/.test(t.msg)) got.push(t.msg); } else got.push('Tri Ân: ' + (t.err || 'lỗi')); }
    } else triDone = true;   // hết sự kiện
    if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
    if (quaOn('pd')) try { const pd = await phucDuyen(); if (pd) got.push(pd); } catch {}   // [LITE v10.9]
    try { const g = await gopBang(); if (g) got.push(g); } catch (e) { got.push('cống hiến bang lỗi: ' + (e && e.message)); }   // [V11]
    try { const t = await muaSatThu(); if (t) got.push(t); } catch (e) { got.push('Lệnh Bài Sát Thủ lỗi: ' + (e && e.message)); }
    const onlyRef = got.length && got.every(x => /thử lại sau/.test(x));
    if (!(onlyRef && window.__labHbRef)) try { ipcRenderer.send('lab:auto:log', 'quà hằng ngày: ' + (got.join(', ') || 'không có gì để nhận')); } catch {}
    if (onlyRef) window.__labHbRef = 1;   // chỉ báo 1 lần, các lần thử lại sau không ghi lặp
    return { ok: true, got, hbPending, knbDone, triDone };
  }
  // [LITE v10.4] Trước khi ủy thác: game không cho ủy thác khi đang ở Tháp / phó bản → chuyển Luyện Công, chờ ra bãi (tối đa 30 giây), đưa về Mạc Bắc
  async function prepExit() {
    const noi = () => portFresh() ? port.st.noi : null;
    const m0 = domMode(), n0 = noi();
    if (m0 === 'farm' && (n0 === 'bai' || n0 === 'thanh' || n0 == null)) return { ok: true, noi: n0, moved: false };
    if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
    if (m0 !== 'farm') await tasks.setMode('farm');
    const t0 = Date.now();
    while (Date.now() - t0 < 30000 && noi() != null && noi() !== 'bai' && noi() !== 'thanh') await sleep(1000);
    if (labToMacBac && (noi() === 'bai' || noi() === 'thanh' || noi() == null)) { try { await labToMacBac(); } catch {} await sleep(1500); }
    return { ok: noi() == null || noi() === 'bai' || noi() === 'thanh', noi: noi(), moved: true, from: m0 };
  }
  // [LITE v10.5] đổi bộ Trang bị 1 / 2 bằng nút của game (màn hình Nhân vật)
  async function gear(n) {
    const want = n === 2 ? 1 : 0, D = readSave();
    if (D && D.eqs && D.eqs.a === want) return { ok: true, changed: false };
    if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
    const wasOpen = document.body.classList.contains('u20win'), prevU = q('#u20menu .u20mi.on:not([data-u=ride])')?.dataset.u || null;
    if (!q(`[data-eqt="${want}"]`)) { (q('#u20menu .u20mi[data-u="char"]') || q('#tabs [data-t="char"]'))?.click(); await sleep(1000); }
    const b = q(`[data-eqt="${want}"]`); if (!b) return { ok: false, err: 'không thấy nút Trang bị' };
    if (!b.classList.contains('on')) { b.click(); await sleep(900); }
    const ok = !!q(`[data-eqt="${want}"].on`);
    if (!wasOpen && document.body.classList.contains('u20win')) q('#u20wx')?.click();
    else if (prevU && prevU !== 'char') q(`#u20menu .u20mi[data-u="${prevU}"]`)?.click();
    return { ok, changed: true };
  }
  // [V11.14] quét bù 30 phút: việc nào trong ngày chưa xong (chỉ đọc bộ đếm trong ngày + bản lưu)
  const pending = async () => { const me = LCFG.me || {}, sv = readSave(), lb = sv && sv.rw && sv.rw.ldtBuy;
    return { ok: true, gop: (Math.max(0, (me.gopV | 0) - dayGet('gopV')) > 0 && !dayGet('gopVHet')) || (Math.max(0, (me.gopK | 0) - dayGet('gopK')) > 0 && !dayGet('gopKHet')),
      st: Math.max(0, (me.st | 0) - dayGet('st')) > 0, ldt: lb && lb.d === gameDay() ? (lb.n | 0) : 0 }; };
  const cmds = { gear, prepExit, info: async a => info(a), pref, mode: async m => ({ ok: await tasks.setMode(m) }), collect, buyLdt, daily, pending,
    gop: async () => { if (Date.now() - lastUser < 60000) return { ok: false, busy: true }; if (autoOffMe()) return { ok: false, off: true }; return { ok: true, msg: await gopBang() }; },
    satthu: async () => { if (autoOffMe()) return { ok: false, off: true }; return { ok: true, msg: await muaSatThu() }; },
    hbNow: async () => LENH.hb ? await LENH.hb() : { ok: false, why: 'chưa sẵn sàng' },   // [LITE v10.45]
    hbAll: async () => LENH.hbAll ? await LENH.hbAll() : { ok: false, why: 'chưa sẵn sàng' },
    hoso: async () => { try {   // [V11] mã hồ sơ cho Thiên Cơ Toán — chỉ đọc (H5.G 1 tham số), sao chép JSON
      const G = window.H5 && window.H5.G, S0 = G && G('S'); if (!S0 || !S0.fac) return { ok: false, why: 'chưa vào game' };
      const S = JSON.parse(JSON.stringify({ name: S0.name, fac: S0.fac, sex: S0.sex, lvl: S0.lvl, main: S0.main, sk: S0.sk, eq: S0.eq, attr: S0.attr, rw: { title: S0.rw && S0.rw.title, pet: S0.rw && S0.rw.pet, petDex: S0.rw && S0.rw.petDex, stat: S0.rw && S0.rw.stat } }));
      const st = window.H5.st, c = st && st.char, w = (S.eq || {}).weapon;
      const hs = { vll: 1, at: Date.now(), name: (c && c.name) || S.name || '', fac: S.fac, sex: S.sex | 0, lvl: S.lvl | 0, reborn: (c && c.reborn) | 0 || ((S.rw.stat || {}).reborn | 0), mainId: +S.main || 0,
        petDexN: S.rw.petDex ? Object.keys(S.rw.petDex).length : 0, sk: S.sk || {}, buffs: [], curses: [], weapon: w ? { n: w.n || '', enh: (w.enh != null ? w.enh : w.e) | 0 } : null,
        eq: S.eq || {}, attr: S.attr || {}, title: S.rw.title || '', pet: S.rw.pet || null };
      return { ok: true, hs };
    } catch (e) { return { ok: false, why: String(e && e.message) }; } },
    prefsNow: async () => LENH.prefs ? await LENH.prefs() : { ok: false, why: 'chưa sẵn sàng' },
    gioihan: async () => { try {   // [V11.7] CHỈ ĐỌC (H5.G 1 tham số): giới hạn acc/IP, theo máy, sự kiện Tri Ân
      const G = window.H5 && window.H5.G; if (!G) return { ok: false, why: 'chưa có H5' };
      const rd = k => { try { return G(k); } catch { return undefined; } };
      const I = rd('IPL') || {}, N = rd('NET') || {}, T = rd('TAB') || {}, NG = rd('NG') || {}, me = NG.me || {};
      const t = v => v ? new Date(+v).toLocaleString('vi-VN') : null;
      return { ok: true,
        ip: { dangChoi: I.n | 0, toiDa: I.max | 0, chan: !!I.chan, tat: !!I.off, lanHoi: t(I.t) },
        theoMay: { chan: !!N.tb4, daHien: !!N.tb4Shown },
        tab: { khoa: !!T.blocked, why: T.why || '' },
        triAn: { bat: !!NG.bat, tu: t(NG.tu), den: t(NG.den), giaLangMay: NG.gia != null ? +NG.gia : null, x2: !!NG.n20, lmMua: me.lm_mua | 0, langDung: me.lang_dung | 0 } };
    } catch (e) { return { ok: false, why: String(e && e.message) }; } },
    snap: async () => { try {
      const G = window.H5 && window.H5.G, S = G && G('S'), R = G && G('R'), st = window.H5 && window.H5.st, a = (st && st.amat) || {}, w = (st && st.wallet) || {}, p = portFresh(8000) ? port.st : {};
      return { ok: true, lvl: S && S.lvl, mode: S && S.mode, noi: p.noi, tang: R && R.tower ? R.tower.floor : null, best: TW && TW.f, knb: w.knb != null ? w.knb : S && S.knb, knbk: S && S.knbk, vanLuong: S ? Math.floor((+S.gold || 0) / 1e4) : null,
        hb: a.hb | 0, dhb: a.dhb | 0, dt: p.dt, gb: p.gb, gucNay: !!(R && R.deadT > 0), dgPhut: Math.round(((DGT && DGT.ms) || 0) / 60e3) };
    } catch (e) { return { ok: false, why: String(e && e.message) }; } } };
  ipcRenderer.on('lab:sched:cmd', async (_e, rid, cmd, arg) => {
    let r; try { r = await cmds[cmd](arg); } catch (e) { r = { ok: false, err: String(e) }; }
    ipcRenderer.send('lab:sched:reply', rid, r);
  });
})();

// [LITE v9.3] Game báo "đang mở ở tab khác" ngay trong ô của client (thường sau khi game tự tải bản mới,
// tab cũ chưa kịp nhả) -> sau 90 giây vẫn còn thì bấm nút "Chơi ở tab này" của game.
(() => {
  let seen = 0;
  setInterval(() => {
    const box = document.getElementById('tabLockBox'), go = document.getElementById('tabGo');
    if (box && go && !go.disabled && /tab khác/i.test(box.innerText || '')) {
      if (!seen) seen = Date.now();
      else if (Date.now() - seen > 90000) { seen = 0; go.click(); ipcRenderer.send('lab:auto:log', 'game báo "đang mở ở tab khác" → bấm Chơi ở tab này'); }
    } else seen = 0;
  }, 30000);
})();

// [LITE v10] Kết nối máy chủ — lấy từ cổng trạng thái của game (không đọc file lưu). Gửi Manager khi đổi, nhắc lại 5 phút/lần.
//  noi = đang nối máy chủ thưởng · giu = đang nối lại · mat = mất (kèm thời điểm) · khong = chơi không mạng
//  Game chưa có cổng (bản cũ): báo unknown.
(() => {
  let last = '', lastAt = 0;
  function check() {
    const out = { st: 'unknown', why: '', at: Date.now() };
    const lock = document.getElementById('tabLockBox'), s = portFresh(15000) ? port.st : null;
    if (lock) { out.st = 'blocked'; out.why = (lock.querySelector('h3')?.innerText || 'Game đang tạm dừng').trim().slice(0, 90); }
    else if (s && s.phien === 'da') { out.st = 'kicked'; out.why = 'đang mở ở nơi khác'; }
    else if (s && s.o === 'uythac') { out.st = 'gate'; out.why = 'đang ủy thác'; }
    else if (s && s.o === 'game') {
      out.mode = q0('#mswMenu [data-msw].on')?.dataset.msw || '';
      const m = Math.round((Date.now() - (s.ltT || Date.now())) / 60000);
      if (s.lt === 'mat') { out.st = 'noloot'; out.why = `mất máy chủ phần thưởng ${m} phút`; out.lostAt = s.ltT; }
      else if (s.lt === 'giu') { out.st = 'checking'; out.why = 'đang nối lại máy chủ phần thưởng'; }
      else { out.st = 'ok'; out.why = s.lt === 'khong' ? 'chơi không mạng' : ''; }
      out.luu = s.luu || 0;
    } else if (s) { out.st = 'gate'; out.why = s.o === 'menu' ? 'màn chào / chọn nhân vật' : s.o === 'dangnhap' ? 'màn đăng nhập' : s.o; }
    const sig = out.st + '|' + (out.st === 'noloot' ? Math.floor((Date.now() - (out.lostAt || 0)) / 300000) : '');
    if (sig !== last || Date.now() - lastAt > 300000) { last = sig; lastAt = Date.now(); ipcRenderer.send('lab:conn', out); }
  }
  const q0 = s => document.querySelector(s);
  setTimeout(() => { check(); setInterval(check, 20000); }, 30000);
  ipcRenderer.on('lab:conn:check', () => { last = ''; check(); });
})();

// [LITE v5] Tự động (bật/tắt ở bảng bên trái Manager). Quét ngẫu nhiên 3–5 phút/lần.
// 1) Đang ở chế độ Nhiệm Vụ mà đã hết lượt Dã Tẩu trong ngày -> chuyển Luyện Công.
// 2) Tiên Thảo Lộ / Tiên Thảo Lộ Đặc Biệt sắp hết (< 5 phút) hoặc đã hết -> dùng 1 bình trong Hành trang.
// Chỉ bấm các nút có sẵn của game (menu Chế độ, ô vật phẩm, nút "Dùng 1"); bỏ qua lượt nếu người dùng vừa thao tác.
(() => {
  const { activeSlot } = require('./game-progress');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const modalOpen = () => { const m = q('#modal'); return !!m && !m.classList.contains('hidden'); };
  const log = m => ipcRenderer.send('lab:auto:log', m);
  let acfg = { farm: false, tt: false }, lastUser = 0, running = false;
  ipcRenderer.on('lab:auto:cfg', (_e, c) => { acfg = { ...acfg, ...(c || {}) }; });
  for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, e => { if (userEv(e)) lastUser = Date.now(); }, true);
  const readSave = () => gameSave();   // [LITE v10.12] dữ liệu máy chủ mới (H5)
  // [LITE v10] Hết Dã Tẩu (chế độ Nhiệm Vụ) → Phó Bản nếu còn lượt, không thì Luyện Công.
  //            Hết phó bản (chế độ Phó Bản, không đang trong phó bản) → Luyện Công.
  //            Mỗi lần vào Luyện Công → đưa tới Mạc Bắc Thảo Nguyên (sau đó bạn tự đổi bản đồ thì giữ nguyên).
  async function autoFarm(D) {
    const mode = domMode(); if (!q('#mswBtn')) return;
    if (mode === 'quest') {
      const dt = D.dt || {}, today = dt.day === gameDay() ? (dt.today | 0) : 0;
      const cap = (dt.du && dt.du === dt.day ? Math.min(200, dt.today | 0) : Math.min(200, 40 + (dt.extra | 0))), ldt = (D.mats && D.mats.misc && D.mats.misc.ldt) | 0;
      if (today < cap || (cap < 200 && ldt > 0 && D.autoLdt !== false)) return;
      try { if (localStorage.getItem('lite_ldtPend_' + gameDay()) && new Date(Date.now() + 7 * 3600e3).getUTCHours() < 2) return; } catch {}   // [V11] chờ mua xong Lệnh Bài rồi mới rời Dã Tẩu
      const left = dgLeft(D);
      if (left > 0 && LCFG.pb !== false) { const ok = await tasks.setMode('dg'); log(ok ? `Dã Tẩu ${today}/${cap} xong → Phó Bản (còn ${left} lượt)` : 'Dã Tẩu xong nhưng chuyển Phó Bản chưa được'); }
      else { const ok = await tasks.setMode('farm'); log(ok ? `Dã Tẩu ${today}/${cap} xong → Luyện Công` : 'Dã Tẩu xong nhưng chuyển Luyện Công chưa được'); }
    } else if (mode === 'dg') {
      if (dgCut()) { if (!DGT.moved) { DGT.moved = 1; dgtSave(); const ok = await tasks.setMode('farm'); log(ok ? `Phó Bản quá ${DG_MAX_MS / 60e3} phút hôm nay → bỏ các lượt còn lại, về Luyện Công / Tháp` : 'Phó Bản quá giờ nhưng chuyển chế độ chưa được'); if (!ok) DGT.moved = 0; } return; }
      if (portFresh() && port.st.noi === 'phoban') return;   // đang trong phó bản
      const left = dgLeft(D); if (left > 0) return;
      const ok = await tasks.setMode('farm'); log(ok ? 'hết lượt phó bản → Luyện Công' : 'hết phó bản nhưng chuyển Luyện Công chưa được');
    }
  }
  const domMode = () => q('#mswMenu [data-msw].on')?.dataset.msw || null;
  let prevMode = null;
  setTimeout(() => { labToMacBac = toMacBac; }, 0);
  async function toMacBac() {
    const j = window.JW; if (!j || !Array.isArray(j.zones)) return false;
    let idx = -1, alt = 0;
    const want = String(LCFG.farmMap || 'Mạc Bắc Thảo Nguyên').toLowerCase(), isW = n => !!n && String(n).toLowerCase() === want;   // [V11] chọn bản đồ Luyện Công
    j.zones.forEach((m, i) => { if (idx < 0 && m && isW(m.n)) { idx = i; alt = 0; } (j.zalt?.[i] || []).forEach((z, k) => { if (idx < 0 && z && isW(z.n)) { idx = i; alt = k + 1; } }); });
    const mapN = LCFG.farmMap || 'Mạc Bắc Thảo Nguyên';
    if (idx < 0) { log('không tìm thấy bản đồ ' + mapN); return false; }
    const ok = await tasks.farmOnce(idx, alt);
    log(ok ? 'Luyện Công → ' + mapN : 'chưa chuyển được tới ' + mapN);
    return ok;
  }
  async function useItem(uid) {
    const before = { win: document.body.classList.contains('u20win'), u: q('#u20menu .u20mi.on:not([data-u=ride])')?.dataset.u || null, bag: document.body.classList.contains('u2bagon') };
    const find = () => q(`#t-inv .it[data-uid="${uid}"]`) || q(`.it[data-uid="${uid}"]`);   // [LITE v10.3] cả giao diện túi mới
    const bagShown = () => document.body.classList.contains('u2bagon') || (document.body.classList.contains('u20win') && !!q('#u20menu .u20mi.on[data-u="inv"]'));
    if (!bagShown()) { const b = q('#u20menu .u20mi[data-u="inv"]') || q('#tabs [data-t="inv"]'); if (b) b.click(); await sleep(900); }
    let ok = false;
    const el = find();
    if (el) {
      el.click(); await sleep(600);
      const use = q('#kiUse');
      if (use && modalOpen()) { use.click(); ok = true; await sleep(700); }
      if (modalOpen()) { q('#mClose')?.click(); await sleep(250); }
    }
    try {
      if (!before.bag && document.body.classList.contains('u2bagon')) (q('#u2bwx') || q('#u20menu .u20mi[data-u="inv"]'))?.click();
      if (!before.win && document.body.classList.contains('u20win')) q('#u20wx')?.click();
      else if (before.win && before.u && !q(`#u20menu .u20mi.on[data-u="${before.u}"]`)) q(`#u20menu .u20mi[data-u="${before.u}"]`)?.click();
    } catch {}
    return ok;
  }
  async function autoTT(D) {
    const now = Date.now(), inv = Array.isArray(D.inv) ? D.inv : [];
    for (const [buf, key, label] of [['tt', 'tt', 'Tiên Thảo Lộ'], ['tt2', 'ttsp', 'Tiên Thảo Lộ Đặc Biệt'], ['luck', 'qht', 'Quế Hoa Tửu'], ['luck2', 'tsbl', 'Thiên Sơn Bảo Lộ']]) {   // [LITE v10.5] + 2 bình may mắn
      if (!thuocOn(key)) continue;   // [V11] tick từng loại thuốc
      const until = +(D.buf && D.buf[buf] && D.buf[buf].until) || 0;
      if (until - now > 5 * 60e3) continue;
      const it = inv.find(x => x && x.ktc && x.ktc.k === key && (x.ktc.c | 0) > 0);
      if (!it) continue;
      // [LITE v10.8] game 1041: bấm túi đồ không dùng được nữa → Tiên Thảo Lộ / TTL Đặc Biệt dùng qua lệnh ẩn của game (không mở túi)
      let ok = false;
      if (key === 'tt' || key === 'ttsp') { const r = await vlmApi('dungTui', { k: key }); ok = !!(r.ok && r.n > 0); if (!r.ok && /lệnh lạ/.test(r.why || '')) ok = await useItem(it.uid); }
      else ok = await useItem(it.uid);
      if (ok) { ttFail = 0; log(`dùng 1 ${label} (còn ${Math.max(0, (it.ktc.c | 0) - 1)} trong hành trang)`); }
      else { if (!ttFail) log(`không dùng được ${label} — 30 phút sau thử lại`); ttFail = Date.now(); }   // [LITE v10.3] trước đây thử lại mỗi phút, mở/đóng túi liên tục
      await sleep(1000);
    }
  }
  // [LITE v6.1] Siêu nhẹ: quét cố định 5 phút/lần và chỉ đọc file save khi thật sự cần.
  // - Dã Tẩu: xem chế độ hiện tại trên giao diện (không đọc save); chỉ đọc save khi đang ở Nhiệm Vụ.
  // - Tiên Thảo Lộ: sau mỗi lần đọc, nhớ thời điểm buff sắp hết; trước thời điểm đó không đọc lại.
  let nextTT = 0, ttFail = 0, khanNext = Date.now() + 90e3, khanLogAt = 0;
  function planTT(D) {
    const now = Date.now(), inv = Array.isArray(D.inv) ? D.inv : [];
    let due = Infinity;
    for (const [buf, key] of [['tt', 'tt'], ['tt2', 'ttsp'], ['luck', 'qht'], ['luck2', 'tsbl']]) {
      if (!thuocOn(key)) continue;
      if (!inv.some(x => x && x.ktc && x.ktc.k === key && (x.ktc.c | 0) > 0)) continue;   // không có bình -> không cần canh
      const until = +(D.buf && D.buf[buf] && D.buf[buf].until) || 0;
      due = Math.min(due, until - 5 * 60e3);
    }
    // không có bình nào: 30 phút sau xem lại (phòng khi mới nhặt/mua)
    nextTT = due === Infinity ? now + 30 * 60e3 : Math.max(now, due);
    if (ttFail && now - ttFail < 30 * 60e3) nextTT = Math.max(nextTT, ttFail + 30 * 60e3);
  }
  async function tick() {
    try {
      if (running) return;
      if (autoOffMe()) return;   // [V11] 🤖 tắt riêng acc này
      const mode = domMode();
      // vừa chuyển sang Luyện Công (do game, do lịch hay do bạn) → Mạc Bắc
      // [LITE v10.3] ô đang xem (không màn hình đen) mà bạn vừa thao tác trong 3 phút → không bấm gì vào game (tránh giật chuột / mở túi khi bạn đang điều khiển)
      const userNear = Date.now() - lastUser < (port.want === false ? 180000 : 20000);
      if (userNear) return;
      if (mode === 'farm' && prevMode && prevMode !== 'farm' && acfg.farm && !(portFresh() && port.st.noi !== 'bai' && port.st.noi !== 'thanh')) {
        prevMode = mode; running = true; try { await toMacBac(); } finally { running = false; } return;
      }
      prevMode = mode;
      // [LITE v10.9] Khấn tượng mỗi ngày (+20% kinh nghiệm 8 giờ): lệnh ẩn của game tự dịch chuyển tới tượng, khấn rồi quay về.
      // Chỉ khi bật "Nhận thưởng", đang Luyện Công, không ở Phó Bản/Tháp/Truy sát/chết; giờ Boss game tự từ chối → 10 phút sau thử lại.
      if (acfg.daily !== false && mode === 'farm' && Date.now() >= khanNext && !modalOpen() && !(gbLive() || {}).on) {   // [LITE v10.23] không khấn khi còn Boss HK
        khanNext = Date.now() + 10 * 60e3;
        const I = await vlmApi('info', {}, 8000);
        if (I.ok && I.khan) khanNext = Date.now() + 60 * 60e3;
        else if (I.ok && !I.dg && !I.tower && !I.sat && !I.dead) {
          running = true;
          try {
            const r = await vlmApi('khan', {}, 60000);
            if (r.ok && (r.xong || r.da)) { khanNext = Date.now() + 60 * 60e3; if (r.xong) log('khấn tượng: +20% kinh nghiệm 8 giờ'); }
            else if (Date.now() - khanLogAt > 60 * 60e3) { khanLogAt = Date.now(); log('khấn tượng chưa được (' + (r.why || 'game chưa cho, có thể đang giờ Boss') + ') — 10 phút sau thử lại'); }
          } finally { running = false; }
          return;
        }
      }
      if (!(acfg.farm || acfg.tt)) return;
      if (modalOpen()) return;   // đang có bảng mở -> để lượt sau
      const needFarm = acfg.farm && (mode === 'quest' || mode === 'dg');
      const needTT = acfg.tt && Date.now() >= nextTT;
      if (!needFarm && !needTT) return;                           // phần lớn các lượt dừng ở đây, không đọc save
      const D = readSave(); if (!D || !D.fac) return;
      running = true;
      if (needFarm) await autoFarm(D);
      if (needTT) { await autoTT(D); await sleep(12000); planTT(readSave() || D); }
    } catch (e) { console.warn('[LITE] tự động lỗi', e); }
    finally { running = false; }
  }
  ipcRenderer.on('lab:farm:macbac', () => { if (!running) { running = true; toMacBac().finally(() => { running = false; }); } });
  ipcRenderer.on('lab:auto:cfg', () => { nextTT = 0; });          // bật lại ô tick -> kiểm tra ngay lượt sau
  const loop = () => setTimeout(async () => { await tick(); loop(); }, 60000);   // [LITE v10] 1 phút/lần (phần lớn lượt chỉ xem chế độ trên giao diện)
  setTimeout(() => { tick(); loop(); }, 60000);
})();

// [LITE v4.1] Chụp nhân vật: Manager điều khiển từng bước (mở màn hình Nhân vật, mở/đóng cửa sổ xem từng món).
// Chỉ mở/đóng cửa sổ xem của game, không bấm nút thao tác nào khác.
(() => {
  const { activeSlot } = require('./game-progress');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const charBtn = () => q('#u20menu .u20mi[data-u="char"]') || q('#tabs [data-t="char"]');
  const charOpen = () => !!q('#u20menu .u20mi.on[data-u="char"]') && document.body.classList.contains('u20win');
  const modalOpen = () => { const m = q('#modal'); return !!m && !m.classList.contains('hidden'); };
  const charText = () => (q('#t-char')?.innerText || '').trim();
  const rectOf = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 20 ? { x: Math.max(0, Math.floor(r.left)), y: Math.max(0, Math.floor(r.top)), width: Math.ceil(r.width), height: Math.ceil(r.height) } : null; };
  let prev = null;
  async function ensureChar() {
    for (let i = 0; i < 3 && !(charOpen() && charText().length > 80); i++) {
      if (!charOpen()) charBtn()?.click();
      await sleep(i ? 1200 : 800);
    }
    return charText().length > 80;
  }
  const cmds = {
    async open() {
      const on = q('#u20menu .u20mi.on:not([data-u=ride])');
      prev = { winOpen: document.body.classList.contains('u20win'), u: on ? on.dataset.u : null };
      if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
      let name = '';
      try { const raw = localStorage.getItem(activeSlot()); name = raw ? String(JSON.parse(JSON.parse(raw).d).name || '') : ''; } catch {}
      const ok = await ensureChar();
      const panel = q('#panel') || q('#t-char');
      return { ok, name, text: charText(), slots: [...document.querySelectorAll('#t-char .slot[data-slot], #t-char .eqsap[data-slot]')].filter(s => s.querySelector('.it')).map(s => s.dataset.slot).filter(Boolean),   // [V11.11] có cả Ngựa, Chiến Ấn; ô trống bỏ qua
        rect: rectOf(panel), diag: ok ? '' : `u20menu=${!!q('#u20menu')} body=${document.body.className}` };
    },
    async item(slot) {
      if (!(await ensureChar())) return { ok: false };
      const it = q(`#t-char [data-slot="${slot}"] .it`); if (!it) return { ok: false };
      it.scrollIntoView({ block: 'center' }); it.click(); await sleep(500);
      if (slot === 'horse') { const hi = q('#mBody #hpInfo'); if (hi) { hi.click(); await sleep(500); } }   // [V11.13] Ngựa: bảng Chọn ngựa → Chi tiết
      if (!modalOpen()) return { ok: false };
      const body = q('#mBody');
      return { ok: true, text: (body?.innerText || '').trim(), rect: rectOf(body?.parentElement || body) };
    },
    async closeItem() { if (modalOpen()) { q('#mClose')?.click(); await sleep(250); } return { ok: true }; },
    // [V11.11] mở thêm bảng để chụp: Võ công, Chiêu chính (tooltip), Đồng hành / Thú điển / Trang bị đồng hành, Danh hiệu đang đeo. Chỉ mở/xem, không bấm nút thao tác.
    async panel(kind) {
      if (modalOpen() && !/^pet:/.test(kind)) { q('#mClose')?.click(); await sleep(300); }
      const txt = el => (el?.innerText || '').trim();
      const mrect = () => rectOf(q('#mBody')?.parentElement || q('#mBody'));
      const openSkill = async () => { if (!q('#u20menu .u20mi.on[data-u="skill"]')) (q('#u20menu .u20mi[data-u="skill"]') || q('#tabs [data-t="skill"]'))?.click(); await sleep(900); return txt(q('#t-skill')).length > 20; };
      if (kind === 'skill') { const ok = await openSkill(); return { ok, text: txt(q('#t-skill')), rect: rectOf(q('#t-skill')) }; }
      if (kind === 'main') {
        if (!(await openSkill())) return { ok: false, err: 'không mở được bảng Võ công' };
        let R = null; try { R = window.H5.G('R'); } catch {}
        const m = R && R.P && R.P.main, isBasic = !m || (R.P.basic && R.P.basic === m);
        const el = isBasic ? q('#u2basic') : q(`#t-skill .u2k[data-id="${m.id}"]`);
        if (!el) return { ok: false, err: 'không thấy ô chiêu chính' };
        el.scrollIntoView({ block: 'center' }); await sleep(200);
        const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y })); await sleep(400);
        const tip = q('#skTip'); const ok = !!tip && !tip.hidden && txt(tip).length > 5;   // [V11.13] #skTip position:fixed → offsetParent luôn null
        return { ok, text: (m ? 'Chiêu chính: ' + (m.n || '') + '\n' : '') + txt(tip), rect: rectOf(tip), el: 1 };
      }
      if (/^pet:/.test(kind)) {
        const tab = kind.slice(4);
        if (!q('#mBody .ptabs')) {
          if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
          const b = q('#u20pet'); if (!b || b.style.display === 'none') return { ok: false, err: 'chưa mở khóa Đồng hành' };
          b.click(); await sleep(1000);
        }
        const t = q(`#mBody [data-ptab="${tab}"]`); if (!t) return { ok: false, err: 'không thấy tab ' + tab };
        if (!t.classList.contains('on')) { t.click(); await sleep(900); }
        q('#mBody')?.scrollTo?.(0, 0);
        return { ok: modalOpen(), text: txt(q('#mBody')), rect: mrect() };
      }
      if (kind === 'title') {
        if (!(await ensureChar())) return { ok: false, err: 'không mở được Nhân vật' };
        const b = q('#bTitle'); if (!b) return { ok: false, err: 'không thấy nút Danh hiệu' };
        b.click(); await sleep(900);
        if (!modalOpen()) return { ok: false, err: 'không mở được bảng Danh hiệu' };
        const on = q('#mBody [data-tt].on'); const row = on && on.closest('.qrow');
        if (!row) return { ok: true, text: 'Chưa đeo danh hiệu.', rect: rectOf(q('#mBody .ttcur')) || mrect() };
        row.scrollIntoView({ block: 'center' }); await sleep(300);
        return { ok: true, text: txt(row).replace(/\s*Tháo\s*$/, ''), rect: rectOf(row) };
      }
      return { ok: false };
    },
    async closePanel() {
      const tip = q('#skTip'); if (tip && !tip.hidden) { document.querySelectorAll('#t-skill .u2k[data-id], #u2basic').forEach(e => e.dispatchEvent(new MouseEvent('mouseleave'))); }
      if (modalOpen()) { q('#mClose')?.click(); await sleep(300); }
      await ensureChar();
      return { ok: true };
    },
    async finish() {
      try {
        if (modalOpen()) q('#mClose')?.click();
        if (!prev || !prev.winOpen) { if (document.body.classList.contains('u20win')) q('#u20wx')?.click(); }
        else if (prev.u && prev.u !== 'char') q(`#u20menu .u20mi[data-u="${prev.u}"]`)?.click();
      } catch {}
      return { ok: true };
    }
  };
  ipcRenderer.on('lab:snap:cmd', async (_e, rid, cmd, arg) => {
    let r; try { r = await cmds[cmd](arg); } catch (e) { r = { ok: false, err: String(e) }; }
    ipcRenderer.send('lab:snap:reply', rid, r);
  });
})();

// Keep Firefox collection and EXP/loot calculation code unchanged; swap only browser.* bridge.
// [LITE] Tắt module thống kê
// try { require('./extension-game'); } catch (error) { console.error('Extension game bridge failed:', error); }

// [LITE v9.5] bảng THÔNG BÁO luật máy chủ ("…BẠN CÓ ĐỒNG TÌNH KHÔNG?") → bấm nút "TÔI ĐỒNG TÌNH" ngay
(() => {
  const RX = /(t[ôo]i\s*)?[đd][ồo]ng\s*t[ìi]nh/i;
  let last = 0;
  setInterval(() => {
    if (Date.now() - last < 4000) return;
    for (const b of document.querySelectorAll('button, .btn, [role="button"], a')) {   // [LITE v10.24] textContent (không ép tính layout) thay innerText
      const t = (b.textContent || '').trim();
      if (!t || t.length > 40 || !RX.test(t) || /kh[ôo]ng/i.test(t)) continue;
      if (!b.offsetParent && getComputedStyle(b).position !== 'fixed') continue;   // chỉ nút đang hiện
      let p = b.parentElement, ok = false;   // phải nằm trong bảng có câu hỏi "…đồng tình không" (tránh bấm nhầm tên người chơi "TOI DONG TINH" ở Chợ)
      for (let i = 0; p && i < 6; i++, p = p.parentElement) if (/[đd][ồo]ng\s*t[ìi]nh\s*kh[ôo]ng/i.test(p.textContent || '')) { ok = true; break; }
      if (!ok) continue;
      last = Date.now(); b.click();
      try { ipcRenderer.send('lab:auto:log', 'bảng Thông báo luật máy chủ → bấm "' + t.slice(0, 30) + '"'); } catch {}
      break;
    }
  }, 2000);
})();

// [LITE v9.5.1] bảng "Ủy thác hoàn tất" (thưởng đã cộng sẵn, nút Nhận chỉ đóng bảng) → bấm Nhận ngay.
// Bảng này che màn hình nên client chưa coi acc là "đã vào game" → lịch đổi ca bị kẹt tới khi có người bấm.
(() => {
  setInterval(() => {
    const m = document.getElementById('modal'), b = document.getElementById('offOk');
    if (!b || !m || m.classList.contains('hidden')) return;
    b.click();
    try { ipcRenderer.send('lab:auto:log', 'bấm Nhận ở bảng "Ủy thác hoàn tất"'); } catch {}
  }, 2000);
})();

// [LITE v10.8→v10.15] 🏃 Chạy né quái (hit-and-run). Game vẫn ở chế độ Tự động: bấm chuột lên sân = game tạm cho đi tới điểm đó
// rồi tự quay về Tự động, nhân vật vẫn đánh quái trong tầm. Game không cho đọc vị trí quái nên chạy theo nhịp: chạy run ms, đứng stop ms.
// Thông số: riêng từng nhân vật (bảng bên trái) hoặc mặc định theo CHIÊU CHÍNH: tầm thật của chiêu so với mẫu Âm Phong Thực Cốt (480).
// Chiêu cận chiến (tầm < 150) không có mặc định. Chiêu không đánh trên ngựa: đang cưỡi thì xuống ngựa (không mở bảng Tùy chọn nữa).
(() => {
  const BASE_RAD = 480, BASE = { run: 700, stop: 1300, r: 0.2 };
  const NO_HORSE = new Set([10,11,271,318,319,29,30,31,35,41,324,323,325,347,303,47,50,54,343,345,349,249,341,339,342,351,68,71,353,85,82,385,88,91,328,380,102,105,113,108,111,336,337,122,125,128,357,359,145,138,148,362,155,158,164,165,267,365,368,179,172,176,182,372,375]);   // HORSE_LIM của game (bản 1041)
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const log = m => ipcRenderer.send('lab:auto:log', m);
  let recv = 0, sent = 0, diag = false, blockedSince = 0, blockLogAt = 0;
  document.addEventListener('pointerdown', e => { if (e.isTrusted && Date.now() - kiteSynthAt < 500 && e.target && e.target.id === 'arena') recv++; }, true);
  let mode = 'mouse', noYield = false, keep = 0, style = 'circle';   // [LITE v10.17] cách chạy: chuột (giữ Tự động) / phím (Tự điều khiển); không nhường khi bạn thao tác
  let on = false, custom = null, towerOnly = true, def = null, ep = null, sk = null, skAt = 0, skKey = '', ang = Math.random() * 6.28, dir = 1, phase = 'stop', phaseAt = 0, me = 0, clicks = 0, logAt = Date.now(), dismountAt = 0;
  ipcRenderer.on('lab:kite', (_e, c) => {
    const was = on; on = !!(c && c.on); custom = c && c.p && c.p.run ? c.p : null; towerOnly = !(c && c.towerOnly === false); skKey = ''; skAt = 0;
    try { diagStart = 0; diagPos = null; } catch {}
    const m0 = mode; mode = c && c.mode === 'key' ? 'key' : 'mouse'; noYield = !!(c && c.noYield); keep = +(c && c.keep) || 0; style = (c && c.style) || 'circle'; trig = (c && c.trig) || 'dist'; if (m0 !== mode) release();
    if (on !== was) log(on ? `chạy né quái: BẬT${towerOnly ? ' (chỉ trong Tháp)' : ' (mọi nơi)'}` : 'chạy né quái: TẮT');
  });
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, e => { if (userEv(e)) me = Date.now(); }, true);
  function skRange(k) {   // tầm thật như tooltip "Phạm vi tấn công": SK_RAD_VNG → SK_STD → skill_attackradius theo cấp → radius
    let lv = 20; try { const c = window.H5 && window.H5.st && window.H5.st.char, m = c && (c.sk || c.skl); if (m && +m[k.id] > 0) lv = +m[k.id]; } catch {}
    lv = Math.max(1, Math.min(30, lv | 0));
    let a = (window.SK_STD && window.SK_STD[k.id] && window.SK_STD[k.id].a && window.SK_STD[k.id].a.skill_attackradius) || (k.attr && k.attr.skill_attackradius);
    const V = window.SK_RAD_VNG; if (V && k.id in V) a = V[k.id] ? V[k.id].map(e => [e, 0, 0]) : null;
    const row = Array.isArray(a) ? (a[lv - 1] || a[a.length - 1]) : null;
    return +(row ? (Array.isArray(row) ? row[0] : row) : 0) || +k.radius || 60;
  }
  function mainSkill() {
    const t = String(document.getElementById('bMain')?.title || '').replace(/^Chiêu chính:\s*/, '').trim();
    if (!t || t === '—') return null;
    if (t === 'Đánh thường') return { id: 0, n: t, rad: 60 };
    const all = window.JX && window.JX.skills ? Object.values(window.JX.skills) : [];
    const k = all.find(x => x && x.n === t && x.enemy) || all.find(x => x && x.n === t);
    return k ? { id: k.id, n: k.n, rad: skRange(k) } : { id: -1, n: t, rad: BASE_RAD };
  }
  function profile() {
    if (Date.now() - skAt < 20000 && skKey) return; skAt = Date.now();
    sk = mainSkill(); if (!sk) return;
    const f = sk.rad / BASE_RAD, melee = sk.rad < 150;
    def = melee ? null : { run: Math.round(cl(BASE.run * f, 300, 1200)), stop: Math.round(cl(BASE.stop * f, 500, 1800)), r: +cl(BASE.r * f, 0.08, 0.3).toFixed(2), keep: Math.round(sk.rad * 0.85) };
    ep = custom ? { ...custom } : def;
    const key = sk.n + sk.rad + JSON.stringify(ep) + on; if (key === skKey) return; skKey = key;
    ipcRenderer.send('lab:kite:info', { n: sk.n, rad: sk.rad, melee, noHorse: NO_HORSE.has(sk.id), def });
    if (on) log(ep ? `chạy né quái: chiêu chính ${sk.n} (tầm ${sk.rad}) → chạy ${ep.run} ms / đứng ${ep.stop} ms / xa ${ep.r}${custom ? ' (thông số riêng)' : ''}`
                   : `chạy né quái: chiêu chính ${sk.n} là cận chiến (tầm ${sk.rad}) → không chạy (đặt thông số riêng nếu vẫn muốn chạy)`);
  }
  // bảng của game đang che sân: tìm nút đóng của chính bảng đó (id + "x", vd #u2rw → #u2rwx), hoặc cửa sổ hệ thống / hộp thoại
  function closeBlocker(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) { if (n.id) { const x = document.getElementById(n.id + 'x'); if (x) { x.click(); return n.id; } } }
    if (document.querySelector('#modal:not(.hidden)')) { document.getElementById('mClose')?.click(); return 'modal'; }
    return '';
  }
  // [LITE v10.16] Chạy bằng PHÍM MŨI TÊN ở chế độ "Tự điều khiển" (game: nhân vật tự đánh quái trong tầm, phím mũi tên để đi).
  // Không bấm chuột lên sân nữa → không vướng bảng che sân, đồ rơi dưới đất (bấm trúng = đi nhặt), màn hình đen.
  // Bắt đầu chạy: chuyển Tự điều khiển (nút Auto của game); dừng / ra khỏi Tháp: nhả phím, trả lại Tự động nếu client đã đổi.
  const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  let held = new Set(), switched = false, lastAutoCheck = 0;
  const key = (type, k) => { try { window.dispatchEvent(new KeyboardEvent(type, { key: k, code: k, bubbles: true })); } catch {} };
  const setKeys = want => { for (const k of ARROWS) { const w = want.has(k); if (w && !held.has(k)) key('keydown', k); if (!w && held.has(k)) key('keyup', k); } held = new Set(want); };
  const ctrlBtn = () => document.getElementById('ctrlBtn');
  const isAuto = () => { const b = ctrlBtn(); return !b || b.classList.contains('on'); };
  function release() {
    if (held.size) setKeys(new Set());
    if (switched && !isAuto()) { ctrlBtn()?.click(); }
    switched = false;
  }
  function mouseStep(now) {   // cách CHUỘT (v10.15): game giữ Tự động, bấm điểm trên vòng tròn quanh tâm sân
    const ar = document.getElementById('arena'); if (!ar) return;
    const r = ar.getBoundingClientRect(); if (r.width < 60 || r.height < 60) return;
    ang += 0.35 * dir;
    const z = (webFrame && webFrame.getZoomFactor && webFrame.getZoomFactor()) || 1, R = Math.min(r.width, r.height) * (ep.r || 0.2);
    let cx = 0, cy = 0, hit = null;
    for (let i = 0; i < 8; i++) { const a2 = ang + i * Math.PI / 4; cx = r.left + r.width / 2 + Math.cos(a2) * R; cy = r.top + r.height / 2 + Math.sin(a2) * R; hit = document.elementFromPoint(cx, cy); if (hit === ar) { ang = a2; break; } }
    if (hit !== ar) {
      if (!blockedSince) blockedSince = now;
      if (now - blockedSince > 6000) { blockedSince = now; const who = closeBlocker(hit); if (now - blockLogAt > 5 * 60e3) { blockLogAt = now; log(`chạy né quái: bảng ${who || (hit && (hit.id || hit.className)) || '?'} đang che sân → ${who ? 'đã đóng' : 'không đóng được, bạn đóng giúp'}`); } }
      return;
    }
    blockedSince = 0; kiteSynthAt = Date.now(); clicks++; sent++;
    ipcRenderer.send('lab:kite:click', cx * z, cy * z);
    if (!diag && sent >= 20) { diag = true; log(`chạy né quái (chuột): đã gửi ${sent} cú bấm, trúng sân ${recv}`); }
  }
  function keyStep(now) {   // cách PHÍM (v10.16): Tự điều khiển + giữ phím mũi tên
    ang += 0.35 * dir;
    const dx = Math.cos(ang), dy = Math.sin(ang), want = new Set();
    if (dx > 0.38) want.add('ArrowRight'); else if (dx < -0.38) want.add('ArrowLeft');
    if (dy > 0.38) want.add('ArrowDown'); else if (dy < -0.38) want.add('ArrowUp');
    setKeys(want); clicks++; sent++;
    if (!diag && sent >= 20) { diag = true; log(`chạy né quái (phím): đang chạy bằng phím mũi tên (${ep.run} ms chạy / ${ep.stop} ms đứng)`); }
  }
  // [LITE v10.18] GIỮ KHOẢNG CÁCH THẬT: game để sẵn hàm đọc dữ liệu cho máy chủ mới (window.H5.G — chỉ ĐỌC R, H, CAM).
  // Đo khoảng cách như game (jxd: trục dọc ×2, chia JX_K), giữ quái gần nhất ở "khoảng cách giữ" (mặc định 85% tầm chiêu):
  //   gần hơn → lùi + chạy vòng / qua lại quanh mục tiêu; xa hơn tầm chiêu → tiến lại; trong khoảng → vòng tròn / qua lại / đứng (theo Kiểu).
  const GG = k => { try { const g = window.H5 && window.H5.G; return typeof g === 'function' ? g(k) : undefined; } catch { return undefined; } };
  let side = 1, sideAt = 0, lastPos = null, lastPosAt = 0, smartLog = 0, lastClickAt = 0;
  let diagStart = 0, diagAt = 0, diagPos = null, escapeUntil = 0, cancelLogAt = 0;
  function smartStep(now) {
    const Rr = GG('R'), Hh = GG('H'); if (!Rr || !Hh || !Array.isArray(Rr.enemies)) return false;
    const K = +GG('JX_K') || 0.81, range = +(Rr.P && Rr.P.main && Rr.P.main.rad) || (sk && sk.rad) || 400;
    const D = keep > 0 ? keep : Math.round(range * 0.85), band = Math.max(25, range * 0.08);
    const foes = Rr.enemies.filter(e => e && !e.dead && e.hp > 0).map(e => { const ux = e.x - Hh.x, uy = (e.y - Hh.y) * 2, d = Math.hypot(ux, uy) / K; return { e, ux, uy, d }; }).sort((a, b) => a.d - b.d);
    const ground = Array.isArray(Rr.ground) ? Rr.ground : [];
    const lootNear = (x, y) => ground.some(g => g && Math.hypot(g.x - x, g.y - (y + 6)) < 44);   // game groundAt: bán kính 30 quanh (x, y+6) — chừa 14 px   // bấm trúng đồ rơi = game hiểu là đi nhặt
    const CAMv = GG('CAM'), usv = GG('uiScale'), scv = typeof usv === 'function' ? +usv() || 1 : 1, arv = document.getElementById('arena');
    const toScreen = (x, y) => { const r = arv.getBoundingClientRect(); return [(x - CAMv.x) * scv + r.left, (y - CAMv.y) * scv + r.top]; };
    const zf = (webFrame && webFrame.getZoomFactor && webFrame.getZoomFactor()) || 1;
    // [LITE v10.19] cách PHÍM = Tự điều khiển: game CHỈ đánh khi có mục tiêu bấm chọn (R.manTgt) → tự bấm chọn quái gần nhất trong tầm
    if (mode === 'key' && !isAuto() && arv && CAMv && foes.length && now - lastClickAt > 500) {
      const mt = Rr.manTgt, n0 = foes[0];
      if ((!mt || mt.dead || !(mt.hp > 0)) && n0.d <= range) {
        const ex = n0.e.x, ey = n0.e.y - 20;
        if (!lootNear(ex, ey)) { const [cx, cy] = toScreen(ex, ey); if (document.elementFromPoint(cx, cy) === arv) { lastClickAt = now; kiteSynthAt = now; ipcRenderer.send('lab:kite:click', cx * zf, cy * zf); } }
      }
    }
    if (mode !== 'key') return hitRun(now, { Rr, Hh, K, range, D, band, foes, lootNear, toScreen, arv, CAMv, zf });
    let vx = 0, vy = 0;
    if (foes.length) {
      const n = foes[0], len = Math.hypot(n.ux, n.uy) || 1, ox = n.ux / len, oy = n.uy / len;   // hướng tới quái gần nhất (không gian khoảng cách của game)
      if (style === 'zigzag' && now - sideAt > 1600) { side = -side; sideAt = now; }
      const tx = -oy * side, ty = ox * side;   // hướng vòng quanh mục tiêu
      let rx = 0, ry = 0; for (const f of foes) if (f.d < D) { const l = Math.hypot(f.ux, f.uy) || 1, w = (D - f.d) / D; rx -= f.ux / l * w; ry -= f.uy / l * w; }   // đẩy ra khỏi mọi quái quá gần
      if (n.d > range * 0.97) { vx = ox; vy = oy; }                                              // xa quá tầm → tiến lại
      else if (n.d < D - band) { const k = cl((D - n.d) / band, 0.5, 2); vx = rx * k * 1.5 + tx * 0.8; vy = ry * k * 1.5 + ty * 0.8; }   // gần quá → lùi + vòng
      else if (style !== 'stand') { const c = (n.d - D) / band * 0.4; vx = tx + ox * c; vy = ty + oy * c; }                              // trong khoảng → vòng / qua lại, chỉnh nhẹ khoảng cách
      // [LITE v10.21] quái còn xa hơn khoảng cách giữ mà gần có đồ rơi → đứng yên cho game (Tự động) tự nhặt đồ
      if (mode !== 'key' && n.d >= D && ground.some(g => g && Math.hypot(g.x - Hh.x, g.y - Hh.y) < 200)) { vx = 0; vy = 0; }
      // [LITE v10.21] kẹt (đứng yên > 1,2 giây khi đang muốn đi, thường do tường / góc sân) → 0,9 giây chỉ chạy vòng (bỏ phần lùi), đổi chiều
      if (now < escapeUntil) { vx = tx; vy = ty; }
    }
    const wy0 = vy / 2, wl = Math.hypot(vx, wy0);   // đổi về toạ độ thế giới (trục dọc /2)
    if (wl < 0.2) { if (held.size) setKeys(new Set()); return true; }
    const wx = vx / wl, wy = wy0 / wl;
    if (lastPos && now - lastPosAt > 1200) { if (Math.hypot(Hh.x - lastPos.x, Hh.y - lastPos.y) < 4) { side = -side; sideAt = now; escapeUntil = now + 900; } lastPos = null; }   // kẹt tường → đổi chiều, chạy vòng thuần
    if (!lastPos) { lastPos = { x: Hh.x, y: Hh.y }; lastPosAt = now; }
    if (mode === 'key') {
      const want = new Set(); if (wx > 0.38) want.add('ArrowRight'); else if (wx < -0.38) want.add('ArrowLeft'); if (wy > 0.38) want.add('ArrowDown'); else if (wy < -0.38) want.add('ArrowUp');
      setKeys(want);
    } else if (now - lastClickAt > 280) {
      if (!arv || !CAMv) return true;
      // [LITE v10.19] tránh điểm có đồ rơi (bấm trúng = đi nhặt, nhân vật giậm chân) và điểm bị bảng che: thử lệch ±30°/±60°
      // [LITE v10.21] game kẹt "đang giữ chuột" (nhả chuột bị lạc → mọi cú bấm sau bị bỏ qua) → gửi pointercancel đúng con trỏ đó để game nhả
      const IN = GG('INPUT');
      if (IN && IN.active && now - lastClickAt > 400) { try { arv.dispatchEvent(new PointerEvent('pointercancel', { pointerId: IN.id == null ? 1 : IN.id, bubbles: true })); } catch {} if (now - cancelLogAt > 10 * 60e3) { cancelLogAt = now; log('chạy né quái: game kẹt "đang giữ chuột" → đã nhả'); } }
      const a0 = Math.atan2(wy, wx), ignoreLoot = false;   // [V11.9f] KHÔNG bao giờ bấm trúng đồ: game coi là 'Đi nhặt' tay → nhặt mọi món (kể cả trắng) và bỏ qua 'Bán ngay khi nhặt'
      let done = false;
      for (const dist of [90, 150]) { for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
        const tx = Hh.x + Math.cos(a0 + da) * dist, ty = Hh.y + Math.sin(a0 + da) * dist; if (!ignoreLoot && lootNear(tx, ty)) continue;
        const [cx, cy] = toScreen(tx, ty); if (document.elementFromPoint(cx, cy) !== arv) continue;
        lastClickAt = now; kiteSynthAt = now; clicks++; ipcRenderer.send('lab:kite:click', cx * zf, cy * zf); done = true; break;
      } if (done) break; }
    }
    // [LITE v10.20] chẩn đoán: 3 phút đầu sau khi bật, 20 giây ghi 1 dòng trạng thái để so giữa các nhân vật
    if (!diagStart) diagStart = now;
    if (now - diagStart < 180000 && now - diagAt > 20000) {
      diagAt = now; const P = Rr.P || {}, mt = Rr.manTgt;
      const moved = diagPos ? Math.round(Math.hypot(Hh.x - diagPos.x, Hh.y - diagPos.y)) : 0; diagPos = { x: Hh.x, y: Hh.y };
      log(`chẩn đoán chạy: cách ${mode === 'key' ? 'phím' : 'chuột'} · ${isAuto() ? 'Tự động' : 'Tự điều khiển'} · đi được ${moved} trong 20 giây · quái gần nhất ${foes.length ? Math.round(foes[0].d) : '-'} (${foes.length} con) · giữ ${D} · tốc độ ${(+(Rr.mounted ? P.speed : (P.speedFoot || P.speed)) || 0).toFixed(2)}${Rr.mounted ? ' · ĐANG CƯỠI' : ''}${Rr.stunT > 0 ? ' · choáng' : ''}${Rr.dash ? ' · lướt' : ''}${Rr.deadT > 0 ? ' · gục' : ''} · phím ${[...held].map(k => k.replace('Arrow', '')).join('+') || '-'} · bấm ${clicks} · mục tiêu ${mt && !mt.dead ? 'có' : 'không'} · INPUT ${(() => { const I = GG('INPUT'); return I ? (I.active ? 'giữ' : '') + (I.tmp ? 'tạm' : '') + (I.target ? 'đích' : '') || 'trống' : '?'; })()}`);
    }
    if (now - smartLog > 10 * 60e3 && foes.length) { smartLog = now; log(`chạy né quái: giữ khoảng cách ${D} (tầm chiêu ${Math.round(range)}) · quái gần nhất ${Math.round(foes[0].d)} · kiểu ${style === 'zigzag' ? 'qua lại' : style === 'stand' ? 'đứng khi đủ xa' : 'vòng tròn'}`); }
    return true;
  }
  // [LITE v10.39] ĐÁNH RỒI CHẠY. Game 11/11: đang đi theo cú bấm sân (INPUT.tmp) thì KHÔNG ra đòn (khung nào còn di chuyển: R.atkT=0),
  // dừng lại là đánh ngay → bấm liên tục = chỉ chạy. Mới: quái trong khoảng cách giữ → không bấm (đứng đánh); quái lấn vào quá gần → bấm 1 lần
  // ra điểm xa mọi quái nhất (thử 16 hướng, chấm điểm theo quái gần nhất tại điểm đến), quãng = tốc chạy × "Chạy (ms)"; tới nơi/hết giờ →
  // đứng đánh ít nhất "Đứng đánh (ms)" rồi mới xét chạy tiếp. Không bấm trúng quái (bản mới: bấm quái = chọn mục tiêu, không đi) / đồ rơi.
  let hrPre = 0, hrDiagPre = 0, hrLow = false, hrLowRuns = 0, hrGapRuns = 0, hrDiagLow = 0, hrDiagGap = 0, hrBackLog = 0, hrHitEv = 0, hrHitTr = 0, hrDiagHitEv = 0, hrDiagHitTr = 0, hrWall = [], hrTrail = [], hrHurtRuns = 0, hrOrbit = 0, hrBack = 0, hrDiagHurt = 0, hrDiagOrbit = 0, hrDiagBack = 0, hrDiagCorner = 0, hrCorners = 0;   // [V11.7]
  let hrCastSeen = new Map(), hrCastAt = 0, hrCasts = 0, hrHolds = 0, hrDiagCasts = 0, hrDiagHolds = 0;   // [V11.6]
  let trig = 'dist', hrLife = null, hrHitAt = 0, hrStuck = 0, hrStart = null, hrCornerLog = 0;   // [V11] chạy khi mất máu + thoát góc kẹt
  let hrPhase = 'stand', hrUntil = 0, hrRunAt = 0, hrAtk = 0, hrAtkPrev = 0, hrAtkStand = 0, hrRuns = 0, hrPos = null, hrDiagAt = 0, hrDiagStart = 0, hrDiagAtk = 0, hrDiagRuns = 0, hrBad = [];
  function hitRun(now, c) {
    const { Rr, Hh, K, range, D, band, foes, lootNear, toScreen, arv, CAMv, zf } = c;
    const at = +Rr.atkT || 0; if (at > hrAtkPrev + 0.02) hrAtk++; hrAtkPrev = at;   // R.atkT nhảy lên = vừa ra đòn (chỉ đọc)
    const runMs = cl(+(ep && ep.run) || 700, 200, 2000), standMs = cl(+(ep && ep.stop) || 1300, 200, 4000);
    const P = Rr.P || {}, spd = 150 * (+(Rr.mounted ? P.speed : (P.speedFoot || P.speed)) || 1.5);
    const moved = hrPos ? Math.hypot(Hh.x - hrPos.x, Hh.y - hrPos.y) : 0; hrPos = { x: Hh.x, y: Hh.y };
    if (!hrDiagStart) hrDiagStart = now;
    if (now - hrDiagAt > 20000 && (now - hrDiagStart < 180000 || now - hrDiagAt > 10 * 60e3)) {
      if (hrDiagAt) log(`đánh-chạy: ${hrRuns - hrDiagRuns} lần chạy (vòng ${hrOrbit - hrDiagOrbit}, lùi ${hrBack - hrDiagBack}, bị đánh ${hrHitEv - hrDiagHitEv} lần/trúng ${hrHitTr - hrDiagHitTr}, chạy chỉ vì bị đánh ${hrHurtRuns - hrDiagHurt}, kẹt góc ${hrCorners - hrDiagCorner}, máu thấp ${hrLowRuns - hrDiagLow}, né nhịp tinh anh ${hrPre - hrDiagPre}, ra khe ${hrGapRuns - hrDiagGap}, né chiêu ${hrCasts - hrDiagCasts}, nhịp đứng đánh ${hrHolds - hrDiagHolds}, quái có chiêu ${foes.filter(f => f.e.jx).length}/${foes.length}) · ≥${hrAtk - hrDiagAtk} đòn trong ${Math.round((now - hrDiagAt) / 1000)} giây · quái gần nhất ${foes.length ? Math.round(foes[0].d) : '-'} (${foes.length} con) · giữ ${D} · chạy ${runMs} ms / đứng ${standMs} ms`);
      hrDiagAt = now; hrDiagAtk = hrAtk; hrDiagRuns = hrRuns; hrDiagCasts = hrCasts; hrDiagHolds = hrHolds; hrDiagOrbit = hrOrbit; hrDiagBack = hrBack; hrDiagHurt = hrHurtRuns; hrDiagHitEv = hrHitEv; hrDiagHitTr = hrHitTr; hrDiagLow = hrLowRuns; hrDiagPre = hrPre; hrDiagGap = hrGapRuns; hrDiagCorner = hrCorners;
    }
    const IN = GG('INPUT');
    if (hrPhase === 'run') {
      const el = now - hrRunAt;
      if (el < runMs + 500 && !(el > 250 && moved < 2)) return true;   // đang chạy tới điểm đã bấm
      if (el > 250 && moved < 2 && el < runMs * 0.5 && hrLastA != null) hrBad.push({ a: hrLastA, until: now + 3000 });   // đứng sớm = vướng tường
      { const disp = hrStart ? Math.hypot(Hh.x - hrStart.x, (Hh.y - hrStart.y) * 2) : 999; if (disp < (hrStart && hrStart.d || 100) * 0.35) { hrStuck++; if (hrLastA != null) { hrBad.push({ a: hrLastA, until: now + 5000 }); hrWall.push({ x: Hh.x + Math.cos(hrLastA) * 40 * K, y: Hh.y + Math.sin(hrLastA) * 20 * K, until: now + 90000 }); } } else hrStuck = 0; }   // [V11.7] nhớ chỗ tường 90 s   // [V11] chạy không xa = kẹt góc/tường
      hrPhase = 'stand'; hrUntil = now + standMs; hrAtkStand = hrAtk;
    }
    if (!foes.length || !arv || !CAMv) return true;
    // [V11.6] Hệ số theo tầm chiêu chính R (đọc sống R.P.main.rad — đúng "Phạm vi tấn công" của game) → hợp mọi chiêu đánh xa 9x (≈240–600):
    //  vòng đứng = R − 8 quanh mục tiêu (luôn còn trong tầm đánh) · đệm an toàn = max(20, 5% R) · quãng chạy tối đa = tốc × "Chạy mỗi lần" × 1,6 (80 … 60% R)
    //  quái "thoát được" = tầm quái + đệm < R − 8 (quái đánh xa hơn thì đứng đánh, không chạy vô ích) · cận chiến (R ≤ 150): không chạy theo khoảng cách
    const RR = range - 8, pad = Math.max(20, range * 0.05), maxTr = cl(spd * runMs / 1000 * 1.6, 80, range * 0.6);
    const monR = e => e.ranged ? (+e.reach || 200) : Math.max(((+e.r || 20) + 24) / K, Math.min(+e.reach || 0, 90));   // = tầm đánh quái trong code game
    const jd = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 2) / K;
    const esc = foes.filter(f => f.d < range * 1.6 && monR(f.e) + pad < RR);
    // quái vừa tung chiêu (jx.busy nhảy lên / jx.last đổi) mà mình nằm trong tầm chiêu → né khỏi tâm chiêu, hướng vuông góc
    let cast = null;
    for (const f of foes) { const j = f.e.jx; if (!j) continue; const bz = +j.busy || 0, pv = hrCastSeen.get(f.e); hrCastSeen.set(f.e, { bz, last: j.last });
      if (pv && j.last && (bz > pv.bz + 0.5 || j.last !== pv.last) && f.d <= (+(j.last.hit && j.last.hit.rad) || monR(f.e)) + 4 && (!cast || f.d < cast.f.d)) cast = { f, x: Hh.x, y: Hh.y, r: Math.max(60, Math.min(160, (+(j.last.hit && j.last.hit.rad) || 120) * 0.35)) }; }
    if (hrCastSeen.size > 300) hrCastSeen.clear();
    if (cast && now - hrCastAt < 1200) cast = null; if (cast) { hrCastAt = now; hrCasts++; }
    const n0 = foes[0];
    // [V11.9b] "bị đánh" = game vừa trừ máu mình (R.hurtT > 0, game đặt 0,25 s mỗi đòn trúng) HOẶC quái đang ra đòn (act 'at', actT < 0,35 s) mà mình trong tầm nó — kể cả đòn bị Né/Hóa giải
    { const ht = +Rr.hurtT || 0, atk = foes.find(f => f.e.act === 'at' && (+f.e.actT || 0) < 0.35 && f.d <= monR(f.e) + 8); if (ht > 0 || atk) { if (now - hrHitAt > 300) { hrHitEv++; if (ht > 0) hrHitTr++; } hrHitAt = now; }
      const lf = +Rr.life, mx = +((Rr.P || {}).life) || 0; if (Number.isFinite(lf)) { if (hrLife != null && lf < hrLife - Math.max(1, mx * 0.003) && !((Rr.P || {}).main || {}).costLife) hrHitAt = now; hrLife = lf; } }
    const hurtNow = trig !== 'dist' && now - hrHitAt < 600;
    // [V11.11] tinh anh/boss: ngưỡng máu thấp sớm hơn (70% → 85%), giữ thêm 1 đệm, và né theo nhịp đòn (atkCd < 0,3 s) nếu tầm nó ngắn hơn tầm mình
    const isEl = e => e.cls === 'elite' || e.cls === 'boss', elR = e => monR(e) + (isEl(e) ? pad : 0);
    const elNear = foes.some(f => isEl(f.e) && f.d < monR(f.e) + pad * 3);
    { const lfr = (+Rr.life || 0) / Math.max(1, +((Rr.P || {}).life) || 1), lin = elNear ? 0.70 : 0.45, lout = elNear ? 0.85 : 0.70; if (lfr < lin) hrLow = true; else if (lfr > lout) hrLow = false; }   // [V11.10] máu thấp → chỉ chạy xa
    const preHit = foes.some(f => isEl(f.e) && (+f.e.atkCd || 0) < 0.3 && f.d < monR(f.e) + pad * 1.5 && monR(f.e) + pad * 2 < RR);
    if (preHit) hrPre++;   // [V11.10] máu < 45% → chỉ chạy xa, không đứng đánh, tới khi > 70%
    if (now < hrUntil && !cast && !hurtNow && !hrLow && !preHit) {   // đang đứng đánh; chạy sớm khi bị đánh, hoặc đã ra đòn mà quái "thoát được" áp sát
      if (!(hrAtk > hrAtkStand && esc.length && esc[0].d < Math.max(monR(esc[0].e) + pad, D * 0.35))) return true;
    }
    const melee = range <= 150;
    const nearT = !melee && esc.some(f => f.d < Math.max(D - band, monR(f.e) + pad)), hurt = trig !== 'dist' && now - hrHitAt < 800;
    const threatLow = hrLow && foes.some(f => f.d < monR(f.e) + pad * 3);
    if (!cast && !threatLow && !preHit && !(trig === 'hp' ? hurt : trig === 'both' ? (nearT || hurt) : nearT)) return true;
    if (threatLow) hrLowRuns++;
    if (hurt && !nearT) hrHurtRuns++;   // chạy theo: khoảng cách | mất máu | cả hai, và luôn né chiêu
    if (IN && IN.active) { try { arv.dispatchEvent(new PointerEvent('pointercancel', { pointerId: IN.id == null ? 1 : IN.id, bubbles: true })); } catch {} }
    hrBad = hrBad.filter(b => b.until > now);
    const corner = hrStuck >= 2 || hrWall.filter(w => w.until > now && Math.hypot(w.x - Hh.x, (w.y - Hh.y) * 2) / K < 90).length >= 2;   // [V11.7] 1 lần hụt hoặc 2 điểm tường sát bên = góc
    hrWall = hrWall.filter(w => w.until > now); hrTrail.push({ x: Hh.x, y: Hh.y, t: now }); hrTrail = hrTrail.filter(p => now - p.t < 60000); if (hrTrail.length > 400) hrTrail.splice(0, hrTrail.length - 400);
    const cen = hrTrail.reduce((o, p) => (o.x += p.x / hrTrail.length, o.y += p.y / hrTrail.length, o), { x: 0, y: 0 });
    if (corner) hrCorners++;
    let escA = null; if (corner && hrBad.length) { let sx = 0, sy = 0; for (const b of hrBad) { sx += Math.cos(b.a); sy += Math.sin(b.a); } escA = Math.atan2(-sy, -sx); }
    if (corner && now - hrCornerLog > 60000) { hrCornerLog = now; log('đánh-chạy: kẹt góc → chạy xa ra phía thoáng'); }
    // mục tiêu game đang khóa (R.tgt) — điểm đến nằm trên vòng R − 8 quanh nó để chạy xong đánh được ngay
    const T = (Rr.tgt && !Rr.tgt.dead && Rr.tgt.hp > 0 && foes.find(f => f.e === Rr.tgt)) || n0;
    // [V11.10] bị vây (≥ 4 quái trong 1,3 R): chạy ra giữa khe rộng nhất giữa các quái thay vì chạy vòng/lùi thẳng
    let gapA = null; { const cr = foes.filter(f => f.d < range * 1.3); if (cr.length >= 4) { const an = cr.map(f => Math.atan2(f.uy, f.ux)).sort((a, b) => a - b); let best = 0; for (let i = 0; i < an.length; i++) { const a1 = an[i], a2 = i + 1 < an.length ? an[i + 1] : an[0] + Math.PI * 2, g = a2 - a1; if (g > best) { best = g; gapA = a1 + g / 2; } } if (best < 0.6) gapA = null; } }
    const mset = hrLow ? foes : esc.concat(foes.filter(f => isEl(f.e) && !esc.includes(f) && monR(f.e) + pad * 2 < RR));   // máu thấp: tránh cả quái đánh xa
    const margin = (x, y) => { let m = Infinity; for (const f of mset) { const d = jd(x, y, f.e.x, f.e.y) - elR(f.e); if (d < m) m = d; } return m; };
    const curM = margin(Hh.x, Hh.y);
    const perp = cast ? Math.atan2((Hh.y - cast.f.e.y) * 2, Hh.x - cast.f.e.x) : 0;
    let thx = 0, thy = 0; for (const f of (esc.length ? esc : foes).slice(0, 4)) { const w = 1 / Math.max(30, f.d); thx += f.ux * w; thy += f.uy * w; }
    const thA = Math.atan2(thy, thx);   // hướng tới đám quái (không gian khoảng cách game)
    const cand = [];
    const Lmax = maxTr * (corner ? 1.3 : hrLow ? 1.5 : 1), RRc = corner ? RR + range * 0.3 : hrLow ? Infinity : RR;   // [V11.9d] thoát góc vẫn trong vòng tầm nới (không chạy xa hẳn)
    for (let i = 0; i < 24; i++) {
      const da = i / 24 * Math.PI * 2;
      // đi theo hướng da tối đa Lmax; nếu ra ngoài vòng R − 8 quanh mục tiêu thì rút lại cho vừa trong vòng (luôn còn trong tầm đánh)
      const pt = L => [Hh.x + Math.cos(da) * L * K, Hh.y + Math.sin(da) * L * K / 2];
      let L = Lmax, [tx, ty] = pt(L);
      if (jd(tx, ty, T.e.x, T.e.y) > RRc) { let lo = 0, hi = Lmax; for (let k = 0; k < 12; k++) { const md = (lo + hi) / 2, [x, y] = pt(md); if (jd(x, y, T.e.x, T.e.y) > RRc) hi = md; else lo = md; } L = lo; [tx, ty] = pt(L); }
      const tr = L; if (tr < 25) continue;
      if (hrBad.some(b => Math.abs(Math.atan2(Math.sin(da - b.a), Math.cos(da - b.a))) < 0.4)) continue;
      const mg = margin(tx, ty);
      let sc = hrLow ? Math.min(mg, range) * 2 - tr * 0.05 : Math.min(mg, pad * 2) * 2 - tr * 0.1;   // [V11.7] đủ an toàn thì xa hơn không cộng thêm; máu thấp: càng xa càng tốt
      const tang = Math.sin(da - thA), back = -Math.cos(da - thA);
      if (gapA != null) sc += Math.cos(da - gapA) * range * 0.6;   // [V11.10] bị vây: ra khe
      else if (!hrLow) { sc += Math.abs(tang) * range * 0.3 + (Math.sign(tang) === side ? range * 0.08 : 0);   // ưu tiên chạy VÒNG quanh đám quái, giữ 1 chiều
        if (back > 0.9) sc -= range * 0.06; }   // hạn chế lùi thẳng
      if (hrTrail.length > 20) { const dc = jd(tx, ty, cen.x, cen.y) - jd(Hh.x, Hh.y, cen.x, cen.y); if (dc > 0) sc -= dc * 0.5; }   // kéo về phía giữa khu đã đi (xa tường)
      for (const w of hrWall) { const dw = jd(tx, ty, w.x, w.y); if (dw < 110) sc -= (110 - dw) * 1.5; }   // né chỗ tường đã biết
      if (cast) { const out = jd(tx, ty, cast.x, cast.y) - cast.r; sc += out > 0 ? 60 : out * 2; sc += Math.abs(Math.sin(da - perp)) * 40; }   // ra khỏi tâm chiêu, ưu tiên vuông góc
      if (escA != null) sc += Math.cos(da - escA) * range * 0.35;   // [V11.9d] cũ ×1 lấn át chạy vòng → chạy thẳng ra xa
      cand.push({ a: da, tx, ty, sc, m: mg, tg: tang, bk: back });
    }
    cand.sort((x, y) => y.sc - x.sc);
    // không có chỗ nào an toàn hơn đáng kể (và không phải né chiêu) → đứng đánh (hold)
    if (!cast && !hurt && !hrLow && !preHit && (!cand.length || cand[0].m < Math.min(curM + pad, pad))) { hrHolds++; hrUntil = now + Math.min(standMs, 600); return true; }
    const ignoreLoot = false;   // [V11.9f] như trên (trước: sau 4 s không chạy thì bấm cả chỗ có đồ → túi đầy đồ trắng/xanh)
    let hrSkipUi = 0, hrSkipOther = 0;
    for (const k0 of cand) {
      // [V11.9d] điểm đến bị bảng/khung game che, trúng quái hoặc đồ rơi → thử rút ngắn cùng hướng (70%, 50%) trước khi bỏ hướng đó (trước đây bỏ luôn → rơi xuống hướng lùi thẳng)
      let k = null;
      for (const f of [1, 0.7, 0.5]) {
        const tx = Hh.x + (k0.tx - Hh.x) * f, ty = Hh.y + (k0.ty - Hh.y) * f;
        if (f < 1 && jd(tx, ty, Hh.x, Hh.y) < 25) break;
        if ((!ignoreLoot && lootNear(tx, ty)) || foes.some(fo => Math.hypot(fo.e.x - tx, fo.e.y - ty + 20) < 50)) { hrSkipOther++; continue; }   // trúng quái = chọn mục tiêu, không đi
        const [sx, sy] = toScreen(tx, ty); if (document.elementFromPoint(sx, sy) !== arv) { hrSkipUi++; continue; }
        k = { ...k0, tx, ty }; break;
      }
      if (!k) continue;
      const [cx, cy] = toScreen(k.tx, k.ty);
      if (gapA != null) hrGapRuns++; if (Math.abs(k.tg) > 0.6) hrOrbit++; else if (k.bk > 0.8 && gapA == null && !hrLow) { hrBack++; if (now - hrBackLog > 30000) { hrBackLog = now; log(`đánh-chạy: lùi thẳng vì ${cast ? 'né chiêu' : corner ? 'kẹt góc' : hurt && !nearT ? 'bị đánh' : 'quái gần'} · quái gần ${Math.round(n0.d)} · ${esc.length}/${foes.length} quái thoát được · ứng viên vòng tốt nhất ${(cand.find(c => Math.abs(c.tg) > 0.6) || {}).sc | 0} vs chọn ${k.sc | 0} · bỏ vì bị bảng che ${hrSkipUi}, trúng quái/đồ ${hrSkipOther}`); } } if (Math.abs(k.tg) > 0.6 && Math.sign(k.tg) !== side) side = -side;
      hrLastA = k.a; hrStart = { x: Hh.x, y: Hh.y, d: jd(k.tx, k.ty, Hh.x, Hh.y) * K }; if (corner) hrStuck = 0; hrPhase = 'run'; hrRunAt = now; hrRuns++; clicks++; lastClickAt = now; kiteSynthAt = now;
      if (style === 'zigzag' && Math.random() < 0.5) side = -side;
      ipcRenderer.send('lab:kite:click', cx * zf, cy * zf); return true;
    }
    return true;
  }
  let hrLastA = null, uiHold = false, uiHoldAt = 0, uiUntil = 0;
  // [V11.10] GHI NGUYÊN NHÂN CHẾT trong Tháp: 6 giây cuối (4 lần/giây, chỉ đọc R/H): máu, đòn trúng, quái quanh, ai đang đánh, khống chế, độc, chạy/đứng
  let dsBuf = [], dsDead = false;
  setInterval(() => { try {
    const Rr = GG('R'), Hh = GG('H'); if (!Rr || !Hh) return;
    const now = Date.now(), dead = (+Rr.deadT || 0) > 0;
    if (!dead && Rr.tower && Array.isArray(Rr.enemies)) {
      const K = +GG('JX_K') || 0.81, mx = +((Rr.P || {}).life) || 1; let near = 0, el = 0; const atk = [];
      for (const e of Rr.enemies) { if (!e || e.dead || !(e.hp > 0)) continue; const d = Math.hypot(e.x - Hh.x, (e.y - Hh.y) * 2) / K; if (d < 600) { near++; if (e.cls === 'elite' || e.cls === 'boss') el++; }
        const reach = e.ranged ? (+e.reach || 200) : Math.max(((+e.r || 20) + 24) / K, Math.min(+e.reach || 0, 90)); if (e.act === 'at' && (+e.actT || 0) < 0.35 && d <= reach + 8) atk.push((e.n || '?') + (e.ranged ? '·xa' : '') + (e.cls === 'elite' ? '·TA' : e.cls === 'boss' ? '·boss' : '')); }
      dsBuf.push({ t: now, f: Rr.tower.floor, hp: (+Rr.life || 0) / mx, hit: (+Rr.hurtT || 0) > 0, near, el, atk, stun: (+Rr.stunT || 0) > 0, slow: (+Rr.slowT || 0) > 0, dot: (+Rr.hpDotT || 0) > 0, ph: hrPhase, cor: hrStuck >= 2, low: hrLow, on: on && !!ep });
      while (dsBuf.length && now - dsBuf[0].t > 6000) dsBuf.shift();
    }
    if (dead && !dsDead && dsBuf.length && now - dsBuf[dsBuf.length - 1].t < 1500) {
      const B = dsBuf, at = s => { let x = B[0]; for (const b of B) if (b.t <= now - s * 1000) x = b; return x; }, pc = v => Math.round(v * 100) + '%';
      let hits = 0; for (let i = 1; i < B.length; i++) if (B[i].hit && !B[i - 1].hit) hits++;
      const who = {}; for (const b of B) for (const a of b.atk) who[a] = (who[a] || 0) + 1; const top = Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const nearMax = Math.max(...B.map(b => b.near)), elMax = Math.max(...B.map(b => b.el)), last2 = B.filter(b => now - b.t < 2500);
      const stun = last2.some(b => b.stun), slow = last2.some(b => b.slow), dot = B.some(b => b.dot), cor = B.some(b => b.cor), low = B.some(b => b.low);
      const runP = B.filter(b => b.ph === 'run').length / B.length, ranged = top.length && top.every(([n]) => n.includes('·xa'));
      const why = [];
      if (stun) why.push('bị choáng/khống chế'); if (nearMax >= 4) why.push('bị vây ' + nearMax + ' quái'); if (elMax) why.push('tinh anh/boss'); if (ranged) why.push('quái đánh xa');
      if (dot && hits <= 1) why.push('độc/đốt'); if (cor) why.push('kẹt góc'); if (runP < 0.25 && hits >= 2) why.push('đứng đánh ăn đòn'); if (hits >= 1 && at(2).hp - (B[B.length - 1].hp) > 0.6) why.push('1–2 đòn cực mạnh'); if (!B[B.length - 1].on) why.push('chạy né đang tắt');
      log(`chết Tháp tầng ${B[B.length - 1].f}: ${why.join(', ') || 'chưa rõ'} · máu 5s ${pc(at(5).hp)} → 2s ${pc(at(2).hp)} → ${pc(B[B.length - 1].hp)} · trúng ${hits} đòn · quanh ${nearMax} quái (TA/boss ${elMax}) · đánh: ${top.map(([n, c]) => n + '×' + c).join(', ') || '-'}${slow ? ' · bị làm chậm' : ''}${dot ? ' · độc/đốt' : ''} · chạy ${pc(runP)}${low ? ' · đã vào chế độ máu thấp' : ''}`);
      dsBuf = [];
    }
    dsDead = dead;
  } catch {} }, 250);
  // [V11.9e] cú bấm giả luôn trúng #arena → mọi pointerdown thật NGOÀI #arena là của bạn (không lọc theo thời gian như userEv: bấm sát cú giả bị bỏ sót)
  document.addEventListener('pointerdown', e => { if (e.isTrusted && !(e.target && e.target.id === 'arena')) { uiHold = true; uiHoldAt = Date.now(); uiUntil = Date.now() + 1500; } }, true);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, e => { if (uiHold && e.isTrusted) { uiHold = false; uiUntil = Date.now() + 800; } }, true);
  // game u20Drag (kéo bảng) chỉ thôi kéo khi nhận pointerup trên thanh tên; nếu mất capture (cú bấm giả chen vào) thì cờ kéo kẹt → rê chuột qua thanh tên là bảng nhảy.
  // → khi thanh tên mất capture, gửi pointerup cho chính nó để game tắt cờ kéo.
  document.addEventListener('lostpointercapture', e => { const t = e.target; if (t && t.id !== 'arena' && t.dispatchEvent) { try { t.dispatchEvent(new PointerEvent('pointerup', { pointerId: e.pointerId })); } catch {} } }, true);
  setInterval(() => {
    const s = portFresh(8000) ? port.st : null;
    if (!(on && s && s.o === 'game' && (!towerOnly || s.noi === 'thap')) || !ep) return;
    if (uiHold && Date.now() - uiHoldAt < 20000 || Date.now() < uiUntil) return;   // [V11.9d] bạn đang giữ/kéo bảng: cú bấm giả (mouseMove/Down/Up) kéo bảng đi → luôn chờ
    if (!noYield && Date.now() - me < 5000) return;
    if (mode === 'key' && isAuto()) return;
    smartStep(Date.now());
  }, 150);
  setInterval(() => {
    profile();   // luôn báo thông số mặc định cho bảng bên trái
    const s = portFresh(8000) ? port.st : null;
    const active = on && s && s.o === 'game' && (!towerOnly || s.noi === 'thap');
    if (!active || !ep) { phase = 'stop'; release(); return; }
    if (!noYield && Date.now() - me < 5000) { phase = 'stop'; if (held.size) setKeys(new Set()); return; }   // bạn vừa thao tác → nhường 5 giây (trừ khi chọn "không nhường")
    if (sk && NO_HORSE.has(sk.id)) { const rb = document.getElementById('rideBtn'); if (rb && rb.classList.contains('on') && Date.now() - dismountAt > 4000) { dismountAt = Date.now(); rb.click(); } }
    if (mode === 'mouse' && !isAuto() && Date.now() - lastAutoCheck > 3000) {   // [LITE v10.19] cách chuột cần Tự động; còn kẹt Tự điều khiển (vd lần trước dùng phím) → bật lại
      lastAutoCheck = Date.now(); ctrlBtn()?.click(); log('chạy né quái: game đang "Tự điều khiển" → bật lại Tự động (cách chạy Chuột)');
      return;
    }
    if (mode === 'key' && isAuto() && Date.now() - lastAutoCheck > 3000) {
      lastAutoCheck = Date.now(); ctrlBtn()?.click(); switched = true; log('chạy né quái: chuyển "Tự điều khiển" (vẫn tự đánh quái trong tầm), đi bằng phím mũi tên');
      return;
    }
    const now = Date.now();
    if (GG('R') && GG('H')) return;   // [LITE v10.18] đọc được vị trí → vòng giữ khoảng cách (ở trên) lo
    if (phase === 'stop') { if (now - phaseAt < ep.stop) { if (held.size) setKeys(new Set()); return; } phase = 'run'; phaseAt = now; if (Math.random() < 0.15) dir = -dir; }
    if (now - phaseAt > ep.run) { phase = 'stop'; phaseAt = now; if (held.size) setKeys(new Set()); return; }
    if (mode === 'key') keyStep(now); else mouseStep(now);
    if (now - logAt > 15 * 60e3) { logAt = now; log(`chạy né quái: ${clicks} nhịp chạy trong 15 phút`); clicks = 0; }
  }, 300);
  window.addEventListener('blur', () => { if (held.size) setKeys(new Set()); });
})();

// [LITE v10.10→v10.22] Gục ở Tháp → vào lại Tháp nhanh nhất. Game: gục trong Tháp → R.tower = null, S.mode = 'farm', đếm hồi phục R.deadT.
// Client đọc trạng thái trận (window.H5.G, chỉ đọc) mỗi 0,5 giây: thấy vừa rời Tháp mà đang trọng thương → đổi lại Leo Tháp ngay;
// game tự vào lại Tháp đúng lúc hết hồi phục (vòng kiểm 4 giây của game). Rời Tháp không phải do gục (bạn tự đổi) → không làm gì.
(() => {
  const GG = k => { try { const g = window.H5 && window.H5.G; return typeof g === 'function' ? g(k) : undefined; } catch { return undefined; } };
  let wasTower = false, lastIn = 0, busy = false;
  setInterval(async () => {
    if (busy) return;
    const R = GG('R'), S = GG('S');
    let inT, dead = false, mode = '';
    if (R && S) { inT = !!R.tower; dead = R.deadT > 0; mode = S.mode || ''; }
    else { if (!portFresh(8000) || port.st.o !== 'game') return; inT = port.st.noi === 'thap'; }
    if (inT) { wasTower = true; lastIn = Date.now(); return; }
    if (!wasTower) return;
    if (R && S) {
      if (!dead && Date.now() - lastIn < 1500) return;          // chờ thêm 1 nhịp cho game ghi trạng thái gục
      wasTower = false;
      if (!dead || mode !== 'farm' || Date.now() - tasks.modeSetAt() < 30000) return;   // không phải gục / client vừa tự đổi chế độ
      { const g = gbLive(); if (g && g.on) return; }   // [LITE v10.23] Boss HK còn sống → để game đi Boss (xong game tự vào lại Tháp)
    } else {
      wasTower = false;
      if (Date.now() - lastIn > 20000 || Date.now() - tasks.modeSetAt() < 30000) return;
    }
    busy = true;
    try {
      if (!R) { const I = await vlmApi('info', {}, 8000); if (!I.ok || I.mode !== 'farm' || I.tower || I.dg) return; }
      const ok = await tasks.setMode('tower');
      ipcRenderer.send('lab:auto:log', ok ? `gục ở Tháp → đặt lại Leo Tháp ngay${dead ? ` (game vào lại khi hết hồi phục ~${Math.ceil(R.deadT)} giây)` : ''}` : 'gục ở Tháp nhưng chưa đổi lại Leo Tháp được');
    } catch {} finally { busy = false; }
  }, 500);
})();

// [LITE v10.25] Dã Tẩu kẹt ở bản đồ không lên được (sau chuyển sinh): còn Lệnh Bài → bấm "Đổi (1 Lệnh Bài)" của game (giữ chuỗi);
// hết Lệnh Bài → KHÔNG hủy (mất chuỗi), chuyển Luyện Công + báo; lịch coi như xong Dã Tẩu hôm nay để làm Phó Bản / nhận thưởng.
(() => {
  const q = s => document.querySelector(s), sleep = ms => new Promise(r => setTimeout(r, ms));
  let seen = 0, busy = false, day = '', swaps = 0, warned = '';
  setInterval(async () => {
    if (busy) return;
    const G = window.H5 && window.H5.G; const S = typeof G === 'function' ? (() => { try { return G('S'); } catch { return null; } })() : null;
    if (!S || S.mode !== 'quest') { seen = 0; return; }
    const u = dtUnreach(); if (!u) { seen = 0; dtStuckNoLdt = false; return; }
    if (!seen) { seen = Date.now(); return; }
    if (Date.now() - seen < 45000) return;            // kẹt liên tục 45 giây mới xử lý
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); if (day !== today) { day = today; swaps = 0; }
    const D = gameSave(), ldt = (D && D.mats && D.mats.misc && D.mats.misc.ldt) | 0;
    busy = true;
    try {
      if (ldt >= 1 && swaps < 5) {
        const wasOpen = document.body.classList.contains('u20win');
        if (!q('#dtCancel')) {
          const b = q('#u20menu .u20mi[data-u="quest"]') || q('#tabs [data-t="quest"]'); if (b) b.click(); await sleep(900);
          const tab = q('#t-quest [data-qt="dt"]'); if (tab && !tab.classList.contains('on')) { tab.click(); await sleep(600); }
        }
        const btn = q('#dtCancel');
        if (btn && !btn.disabled && /L[ệe]nh B[àa]i/i.test(btn.textContent || '')) {
          btn.click(); await sleep(600);
          const box = q('#askBox'), yes = box && box.querySelector('[data-a="1"]');
          if (yes && /L[ệe]nh B[àa]i/i.test(box.textContent || '') && !/m[ấa]t chu[ỗo]i/i.test(box.textContent || '')) {
            yes.click(); swaps++; seen = 0;
            ipcRenderer.send('lab:auto:log', `Dã Tẩu kẹt: nhiệm vụ ở ${u.zn} cần cấp ${u.need}, nhân vật cấp ${u.lvl} → đổi nhiệm vụ bằng 1 Lệnh Bài (giữ chuỗi)`);
          } else { box && box.querySelector('[data-a="0"]')?.click(); ipcRenderer.send('lab:auto:log', 'Dã Tẩu kẹt: bảng xác nhận lạ → không bấm'); }
        } else ipcRenderer.send('lab:auto:log', 'Dã Tẩu kẹt: chưa thấy nút "Đổi (1 Lệnh Bài)"');
        await sleep(500);
        if (!wasOpen && document.body.classList.contains('u20win')) q('#u20wx')?.click();
      } else {
        dtStuckNoLdt = true;
        if (warned !== today) { warned = today; ipcRenderer.send('lab:auto:log', `⚠ Dã Tẩu kẹt: nhiệm vụ ở ${u.zn} cần cấp ${u.need} (nhân vật cấp ${u.lvl}), ${ldt ? 'đã đổi 5 lần hôm nay' : 'hết Lệnh Bài'} → không hủy (mất chuỗi), chuyển Luyện Công`); }
        await tasks.setMode('farm'); seen = 0;
      }
    } catch {} finally { busy = false; }
  }, 15000);
})();

// [LITE v10.27] đếm khung hình (requestAnimationFrame) mỗi 30 giây → Manager biết game có đang chạy không
(() => {
  let n = 0; const f = () => { n++; requestAnimationFrame(f); }; requestAnimationFrame(f);
  setInterval(() => { try { ipcRenderer.send('lab:raf', { fps: Math.round(n / 30), hidden: document.hidden }); } catch {} n = 0; }, 30000);
})();

// [LITE v10.40] ÁP SETTINGS CHUẨN của Hùng cho mọi acc, mỗi lần mở client (1 lần / phiên ô game; tải lại trang không áp lại).
// Chỉ BẤM giao diện có sẵn của game: mở Trợ Thủ (#u20tt) → 3 thẻ Chiến đấu / Hồi phục / Nhặt đồ, rồi Menu Hệ Thống › Tùy Chọn;
// ô nào khác mong muốn mới bấm / chọn; xong đóng bảng (#u20wx). Bỏ qua giờ Boss, khi bạn đang thao tác, khi bảng đang mở sẵn.
// Điều kiện "Giữ đồ khi…" (các hàng lọc) và chiêu Xoay chiêu theo từng nhân vật: KHÔNG áp (chỉ ghi nhật ký nếu khác).
(() => {
  const WANT = {
    fight: [['seg', 'data-pri', 'elite', 'Ưu tiên đánh: Tinh anh'],   // [V11.11] hạ tinh anh trước (máu 2,5×, sát thương 1,3×) ['cb', 'tClose', false, 'Đánh tiếp cận'], ['cb', 'tRide', true, 'Tự lên ngựa'],
            ['cb', 'xcOn', false, 'Luân phiên chiêu'], ['cb', 'tDt', true, 'Dã Tẩu tự trả/nhận'], ['cb', 'tLdt', true, 'Tự dùng Lệnh Bài'],
            ['cb', 'tSt', false, 'Tự gọi Sát Thủ'], ['gb', 'tGb', true, 'Tự đi Boss HK']],
    pot: [['cb', 'tPot', true, 'Tự dùng thuốc'], ['sel', '[data-pk="potHp"]', '85', 'Sinh lực dưới 85%'], ['sel', '[data-pk="potMp"]', '70', 'Nội lực dưới 70%'],
          ['sel', '[data-pk="potUrg"]', '80', 'Nguy kịch 80%'], ['cb', 'tBuy', true, 'Tự mua thuốc']],
    loot: [['seg', 'data-pick', 'all', 'Nhặt: Tất cả'], ['cb', 'fNoUnwear', false, 'Không nhặt đồ không mặc được'], ['cb', 'fAuto', true, 'Tự đi nhặt khi hết quái'],
           ['cb', 'tRWear', false, 'Chỉ đồ mặc được'], ['cb', 'tRFacW', false, 'Vũ khí đúng loại phái'], ['cb', 'fKUp', false, 'Đồ mạnh hơn đồ đang mặc'],
           ['cb', 'fHkBc', true, 'HK Bộ chung'], ['cb', 'fHkMine', true, 'HKMP phái mình'], ['cb', 'fHkOth', true, 'HKMP phái khác'], ['num', '#tkLvl', '', 'Cấp đồ ≥: tắt'], ['pre', 'Kỹ năng vốn có', '', 'Giữ đồ có Kỹ năng vốn có'],   // [V11.9g] bán mọi đồ trắng/xanh trừ dòng Kỹ năng vốn có
           ['seg', 'data-sat', 'pick', 'Bán: Ngay khi nhặt'], ['seg', 'data-full', 'sell', 'Xử lý: Bán lấy tiền'], ['cb', 'eWhite', false, 'Ép Tím: Đồ trắng'],
           ['cb', 'eJew', false, 'Ép Tím: Trang sức thừa'], ['cb', 'eBlue', false, 'Ép Tím: Đồ xanh'], ['sel', '#eDest', 'box', 'Cất vào Kho Rèn']],
    sys: [['cb', 'cLowFx', true, 'Giảm hiệu ứng'], ['cb', 'sOn', true, 'Âm thanh'], ['rng', '#sVol', '0.2', 'Âm lượng 20%'], ['cb', 'mOn', true, 'Nhạc nền'], ['rng', '#mVol', '0.2', 'Nhạc 20%']],
  };
  const log = m => { try { ipcRenderer.send('lab:auto:log', m); } catch {} };
  const q = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms));
  const GG = k => { try { const g = window.H5 && window.H5.G; return typeof g === 'function' ? g(k) : undefined; } catch { return undefined; } };
  let busy = false, tries = 0, lastUser = 0;
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, e => { if (e.isTrusted) lastUser = Date.now(); }, true);
  async function one(kind, key, val) {   // trả về: 0 đúng sẵn, 1 đã đổi, -1 không thấy ô
    if (kind === 'pre') { if (!q('#tRowAdd')) return -1; const b = [...document.querySelectorAll('#t-more [data-pre]')].find(x => x.textContent.includes(key)); if (!b) return 0; b.click(); await wait(300); return 1; }   // nút ＋ preset chỉ hiện khi chưa có dòng đó
    if (kind === 'seg') { const b = q(`#t-more [${key}="${val}"]`); if (!b) return -1; if (b.classList.contains('on')) return 0; b.click(); await wait(250); return 1; }
    if (kind === 'cb' || kind === 'gb') {
      const el = document.getElementById(key); if (!el) return -1;
      if (kind === 'gb' && el.checked) { let a; try { a = GG('S').autoGb; } catch {} if (a === true) return 0; el.click(); await wait(300); const e2 = document.getElementById(key); if (e2 && !e2.checked) { e2.click(); await wait(300); } return 1; }   // ô hiện "đã tích" nhưng chưa lưu thật (BAI-HOC 08/11)
      if (el.checked === val) return 0; el.click(); await wait(250); return 1;
    }
    const el = q(key); if (!el) return -1;
    if (kind === 'rng') { if (Math.abs(+el.value - +val) < 0.03) return 0; el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); await wait(200); return 1; }
    if (String(el.value) === String(val)) return 0;
    el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); await wait(250); return 1;
  }
  async function group(name, items, done, miss) { for (const [k, key, val, lb] of items) { const r = await one(k, key, val); if (r === 1) done.push(lb); else if (r < 0) miss.push(lb); } }
  async function apply() {
    const done = [], miss = [];
    // [LITE v10.41] Menu Hệ Thống TRƯỚC, Trợ Thủ SAU: bảng Hệ thống để lại .escm trong #t-more → luật CSS của máy chủ mới
    // '#panel:has(.escm:not(.off)){width:236px}' làm MỌI bảng mở sau đó hẹp, không cuộn ngang được. Mở Trợ Thủ sau cùng thay #t-more.
    const more = q('#u20menu .u20mi[data-u="more"]');
    if (more) {
      more.click(); await wait(500); q('[data-sysp="opt"]')?.click(); await wait(500);
      await group('sys', WANT.sys, done, miss);
      q('#u20wx')?.click(); await wait(300);
    } else miss.push('Menu Hệ Thống');
    const tt = q('#u20tt'); if (!tt) { log('áp settings: không thấy nút Trợ Thủ (#u20tt) — bỏ qua'); return true; }
    tt.click(); await wait(600);
    for (const tab of ['fight', 'pot', 'loot']) {
      const tb = q(`#t-more [data-tt="${tab}"]`); if (!tb) { miss.push('thẻ ' + tab); continue; }
      if (!tb.classList.contains('on')) { tb.click(); await wait(500); }
      if (tab === 'fight') await wait(400);   // phần Xoay chiêu do máy chủ mới chèn sau
      await group(tab, WANT[tab], done, miss);
    }
    q('#u20wx')?.click(); await wait(400);
    if (document.body.classList.contains('u20win')) q('#u20wx')?.click();
    log(`áp settings chuẩn: ${done.length ? 'đã đổi ' + done.join(', ') : 'đã đúng sẵn'}${miss.length ? ' · không thấy: ' + miss.join(', ') : ''}`);
    return true;
  }
  LENH.prefs = async () => { if (busy) return { ok: false, why: 'đang áp' }; busy = true; try { await apply(); return { ok: true }; } catch (e) { return { ok: false, why: String(e && e.message) }; } finally { busy = false; } };
  setInterval(async () => {
    if (busy || tries >= 3) return;
    try { if (sessionStorage.getItem('lite_prefs_v1111') === '1') return; } catch {}
    const s = portFresh(8000) ? port.st : null; if (!s || s.o !== 'game') return;
    if (!port.inAt) port.inAt = Date.now(); if (Date.now() - port.inAt < 15000) return;   // [V11.9g] vào game ≥ 15 giây (cũ 1 phút)
    const g = gbLive(); if (g && g.on) return;   // giờ Boss: để yên
    if (Date.now() - lastUser < 20000 || document.body.classList.contains('u20win') || !q('#modal.hidden') && q('#modal')) return;
    busy = true; tries++;
    try { if (await apply()) sessionStorage.setItem('lite_prefs_v1111', '1'); } catch (e) { log('áp settings lỗi: ' + (e && e.message)); try { q('#u20wx')?.click(); } catch {} }
    busy = false;
  }, 5000);
  // [V11.9g] 10 phút / lần: mở Trợ Thủ › Nhặt đồ, bấm nút có sẵn "Bán N món không giữ" (#tSellNo, game sellByFilter) nếu N > 0 — dọn món lỡ nhặt tay.
  let sellAt = Date.now();
  setInterval(async () => {
    if (busy || Date.now() - sellAt < 10 * 60e3) return;
    const s = portFresh(8000) ? port.st : null; if (!s || s.o !== 'game') return;
    const g = gbLive(); if (g && g.on) return;
    if (Date.now() - lastUser < 20000 || document.body.classList.contains('u20win') || !q('#modal.hidden') && q('#modal')) return;
    const tt = q('#u20tt'); if (!tt) return;
    busy = true; sellAt = Date.now();
    try {
      tt.click(); await wait(600);
      const tb = q('#t-more [data-tt="loot"]'); if (tb && !tb.classList.contains('on')) { tb.click(); await wait(500); }
      const b = q('#tSellNo'), n = b ? +((b.textContent.match(/(\d+)/) || [])[1] || 0) : -1;
      if (n > 0) { b.click(); await wait(400); log(`bán đồ thừa: ${n} món không giữ (Trợ Thủ › Bán)`); }
      else if (n < 0) log('bán đồ thừa: không thấy nút #tSellNo');
      q('#u20wx')?.click(); await wait(300); if (document.body.classList.contains('u20win')) q('#u20wx')?.click();
    } catch (e) { try { q('#u20wx')?.click(); } catch {} }
    busy = false;
  }, 30000);
})();


// [LITE v10.42] Theo dõi thời gian Phó Bản trong ngày + ghi số lượt còn lại khi đổi (để biết lượt thắng/thua).
(() => {
  const log = m => { try { ipcRenderer.send('lab:auto:log', m); } catch {} };
  let lastLeft = null, lastAt = 0;
  setInterval(() => {
    try {
      const day = gameDay(); if (DGT.day !== day) { for (const k of Object.keys(DGT)) delete DGT[k]; DGT.day = day; dgtSave(); }
      const s = portFresh(8000) ? port.st : null; if (!s || s.o !== 'game') return;
      const inDg = s.noi === 'phoban';
      if (inDg) { if (!DGT.start) { DGT.start = Date.now(); DGT.ms = DGT.ms || 0; } DGT.ms = (DGT.ms || 0) + Math.min(30000, Date.now() - (DGT.tick || Date.now())); }
      DGT.tick = Date.now();
      if (inDg && DG_MAX_MS > 0 && !DGT.cut && DGT.ms > DG_MAX_MS) { DGT.cut = 1; log(`Phó Bản: đã ${Math.round(DGT.ms / 60e3)} phút hôm nay — vượt giới hạn ${DG_MAX_MS / 60e3} phút, xong lượt đang đánh sẽ về Tháp`); }
      dgtSave();
      const D = gameSave(); if (!D) return;
      const left = (() => { const c = DGT.cut; DGT.cut = 0; const v = dgLeft(D); DGT.cut = c; return v; })();
      if (lastLeft != null && left !== lastLeft && Date.now() - lastAt < 4 * 3600e3) log(`Phó Bản: còn ${left} lượt (sau ${Math.round((DGT.ms || 0) / 60e3)} phút trong Phó Bản hôm nay)`);
      lastLeft = left; lastAt = Date.now();
    } catch {}
  }, 30000);
})();

// [LITE v10.42] MỞ ĐẠI HỒNG BAO (100–1.000 KNB thường, gửi được) bằng nút có sẵn của game: Hành trang → bấm hộp → "Mở ×N" (#kiUse10).
// Hồng Bao (lượng) chỉ mở khi acc thiếu lượng để đổi KNB (< 2.000 vạn). Ghi số KNB nhận được vào nhật ký (đo trung bình mỗi hộp).
(() => {
  const log = m => { try { ipcRenderer.send('lab:auto:log', m); } catch {} };
  const q = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms));
  const GG = k => { try { const g = window.H5 && window.H5.G; return typeof g === 'function' ? g(k) : undefined; } catch { return undefined; } };
  const modalOpen = () => !!q('#modal') && !q('#modal').classList.contains('hidden');
  let busy = false, lastTry = 0, lastUser = 0, tot = { n: 0, knb: 0 };
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, e => { if (e.isTrusted) lastUser = Date.now(); }, true);
  // Máy chủ mới (H5): số Hồng Bao / Đại Hồng Bao ở H5.st.amat (dùng chung tài khoản), mở bằng bảng 🧧 (hbModal → nút [data-hbo]) → RPC hb.mo
  const amat = k => { try { const t = window.H5 && window.H5.st; return t && t.amat ? (t.amat[k] | 0) : 0; } catch { return 0; } };
  const knbNow = () => { try { const w = window.H5 && window.H5.st && window.H5.st.wallet; if (w && w.knb != null) return w.knb | 0; } catch {} const S = GG('S'); return S ? S.knb | 0 : 0; };
  const goldNow = () => { const S = GG('S'); return S ? +S.gold || 0 : 0; };
  const bagOn = () => document.body.classList.contains('u2bagon') || (document.body.classList.contains('u20win') && !!q('#u20menu .u20mi.on[data-u="inv"]'));
  async function openHbModal(k) {
    if (q(`#mBody [data-hbo="${k}"]`)) return true;
    if (!bagOn()) { (q('#u20menu .u20mi[data-u="inv"]') || q('#tabs [data-t="inv"]'))?.click(); await wait(900); }
    const el = q(`#u2bagw .it[data-mi="${k}"]`) || q(`#t-inv .it[data-mi="${k}"]`) || q(`.it[data-mi="${k}"]`); if (!el) return false;
    el.click(); await wait(700);
    if (!q(`#mBody [data-hbo="${k}"]`)) { const u = q('#miUse:not([disabled])'); if (u) { u.click(); await wait(900); } }
    return !!q(`#mBody [data-hbo="${k}"]`);
  }
  async function openKind(k, label) {
    const n0 = amat(k); if (!n0) return;
    const knb0 = knbNow(), gold0 = goldNow(), bagWas = bagOn();
    if (!await openHbModal(k)) { log(`mở ${label}: không mở được bảng Hồng Bao (có ${n0} hộp)`); if (modalOpen()) q('#mClose')?.click(); return; }
    for (let i = 0; i < 60 && amat(k) > 0; i++) {
      const b = q(`#mBody [data-hbo="${k}"].on:not([disabled])`) || q(`#mBody [data-hbo="${k}"]:not([disabled])`); if (!b) break;
      b.click(); await wait(2200);
      if (!q(`#mBody [data-hbo="${k}"]`)) { if (!await openHbModal(k)) break; }
    }
    if (modalOpen()) { (q('#hbClose') || q('#mClose'))?.click(); await wait(300); }
    if (!bagWas) { if (document.body.classList.contains('u2bagon')) (q('#u2bwx') || q('#u20menu .u20mi[data-u="inv"]'))?.click(); else if (document.body.classList.contains('u20win')) q('#u20wx')?.click(); }
    await wait(1500);
    const opened = n0 - amat(k);
    if (k === 'dhb') { const got = knbNow() - knb0; if (opened > 0) { tot.n += opened; tot.knb += got; } log(`mở ${opened}/${n0} ${label}: +${got} KNB thường (trung bình ${opened ? Math.round(got / opened) : 0}/hộp · cộng dồn phiên này ${tot.n} hộp = ${tot.knb} KNB)`); }
    else log(`mở ${opened}/${n0} ${label}: +${Math.round((goldNow() - gold0) / 1e4)} vạn lượng`);
  }
  // [V11] dùng Võ Lâm Mật Tịch / Tẩy Tủy Kinh tới đủ (tick ở Thuốc tự dùng), bấm túi → Dùng như người chơi
  async function useBooks() {
    const S = GG('S'); if (!S || ((S.lvl | 0) < 80 && !bookReb())) return;
    for (const [t, label] of [['vlmt', 'Võ Lâm Mật Tịch'], ['ttk', 'Tẩy Tủy Kinh']]) {
      if (!thuocOn(t)) continue;
      let n = Math.min(bookMax(t) - bookUsed(t), bookHave(t)), used = 0;
      for (let i = 0; i < n && i < 40; i++) {
        const u0 = bookUsed(t), h0 = bookHave(t);
        if (!bagOn()) { (q('#u20menu .u20mi[data-u="inv"]') || q('#tabs [data-t="inv"]'))?.click(); await wait(900); }
        const el = q(`#u2bagw .it[data-mi="${t}"]`) || q(`#t-inv .it[data-mi="${t}"]`) || q(`.it[data-mi="${t}"]`); if (!el) break;
        el.click(); await wait(700);
        const b = q('#miUse:not([disabled])'); if (!b) { if (modalOpen()) q('#mClose')?.click(); break; }
        b.click(); await wait(1500); if (modalOpen()) { q('#mClose')?.click(); await wait(300); }
        if (bookUsed(t) <= u0 && bookHave(t) >= h0) break; used++;
      }
      if (used) log(`dùng ${used} ${label} (đã dùng ${bookUsed(t)}/${bookMax(t)})`);
    }
    if (document.body.classList.contains('u2bagon')) (q('#u2bwx') || q('#u20menu .u20mi[data-u="inv"]'))?.click(); else if (document.body.classList.contains('u20win')) q('#u20wx')?.click();
  }
  let booksAt = 0;
  LENH.hb = async () => {
    if (busy) return { ok: false, why: 'đang mở' }; if (!window.H5 || !window.H5.st) return { ok: false, why: 'chưa vào game' };
    busy = true; lastTry = Date.now(); const h0 = amat('hb'), d0 = amat('dhb'), k0 = knbNow();
    try { await openKind('dhb', 'Đại Hồng Bao'); if (Math.floor(goldNow() / 1e4) < 2000) await openKind('hb', 'Hồng Bao'); } catch (e) { busy = false; return { ok: false, why: String(e && e.message) }; }
    busy = false; return { ok: true, dhbTruoc: d0, dhbSau: amat('dhb'), hbTruoc: h0, hbSau: amat('hb'), knbThem: knbNow() - k0 };
  };
  LENH.hbAll = async () => {
    if (busy) return { ok: false, why: 'đang mở' };
    if (!window.H5 || !window.H5.st) return { ok: false, why: 'chưa vào game' };
    busy = true; lastTry = Date.now(); const h0 = amat('hb'), d0 = amat('dhb');
    try { await openKind('dhb', 'Đại Hồng Bao'); await openKind('hb', 'Hồng Bao'); }
    catch (e) { busy = false; return { ok: false, why: String(e && e.message) }; }
    busy = false;
    return { ok: (h0 === 0 || amat('hb') < h0) && (d0 === 0 || amat('dhb') < d0), hbBefore: h0, hbAfter: amat('hb'), dhbBefore: d0, dhbAfter: amat('dhb') };
  };
  setInterval(async () => {
    if (busy || Date.now() - lastTry < 20 * 60e3) return;
    const s = portFresh(8000) ? port.st : null; if (!s || s.o !== 'game') return;
    const g = gbLive(); if (g && g.on) return;
    if (Date.now() - lastUser < 30000 || modalOpen()) return;
    if (!window.H5 || !window.H5.st) return;
    if (autoOffMe()) return;   // [V11]
    if (Date.now() - booksAt > 20 * 60e3 && (thuocOn('vlmt') || thuocOn('ttk'))) { booksAt = Date.now(); const need = ['vlmt', 'ttk'].some(t => thuocOn(t) && bookHave(t) > 0 && bookUsed(t) < bookMax(t)); if (need) { busy = true; try { await useBooks(); } catch (e) { log('dùng sách lỗi: ' + (e && e.message)); } busy = false; return; } }
    if (!tot.logged) { tot.logged = 1; log(`Hồng Bao (dùng chung tài khoản): có ${amat('hb')} Hồng Bao, ${amat('dhb')} Đại Hồng Bao · KNB thường ${knbNow()}`); }
    const needHb = quaOn('mohbn') && Math.floor(goldNow() / 1e4) < 2000, doDhb = quaOn('mohb');
    if (!(doDhb && amat('dhb')) && !(needHb && amat('hb'))) return;
    busy = true; lastTry = Date.now();
    try { if (doDhb) await openKind('dhb', 'Đại Hồng Bao'); if (needHb) await openKind('hb', 'Hồng Bao'); } catch (e) { log('mở Hồng Bao lỗi: ' + (e && e.message)); }
    busy = false;
  }, 60000);
})();

// [V11] Canh "đứng im": không có hoạt động mới (kinh nghiệm, vàng, KNB, đồ nhặt, tầng Tháp, Dã Tẩu) → báo; kẹt trong Phó Bản 8 phút → bỏ Phó Bản, sang bước kế (Luyện Công)
(function () {
  let sig = '', since = Date.now(), warnAt = 0, pbAt = 0;
  setInterval(async () => {
    try {
      const G = window.H5 && window.H5.G; if (!G) return;
      const s = portFresh(8000) ? port.st : null; if (!s || s.o !== 'game') { since = Date.now(); sig = ''; return; }
      const S = G('S'), R = G('R'); if (!S) return;
      const st = window.H5.st || {}, w = st.wallet || {}, c = st.char || {};
      const now = JSON.stringify([S.exp, S.lvl, S.gold, c.gold, c.exp, w.knb, w.knbk, R && R.tower && R.tower.floor, S.dt && S.dt.today, st.items && st.items.size, (S.inv || []).length]);
      if (now !== sig) { sig = now; since = Date.now(); return; }
      const min = Math.floor((Date.now() - since) / 60e3);
      if (s.noi === 'phoban' && min >= 8 && !autoOffMe() && Date.now() - pbAt > 10 * 60e3) {
        pbAt = Date.now(); const ok = await tasks.setMode('farm');
        try { ipcRenderer.send('lab:stall', { min, noi: 'Phó Bản', act: ok ? 'bỏ Phó Bản, sang Luyện Công' : 'chuyển Luyện Công chưa được' }); } catch {}
        try { ipcRenderer.send('lab:auto:log', `Phó Bản: ${min} phút không có hoạt động mới (có thể kẹt góc) → ${ok ? 'bỏ Phó Bản, sang Luyện Công' : 'chuyển Luyện Công chưa được'}`); } catch {}
        since = Date.now(); return;
      }
      if (min >= 5 && Date.now() - warnAt > 30 * 60e3) { warnAt = Date.now(); try { ipcRenderer.send('lab:stall', { min, noi: s.noi }); } catch {} }
    } catch {}
  }, 30000);
})();

// [V11.18] KHUNG MODULE: nạp phần-trong-game của các module đang bật (danh sách hỏi main 1 lần lúc mở ô)
try { for (const p of (ipcRenderer.sendSync('lab:mod:preloads') || [])) { try { require(p)({ ipcRenderer, h5Save, gameSave }); (window.__vlmPre = window.__vlmPre || []).push(p.replace(/^.*[\\/]modules[\\/]/, '')); } catch (e) { console.warn('[LITE] module lỗi', p, e); } } } catch (e) { console.warn('[LITE] khung module', e); }
