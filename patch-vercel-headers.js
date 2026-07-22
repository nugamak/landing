#!/usr/bin/env node
/**
 * patch-vercel-headers.js — vercel.json (landing и/или otchive-app)
 * VERCEL-HEADERS: в конфигах Vercel не было ни одного security-заголовка.
 * Добавляет на все пути:
 *   Strict-Transport-Security  — только HTTPS, 2 года, с preload
 *   X-Content-Type-Options     — запрет MIME-sniffing
 *   Referrer-Policy            — не утекать URL на сторонние сайты
 *   Permissions-Policy         — отключить камеру/микрофон/геолокацию
 * Content-Security-Policy НЕ добавляется намеренно: приложение — один HTML с
 * инлайновыми скриптами, строгий CSP их заблокирует. CSP — после выноса скриптов.
 * X-Frame-Options НЕ добавляется: Telegram Mini App работает во фрейме.
 * Существующие правила headers сохраняются. Идемпотентен. UTF-8.
 * Запуск: node patch-vercel-headers.js path/to/vercel.json
 */
'use strict';
const fs = require('fs'); const path = require('path');
const file = path.resolve(process.cwd(), process.argv[2] || 'vercel.json');
if (!fs.existsSync(file)) { console.error('✖ Файл не найден: ' + file); process.exit(1); }
let raw = fs.readFileSync(file, 'utf8');
let cfg;
try { cfg = JSON.parse(raw); } catch (e) { console.error('✖ Не валидный JSON: ' + e.message); process.exit(1); }

const SEC = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), payment=()' }
];

cfg.headers = Array.isArray(cfg.headers) ? cfg.headers : [];
const existing = cfg.headers.find(h => h && h.source === '/(.*)');
if (existing && (existing.headers || []).some(h => h.key === 'Strict-Transport-Security')) {
  console.log('• ' + path.basename(path.dirname(file)) + '/vercel.json: уже применён.');
  process.exit(0);
}
if (existing) {
  const have = new Set((existing.headers || []).map(h => h.key));
  existing.headers = (existing.headers || []).concat(SEC.filter(h => !have.has(h.key)));
} else {
  cfg.headers.unshift({ source: '/(.*)', headers: SEC });
}

// self-check
const all = JSON.stringify(cfg);
for (const h of SEC) { if (all.indexOf(h.key) === -1) { console.error('✖ Self-check: нет ' + h.key); process.exit(1); } }
if (all.indexOf('Content-Security-Policy') !== -1) { console.error('✖ Self-check: CSP добавлен по ошибке.'); process.exit(1); }

const out = JSON.stringify(cfg, null, 2) + '\n';
const tmp = file + '.tmp-' + process.pid; fs.writeFileSync(tmp, out, 'utf8'); fs.renameSync(tmp, file);
console.log('✔ ' + path.basename(path.dirname(file)) + '/vercel.json: +' + SEC.length + ' security-заголовков (HSTS, nosniff, Referrer-Policy, Permissions-Policy).');
