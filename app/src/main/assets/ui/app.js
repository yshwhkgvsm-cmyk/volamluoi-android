// Võ Lâm Lười Android — bảng điều khiển. Nói chuyện với phần Android qua window.VLLHost (Java).
(function () {
  'use strict';
  const H = window.VLLHost || {};
  const call = (f, ...a) => { try { return typeof H[f] === 'function' ? H[f](...a) : null; } catch (e) { console.warn(f, e); return null; } };
  const host = {
    open: (i, c) => call('open', i, JSON.stringify(c)),
    reload: (i, c) => call('reload', i, JSON.stringify(c)),
    close: i => call('close', i),
    send: (i, ch, args) => call('toGame', i, ch, JSON.stringify(args || [])),
    dec: s => call('dec', s) || ''
  };
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => call('toast', m) == null && console.log(m);
  let dirty = false, wasOn = false;
  const eng = VLLEngine.createEngine({ host, store: localStorage, onChange: () => { dirty = true; }, onLog: () => { dirty = true; } });
  window.vllOnGame = (i, json) => { try { eng.onGame(i, typeof json === 'string' ? JSON.parse(json) : json); } catch (e) { console.warn(e); } };
  window.vllOnSlot = (i, ev) => eng.onSlot(i, ev);
  window.vllBack = () => { call('show', 'ui'); return true; };

  // ---- tab ----
  for (const b of $$('nav button')) b.onclick = () => { for (const x of $$('nav button')) x.classList.toggle('on', x === b); for (const s of $$('section')) s.classList.toggle('on', s.id === b.dataset.t); render(true); };
  if (call('multiProfile') === 'false') $('#warn').innerHTML = '<div class="banner">⚠ WebView của máy chưa hỗ trợ nhiều hồ sơ — không chạy được nhiều acc cùng lúc. Hãy cập nhật <b>Android System WebView</b> / Chrome trên CH Play.</div>';

  // ---- Chạy ----
  $('#go').onclick = () => { const S = eng.state(); if (S.run.on) { eng.stop(); call('keepAlive', false); } else if (eng.start()) { call('keepAlive', true); if (S.cfg.awake) call('keepScreen', true); } render(true); };
  $('#viewAll').onclick = () => call('show', 'grid');
  const fmt = ms => { ms = Math.max(0, ms); const m = Math.floor(ms / 60e3), s = Math.floor(ms % 60e3 / 1000); return `${m}:${String(s).padStart(2, '0')}`; };
  function renderRun(S) {
    $('#go').textContent = S.run.on ? (S.run.stopReq ? '… đang dừng' : '■ Dừng') : '▶ Chạy';
    $('#go').classList.toggle('p', !S.run.on);
    const today = S.today, done = S.accs.filter(a => S.cyc.done[a.id] === today).length, active = S.accs.filter(a => !a.off).length;
    $('#sNhom').textContent = S.run.on ? `${S.run.batch}/${S.run.batches}` : '–';
    $('#sCon').textContent = S.run.on ? fmt(S.run.deadline - Date.now()) : '–';
    $('#sXong').textContent = `${done}/${active}`;
    $('#sum').textContent = S.run.on ? `vòng ${S.run.round} · nhóm ${S.cfg.nhom} acc · ${S.cfg.phut} phút/nhóm` : `${active} acc · nhóm ${S.cfg.nhom} · ${S.cfg.phut} phút/nhóm`;
    const n = Math.max(4, S.cfg.nhom); let h = '';
    for (let i = 0; i < n; i++) { const s = S.slots[i];
      h += s ? `<div class="slot" data-i="${i}"><b>${E(s.user)}</b><span class="st ${s.st === 'lỗi' ? 'bad' : s.st === 'xong' ? 'ok' : ''}">${E(s.st)}</span>${s.name || s.lv ? `<div class="mu">${E(s.name || '')} ${s.lv ? 'cấp ' + E(s.lv) : ''}</div>` : ''}${s.msg ? `<div class="mu bad">${E(s.msg).slice(0, 80)}</div>` : ''}</div>`
        : `<div class="slot empty"><b>Ô ${i + 1}</b><span class="mu">trống</span></div>`; }
    $('#slots').innerHTML = h;
    for (const el of $$('.slot[data-i]')) el.onclick = () => call('show', 'slot:' + el.dataset.i);
  }
  // ---- Tài khoản ----
  $('#add').onclick = () => {
    const pw = $('#pw').value; if (pw.length < 6) return ($('#addMsg').textContent = 'mật khẩu ≥ 6 ký tự');
    try { const enc = call('enc', pw); if (!enc) throw new Error('không mã hóa được mật khẩu'); const n = eng.addBulk($('#pf').value, +$('#a1').value, +$('#a2').value, enc, $('#chuaDk').checked); $('#addMsg').textContent = `đã thêm ${n} acc`; $('#pw').value = ''; }
    catch (e) { $('#addMsg').textContent = e.message; }
    render(true);
  };
  $('#addList').onclick = () => { const n = eng.addList($('#list').value, p => call('enc', p), $('#chuaDk').checked); toast(`đã thêm ${n} acc`); $('#list').value = ''; render(true); };
  $('#del').onclick = () => { const ids = $$('[data-sel]:checked').map(x => x.dataset.sel); if (!ids.length) return toast('chưa chọn acc nào'); if (!confirm(`Xóa ${ids.length} acc?`)) return; try { eng.remove(ids); ids.forEach(id => call('dropProfile', id)); } catch (e) { toast(e.message); } render(true); };
  $('#reset').onclick = () => { if (confirm('Xóa dấu "xong hôm nay" của mọi acc để chạy lại?')) { eng.resetToday(); render(true); } };
  function renderAcc(S) {
    $('#nAcc').textContent = `(${S.accs.length})`;
    $('#accs').innerHTML = S.accs.map(a => { const d = S.cyc.done[a.id] === S.today, p = S.cyc.pending[a.id];
      return `<div class="acc"><input type="checkbox" data-sel="${E(a.id)}"><div><span class="u">${E(a.user)}</span>${a.reg !== 'ok' ? '<span class="tag warn">chưa ĐK</span>' : ''}${a.char === 'ok' ? '<span class="tag">có NV</span>' : ''}${a.off ? '<span class="tag">bỏ qua</span>' : ''}
        <div class="mu">${d ? '<span class="ok">✓ xong hôm nay</span>' : p ? `<span class="bad">${E(p).slice(0, 90)}</span>` : 'chưa chạy hôm nay'}</div></div>
        <button class="b" data-off="${E(a.id)}">${a.off ? 'Bật' : 'Bỏ qua'}</button></div>`; }).join('') || '<p class="mu">Chưa có tài khoản. Thêm nhanh ở trên.</p>';
    for (const b of $$('[data-off]')) b.onclick = () => { const a = S.accs.find(x => x.id === b.dataset.off); eng.setAcc(a.id, { off: !a.off }); render(true); };
  }
  // ---- Cài đặt ----
  const chips = (el, vals, cur, fn, lab = v => v) => { el.innerHTML = vals.map(v => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${lab(v)}</button>`).join(''); for (const b of el.querySelectorAll('button')) b.onclick = () => { fn(+b.dataset.v); render(true); }; };
  const bind = (sel, key, get = el => el.checked) => { $(sel).onchange = () => { eng.setCfg({ [key]: get($(sel)) }); render(true); }; };
  bind('#cLap', 'lap'); bind('#cDk', 'dangKy'); bind('#cTao', 'taoNv'); bind('#cKnb', 'knb'); bind('#cHb', 'hb'); bind('#cUt', 'uyThac');
  bind('#cPhut', 'phut', el => +el.value); bind('#cVao', 'vaoGame', el => +el.value);
  bind('#cHe', 'he', el => el.value); bind('#cSex', 'sex', el => el.value); bind('#cTen', 'tenKieu', el => el.value); bind('#cTenTien', 'tenTien', el => el.value.trim());
  $('#cAwake').onchange = e => { localStorage.setItem('vll.awake', e.target.checked ? '1' : ''); if (eng.state().run.on) call('keepScreen', e.target.checked); };
  function renderCfg(S) {
    const c = S.cfg;
    chips($('#cNhom'), [4, 5, 6, 7, 8], c.nhom, v => eng.setCfg({ nhom: v }));
    chips($('#cPhutQ'), [1, 2, 5, 10, 15, 30, 60, 90, 120, 180], c.phut, v => eng.setCfg({ phut: v }), v => v + "'");
    for (const [s, k] of [['#cLap', 'lap'], ['#cDk', 'dangKy'], ['#cTao', 'taoNv'], ['#cKnb', 'knb'], ['#cHb', 'hb'], ['#cUt', 'uyThac']]) $(s).checked = !!c[k];
    for (const [s, k] of [['#cPhut', 'phut'], ['#cVao', 'vaoGame'], ['#cHe', 'he'], ['#cSex', 'sex'], ['#cTen', 'tenKieu'], ['#cTenTien', 'tenTien']]) if (document.activeElement !== $(s)) $(s).value = c[k];
    $('#cTenTien').style.display = c.tenKieu === 'tien' ? '' : 'none';
    $('#cAwake').checked = !!localStorage.getItem('vll.awake');
  }
  // ---- Nhật ký ----
  $('#clr').onclick = () => { eng.clearLog(); render(true); };
  $('#soi').onclick = () => { const s = eng.state().soi; if (!s.length) return toast('chưa có bản Soi nào (chỉ có khi đăng ký / tạo nhân vật không thấy nút)'); call('share', JSON.stringify(s, null, 1), 'soi-vll-android.json'); };
  function renderLog(S) { $('#logs').textContent = S.logs.join('\n') || '(trống)'; }
  // ---- vẽ ----
  function render(force) {
    if (!force && !dirty && !eng.state().run.on) return; dirty = false;
    const S = eng.state(); S.cfg.awake = !!localStorage.getItem('vll.awake');
    const tab = ($('nav button.on') || {}).dataset.t;
    renderRun(S); if (tab === 'acc' || force) renderAcc(S); if (tab === 'cfg' || force) renderCfg(S); if (tab === 'log' || force) renderLog(S);
    if (wasOn && !S.run.on) { call('keepScreen', false); call('keepAlive', false); }   // chạy xong → thả màn hình + dịch vụ nền
    wasOn = S.run.on;
  }
  setInterval(() => render(false), 1000);
  render(true);
  window.__vllEngine = eng;
})();
