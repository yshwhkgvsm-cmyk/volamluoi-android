// Logic tự động cho Võ Lâm Idle. Chạy trong trang game (preload, contextIsolation: false).
// Game có sẵn "Chế Độ" (Luyện Công / Phó Bản / Nhiệm Vụ / Leo Tháp) nên bot chỉ đổi chế độ rồi chờ game tự làm.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const $ = (s) => document.querySelector(s);
const visible = (el) => !!el && el.getClientRects().length > 0;
const state = { task: '', paused: false, onLog: null };
const log = (...a) => { console.log('[bot]', ...a); try { state.onLog?.(a.join(' ')); } catch {} };

async function waitFor(sel, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const el = $(sel); if (visible(el)) return el; await sleep(150); }
  return null;
}
async function waitGone(sel, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (!visible($(sel))) return true; await sleep(200); }
  return false;
}
async function click(el) {
  if (!el) return false;
  el.click();
  await sleep(rnd(300, 800));
  return true;
}
function setVal(el, v) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------- thời gian (giờ Việt Nam GMT+7, không phụ thuộc múi giờ máy) ----------
const vnDate = () => new Date(Date.now() + 7 * 3600e3);
const today = () => vnDate().toISOString().slice(0, 10);
const weekKey = () => String(Math.floor((vnDate() - Date.UTC(1970, 0, 5)) / (7 * 864e5)));   // tuần bắt đầu thứ Hai
const vnMinutes = () => { const d = vnDate(); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; };
const flag = (k) => localStorage.getItem('bot_' + k);
const setFlag = (k, v) => localStorage.setItem('bot_' + k, v);

// ---------- chế độ của game ----------
const curMode = () => $('#mswMenu [data-msw].on')?.dataset.msw || null;   // farm | dg | quest | tower
// [LITE v10.9] lệnh ẩn #vlmAuto của game (bản 990+): làm việc không cần mở bảng / bấm giao diện
async function vlmApi(act, arg = {}, ms = 15000) {
  const b = document.createElement('button'); b.id = 'vlmAuto'; b.type = 'button'; b.style.display = 'none';
  b.dataset.act = act; b.dataset.arg = JSON.stringify(arg || {});
  (document.body || document.documentElement).appendChild(b);
  try {
    b.click(); const end = Date.now() + ms;
    while (!b.dataset.xong && Date.now() < end) await sleep(120);
    if (!b.dataset.xong) return { ok: false, why: 'hết giờ' };
    try { return JSON.parse(b.dataset.kq || '{}'); } catch { return { ok: false, why: 'kết quả lạ' }; }
  } finally { b.remove(); }
}
let modeSetAt = 0;   // [LITE v10.10] lúc client đổi chế độ (để phân biệt với game tự đổi khi gục ở Tháp)
async function setMode(m) {
  if (curMode() === m) return true;
  modeSetAt = Date.now();
  { // [LITE v10.9] đổi chế độ bằng lệnh ẩn: không mở menu, không giật chuột khi bạn đang xem; game cũ không có lệnh → bấm menu như trước
    const r = await vlmApi('cheDo', { m });
    if (r.ok) { await sleep(800); const ok = r.m === m; log(ok ? 'đã chuyển chế độ: ' + m : `chuyển chế độ ${m} chưa được (đang ở ${r.m})`); return ok; }
    if (!/lệnh lạ|hết giờ/.test(r.why || '')) { log(`chuyển chế độ ${m} chưa được: ${r.why || '?'}`); return false; }
  }
  const menu = $('#mswMenu');
  if (menu?.classList.contains('hidden')) { await click($('#mswBtn')); await sleep(300); }
  const b = $(`#mswMenu [data-msw="${m}"]`);
  if (!b) { log('không thấy nút chế độ', m); return false; }
  await click(b);
  await sleep(1500);
  if (menu && !menu.classList.contains('hidden')) await click($('#mswBtn'));   // đóng menu nếu còn mở
  const ok = curMode() === m;
  log(ok ? 'đã chuyển chế độ: ' + m : `chuyển chế độ ${m} chưa được (đang ở ${curMode()})`);
  return ok;
}

// ---------- bảng Nhiệm vụ (chỉ dùng cho Dã Tẩu trả nhiệm vụ và Boss tuần) ----------
let botOpened = false;
const panelOpen = () => visible($('#u20wh')) && visible($('#t-quest'));
async function openQuest(sub) {
  if (!panelOpen()) {
    await click($('#actBtn'));
    if (!await waitFor('#t-quest', 2500)) {
      await click($('#u20menu [data-u="quest"]') || $('#tabs [data-t="quest"]'));
      if (!await waitFor('#t-quest', 2500)) return false;
    }
    botOpened = true;
  }
  const tab = $(`[data-qt="${sub}"]`);
  if (!tab) return false;
  if (!tab.classList.contains('on')) { await click(tab); await sleep(300); }
  return true;
}
async function closePanel() {                       // chỉ đóng bảng do bot mở, không đóng bảng bạn đang xem
  if (!botOpened) return;
  const x = $('#u20wx');
  if (visible(x)) await click(x);
  botOpened = false;
}
const hasDot = (sel) => !!$(sel)?.classList.contains('on');   // chấm đỏ = class "on"

// ---------- Dã Tẩu: trả nhiệm vụ khi có chấm đỏ ----------
// Dã Tẩu: game hiển thị tối đa 3 thưởng ở các nút .dtopt sau khi nhiệm vụ hoàn thành.
// Không thay đổi phép tính thưởng; chỉ ưu tiên click vào một nút đang có thật.
const DT_TYPES = { xp:/kinh nghiệm/i, item:/vật phẩm/i, gold:/tiền/i, luck:/thử vận may/i };
const REWARD_DEFAULT = ['xp', 'item', 'gold', 'luck'];
function rewardOrder(cfg) {
  const input=Array.isArray(cfg.dtRewardOrder)?cfg.dtRewardOrder:[cfg.dtReward||'xp'];
  return [...new Set([...input,...REWARD_DEFAULT].filter(k=>DT_TYPES[k]))];
}
function chooseReward(buttons, cfg) {
  const valid=buttons.filter(b=>b && !b.disabled && (!b.getClientRects || visible(b)));
  for(const type of rewardOrder(cfg)) {
    const found=valid.find(b=>DT_TYPES[type].test(b.textContent||''));
    if(found) return found;
  }
  return valid[0] || null;
}
async function manualRewardMode() {
  const self=$('#dtSelf');
  // dtSelf.checked = true -> game đặt dt.auto=false: hiện 3 lựa chọn thủ công.
  if (self && !self.checked) { self.checked=true; self.dispatchEvent(new Event('change',{bubbles:true})); await sleep(200); }
}
let rewardPrepared=false;
async function prepareRewardSelection() {
  if(rewardPrepared)return;
  if(!await openQuest('dt'))return;
  const self=await waitFor('#dtSelf',1200);
  if(!self) return;
  await manualRewardMode();
  rewardPrepared=true;
  await closePanel();
}
async function doDaTau(cfg) {
  if (!await openQuest('dt')) return;
  await waitFor('#dtSelf');
  await manualRewardMode();
  let done=0;
  for(let i=0;i<45;i++) {
    if(!await openQuest('dt')) break;
    await manualRewardMode();
    // Quan trọng: chọn ngay nút thưởng thực tế khi game có thể trả nhiệm vụ.
    const chosen=chooseReward([...document.querySelectorAll('#t-quest .dtopt')],cfg);
    if(chosen) { await click(chosen); done++; await sleep(500); continue; }
    const btn=$('#dtDo'); if(!btn || btn.disabled) break;
    await click(btn); done++; await sleep(rnd(450,900));
  }
  if(done) log('Dã Tẩu: xử lý',done,'lượt theo ưu tiên thưởng');
  // Không bấm #dtCancel (mất chuỗi) hoặc #dtLdt (tốn Lệnh Bài).
}

// ---------- Boss tuần ----------
async function doBossTuan() {
  const stat=readGame();
  if(!stat || stat.wbDone) return !!stat?.wbDone;
  if (!await openQuest('wb')) return false;
  const claim=$('#wbClaim');
  if(claim && !claim.disabled){
    await click(claim);
    if(readGame()?.wbDone){log('Boss tuần đã nhận rương và hoàn thành');return true;}
  }
  const remaining=readGame()?.wbRemaining;
  if(remaining===0){log('Boss tuần đã hết lượt, chờ rương có thể nhận');return false;}
  const go=$('#wbGo');
  if(!go || go.disabled){log('Boss tuần: chưa đủ điều kiện khiêu chiến hoặc đang đánh');return false;}
  await click(go);
  log('Boss tuần: đã yêu cầu bắt đầu một lượt, còn',remaining,'lượt trước khi vào');
  // Boss chạy bên trong game. Tránh bấm liên tục trong suốt trận và không đánh dấu hoàn thành sớm.
  return false;
}

// ---------- Boss Hoàng Kim: về luyện công quanh giờ boss ----------
const {readGame} = require('./game-progress');
const BOSS_HK = [12 * 60, 15 * 60 + 30, 19 * 60 + 30, 22 * 60];
const LEAD=1,LEN=30,TAIL=1;
const activeBossWindow = () => {
  const n=vnMinutes(); const index=BOSS_HK.findIndex(t=>n>=t-LEAD && n<t+LEN+TAIL);
  return index<0 ? null : {index, end:(BOSS_HK[index]+LEN)*60000};
};
const inBossWindow=()=>!!activeBossWindow();
const minsToBoss=()=>{ const n=vnMinutes(),next=BOSS_HK.find(t=>t-LEAD>n); return (next??BOSS_HK[0]+1440)-LEAD-n; };
let lastBossReturnKey=null;
function bossCompletedHere() {
  const g=readGame()?.gb, w=activeBossWindow();
  if(!g || !w || !g.done) return false;
  const d=vnDate(), start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())).getTime();
  const expectedEnd=start + (BOSS_HK[w.index]+LEN)*60000 - 7*3600000;
  return Math.abs(g.end-expectedEnd)<1000 && g.key.endsWith('#'+w.index);
}
// ---------- tiện ích ----------
async function ensureAuto() {                                 // nút "Auto" (tự động đánh) phải đang bật
  const b = $('#ctrlBtn');
  if (b && visible(b) && !b.classList.contains('on')) { await click(b); log('bật Auto đánh'); }
}
// đổi sang chế độ rồi chờ game tự quay về Luyện Công. true = xong; false = bị ngắt/quá giờ
async function runModeTask(cfg, mode, label, maxMs) {
  if (!await setMode(mode)) return false;
  log(label + ': bắt đầu');
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(5000);
    if (state.paused) return false;
    if (curMode() !== mode) { log(label + ': xong'); return true; }
    if (cfg.bossHK && inBossWindow()) { log(label + ': dừng vì đến giờ Boss Hoàng Kim'); await setMode('farm'); return false; }
  }
  log(label + ': quá thời gian chờ');
  await setMode('farm');
  return false;
}
const towerLog = [];
async function goTower() {                                    // tránh vòng lặp gục ngã liên tục
  const now = Date.now();
  while (towerLog.length && now - towerLog[0] > 600000) towerLog.shift();
  if (curMode() === 'tower') return true;
  if (towerLog.length >= 4) return false;
  const ok = await setMode('tower');
  if (ok) towerLog.push(now);
  return ok;
}

// ---------- vòng chính ----------
async function loop(cfg) {
  let busy = false;
  const cool = {};
  const ready = (k) => !(cool[k] > Date.now());
  const later = (k, ms) => { cool[k] = Date.now() + ms; };
  const tick = async () => {
    if (busy) return;
    if (state.paused) { state.task = 'Tạm dừng'; return; }
    busy = true;
    try {
      // Tắt chọn thưởng mặc định của game NGAY KHI bật Dã Tẩu, trước khi trả nhiệm vụ đầu.
      if (cfg.dt) await prepareRewardSelection();
      if (cfg.autoFight !== false) await ensureAuto();

      if (cfg.bossHK && inBossWindow()) {
        const window=activeBossWindow();
        const key=today()+':'+window.index;
        if (bossCompletedHere()) {
          state.task='Boss Hoàng Kim hoàn thành';
          if (lastBossReturnKey !== key) {
            lastBossReturnKey=key;
            const next=['farm','tower','quest','dg'].includes(cfg.bossReturn)?cfg.bossReturn:'farm';
            await setMode(next);
            state.task='Sau Boss HK: '+next;
            log('Boss HK đã hạ, chuyển về chế độ',next);
          }
        } else if (lastBossReturnKey !== key) {
          state.task = 'Boss Hoàng Kim (luyện công)';
          await setMode('farm');
          const town=$('#townBar');
          if(town && !town.classList.contains('hidden')) await click($('#bBack'));
        }
      } else {
        const safe = !cfg.bossHK || minsToBoss() > 2;

        if (cfg.dt && hasDot('#dotQuest') && ready('dtdot')) {
          state.task = 'Dã Tẩu (trả nhiệm vụ)';
          await doDaTau(cfg); await closePanel();
          later('dtdot', 120000);
        }
        if (cfg.dt && safe && flag('quest_done') !== today() && ready('quest')) {
          state.task = 'Nhiệm vụ ngày';
          if (await runModeTask(cfg, 'quest', 'Nhiệm vụ ngày', 40 * 60e3)) setFlag('quest_done', today());
          else later('quest', 10 * 60e3);
        }
        if (cfg.dg && safe && !readGame()?.dgDone && flag('dg_done') !== today() && ready('dg')) {
          state.task = 'Phó bản';
          await runModeTask(cfg, 'dg', 'Phó bản', 45 * 60e3);
          if(readGame()?.dgDone)setFlag('dg_done', today());
          else later('dg', 10 * 60e3);
        }
        if (cfg.wb && safe && !readGame()?.wbDone && flag('wb_done') !== weekKey() && ready('wb')) {
          state.task = 'Boss tuần';
          await setMode('farm');
          await doBossTuan(); await closePanel();
          if(readGame()?.wbDone)setFlag('wb_done', weekKey());
          else later('wb', 5 * 60e3);
        }
        if (cfg.tower) {
          if (ready('tower')) {
            const ok = await goTower();
            state.task = ok ? 'Leo tháp' : 'Luyện công (tháp tạm nghỉ)';
            if (!ok) later('tower', 120000);
          }
        } else state.task = 'Luyện công';
      }
    } catch (e) { console.error('[bot] lỗi tick', e); }
    busy = false;
  };
  await tick();
  setInterval(tick, 15000);
}


// Một lần duy nhất: nhấn Luyện Công chọn bãi theo index của window.JW.zones.
// Bấm lại nếu game đã chuyển chế độ/map. Không tạo vòng lặp điều hướng liên tục.
let movingFarm=false;
async function farmOnce(mapIndex, altIndex=0) {
  if(movingFarm)return false;
  movingFarm=true;
  try {
    // Dùng dữ liệu JW runtime làm nguồn xác thực; file maps chỉ dùng làm dự phòng.
    const live=window.JW;
    const main=live?.zones?.[mapIndex];
    const alt=altIndex ? live?.zalt?.[mapIndex]?.[altIndex-1] : main;
    const target=alt || require('./maps.json').find(m=>m.index===mapIndex&&m.altIndex===altIndex);
    if(!target) {log('Bãi luyện công không hợp lệ:',mapIndex,altIndex);return false;}
    if(!await setMode('farm'))return false;
    const selector=`#u20zl .zrow[data-z="${mapIndex}"]`;
    let row=$(selector), list=$('#u20zl');
    if(!list || list.classList.contains('hidden') || !visible(row))await click($('#u20zb'));
    row=await waitFor(selector,3500);
    if(!row || row.disabled) {log('Bãi luyện công chưa mở khóa:',target.n||target.name);return false;}
    // data-zf nằm trong nút .zrow: gọi handler trực tiếp để không click nhầm map gốc.
    if((live?.zalt?.[mapIndex]||[]).length){
      let chip=$(`#u20zl [data-za="${mapIndex}:${altIndex}"]`);
      if(!chip){const fold=row.querySelector(`[data-zf="${mapIndex}"]`);if(fold && typeof fold.onclick==='function'){fold.onclick();await sleep(250);}}
      chip=await waitFor(`#u20zl [data-za="${mapIndex}:${altIndex}"]`,1500);
      if(chip && !chip.disabled)await click(chip);
      else if(altIndex===0)await click(row);
      else{log('Không có bản đồ phụ hoặc chưa được mở:',target.n||target.name);return false;}
    } else if(altIndex===0)await click(row);
    else {log('Bản đồ phụ không còn ở dữ liệu game mới');return false;}
    if($('#ctrlBtn') && !$('#ctrlBtn').classList.contains('on')) await ensureAuto();
    log('Luyện công: đã yêu cầu chuyển tới',target.n||target.name);
    return true;
  } catch(e){log('Lỗi chuyển map:',e.message);return false;}
  finally {movingFarm=false;}
}

module.exports = { modeSetAt: () => modeSetAt, vlmApi, loop, state, log, sleep, waitFor, waitGone, setVal, click, $, visible, setMode, curMode, farmOnce, chooseReward, rewardOrder, bossCompletedHere };
