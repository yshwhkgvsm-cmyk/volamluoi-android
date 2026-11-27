# Chạy vll-game.js (bản gói cho Android) trên trang game giả: đăng ký nhanh, đăng nhập, tạo nhân vật Hỏa/Nữ, vào game, soi.
import sys, json, pathlib
from playwright.sync_api import sync_playwright
T = pathlib.Path(__file__).parent; ROOT = T.parent.parent
BUNDLE = (ROOT / 'app/src/main/assets/game/vll-game.js').read_text(encoding='utf8')
ok = 0; bad = 0
def chk(c, m):
    global ok, bad
    print(('  ✓ ' if c else '  ✗ ') + m); ok += bool(c); bad += (not c)
def page(b, creds, pre=''):
    pg = b.new_page(); errs = []
    if pre: pg.add_init_script(pre)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("window.__CREDS = %s;" % json.dumps(creds))
    # giống addDocumentStartJavaScript: chạy trước script của trang, sau khi trang gắn cầu nối → gắn cầu nối giả ở đây
    pg.add_init_script("""window.__out = []; window.VLLAndroid = { send: j => window.__out.push(JSON.parse(j)), creds: () => JSON.stringify(window.__CREDS), sync: () => 'null' };""")
    pg.add_init_script(BUNDLE)
    pg.goto((T / 'fake-game.html').as_uri())
    return pg, errs
evs = lambda pg, t: [m[1] for m in pg.evaluate('window.__out') if m[0] == 'vll:event' and m[1]['type'] == t]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    # 1) acc mới: đăng ký nhanh
    pg, errs = page(b, {'user': 'con1', 'pass': 'abc123', 'cfg': {}, 'autoLogin': False, 'android': {'dangKy': True, 'taoNv': True, 'he': 'hoa', 'sex': 'nu', 'ten': 'con1'}})
    pg.wait_for_function("window.__out.some(m => m[0]==='vll:event' && m[1].type==='reg')", timeout=30000)
    r = evs(pg, 'reg')[0]; chk(r['ok'] and not r.get('exists') and pg.evaluate("!!SV.users.con1 && SV.users.con1.pass==='abc123'"), 'đăng ký nhanh con1: ' + str(r.get('msg')))
    chk(pg.evaluate("$('#ngU') == null || $('#modal').classList.contains('hidden')"), 'đăng ký xong không tự đăng nhập (chờ app tải lại ô)')
    chk(pg.evaluate("$('#chatIn').value") == '', 'không gõ nhầm vào ô chat')
    # 2) tải lại (giữ máy chủ giả trong cùng trang: gọi lại luồng bằng cách giả lập — trang mới sẽ mất SV, nên kiểm đăng nhập + tạo nv trên trang này)
    pg.evaluate("window.__CREDS = {user:'con1', pass:'abc123', cfg:{}, autoLogin:true, android:{dangKy:false, taoNv:true, he:'hoa', sex:'nu', ten:'con1'}}")
    r = pg.evaluate("new Promise(res => { const rid='t1'; const iv=setInterval(()=>{const x=window.__out.find(m=>m[0]==='vll:reply'&&m[1]===rid); if(x){clearInterval(iv);res(x[2]);}},100); window.__vllIpc('vll:cmd',[rid,'dangKy',{user:'con1',pass:'abc123'}]); })")
    chk(r['ok'] and r.get('exists'), 'đăng ký lại tài khoản đã có → nhận "đã có", coi như xong')
    chk(not errs, 'không lỗi JS ' + '; '.join(errs)[:300])
    pg.close()
    # 3) acc đã đăng ký, chưa có nhân vật → đăng nhập (phần LuoiSpeed) → tạo nhân vật Hỏa/Nữ (addon) → chọn nhân vật (LuoiSpeed) → vào game
    pg, errs = page(b, {'user': 'moi', 'pass': 'abc123', 'cfg': {}, 'autoLogin': True, 'android': {'dangKy': False, 'taoNv': True, 'he': 'hoa', 'sex': 'nu', 'ten': 'con1'}})
    pg.evaluate("SV.users.moi = {pass:'abc123', chars:[]}")
    try: pg.wait_for_function("window.__out.some(m => m[0]==='vll:event' && m[1].type==='char')", timeout=60000)
    except Exception as e: print('    (chờ tạo nhân vật quá lâu)', [m for m in pg.evaluate('window.__out') if m[0] in ('bot:log','lab:auto:log','bot:phase')][-12:])
    c = (evs(pg, 'char') or [{}])[0]
    ch = pg.evaluate("SV.users.moi.chars[0] || null")
    chk(c.get('ok') and ch and ch['he'] == 3 and ch['sex'] == 1, f"tạo nhân vật hệ Hỏa (3), Nữ (1): {ch}")
    chk(ch and ch['name'] != 'con1' and ch['name'].startswith('con1'), f"tên 'con1' đã có → tự thêm chữ: {ch and ch['name']}")
    try: pg.wait_for_function("document.querySelector('#heroName').textContent !== 'Võ Lâm Idle'", timeout=30000)
    except Exception: pass
    chk(pg.evaluate("$('#heroName').textContent") == (ch and ch['name']), 'phần LuoiSpeed tự chọn nhân vật → vào game')
    logs = [m for m in pg.evaluate('window.__out') if m[0] in ('bot:log',)]
    chk(any('đăng nhập OK' in ' '.join(map(str, m[1:])) for m in logs), 'đăng nhập tự động của LuoiSpeed chạy qua cầu nối Android')
    chk(any(m[0] == 'bot:phase' for m in pg.evaluate('window.__out')), 'ô game gửi trạng thái (bot:phase) về app')
    r = pg.evaluate("new Promise(res => { const iv=setInterval(()=>{const x=window.__out.find(m=>m[0]==='vll:reply'&&m[1]==='s1'); if(x){clearInterval(iv);res(x[2]);}},100); window.__vllIpc('vll:cmd',['s1','soi',{}]); })")
    chk(r['ok'] and r['soi']['screen'] == 'trong-game' and len(r['soi']['items']) > 0, 'Soi: ghi màn hiện tại + các nút')
    chk(not errs, 'không lỗi JS ' + '; '.join(errs)[:300])
    pg.close()
    # 4) không thấy nút → gửi soi
    pg, errs = page(b, {'user': 'x', 'pass': 'abc123', 'cfg': {}, 'autoLogin': False, 'android': {'dangKy': True}}, "document.addEventListener('readystatechange', () => { const e = document.querySelector('#bReg'); if (e) e.remove(); });")
    pg.wait_for_function("window.__out.some(m => m[0]==='vll:event' && m[1].type==='reg')", timeout=30000)
    r = evs(pg, 'reg')[0]; chk(not r['ok'] and r.get('soi') and r['soi']['html'], 'không thấy nút Đăng Ký → báo lỗi kèm bản Soi giao diện ' + str(r)[:300])
    b.close()
print(f'\n{ok}/{ok + bad} đạt'); sys.exit(1 if bad else 0)
