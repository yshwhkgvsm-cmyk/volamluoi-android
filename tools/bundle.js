// Gói phần chạy trong game của Võ Lâm Lười (LuoiSpeed / V11.20) thành 1 tệp cho WebView Android.
// - Thay require('electron') bằng cầu nối Android (window.VLLAndroid, do Java gắn vào từng ô).
// - require('./tasks'), './game-progress', './game-commands', './maps.json' gói kèm (CommonJS tối giản).
// - Thêm các phần riêng Android ở tools/addon/*.js (đăng ký nhanh, tạo nhân vật, soi).
// Chạy: node tools/bundle.js  → app/src/main/assets/game/vll-game.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), CORE = path.join(ROOT, 'core'), ADDON = path.join(__dirname, 'addon');
const OUT = path.join(ROOT, 'app/src/main/assets/game/vll-game.js');
const mods = { './tasks': 'tasks.js', './game-progress': 'game-progress.js', './game-commands': 'game-commands.js', './maps.json': 'maps.json', './game-preload': 'game-preload.js' };
const SHIM = fs.readFileSync(path.join(__dirname, 'electron-shim.js'), 'utf8');
let out = `/* Võ Lâm Lười Android — phần chạy trong game. Gói tự động từ LuoiSpeed V1.0 (V11.20.1) + phần Android. ${new Date().toISOString().slice(0, 10)} */
(function () {
'use strict';
if (window.top !== window || window.__vllGame) return; window.__vllGame = 1;
if (!window.VLLAndroid) { console.warn('[VLL] thiếu cầu nối Android'); return; }
const __defs = {}, __cache = {};
function __req(name) {
  if (name === 'electron') return __electron;
  const k = name.replace(/\\.js$/, '');
  if (!(k in __defs)) throw new Error('[VLL] thiếu mô-đun ' + name);
  if (__cache[k]) return __cache[k].exports;
  const module = { exports: {} }; __cache[k] = module; __defs[k](module, module.exports, __req); return module.exports;
}
${SHIM}
`;
for (const [k, f] of Object.entries(mods)) {
  const src = fs.readFileSync(path.join(CORE, f), 'utf8');
  if (f.endsWith('.json')) { JSON.parse(src); out += `__defs[${JSON.stringify(k)}] = function (module) { module.exports = ${src.trim()}; };\n`; continue; }
  out += `__defs[${JSON.stringify(k)}] = function (module, exports, require) {\n${src}\n};\n`;
}
const addons = fs.readdirSync(ADDON).filter(f => f.endsWith('.js')).sort();
out += `try { __req('./game-preload'); } catch (e) { __vllSend('lab:auto:log', '[Android] lỗi phần chạy trong game: ' + (e && e.message)); console.error(e); }\n`;
for (const f of addons) out += `// ---- addon ${f} ----\ntry { (function (require) {\n${fs.readFileSync(path.join(ADDON, f), 'utf8')}\n})(__req); } catch (e) { __vllSend('lab:auto:log', '[Android] lỗi ${f}: ' + (e && e.message)); }\n`;
out += '})();\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
new Function(out);   // kiểm cú pháp
console.log('đã gói', Object.values(mods).join(', '), '+ addon', addons.join(', '), '→', path.relative(ROOT, OUT), (out.length / 1024).toFixed(0) + ' KB');
