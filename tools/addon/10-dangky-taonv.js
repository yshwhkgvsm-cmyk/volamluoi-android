// [Android] ĐĂNG KÝ NHANH + TẠO NHÂN VẬT (hệ Hỏa, giới tính Nữ) + SOI GIAO DIỆN.
// Bật theo tài khoản: creds.android = { dangKy: bool, taoNv: bool, he: 'hoa', sex: 'nu', ten: 'tên nhân vật' }.
// Đăng ký: màn chào → nút "Đăng Ký" → điền tài khoản + mật khẩu (+ nhập lại) → bấm Đăng Ký → báo app ('vll:event' reg).
// Tạo nhân vật: thấy màn #cnew → chọn hệ Hỏa + Nữ → điền tên → bấm Tạo. Trùng tên thì thêm 2 chữ cái rồi thử lại (tối đa 4 lần).
// Chỉ bấm nút / ô có sẵn của game. Không thấy nút → gửi bản Soi giao diện về app để chỉnh.
const { ipcRenderer } = require('electron');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const vis = el => { if (!el || !el.isConnected) return false; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { if (e.hidden || (e.classList && e.classList.contains('hidden'))) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || (e === el && cs.visibility === 'hidden')) return false; } return true; };
const txt = el => String((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
const norm = s => String(s || '').normalize('NFC').toLowerCase().trim();
const until = async (fn, ms = 8000, st = 200) => { const t = Date.now() + ms; while (Date.now() < t) { try { const v = fn(); if (v) return v; } catch {} await sleep(st); } return null; };
const ev = (type, o) => ipcRenderer.send('vll:event', { type, at: Date.now(), ...o });
const log = m => ipcRenderer.send('lab:auto:log', '[Android] ' + m);
const toastTxt = () => { const t = $('#toast'); return t && vis(t) ? txt(t) : ''; };
function setVal(el, v) { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); for (const t of ['input', 'change', 'keyup']) el.dispatchEvent(new Event(t, { bubbles: true })); }
const clickables = root => $$('button, a, [role="button"], [data-a], [onclick], .btn, .bt, label, li, span, div', root).filter(vis);
// phần tử nhỏ nhất có chữ khớp (tránh bấm cả khung lớn chứa chữ đó)
function leafByText(root, re, maxLen = 24) {
  const c = clickables(root).filter(e => { const t = norm(txt(e)); return t && t.length <= maxLen && re.test(t); });
  return c.filter(e => !c.some(o => o !== e && e.contains(o)))[0] || null;
}
function byAttr(root, re) { return $$('*', root).filter(vis).find(e => [...e.attributes].some(a => /^(data-|value|title|alt|aria-label)/.test(a.name) && re.test(norm(a.value)))) || null; }
const looksOn = e => { for (let x = e, i = 0; x && i < 3; x = x.parentElement, i++) { if (/(^|\s)(on|active|sel|selected|chon|cur|checked)(\s|$)/i.test(String(x.className || '')) || x.getAttribute && x.getAttribute('aria-pressed') === 'true') return true; const inp = x.querySelector && x.querySelector('input[type=radio],input[type=checkbox]'); if (inp && inp.checked) return true; } return false; };
function pick(el) { if (!el) return false; const inp = el.matches('label') ? (el.control || el.querySelector('input')) : null; (inp || el).click(); return true; }

// ---------- SOI ----------
const desc = e => { const d = {}; for (const a of e.attributes) if (/^(id|class|data-|name|type|placeholder|maxlength|value|for|role)/.test(a.name)) d[a.name] = String(a.value).slice(0, 60); return { tag: e.tagName.toLowerCase(), ...d, t: txt(e).slice(0, 50), on: looksOn(e) || undefined }; };
function soi(why) {
  const out = { why, at: Date.now(), url: location.href, screen: screen(), toast: toastTxt(), items: [], html: {} };
  const seen = new Set();
  for (const e of $$('input, select, textarea, button, a, [role="button"], [data-a], [onclick], label').filter(vis)) { if (seen.has(e)) continue; seen.add(e); out.items.push(desc(e)); if (out.items.length >= 160) break; }
  for (const s of ['#cnew', '#csel', '#modal', '#ngStart', '.ngbox']) { const e = $(s); if (e && vis(e)) out.html[s] = e.outerHTML.replace(/\s+/g, ' ').slice(0, 7000); }
  if (!Object.keys(out.html).length) { const ov = $$('body > div').filter(vis).map(e => e.outerHTML.replace(/\s+/g, ' ').slice(0, 2500)); out.html.body = ov.slice(0, 4).join('\n'); }
  return out;
}
function screen() {
  if (vis($('#cnew'))) return 'tao-nhan-vat';
  if (vis($('#csel'))) return 'chon-nhan-vat';
  if (vis($('#ngU')) && vis($('#ngIn'))) return 'dang-nhap';
  if (vis($('#ngStart'))) return 'man-chao';
  const h = txt($('#heroName')); if ((h && h !== 'Võ Lâm Idle') || txt($('#stageLbl'))) return 'trong-game';
  return 'dang-tai';
}

// ---------- ĐĂNG KÝ ----------
const REG_RE = /^(đăng\s*ký|dang\s*ky|tạo\s*tài\s*khoản|đăng\s*ký\s*nhanh)$/i;
async function dangKy(user, pass) {
  await until(() => screen() !== 'dang-tai', 30000, 500);
  // đang ở form đăng nhập → đóng / quay lại màn chào nếu có nút Đăng Ký ở đó
  let btn = leafByText(document, REG_RE) || leafByText(document, /đăng\s*ký/i, 20);
  if (!btn && vis($('#ngU'))) { const back = leafByText(document, /^(quay lại|trở về|←|x|đóng)$/i, 10); if (back) { back.click(); await sleep(800); btn = leafByText(document, REG_RE) || leafByText(document, /đăng\s*ký/i, 20); } }
  if (!btn) return { ok: false, why: 'không thấy nút Đăng Ký ở màn chào', soi: soi('dang-ky: không thấy nút') };
  btn.click(); await sleep(900);
  // form đăng ký: ô chữ đầu = tài khoản, mọi ô mật khẩu = mật khẩu (có ô nhập lại)
  const form = await until(() => { const pw = $$('input[type=password]').filter(vis); if (!pw.length) return null; const TX = 'input:not([type]), input[type=text], input[type=email], input[type=tel]', okTx = e => vis(e) && !/chat/i.test(e.id + ' ' + e.className) && !e.closest('[id*="chat" i], [class*="chat" i]');
    let box = pw[0].parentElement; while (box && box !== document.body && !$$(TX, box).some(okTx)) box = box.parentElement;   // khung nhỏ nhất chứa cả ô tài khoản
    if (!box || box === document.body) return null; const tx = $$(TX, box).filter(okTx); return tx.length ? { box, tx, pw: $$('input[type=password]', box).filter(vis) } : null; }, 6000);
  if (!form) return { ok: false, why: 'bấm Đăng Ký nhưng không thấy ô tài khoản / mật khẩu', soi: soi('dang-ky: không thấy form') };
  if (form.tx[0] === $('#ngU') && !$$('input[type=password]', form.box).some(e => e !== $('#ngP'))) return { ok: false, why: 'chỉ thấy form đăng nhập, không thấy form đăng ký', soi: soi('dang-ky: nhầm form đăng nhập') };
  setVal(form.tx[0], user); await sleep(250);
  for (const p of form.pw) { setVal(p, pass); await sleep(200); }
  for (const c of $$('input[type=checkbox]', form.box).filter(vis)) if (!c.checked) c.click();   // ô đồng ý điều khoản (nếu có)
  const toast0 = toastTxt();
  const sub = leafByText(form.box, /^(đăng\s*ký|tạo\s*tài\s*khoản|xác\s*nhận|hoàn\s*tất|ok|đồng\s*ý)$/i, 20) || leafByText(form.box, /đăng\s*ký/i, 20);
  if (!sub) return { ok: false, why: 'điền xong nhưng không thấy nút gửi Đăng Ký', soi: soi('dang-ky: không thấy nút gửi') };
  sub.click();
  const res = await until(() => { const t = toastTxt(); if (t && t !== toast0) return t; if (!form.pw.some(vis)) return 'form-dong'; return null; }, 12000, 250);
  await sleep(600);
  const t = norm(res || toastTxt() || txt(form.box));
  if (/tồn tại|đã có|đã được|trùng|exists/.test(t)) return { ok: true, exists: true, msg: res || 'tài khoản đã có' };
  if (/thành công|đã tạo|hoàn tất|success/.test(t) || res === 'form-dong' || ['dang-nhap', 'chon-nhan-vat', 'tao-nhan-vat', 'trong-game'].includes(screen())) return { ok: true, msg: res === 'form-dong' ? 'form đăng ký đã đóng' : res };
  return { ok: false, why: 'game báo: ' + (res || '(không rõ)'), soi: soi('dang-ky: lỗi sau khi gửi') };
}

// ---------- TẠO NHÂN VẬT ----------
const HE = { hoa: /^(hệ\s*)?(hỏa|hoả)(\s*hệ)?$|^(hỏa|hoả)\b/, kim: /^(hệ\s*)?kim$/, moc: /^(hệ\s*)?mộc$/, thuy: /^(hệ\s*)?(thủy|thuỷ)$/, tho: /^(hệ\s*)?thổ$/ };
const HE_ATTR = { hoa: /^(hoa|hỏa|hoả|fire|huo|3)$/, kim: /^(kim|metal|0)$/, moc: /^(moc|mộc|wood|1)$/, thuy: /^(thuy|thủy|water|2)$/, tho: /^(tho|thổ|earth|4)$/ };
const SEX = { nu: /^(nữ|nu|nữ giới|female|♀)$/, nam: /^(nam|nam giới|male|♂)$/ };
async function taoNv(o) {
  const box = await until(() => vis($('#cnew')) && $('#cnew'), 15000); if (!box) return { ok: false, why: 'không thấy màn tạo nhân vật' };
  const he = o.he || 'hoa', sex = o.sex || 'nu';
  let eHe = leafByText(box, HE[he]) || byAttr(box, HE_ATTR[he]);
  let eSex = leafByText(box, SEX[sex], 10) || byAttr(box, /^(nu|nữ|female|f)$/);
  const miss = [];
  if (pick(eSex)) await sleep(500); else miss.push('Nữ');
  if (pick(eHe)) await sleep(500); else miss.push('hệ Hỏa');
  if (miss.length) return { ok: false, why: 'không thấy nút chọn ' + miss.join(' + '), soi: soi('tao-nv: không thấy ' + miss.join(', ')) };
  const chk = { he: looksOn(eHe), sex: looksOn(eSex) };
  let name = String(o.ten || '').trim();
  for (let tries = 0; tries < 4; tries++) {
    const inp = $$('input:not([type]), input[type=text]', box).filter(vis)[0];
    if (inp && name) { setVal(inp, name); await sleep(300); }
    else if (inp && !inp.value) return { ok: false, why: 'chưa có tên nhân vật', soi: soi('tao-nv: thiếu tên') };
    const go = leafByText(box, /^(tạo|tạo nhân vật|xác nhận|bắt đầu|vào game|hoàn tất|ok)$/i, 16) || leafByText(box, /tạo/i, 16);
    if (!go) return { ok: false, why: 'không thấy nút Tạo nhân vật', soi: soi('tao-nv: không thấy nút Tạo') };
    const t0 = toastTxt(); go.click();
    const r = await until(() => !vis(box) ? 'xong' : (toastTxt() && toastTxt() !== t0 ? toastTxt() : null), 10000, 250);
    if (r === 'xong') return { ok: true, ten: name, chk };
    const ab = $('#askBox'); if (ab) { const y = ab.querySelector('[data-a="1"]'); if (y) { y.click(); await sleep(1500); if (!vis(box)) return { ok: true, ten: name, chk }; } }
    if (r && /tên/.test(norm(r)) && /tồn tại|trùng|đã có|đã được dùng/.test(norm(r))) { name = (name || 'Hoa').slice(0, 10) + String.fromCharCode(97 + Math.random() * 26 | 0, 97 + Math.random() * 26 | 0); log(`tên trùng → thử "${name}"`); continue; }
    return { ok: false, why: 'game báo: ' + (r || '(không đổi màn)'), soi: soi('tao-nv: lỗi sau khi bấm Tạo') };
  }
  return { ok: false, why: 'trùng tên 4 lần' };
}

// ---------- điều phối theo tài khoản ----------
let A = {};
window.addEventListener('DOMContentLoaded', async () => {
  let creds = null; try { creds = JSON.parse(window.VLLAndroid.creds() || 'null'); } catch {}
  A = (creds && creds.android) || {};
  if (A.dangKy && creds) {
    log('đăng ký nhanh tài khoản ' + creds.user);
    const r = await dangKy(creds.user, creds.pass).catch(e => ({ ok: false, why: String(e && e.message) }));
    ev('reg', r); log(`đăng ký ${creds.user}: ${r.ok ? (r.exists ? 'tài khoản đã có' : 'xong') : r.why}`);
    return;   // app sẽ tải lại ô để đăng nhập
  }
  if (A.taoNv) {   // trông màn tạo nhân vật suốt phiên
    let busy = false, done = 0;
    setInterval(async () => {
      if (busy || done >= 2 || !vis($('#cnew'))) return; busy = true;
      try { const r = await taoNv(A); done++; ev('char', r); log(`tạo nhân vật: ${r.ok ? `xong "${r.ten}" (hệ Hỏa, Nữ)` : r.why}`); } catch (e) { ev('char', { ok: false, why: String(e && e.message) }); }
      busy = false;
    }, 2000);
  }
});
ipcRenderer.on('vll:cmd', async (_e, rid, cmd, arg) => {
  let r;
  try { r = cmd === 'soi' ? { ok: true, soi: soi('bấm Soi') } : cmd === 'screen' ? { ok: true, screen: screen() } : cmd === 'dangKy' ? await dangKy(arg.user, arg.pass) : cmd === 'taoNv' ? await taoNv(arg || A) : { ok: false, why: 'lệnh lạ ' + cmd }; }
  catch (e) { r = { ok: false, why: String(e && e.message) }; }
  ipcRenderer.send('vll:reply', rid, r);
});
setInterval(() => ipcRenderer.send('vll:screen', screen()), 5000);
