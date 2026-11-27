'use strict';
/**
 * V5.6: HTML-first game controller verified against the 21/10 03:55 HTML and app.js.
 * No access to game closure, no private variables, no game mechanics altered.
 * Esc is the documented system-menu shortcut (game Pm("Escape") -> Nl()).
 */
const sleep = ms => new Promise(done => setTimeout(done, ms));
function createGameCommands(doc, hooks = {}) {
  const $ = sel => doc.querySelector(sel);
  const all = sel => Array.from(doc.querySelectorAll(sel));
  function visible(el) {
    if (!el || el.hidden || el.closest?.('[hidden],.hidden')) return false;
    const style=doc.defaultView?.getComputedStyle?.(el);
    return !style || (style.display !== 'none' && style.visibility !== 'hidden');
  }
  const shown = selector => {const el=$(selector);return visible(el)?el:null};
  async function waitFor(get, timeout=6500, ms=130) {
    const end=Date.now()+timeout;
    do {const el=get();if(el)return el;await sleep(ms);}while(Date.now()<end);
    return null;
  }
  function press(el){
    if(!visible(el)||el.disabled||el.getAttribute?.('aria-disabled')==='true')return false;
    el.click();return true;
  }
  function isModal(){return visible($('#modal'));}
  // Chính HTML 03:55: game gắn onclick cho #mBody [data-play] sau khi tạo màn chọn nhân vật.
  // Chỉ bấm khi sự kiện thật đã được gắn, để không mất click lúc game chưa khởi tạo xong.
  function plays(){
    return all('#mBody [data-play]').filter(el =>
      visible(el) && !el.disabled && el.getAttribute?.('aria-disabled')!=='true' &&
      /^chơi$/iu.test(String(el.textContent||'').trim().replace(/\s+/g,' ')) &&
      /^\d+$/.test(String(el.dataset.play||'')));
  }
  function readyPlay(){return plays().find(el=>typeof el.onclick==='function')||null;}
  // Game 21/10 có HAI giao diện chọn nhân vật:
  //   * #csel #csGo (giao diện mới toàn màn hình, nằm ngoài #modal)
  //   * #mBody [data-play] (giao diện modal cũ)
  // Ưu tiên giao diện mới khi cả hai còn trong DOM.
  function chooseTarget(){
    if(shown('#csel')){
      const btn=shown('#csel #csGo');
      const selected=$('#csel .cs-slot.on') || $('#csel .cs-slot[data-i]');
      return {mode:'new',btn:btn && typeof btn.onclick==='function' && !btn.disabled ? btn : null,
        slot:String(selected?.dataset?.i ?? '?')};
    }
    const btn=readyPlay();
    if(btn)return {mode:'legacy',btn,slot:String(btn.dataset.play)};
    return null;
  }
  function state(){
    if(isModal()&&shown('#utBack'))return 'delegated';
    if(isModal()&&shown('#ngU')&&shown('#ngIn'))return 'login';
    if(shown('#ngStart')&&!shown('#ngU'))return 'title';   // [LITE v10.6] màn chào (bản 1031+): Bắt Đầu Trò Chơi / Đăng Ký / Quên Mật Mã
    // Không coi heroName/stageLbl là 'ingame' khi màn chọn nhân vật đang phủ lên.
    if(shown('#csel'))return chooseTarget()?.btn?'character-select':'character-select-pending';
    if(shown('#cnew'))return 'character-create';
    const ps=hooks.portState?.(); if(ps==='game')return 'ingame';   // [LITE v10] cổng trạng thái của game
    if(readyPlay())return 'character-select';
    if(isModal()&&plays().length)return 'character-select-pending';
    // Thanh tab Hệ thống tồn tại NGAY TRONG HTML ban đầu, kể cả chưa đăng nhập.
    // Không được dùng sự tồn tại của #tabs để kết luận đã vào nhân vật:
    // nếu không sẽ đánh dấu hadCharacter sớm rồi tắt auto-login nhầm.
    const hero=String($('#heroName')?.textContent||'').trim();
    const stage=String($('#stageLbl')?.textContent||'').trim();
    if((hero && hero!=='Võ Lâm Idle') || stage)return 'ingame';
    return 'loading';
  }
  let playBusy=false,lastPlayAt=0;
  function chooseCharacter(){
    if(playBusy || Date.now()-lastPlayAt<1700)return false;
    const target=chooseTarget();
    if(!target?.btn)return false;
    if(target.mode==='legacy' && !isModal())return false;
    // Chỉ dùng .click() trên nút HTML đã được game gắn onclick.
    // Với #csGo, onclick của game tự ghi slot vào local/sessionStorage rồi reload.
    playBusy=true;lastPlayAt=Date.now();
    const slot=target.slot;
    const ok=press(target.btn);
    if(!ok){playBusy=false;return false;}
    try{hooks.onCharacterSelected?.(slot);}catch{}
    setTimeout(()=>{playBusy=false;},1800);
    return true;
  }
  function keyboardEscape(){
    const win=doc.defaultView;
    if(!win?.KeyboardEvent)return false;
    // In app.js, window 'keydown' handler routes Escape to Pm -> Nl (System modal).
    const e=new win.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true});
    const accepted=win.dispatchEvent(e);
    win.dispatchEvent(new win.KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true}));
    return accepted;
  }
  async function openSystemMenu(action){
    const wanted=action==='delegate'?'#emUt':'#emOut';
    if(shown(wanted))return shown(wanted);
    if(state()!=='ingame')throw new Error('Chưa vào nhân vật hoặc game đang mở bảng khác.');
    // Priority: documented Escape key (directly opens system dialog in 03:55 game).
    // ESC can dismiss other dialogs; therefore check the actual HTML after each attempt.
    if(isModal() && shown('#mClose'))press(shown('#mClose'));
    keyboardEscape();
    let result=await waitFor(()=>shown(wanted),1400);
    if(result)return result;
    // Fallback: game desktop's Hệ thống tab, then its Menu Hệ thống button.
    const menuTab=shown('#tabs [data-t="more"]');
    if(menuTab){press(menuTab);const sys=await waitFor(()=>shown('#bEscM'),900);if(sys)press(sys);}
    result=await waitFor(()=>shown(wanted),1250);
    if(result)return result;
    // Fallback: mobile toolbar includes its own system settings screen.
    const u20=shown('#u20menu [data-u="more"]');
    if(u20){press(u20);const sys=await waitFor(()=>shown('#bEscM'),700);if(sys)press(sys);}
    result=await waitFor(()=>shown(wanted),1250);
    if(result)return result;
    // Current UI can expose #smOut/#smUt instead of desktop esc menu.
    const alternate=action==='delegate'?shown('#smUt')||shown('#bUyThac'):shown('#smOut')||shown('#bLogout');
    if(alternate)return alternate;
    throw new Error('Không tìm thấy lệnh '+(action==='delegate'?'Ủy thác':'Đăng xuất')+' trong HTML Hệ thống 03:55.');
  }
  let inFlight=false, abortFlag=false;
  async function exit(action, force){
    if(action!=='logout' && action!=='delegate')throw new Error('Lệnh game không hợp lệ.');
    // [LITE v10.4] đăng xuất bắt buộc (lịch: quá thời hạn ủy thác) → hủy lệnh ủy thác đang chờ rồi đăng xuất
    if(inFlight && action==='logout' && force){ abortFlag=true; await waitFor(()=>!inFlight||null,8000,200); if($('#modal') && visible($('#modal')) && shown('#mClose')) { press($('#mClose')); await sleep(400); } }
    if(inFlight)throw new Error('Game đang xử lý lệnh khác.');
    inFlight=true; abortFlag=false;
    try{
      if(state()!=='ingame')throw new Error('Phải vào nhân vật trước khi '+(action==='delegate'?'ủy thác':'đăng xuất')+'.');
      let entry=await openSystemMenu(action);
      if(!press(entry))throw new Error('Không bấm được lệnh trong HTML.');
      const confirmId=action==='delegate'?'#utY':'#loY';
      let confirm=await waitFor(()=>shown(confirmId),7000);
      if(!confirm)throw new Error('Game chưa hiển thị nút xác nhận '+(action==='delegate'?'Ủy thác':'Đăng xuất')+'. Có thể game đang khóa tính năng trong phó bản hoặc khi leo tháp.');
      if(action==='logout')hooks.onLogoutRequested?.();
      if(!press(confirm))throw new Error('Không nhấn được nút xác nhận.');
      if(action==='delegate'){
        // [LITE v10] game lưu lên máy chủ trước khi vào Đang Ủy Thác: còn "Đang lưu lên máy chủ…" thì chờ tiếp (tối đa 5 phút),
        // game báo "Chưa lưu được" thì dừng ngay — không bấm lặp.
        const t0=Date.now(); let proof=null;
        while(Date.now()-t0<300000){
          proof=await waitFor(()=>abortFlag||(state()==='delegated'&&shown('#utBack')),15000,300); if(abortFlag)throw new Error('Đã hủy ủy thác để đăng xuất.'); if(proof)break;
          const msg=String($('#loMsg')?.textContent||'');
          if(/Chưa lưu được/i.test(msg))throw new Error('Game chưa lưu được lên máy chủ ('+msg.slice(0,80)+'); giữ nguyên phiên.');
          if(!/Đang lưu/i.test(msg) && Date.now()-t0>75000)break;
        }
        if(!proof)throw new Error('Đã gửi lệnh nhưng game không xác nhận màn hình Đang Ủy Thác; giữ nguyên phiên để tránh mất ủy thác.');
        hooks.onDelegated?.();
        return 'Game đã hiện trạng thái Đang Ủy Thác.';
      }
      // [LITE v10.4] game không lưu được lên máy chủ → hiện "Vẫn đăng xuất" (tiến trình còn trên máy, tự tải lên lần đăng nhập sau) → bấm khi lịch yêu cầu
      const t1=Date.now(); let proof=null, forced=false;
      while(Date.now()-t1<120000){
        proof=await waitFor(()=>{const st=state();return (st==='login'&&shown('#ngIn'))||(st==='title'&&shown('#ngStart'));},5000,260); if(proof)break;
        const y=shown('#loY'); if(force && !forced && y && !y.disabled && /Vẫn đăng xuất/i.test(y.textContent||'')){ forced=true; press(y); }
      }
      if(!proof)throw new Error('Đã gửi Đăng xuất nhưng chưa thấy màn đăng nhập/màn chào mới; không tự đăng nhập lại.');
      return 'Game đã trở về màn hình đăng nhập.';
    }finally{inFlight=false;}
  }
  return {state,chooseCharacter,openSystemMenu,exit};
}
module.exports={createGameCommands};
