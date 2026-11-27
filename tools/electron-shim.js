// ---- thay cho require('electron') trong WebView Android ----
// Ô game → app: VLLAndroid.send(JSON [kênh, ...tham số]); app → ô game: window.__vllIpc(kênh, [tham số]).
const __listeners = {};
function __vllSend(ch, ...args) { try { window.VLLAndroid.send(JSON.stringify([ch, ...args])); } catch (e) { console.warn('[VLL] gửi lỗi', ch, e); } }
window.__vllIpc = function (ch, args) {
  const ls = __listeners[ch]; if (!ls) return 0;
  for (const f of ls.slice()) { try { f({ sender: null }, ...(Array.isArray(args) ? args : [])); } catch (e) { console.error('[VLL] lỗi xử lý', ch, e); } }
  return ls.length;
};
const __electron = {
  ipcRenderer: {
    on(ch, f) { (__listeners[ch] = __listeners[ch] || []).push(f); return this; },
    once(ch, f) { const g = (...a) => { this.removeListener(ch, g); f(...a); }; return this.on(ch, g); },
    removeListener(ch, f) { const ls = __listeners[ch]; if (ls) { const i = ls.indexOf(f); if (i >= 0) ls.splice(i, 1); } return this; },
    send(ch, ...args) { __vllSend(ch, ...args); },
    sendSync(ch) { if (ch === 'lab:mod:preloads') return []; try { return JSON.parse(window.VLLAndroid.sync(ch) || 'null'); } catch { return null; } },
    invoke(ch) {
      if (ch === 'bot:creds') { try { return Promise.resolve(JSON.parse(window.VLLAndroid.creds() || 'null')); } catch { return Promise.resolve(null); } }
      return Promise.resolve(null);
    }
  },
  webFrame: { getZoomFactor: () => 1 }
};
