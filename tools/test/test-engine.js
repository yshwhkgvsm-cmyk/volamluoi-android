// Kiểm bộ điều phối xoay nhóm với ô game giả (phản hồi như vll-game.js).
'use strict';
const path = require('path');
const { createEngine, vnDay } = require(path.resolve(__dirname, '../../app/src/main/assets/ui/engine.js'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const mem = () => { const m = {}; return { getItem: k => k in m ? m[k] : null, setItem: (k, v) => { m[k] = String(v); }, m }; };
let clock = Date.parse('2026-11-27T03:00:00Z');
const timers = new Set();
const fSet = (f, ms) => { const t = { at: clock + ms, f }; timers.add(t); return t; }, fClr = t => timers.delete(t);
const fire = () => { for (const t of [...timers].sort((a, b) => a.at - b.at)) if (t.at <= clock) { timers.delete(t); t.f(); } };
const sleep = ms => { clock += ms; fire(); return new Promise(r => setImmediate(r)); };   // bài kiểm thử đẩy đồng hồ
const eSleep = ms => new Promise(r => fSet(r, ms));                                     // bộ điều phối chờ theo hẹn giờ
function fakeHost(behave) {
  const H = { opened: [], closed: [], sent: [], live: {}, maxOpen: 0, eng: null };
  const reply = (i, m) => setImmediate(() => H.eng.onGame(i, m));
  function boot(i, c) {
    H.live[i] = c; H.maxOpen = Math.max(H.maxOpen, Object.keys(H.live).length);
    const b = behave(c.user) || {};
    if (c.android.dangKy) { reply(i, ['vll:event', b.regFail ? { type: 'reg', ok: false, why: 'không thấy nút Đăng Ký', soi: { why: 'x', items: [] } } : { type: 'reg', ok: true }]); return; }
    if (b.noLogin) { reply(i, ['bot:phase', 'login']); return; }
    if (c.android.taoNv && b.charFail) { reply(i, ['vll:event', { type: 'char', ok: false, why: 'không thấy nút chọn hệ Hỏa' }]); return; }
    reply(i, ['bot:phase', 'ingame']);
  }
  Object.assign(H, {
    open: (i, c) => { H.opened.push([i, c.user, JSON.parse(JSON.stringify(c))]); boot(i, c); },
    reload: (i, c) => { H.opened.push([i, c.user + '(tải lại)', JSON.parse(JSON.stringify(c))]); boot(i, c); },
    close: i => { if (H.live[i]) H.closed.push(H.live[i].user); delete H.live[i]; },
    dec: s => s === 'ENC' ? 'abc123' : '',
    send: (i, ch, args) => { const c = H.live[i]; if (!c) return; H.sent.push([c.user, ch, args]); const b = behave(c.user) || {};
      if (ch === 'lab:sched:cmd') { const [rid, cmd] = args; reply(i, ['lab:sched:reply', rid, cmd === 'daily' ? { ok: true, got: ['điểm danh'], knbDone: true } : { ok: true }]); }
      if (ch === 'ui:cmd' && args[0] === 'delegate') reply(i, b.delegFail ? ['game:action-result', 'delegate', false, 'chưa lưu xong'] : ['game:delegated']);
      if (ch === 'ui:cmd' && args[0] === 'logout!') reply(i, ['game:action-result', 'logout', true, '']); }
  });
  return H;
}
(async () => {
  const st = mem(); const beh = {};
  const H = fakeHost(u => beh[u]);
  const E = createEngine({ host: H, store: st, now: () => clock, sleep: eSleep, setTimeout: fSet, clearTimeout: fClr, times: { tick: 60000 } }); H.eng = E;
  ok(E.state().cfg.nhom === 4 && E.state().cfg.phut === 30, 'mặc định: nhóm 4 acc, 30 phút');
  ok(E.addBulk('con', 1, 10, 'ENC', true) === 10 && E.state().accs.every(a => a.reg === 'can'), 'thêm nhanh con1…con10, đánh dấu chưa đăng ký');
  ok(E.addBulk('con', 5, 12, 'ENC', true) === 2, 'thêm trùng → chỉ thêm con11, con12');
  let err = ''; try { E.addBulk('1x', 1, 2, 'E'); } catch (e) { err = e.message; } ok(/tiền tố/.test(err), 'tiền tố sai → báo');
  E.setCfg({ nhom: 6, phut: 2 }); ok(E.state().cfg.nhom === 6, 'đổi nhóm 6 acc');
  E.setCfg({ nhom: 12, phut: 999 }); ok(E.state().cfg.nhom === 8 && E.state().cfg.phut === 180, 'kẹp nhóm ≤ 8, phút ≤ 180');
  E.setCfg({ nhom: 4, phut: 3 });
  beh.con3 = { regFail: true }; beh.con6 = { charFail: true }; beh.con7 = { delegFail: true }; beh.con9 = { noLogin: true };
  const t0 = clock; E.start();
  while (E.state().run.on) await sleep(1000);
  const S = E.state(), today = vnDay(clock);
  ok(H.maxOpen <= 4, `không bao giờ mở quá 4 ô cùng lúc (tối đa ${H.maxOpen})`);
  const first = H.opened.find(o => o[1] === 'con1')[2];
  ok(first.android.dangKy && !first.autoLogin && first.pass === 'abc123', 'acc mới: mở với Đăng ký nhanh, chưa tự đăng nhập, giải mã mật khẩu');
  const re = H.opened.find(o => o[1] === 'con1(tải lại)'); ok(re && re[2].autoLogin && !re[2].android.dangKy && re[2].android.taoNv && re[2].android.he === 'hoa' && re[2].android.sex === 'nu', 'đăng ký xong → tải lại ô để đăng nhập, bật tạo nhân vật hệ Hỏa Nữ');
  ok(S.accs.find(a => a.user === 'con1').reg === 'ok' && S.accs.find(a => a.user === 'con1').char === 'ok', 'con1: lưu đã đăng ký + đã có nhân vật');
  ok(H.sent.some(x => x[0] === 'con1' && x[1] === 'lab:sched:cmd' && x[2][1] === 'daily') && H.sent.some(x => x[0] === 'con1' && x[2][1] === 'hbAll'), 'vào game → nhận quà/KNB + Hồng Bao');
  ok(H.sent.some(x => x[0] === 'con1' && x[1] === 'lab:auto:cfg' && x[2][0].qua.knb === true && x[2][0].daily === false), 'gửi cài đặt quà cho ô (lịch tự động của client tắt, điều phối lo)');
  const done = Object.keys(S.cyc.done).map(id => S.accs.find(a => a.id === id).user).sort();
  ok(JSON.stringify(done) === JSON.stringify(['con1', 'con10', 'con11', 'con12', 'con2', 'con4', 'con5', 'con8']), 'ủy thác xong 8 acc: ' + done.join(','));
  const pend = Object.fromEntries(Object.entries(S.cyc.pending).map(([id, m]) => [S.accs.find(a => a.id === id).user, m]));
  ok(/đăng ký/.test(pend.con3) && /tạo nhân vật/.test(pend.con6) && /ủy thác/.test(pend.con7) && /chưa vào game/.test(pend.con9), 'ghi lỗi từng acc: ' + JSON.stringify(pend).slice(0, 220));
  ok(S.soi.length === 1 && S.soi[0].user === 'con3', 'đăng ký lỗi → lưu bản Soi');
  const mins = (clock - t0) / 60e3; ok(mins >= 9 && mins < 30, `3 nhóm × 3 phút (+ chờ lỗi vào game 5 phút) ≈ ${mins.toFixed(1)} phút`);
  ok(H.closed.length >= 12 && !Object.keys(H.live).length, 'mọi ô đóng sau mỗi nhóm');
  // chạy lại cùng ngày: bỏ acc đã xong
  H.opened.length = 0; delete beh.con3; delete beh.con6; delete beh.con7; delete beh.con9; E.start(); while (E.state().run.on) await sleep(1000);
  ok(H.opened.filter(o => !/tải lại/.test(o[1])).map(o => o[1]).sort().join() === 'con3,con6,con7,con9', 'chạy lại hôm nay: chỉ chạy 4 acc còn lỗi');
  // dừng giữa chừng
  E.resetToday(); E.setCfg({ phut: 60 }); E.start(); for (let k = 0; k < 300; k++) await sleep(1000); E.stop(); while (E.state().run.on) await sleep(1000);
  ok(!Object.keys(H.live).length && E.state().logs.some(l => /đã dừng/.test(l)), 'Dừng: đóng hết ô, ghi "đã dừng"');
  ok(Object.keys(E.state().cyc.done).length === 0, 'dừng giữa chừng → không đánh dấu xong');
  // lặp lại
  E.setCfg({ phut: 1, lap: true }); H.opened.length = 0; E.start(); for (let k = 0; k < 480; k++) await sleep(1000); const opened = H.opened.length; E.stop(); while (E.state().run.on) await sleep(1000);
  ok(opened > 12, `"chạy lại từ đầu": hết danh sách quay lại nhóm đầu (${opened} lượt mở trong 8 phút)`);
  ok(st.m['vll.accs'] && st.m['vll.cfg'] && st.m['vll.cycle'], 'lưu acc / cài đặt / tiến độ');
  // ---- đổi IP theo nhóm (proxy) ----
  const P = E.parseProxies('1.1.1.1:8080\n2.2.2.2:3128:u2:p2\nu3:p3@px3.vn:8000\nsocks5://4.4.4.4:1080\nhttp://u5:p5@5.5.5.5:80\n# chú thích\nrác\n6.6.6.6:99999');
  ok(P.length === 7 && P[0].host === '1.1.1.1' && P[0].port === 8080 && P[1].user === 'u2' && P[1].pass === 'p2' && P[2].host === 'px3.vn' && P[2].user === 'u3' && P[3].scheme === 'socks5' && P[4].scheme === 'http' && P[4].user === 'u5' && P[5].bad && P[6].bad, 'đọc 5 kiểu proxy, báo dòng lỗi / cổng sai');
  E.stop(); while (E.state().run.on) await sleep(1000);
  const proxCalls = []; let order = [];
  H.dec = s => s.startsWith('ENC') ? 'abc123' : s.startsWith('PX:') ? s.slice(3) : '';
  H.proxy = p => { proxCalls.push(p && p.label); order.push('proxy:' + (p ? p.label : 'thật')); if (p && p.host === '9.9.9.9') return { ok: false, why: 'hết thời gian' }; return { ok: true, ip: p ? '103.0.0.' + p.host.split('.')[0] : '45.45.45.45' }; };
  const open0 = H.open; H.open = (i, c) => { order.push('open:' + c.user); open0(i, c); };
  E.resetToday(); E.setCfg({ ip: true, nhom: 3, phut: 1, lap: false, proxyEnc: 'PX:1.1.1.1:8080\n9.9.9.9:80\n3.3.3.3:80' });
  ok(E.state().cfg.nhom === 3, 'cho chọn nhóm 3 acc');
  E.start(); while (E.state().run.on) await sleep(1000);
  const opensAfter = k => { const i = order.indexOf(k); return i >= 0 ? order.slice(i + 1).find(x => x.startsWith('proxy:')) : null; };
  ok(order[0].startsWith('proxy:') && order[1].startsWith('open:'), 'đổi IP trước khi mở ô đầu tiên');
  const grp = order.filter(x => x.startsWith('open:') && !/tải lại/.test(x)).length;
  ok(proxCalls.filter(x => x && x !== '9.9.9.9:80').length === 4, `12 acc / 3 = 4 nhóm → 4 lần đổi IP thành công (${proxCalls.join(', ')})`);
  ok(proxCalls[0] === '1.1.1.1:8080' && proxCalls[1] === '9.9.9.9:80' && proxCalls[2] === '3.3.3.3:80', 'nhóm 2: proxy 2 lỗi → tự chuyển proxy 3');
  ok(proxCalls.filter(x => x === '9.9.9.9:80').length === 1, 'proxy lỗi không thử lại trong cùng lượt');
  ok(proxCalls[proxCalls.length - 1] === null, 'chạy xong → trả về IP thật');
  ok(E.state().logs.some(l => /nhóm 1: proxy 1 \(1\.1\.1\.1:8080\) → IP 103\.0\.0\.1/.test(l)), 'nhật ký ghi IP từng nhóm');
  // mọi proxy lỗi
  H.proxy = p => { proxCalls.push(p && p.label); return p ? { ok: false, why: 'chết' } : { ok: true, ip: '45.45.45.45' }; };
  E.resetToday(); E.setCfg({ ipHet: 'dung' }); H.opened.length = 0; E.start(); while (E.state().run.on) await sleep(1000);
  ok(H.opened.length === 0 && E.state().logs.some(l => /mọi proxy đều lỗi → dừng/.test(l)), 'mọi proxy lỗi + "dừng chạy" → không mở ô nào');
  E.resetToday(); E.setCfg({ ipHet: 'that' }); H.opened.length = 0; E.start(); while (E.state().run.on) await sleep(1000);
  ok(H.opened.length > 0 && E.state().logs.some(l => /chạy bằng IP thật/.test(l)), 'mọi proxy lỗi + "chạy bằng IP thật" → vẫn chạy');
  E.setCfg({ proxyEnc: '' }); E.start(); ok(!E.state().run.on && E.state().logs.some(l => /danh sách proxy trống/.test(l)), 'bật đổi IP mà danh sách trống → không chạy');
  console.log(`\n${pass}/${pass + fail} đạt`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
