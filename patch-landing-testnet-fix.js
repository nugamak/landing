// patch-landing-testnet-fix.js — TESTNET-COPY-FIX: убрать устаревший «ready for testnet / at launch»,
// заменить на актуальный статус «Live on TON mainnet — Open Beta» (EN+RU, HTML + оба словаря)
// Запуск: node patch-landing-testnet-fix.js   (из корня landing)
const ALLOW_CR=false;
const fs = require('fs');
function fail(msg){ console.error('FAIL: ' + msg + ' — файл НЕ изменён.'); process.exit(1); }
function cnt(hay, sub){ let c=0,i=0; while((i=hay.indexOf(sub,i))!==-1){c++;i+=sub.length;} return c; }
function readUtf8(p){ const b=fs.readFileSync(p); if(b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF) fail(p+': найден BOM — конвенция запрещает'); return b.toString('utf8'); }
function applyRules(file, rules, guards){
  const before = readUtf8(file);
  if (before.indexOf('\r')!==-1 && !ALLOW_CR) fail(file+': найден CR до патча');
  const gpre = guards.map(g=>cnt(before,g));
  let fresh=0, done=0;
  for (const r of rules){
    const pre=r.pre||0; const cf=cnt(before,r.find), cr=cnt(before,r.repl);
    if (cf===r.expect && cr===pre) fresh++;
    else if (cf===0 && cr===pre+r.expect) done++;
    else fail(`якорь "${r.name}": find=${cf} repl=${cr}, ожидал ${r.expect}/${pre} или 0/${pre+r.expect}`);
  }
  if (done===rules.length){ console.log('УЖЕ ПРИМЕНЁН: '+file+' ('+done+'/'+rules.length+')'); return {applied:false, text:before}; }
  if (fresh!==rules.length) fail('смешанное состояние: applied='+done+', fresh='+fresh);
  let out=before, delta=0;
  for (const r of rules){ out=out.split(r.find).join(r.repl); delta+=(r.repl.length-r.find.length)*r.expect; }
  for (const r of rules){ if(cnt(out,r.find)!==0||cnt(out,r.repl)!==(r.pre||0)+r.expect) fail('self-check замены: '+r.name); }
  if (out.length!==before.length+delta) fail('self-check длины: '+out.length+' != '+(before.length+delta));
  guards.forEach((g,i)=>{ if(cnt(out,g)!==gpre[i]) fail('задет чужой маркер: '+g); });
  if (out.indexOf('\r')!==-1 && !ALLOW_CR) fail('появился CR');
  fs.writeFileSync(file, Buffer.from(out,'utf8'));
  console.log('ПРИМЕНЁН: '+file+' ('+rules.length+' замен), Δ='+delta+' байт');
  return {applied:true, text:out};
}
const RULES=[{"name": "html-ev3t", "find": ">Early users ready for testnet</div>", "repl": ">Live on TON mainnet — Open Beta</div>", "expect": 1, "pre": 0}, {"name": "html-ev3d", "find": ">Pilot participants confirmed for onboarding at launch</div>", "repl": ">Mini App shipped, escrow contract deployed, onboarding open</div>", "expect": 1, "pre": 0}, {"name": "en-ev3t", "find": "ev3t:\"Early users ready for testnet\"", "repl": "ev3t:\"Live on TON mainnet — Open Beta\"", "expect": 1, "pre": 0}, {"name": "en-ev3d", "find": "ev3d:\"Pilot participants confirmed for onboarding at launch\"", "repl": "ev3d:\"Mini App shipped, escrow contract deployed, onboarding open\"", "expect": 1, "pre": 0}, {"name": "ru-ev3t", "find": "ev3t:\"Ранние пользователи готовы к тестнету\"", "repl": "ev3t:\"Работает в мейннете TON — Открытая бета\"", "expect": 1, "pre": 0}, {"name": "ru-ev3d", "find": "ev3d:\"Пилотные участники подтверждены для онбординга при запуске\"", "repl": "ev3d:\"Mini App запущен, контракт эскроу задеплоен, онбординг открыт\"", "expect": 1, "pre": 0}];
applyRules('index.html', RULES, []);
const post=fs.readFileSync('index.html','utf8');
if(post.indexOf('ready for testnet')!==-1||post.indexOf('готовы к тестнету')!==-1) fail('остался testnet-фрейминг');
console.log('OK: TESTNET-COPY-FIX self-check пройден.');
