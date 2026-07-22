// patch-landing-hygiene.js — создать .gitattributes (eol=lf) + нормализовать terms/privacy в LF
// Запуск: node patch-landing-hygiene.js   (из корня landing)
const ALLOW_CR=true;
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
    const cf=cnt(before,r.find), cr=cnt(before,r.repl);
    if (cf===r.expect && cr===0) fresh++;
    else if (cf===0 && cr===r.expect) done++;
    else fail(`якорь "${r.name}": find=${cf} repl=${cr}, ожидал ${r.expect}/0 или 0/${r.expect}`);
  }
  if (done===rules.length){ console.log('УЖЕ ПРИМЕНЁН: '+file+' ('+done+'/'+rules.length+')'); return {applied:false, text:before}; }
  if (fresh!==rules.length) fail('смешанное состояние: applied='+done+', fresh='+fresh);
  let out=before, delta=0;
  for (const r of rules){ out=out.split(r.find).join(r.repl); delta+=(r.repl.length-r.find.length)*r.expect; }
  for (const r of rules){ if(cnt(out,r.find)!==0||cnt(out,r.repl)!==r.expect) fail('self-check замены: '+r.name); }
  if (out.length!==before.length+delta) fail('self-check длины: '+out.length+' != '+(before.length+delta));
  guards.forEach((g,i)=>{ if(cnt(out,g)!==gpre[i]) fail('задет чужой маркер: '+g); });
  if (out.indexOf('\r')!==-1 && !ALLOW_CR) fail('появился CR');
  fs.writeFileSync(file, Buffer.from(out,'utf8'));
  console.log('ПРИМЕНЁН: '+file+' ('+rules.length+' замен), Δ='+delta+' байт');
  return {applied:true, text:out};
}

function normalizeLF(file){
  let b=fs.readFileSync(file); let changed=false, notes=[];
  if(b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF){ b=b.slice(3); changed=true; notes.push('BOM снят'); }
  let t=b.toString('utf8');
  if(t.indexOf('\r')!==-1){ t=t.replace(/\r\n/g,'\n').replace(/\r/g,'\n'); changed=true; notes.push('CRLF→LF'); }
  if(changed){ fs.writeFileSync(file, Buffer.from(t,'utf8')); console.log('НОРМАЛИЗОВАН: '+file+' ('+notes.join(', ')+')'); }
  else console.log('УЖЕ В НОРМЕ: '+file);
  const chk=fs.readFileSync(file); if(chk[0]===0xEF&&chk[1]===0xBB&&chk[2]===0xBF) fail(file+': BOM остался'); if(chk.toString('utf8').indexOf('\r')!==-1) fail(file+': CR остался');
  return t;
}
if(!fs.existsSync('.gitattributes')){ fs.writeFileSync('.gitattributes', Buffer.from("index.html text eol=lf\nterms.html text eol=lf\nprivacy.html text eol=lf\nvercel.json text eol=lf\n",'utf8')); console.log('СОЗДАН .gitattributes'); } else console.log('УЖЕ ЕСТЬ: .gitattributes');
['terms.html','privacy.html','index.html'].forEach(normalizeLF);
console.log('OK.');
