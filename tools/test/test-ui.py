# Kiểm bảng điều khiển (assets/ui) trên khung điện thoại, với VLLHost giả mô phỏng ô game.
import sys, pathlib, http.server, threading, functools
from playwright.sync_api import sync_playwright
T = pathlib.Path(__file__).parent; UI = T.parent.parent / 'app/src/main/assets/ui'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(UI)))
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
FAKE = r"""
window.__calls = []; window.__live = {};
const rep = (i, m) => setTimeout(() => window.vllOnGame && vllOnGame(i, JSON.stringify(m)), 30);
const boot = (i, c) => { __live[i] = c; if (c.android.dangKy) return rep(i, ['vll:event', { type: 'reg', ok: true }]); rep(i, ['bot:phase', 'ingame']); rep(i, ['bot:status', { name: 'NV ' + c.user, lv: '12' }]); };
window.VLLHost = {
  open: (i, c) => { __calls.push(['open', i, JSON.parse(c)]); boot(i, JSON.parse(c)); }, reload: (i, c) => { __calls.push(['reload', i]); boot(i, JSON.parse(c)); },
  close: i => { __calls.push(['close', i]); delete __live[i]; },
  toGame: (i, ch, a) => { const args = JSON.parse(a); __calls.push(['toGame', i, ch]);
    if (ch === 'lab:sched:cmd') rep(i, ['lab:sched:reply', args[0], { ok: true, got: ['điểm danh'], knbDone: true }]);
    if (ch === 'ui:cmd' && args[0] === 'delegate') rep(i, ['game:delegated']); },
  show: m => __calls.push(['show', m]), enc: s => 'E:' + s, dec: s => s.slice(2), multiProfile: () => 'true',
  toast: m => __calls.push(['toast', m]), keepAlive: b => __calls.push(['keepAlive', b]), keepScreen: b => __calls.push(['keepScreen', b]), share: (t, n) => __calls.push(['share', n]), dropProfile: u => __calls.push(['drop', u])
};"""
ok = 0; bad = 0
def chk(c, m):
    global ok, bad
    print(('  ✓ ' if c else '  ✗ ') + m); ok += bool(c); bad += (not c)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 400, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(FAKE); pg.goto(URL); pg.wait_for_timeout(300)
    pg.screenshot(path=str(T / 'shot-run-empty.png'))
    pg.click('nav [data-t=acc]')
    pg.fill('#pf', 'con'); pg.fill('#a1', '1'); pg.fill('#a2', '6'); pg.fill('#pw', 'abc'); pg.click('#add')
    chk('≥ 6' in pg.inner_text('#addMsg'), 'mật khẩu ngắn → nhắc')
    pg.fill('#pw', 'abc123'); pg.click('#add'); pg.wait_for_timeout(200)
    chk('đã thêm 6' in pg.inner_text('#addMsg') and pg.locator('.acc').count() == 6, 'thêm nhanh con1…con6')
    chk(pg.locator('.tag.warn').count() == 6, '6 acc gắn nhãn "chưa ĐK" (sẽ đăng ký nhanh)')
    chk(pg.evaluate("JSON.parse(localStorage.getItem('vll.accs'))[0].pass") == 'E:abc123', 'mật khẩu lưu dạng đã mã hóa (qua Keystore)')
    pg.screenshot(path=str(T / 'shot-acc.png'), full_page=True)
    pg.click('nav [data-t=cfg]')
    chk(pg.locator('#cNhom button').count() == 5 and pg.locator('#cNhom button.on').inner_text() == '4', 'chọn nhóm 4–8 acc (đang 4)')
    pg.click('#cNhom button[data-v="6"]'); pg.wait_for_timeout(100); chk(pg.evaluate("JSON.parse(localStorage.getItem('vll.cfg')).nhom") == 6, 'đổi sang nhóm 6')
    pg.click('#cPhutQ button[data-v="1"]'); pg.wait_for_timeout(100); chk(pg.input_value('#cPhut') == '1', 'chọn nhanh 1 phút/nhóm')
    pg.fill('#cPhut', '180'); pg.press('#cPhut', 'Tab'); chk(pg.evaluate("JSON.parse(localStorage.getItem('vll.cfg')).phut") == 180, 'gõ 180 phút')
    pg.fill('#cPhut', '1'); pg.press('#cPhut', 'Tab')
    chk(pg.input_value('#cHe') == 'hoa' and pg.input_value('#cSex') == 'nu', 'mặc định tạo nhân vật hệ Hỏa, Nữ')
    pg.screenshot(path=str(T / 'shot-cfg.png'), full_page=True)
    pg.click('nav [data-t=run]'); pg.click('#go'); pg.wait_for_timeout(800)
    calls = pg.evaluate('__calls')
    chk(['keepAlive', True] in calls, 'bấm Chạy → bật dịch vụ nền')
    opens = [c for c in calls if c[0] == 'open']
    chk(len(opens) == 6 and all(c[2]['android']['dangKy'] for c in opens), 'mở 6 ô cùng lúc, đăng ký nhanh trước')
    pg.wait_for_timeout(2500)
    chk(pg.locator('.slot[data-i]').count() == 6 and 'đang chơi' in pg.inner_text('#slots'), 'các ô hiện "đang chơi" sau khi vào game + nhận quà')
    pg.screenshot(path=str(T / 'shot-run.png'), full_page=True)
    pg.click('.slot[data-i="2"]'); chk(['show', 'slot:2'] in pg.evaluate('__calls'), 'chạm ô 3 → xem game của ô đó')
    pg.wait_for_timeout(62000)
    calls = pg.evaluate('__calls')
    chk(len([c for c in calls if c[0] == 'toGame' and c[2] == 'ui:cmd']) >= 6, 'hết 1 phút → ủy thác cả 6 acc')
    pg.wait_for_timeout(2500)
    chk(['keepAlive', False] in pg.evaluate('__calls') and 'Chạy' in pg.inner_text('#go'), 'xong hết → tắt dịch vụ nền, nút về "▶ Chạy"')
    pg.click('nav [data-t=acc]'); n = pg.locator('.acc .ok').count(); chk(n == 6, f'danh sách: 6 acc "xong hôm nay" ({n}) ' + pg.inner_text('#accs')[:200].replace(chr(10), ' | '))
    pg.click('nav [data-t=log]'); chk('đã ủy thác' in pg.inner_text('#logs'), 'nhật ký ghi ủy thác')
    pg.screenshot(path=str(T / 'shot-log.png'), full_page=True)
    chk(not errs, 'không lỗi JS ' + '; '.join(errs)[:200])
    b.close()
srv.shutdown()
print(f'\n{ok}/{ok + bad} đạt'); sys.exit(1 if bad else 0)
