// Đọc trạng thái game theo cùng slot với extension; không viết vào file lưu game.
'use strict';
const dungeons = [
{id:'dvc',lv:20}, {id:'tbk',lv:50}, {id:'lal',lv:80}, {id:'pdq',lv:110}, {id:'kct',lv:140}, {id:'mcb',lv:170}, {id:'hsl',lv:190}
];
const valid = n => Number.isFinite(Number(n)) ? Number(n) : 0;
function activeSlot(store = localStorage, session = sessionStorage) {
  const file = n => n > 0 ? 'jxidle_' + (n + 1) : 'jxidle';
  const has = n => !!store.getItem(file(n));
  const ss = session.getItem('jxidle_in');
  if (ss !== null && Number.isInteger(+ss) && +ss >= 0 && +ss < 3 && has(+ss)) return file(+ss);
  const ls = store.getItem('jxidle_slot');
  if (ls !== null && Number.isInteger(+ls) && +ls >= 0 && +ls < 3) return file(+ls);
  for(let n=0;n<3;n++) if(has(n)) return file(n);
  return 'jxidle';
}
function readGame(store = localStorage, session = sessionStorage, now = new Date()) {
  try {
    const raw=store.getItem(activeSlot(store, session)); if(!raw)return null;
    const parsed=JSON.parse(raw); const D=JSON.parse(parsed.d);
    if (!D || !D.fac) return null;
    const today = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    const monday = new Date(now); monday.setHours(0,0,0,0); monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
    const week = `${monday.getFullYear()}-${monday.getMonth()+1}-${monday.getDate()}`;
    const dg = D.dg || {}; const dayFresh=dg.day===today, weekFresh=dg.week===week;
    const info = { mode: D.mode || 'farm', mapIndex: valid(D.stage), gb: D.gb ? { key:String(D.gb.key||''), done:D.gb.done===true, end:valid(D.gb.end) } : null,
      towerBest:valid(D.rw?.stat?.towerBest), dgDone:false, wbDone:false, dgKnown:true, wbKnown:true, dgRemaining:null, wbRemaining:null, wbClaimed:false, wbRank:'' };
    // Phó bản hiện có trong bản game. Nếu thay phiên bản, dùng danh sách đi cùng file maps.
    const eligible=dungeons.filter(x => valid(D.lvl)>=x.lv || valid(D.rw?.stat?.reborn)>0);
    const remain=eligible.map(x => 2 - (dayFresh ? valid(dg.runs?.[x.id]) : 0));
    info.dgRemaining=remain.reduce((a,b)=>a+Math.max(0,b),0);
    info.dgDone=eligible.length>0 && info.dgRemaining===0;
    info.wbRemaining=Math.max(0,3-(weekFresh?valid(dg.wbTries):0));
    info.wbClaimed=weekFresh && dg.wbClaimed===true;
    info.wbRank=weekFresh ? String(dg.wbRank||'') : '';
    info.wbDone=weekFresh && dg.wbClaimed===true && (valid(dg.wbTries)>=3 || dg.wbRank==='S');
    return info;
  } catch { return null; }
}
module.exports = { activeSlot, readGame, dungeons };
