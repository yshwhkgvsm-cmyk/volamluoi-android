// Võ Lâm Lười Android — BỘ ĐIỀU PHỐI XOAY NHÓM (như LuoiSpeed): mở 1 nhóm 4–8 acc → (đăng ký nhanh) → đăng nhập → (tạo nhân vật Hỏa/Nữ)
// → nhận quà/KNB + Hồng Bao → để chơi tới hết "thời gian chạy nhóm" (1–180 phút) → ủy thác → đóng → nhóm kế.
// Không phụ thuộc Android: host = { open(slot, creds), reload(slot, creds), close(slot), send(slot, kênh, [tham số]), dec(passEnc) }.
(function (root) {
  'use strict';
  const vnDay = t => new Date((t || Date.now()) + 7 * 3600e3).toISOString().slice(0, 10);
  const DEFAULT_CFG = { dt: false, dg: false, wb: false, tower: false, bossHK: false, autoFight: false, dtReward: 'xp', dtRewardOrder: ['xp', 'item', 'gold', 'luck'], farmMap: '', bossReturn: 'farm' };
  const DEF = () => ({ nhom: 4, phut: 30, dangKy: true, taoNv: true, he: 'hoa', sex: 'nu', tenKieu: 'user', tenTien: '', knb: true, hb: true, uyThac: true, lap: false, vaoGame: 5,
    ip: false, ipHet: 'dung', proxyEnc: '' });
  // Danh sách proxy: mỗi dòng 1 cái — host:port | host:port:user:pass | user:pass@host:port | http(s)://… | socks5://host:port
  function parseProxies(text) {
    const out = [];
    for (let ln of String(text || '').split(/\r?\n/)) {
      ln = ln.trim(); if (!ln || ln.startsWith('#')) continue;
      let scheme = 'http', m = /^(https?|socks5?|socks4):\/\/(.*)$/i.exec(ln); if (m) { scheme = m[1].toLowerCase(); if (scheme === 'socks') scheme = 'socks5'; ln = m[2]; }
      let user = '', pass = '', host = '', port = 0;
      if ((m = /^([^:@\s]+):([^@\s]*)@([^:\s]+):(\d{1,5})\/?$/.exec(ln))) [, user, pass, host, port] = m;
      else if ((m = /^([^:\s]+):(\d{1,5}):([^:\s]+):(\S+)$/.exec(ln))) [, host, port, user, pass] = m;
      else if ((m = /^([^:\s]+):(\d{1,5})\/?$/.exec(ln))) [, host, port] = m;
      else { out.push({ bad: 'không đọc được dòng: ' + ln.slice(0, 40) }); continue; }
      port = +port; if (!(port > 0 && port < 65536)) { out.push({ bad: 'cổng sai: ' + ln.slice(0, 40) }); continue; }
      out.push({ scheme, host, port, user, pass, label: `${host}:${port}` });
    }
    return out;
  }
  function createEngine(o) {
    const host = o.host, store = o.store, now = o.now || (() => Date.now());
    const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    const setT = o.setTimeout || ((f, ms) => setTimeout(f, ms)), clrT = o.clearTimeout || (t => clearTimeout(t));
    const T = (name, ms) => (o.times && o.times[name]) || ms;   // cho kiểm thử rút ngắn thời gian chờ
    const logs = [];
    const log = m => { const d = new Date(now() + 7 * 3600e3); const s = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} ${m}`; logs.unshift(s); if (logs.length > 400) logs.length = 400; o.onLog && o.onLog(s); };
    const load = (k, d) => { try { const v = JSON.parse(store.getItem(k)); return v == null ? d : v; } catch { return d; } };
    const save = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch (e) { log('lỗi lưu ' + k + ': ' + e); } };
    let accs = load('vll.accs', []), cfg = { ...DEF(), ...load('vll.cfg', {}) }, cyc = load('vll.cycle', { done: {}, pending: {} });
    let soiList = load('vll.soi', []);
    const saveAccs = () => save('vll.accs', accs), saveCfg = () => save('vll.cfg', cfg), saveCyc = () => save('vll.cycle', cyc);
    const run = { on: false, round: 0, batch: 0, batches: 0, deadline: 0, start: 0, stopReq: false, ip: '', proxy: '' };
    const proxyList = () => { let t = ''; try { t = cfg.proxyEnc ? host.dec(cfg.proxyEnc) : ''; } catch {} return parseProxies(t).filter(p => !p.bad); };
    const setProxy = p => host.proxy ? Promise.resolve(host.proxy(p)).then(r => r || { ok: false, why: 'không có kết quả' }) : Promise.resolve({ ok: false, why: 'app chưa hỗ trợ proxy' });
    // Nhóm thứ b dùng proxy thứ b (quay vòng khi hết danh sách). Proxy lỗi → thử proxy kế; lỗi trong lượt chạy này thì bỏ qua tới hết lượt.
    async function ipForBatch(b, bad) {
      const L = proxyList(); if (!L.length) return { ok: false, why: 'danh sách proxy trống' };
      for (let k = 0; k < L.length; k++) {
        const idx = (b + k) % L.length, p = L[idx]; if (bad.has(p.label)) continue;
        if (/^socks/.test(p.scheme) && p.user) { bad.add(p.label); log(`proxy ${idx + 1} (${p.label}): SOCKS có mật khẩu WebView không dùng được — dùng proxy HTTP`); continue; }
        const r = await setProxy(p); if (stopped()) return { ok: false, why: 'đã dừng' };
        if (r.ok) { run.ip = r.ip; run.proxy = `${idx + 1}/${L.length} ${p.label}`; emit(); return { ok: true, ip: r.ip, idx, p }; }
        bad.add(p.label); log(`❌ proxy ${idx + 1} (${p.label}): ${r.why || 'lỗi'} → thử proxy kế`);
      }
      return { ok: false, why: 'mọi proxy đều lỗi' };
    }
    const slots = [];   // slot i: { acc, st, msg, phase, status, at }
    const waiters = [];
    const emit = () => { o.onChange && o.onChange(); };

    // ---- tin từ ô game ----
    function onGame(i, m) {
      if (!Array.isArray(m)) return; const s = slots[i]; const ch = m[0];
      if (s) {
        if (ch === 'bot:phase') { if (s.phase !== m[1]) { s.phase = m[1]; emit(); } }
        else if (ch === 'bot:status') { s.status = m[1] || {}; }
        else if (ch === 'vll:screen') { s.screen = m[1]; }
        else if (ch === 'bot:log' || ch === 'lab:auto:log') { const t = m.slice(1).join(' '); if (!/^\s*$/.test(t) && !/quét|chạy né|giữ khoảng cách/.test(t)) log(`${s.acc.user}: ${t}`); }
        else if (ch === 'vll:event' && m[1] && m[1].soi) addSoi(s.acc, m[1].soi);
      }
      for (const w of waiters.slice()) if (w.i === i) { let v; try { v = w.test(m); } catch { v = null; } if (v) { done(w); w.res(v); } }
    }
    function done(w) { clrT(w.t); const k = waiters.indexOf(w); if (k >= 0) waiters.splice(k, 1); }
    const waitMsg = (i, test, ms) => new Promise(res => { const w = { i, test, res }; w.t = setT(() => { done(w); res(null); }, ms); waiters.push(w); });
    let seq = 0;
    async function sCmd(i, cmd, arg, ms) { const rid = 'a' + (++seq) + '_' + now(); host.send(i, 'lab:sched:cmd', [rid, cmd, arg == null ? null : arg]); const r = await waitMsg(i, m => m[0] === 'lab:sched:reply' && m[1] === rid && (m[2] || { ok: false, err: 'rỗng' }), ms); return r || { ok: false, err: 'ô không trả lời' }; }
    function addSoi(acc, soi) { soiList.unshift({ user: acc.user, ...soi }); soiList = soiList.slice(0, 10); save('vll.soi', soiList); log(`${acc.user}: đã lưu bản Soi giao diện (${soi.why || ''}) — mở Nhật ký › Gửi bản Soi`); }
    const tenOf = (acc) => cfg.tenKieu === 'tien' && cfg.tenTien ? cfg.tenTien + String(accs.indexOf(acc) + 1) : acc.user;
    function creds(acc, x) {
      let pass = ''; try { pass = host.dec(acc.pass) || ''; } catch {}
      return { user: acc.user, pass, cfg: { ...DEFAULT_CFG }, autoLogin: x.autoLogin !== false,
        android: { dangKy: !!x.dangKy, taoNv: !!cfg.taoNv && acc.char !== 'ok', he: cfg.he, sex: cfg.sex, ten: tenOf(acc) } };
    }
    const AUTO = () => ({ farm: false, tt: false, rc: true, daily: false, qua: { knb: !!cfg.knb, dd: true, dhb: !!cfg.hb, hb: !!cfg.hb, doi: false, tri: false, pd: false, mohb: !!cfg.hb, mohbn: !!cfg.hb }, me: {} });
    const stopped = () => run.stopReq || !run.on;
    const chk = () => { if (stopped()) throw new Error('đã dừng'); };

    // ---- 1 tài khoản trong nhóm ----
    async function flow(i, acc, ctx) {
      const s = slots[i] = { acc, st: 'mở ô', msg: '', phase: '', status: {}, at: now() }; emit();
      const set = (st, msg) => { s.st = st; if (msg != null) s.msg = msg; emit(); };
      if (cfg.dangKy && acc.reg !== 'ok') {
        set('đăng ký nhanh'); host.open(i, creds(acc, { dangKy: true, autoLogin: false }));
        const e = await waitMsg(i, m => m[0] === 'vll:event' && m[1] && m[1].type === 'reg' && m[1], T('reg', 120000)); chk();
        if (!e) throw new Error('đăng ký quá 2 phút');
        if (!e.ok) throw new Error('đăng ký: ' + e.why);
        acc.reg = 'ok'; saveAccs(); log(`${acc.user}: ${e.exists ? 'tài khoản đã có sẵn' : 'đăng ký nhanh xong'} → đăng nhập`);
        await sleep(T('afterReg', 1500)); chk();
        host.reload(i, creds(acc, { autoLogin: true }));
      } else host.open(i, creds(acc, { autoLogin: true }));
      set('đăng nhập');
      const charFail = waitMsg(i, m => m[0] === 'vll:event' && m[1] && m[1].type === 'char' && !m[1].ok && m[1], T('vaoGame', cfg.vaoGame * 60e3));
      let inGame = s.phase === 'ingame' ? true : await Promise.race([waitMsg(i, m => m[0] === 'bot:phase' && m[1] === 'ingame', T('vaoGame', cfg.vaoGame * 60e3)), charFail.then(c => c ? { fail: c } : null)]);
      chk();
      if (inGame && inGame.fail) throw new Error('tạo nhân vật: ' + inGame.fail.why);
      if (!inGame) throw new Error(`quá ${cfg.vaoGame} phút chưa vào game (${s.screen || s.phase || '?'})`);
      if (acc.char !== 'ok') { acc.char = 'ok'; saveAccs(); }
      host.send(i, 'lab:auto:cfg', [AUTO()]);
      if (cfg.knb || cfg.hb) {
        set('nhận quà');
        const d = await sCmd(i, 'daily', { knbDone: !cfg.knb, triDone: true }, T('daily', 180000)); chk();
        log(`${acc.user}: quà ${d.ok ? (d.got && d.got.length ? d.got.join(', ') : 'đã nhận hết') : 'lỗi: ' + (d.err || '?')}${cfg.knb ? (d.knbDone ? '' : ' · KNB chưa đổi') : ''}`);
        if (cfg.hb) { const h = await sCmd(i, 'hbAll', null, T('hb', 120000)); chk(); log(`${acc.user}: Hồng Bao ${h.ok ? 'xong' : 'lỗi: ' + (h.err || '?')}`); }
      }
      set('đang chơi', '');
      while (now() < ctx.deadline) { chk(); await sleep(Math.min(T('tick', 5000), Math.max(10, ctx.deadline - now()))); }
      chk();
      if (cfg.uyThac) {
        set('ủy thác');
        await sCmd(i, 'prepExit', null, T('prep', 5000)); chk();
        host.send(i, 'ui:cmd', ['delegate']);
        const r = await waitMsg(i, m => (m[0] === 'game:delegated' && { ok: true }) || (m[0] === 'game:action-result' && m[1] === 'delegate' && { ok: !!m[2], msg: m[3] }), T('delegate', 120000)); chk();
        if (!r) throw new Error('ủy thác quá 2 phút chưa xác nhận');
        if (!r.ok) throw new Error('ủy thác: ' + (r.msg || 'game báo lỗi'));
        log(`${acc.user}: ✅ đã ủy thác`);
      } else { set('đăng xuất'); host.send(i, 'ui:cmd', ['logout!']); await waitMsg(i, m => m[0] === 'game:action-result' && m[1] === 'logout', T('logout', 30000)); log(`${acc.user}: đã đăng xuất (không ủy thác)`); }
      cyc.done[acc.id] = vnDay(now()); delete cyc.pending[acc.id]; saveCyc();
      set('xong'); host.close(i);
    }
    async function runAll() {
      run.on = true; run.stopReq = false; run.round = 0; run.ip = ''; run.proxy = ''; emit();
      const badProxy = new Set();
      if (cfg.ip && !proxyList().length) { log('❌ bật Đổi IP nhưng danh sách proxy trống'); run.on = false; emit(); return; }
      log(`▶ bắt đầu: nhóm ${cfg.nhom} acc${cfg.ip ? ` / 1 IP (${proxyList().length} proxy)` : ''}, chạy ${cfg.phut} phút/nhóm${cfg.dangKy ? ', đăng ký nhanh' : ''}${cfg.taoNv ? ', tạo nhân vật hệ Hỏa Nữ' : ''}${cfg.uyThac ? ', ủy thác cuối nhóm' : ''}`);
      try {
        do {
          run.round++;
          const today = vnDay(now());
          const list = accs.filter(a => !a.off && (cfg.lap ? true : cyc.done[a.id] !== today));
          if (!list.length) { log('không còn acc nào cần chạy hôm nay'); break; }
          const N = Math.max(3, Math.min(8, cfg.nhom | 0));
          run.batches = Math.ceil(list.length / N);
          for (let b = 0; b < run.batches && !stopped(); b++) {
            const batch = list.slice(b * N, b * N + N); run.batch = b + 1;
            if (cfg.ip) {   // đổi IP trước khi mở nhóm (lúc này không còn ô nào mở)
              const r = await ipForBatch(b, badProxy); if (stopped()) break;
              if (r.ok) log(`🌐 nhóm ${b + 1}: proxy ${r.idx + 1} (${r.p.label}) → IP ${r.ip}`);
              else if (cfg.ipHet === 'that') { const d = await setProxy(null); run.ip = d.ip || ''; run.proxy = 'IP thật'; log(`⚠ ${r.why} → nhóm ${b + 1} chạy bằng IP thật ${d.ip || ''}`); }
              else { log(`❌ ${r.why} → dừng (Cài đặt › Đổi IP: chọn "chạy bằng IP thật" nếu muốn chạy tiếp)`); run.stopReq = true; break; }
            }
            run.start = now(); run.deadline = now() + Math.max(1, Math.min(180, cfg.phut | 0)) * 60e3; emit();
            log(`— vòng ${run.round} · nhóm ${b + 1}/${run.batches}: ${batch.map(a => a.user).join(', ')}`);
            const ctx = { deadline: run.deadline };
            await Promise.all(batch.map((a, i) => flow(i, a, ctx).catch(async e => {
              const msg = String(e && e.message || e).slice(0, 200);
              if (!stopped()) { cyc.pending[a.id] = msg; saveCyc(); log(`${a.user}: ❌ ${msg}`); if (slots[i]) { slots[i].st = 'lỗi'; slots[i].msg = msg; } }
              try { host.send(i, 'login:disable', []); if (slots[i] && slots[i].phase === 'ingame') { host.send(i, 'ui:cmd', ['logout!']); await sleep(T('close', 1500)); } } catch {}
              host.close(i); emit();
            })));
            for (let i = 0; i < 8; i++) slots[i] = null; emit();
            if (!stopped()) await sleep(T('gap', 2000));
          }
        } while (cfg.lap && !stopped());
      } finally {
        for (let i = 0; i < 8; i++) { try { host.close(i); } catch {} slots[i] = null; }
        if (cfg.ip) { try { await setProxy(null); } catch {} run.proxy = ''; }   // trả máy về IP thật
        for (const w of waiters.slice()) { done(w); w.res(null); }
        log(run.stopReq ? '■ đã dừng' : '■ xong hết các nhóm');
        run.on = false; run.stopReq = false; emit();
      }
    }
    return {
      onGame, onSlot(i, ev) { if (ev === 'crash' && slots[i]) log(`${slots[i].acc.user}: ô game bị Android đóng (thiếu RAM?)`); },
      start() { if (run.on) return false; if (!accs.length) { log('chưa có tài khoản'); return false; } runAll(); return true; },
      stop() { if (!run.on) return; run.stopReq = true; for (const w of waiters.slice()) { done(w); w.res(null); } log('đang dừng…'); emit(); },
      state: () => ({ run: { ...run }, slots: slots.map(s => s && { user: s.acc.user, st: s.st, msg: s.msg, phase: s.phase, lv: s.status && s.status.lv, map: s.status && s.status.map, name: s.status && s.status.name }), cfg: { ...cfg }, accs, cyc, logs, soi: soiList, today: vnDay(now()) }),
      setCfg(p) { for (const k of Object.keys(DEF())) if (k in p) cfg[k] = p[k]; cfg.nhom = Math.max(3, Math.min(8, cfg.nhom | 0)); cfg.phut = Math.max(1, Math.min(180, cfg.phut | 0)); cfg.vaoGame = Math.max(1, Math.min(30, cfg.vaoGame | 0)); saveCfg(); emit(); return cfg; },
      addBulk(prefix, a, b, passEnc, chuaDk) {
        prefix = String(prefix || '').trim(); a = a | 0; b = b | 0;
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,20}$/.test(prefix) || a < 0 || b < a || b - a > 999) throw new Error('Kiểm tra tiền tố (chữ đầu, không dấu) và số đầu/cuối (tối đa 1000 acc)');
        const used = new Set(accs.map(x => x.user.toLowerCase())); let n = 0;
        for (let k = a; k <= b; k++) { const user = prefix + k; if (used.has(user.toLowerCase())) continue; accs.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), user, pass: passEnc, reg: chuaDk ? 'can' : 'ok', char: '?' }); used.add(user.toLowerCase()); n++; }
        saveAccs(); emit(); return n;
      },
      addList(lines, encFn, chuaDk) { let n = 0; const used = new Set(accs.map(x => x.user.toLowerCase())); for (const ln of String(lines || '').split(/\r?\n/)) { const m = /^\s*([^\s|:;,]+)\s*[|:;,\s]\s*(\S+)\s*$/.exec(ln); if (!m || used.has(m[1].toLowerCase())) continue; accs.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), user: m[1], pass: encFn(m[2]), reg: chuaDk ? 'can' : 'ok', char: '?' }); used.add(m[1].toLowerCase()); n++; } saveAccs(); emit(); return n; },
      remove(ids) { if (run.on) throw new Error('Dừng chạy trước khi xóa'); const s = new Set(ids); accs = accs.filter(a => !s.has(a.id)); saveAccs(); emit(); },
      setAcc(id, p) { const a = accs.find(x => x.id === id); if (!a) return; for (const k of ['off', 'reg', 'char']) if (k in p) a[k] = p[k]; saveAccs(); emit(); },
      resetToday() { cyc = { done: {}, pending: {} }; saveCyc(); emit(); },
      clearLog() { logs.length = 0; emit(); },
      proxies: () => proxyList(), parseProxies,
      async testProxies() { const L = proxyList(), out = []; for (let k = 0; k < L.length; k++) { const p = L[k]; const r = host.check ? await Promise.resolve(host.check(p)) : { ok: false, why: 'app chưa hỗ trợ' }; out.push({ k: k + 1, label: p.label, ...r }); log(`kiểm proxy ${k + 1} (${p.label}): ${r.ok ? 'IP ' + r.ip : '❌ ' + r.why}`); } return out; }
    };
  }
  root.VLLEngine = { createEngine, vnDay };
  if (typeof module !== 'undefined') module.exports = root.VLLEngine;
})(typeof window !== 'undefined' ? window : globalThis);
