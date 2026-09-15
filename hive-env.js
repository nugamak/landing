/* ============================================================================
   OTCHive — HIVE ENVIRONMENT
   ----------------------------------------------------------------------------
   One 15-second video is the physical hive the whole page sits inside. Page
   scroll is its only clock: 0% of the document is 0s, 100% is 15s. It never
   autoplays, never loops, never restarts per section, and it holds still on a
   frame the moment scrolling stops.

   The video is encoded all-intra (every frame a keyframe) so any position is an
   instant seek — that is what makes reverse and fast scrolling exact rather
   than stuttery.

   When the video is genuinely playable it takes over as the environment and
   the existing cell canvas drops to response-only, so there is never a second
   honeycomb competing with the first. If it cannot play — unsupported, offline,
   Save-Data, reduced motion — the cell wall simply stays as it was and the page
   is unchanged.
   ========================================================================== */
(function (global, doc) {
  'use strict';

  var reduce = global.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = global.matchMedia('(max-width: 900px)');

  function saveData() {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|[^0-9])2g/.test(c.effectiveType || '')));
  }

  /* The environment is an enhancement. Anything that says "not now" wins. */
  if (reduce.matches || saveData()) return;

  var layer = doc.getElementById('hiveEnv');
  var vid = layer && layer.querySelector('video');
  if (!vid) return;

  var ready = false, failed = false;
  var target = 0, current = 0, raf = 0;
  var pending = null, seeking = false, seekAt = 0;

  function docProgress() {
    var max = doc.documentElement.scrollHeight - global.innerHeight;
    if (max <= 0) return 0;
    var y = global.scrollY || doc.documentElement.scrollTop || 0;
    return Math.min(1, Math.max(0, y / max));
  }

  /* Scrubbable means more than "loaded": without a seekable range covering the
     clip, currentTime silently clamps to 0 and the layer would sit frozen on
     frame one while hiding a perfectly good fallback. */
  function scrubbable() {
    return vid.duration > 0 && vid.seekable && vid.seekable.length &&
           vid.seekable.end(vid.seekable.length - 1) >= vid.duration * 0.9;
  }

  function seek(t) {
    if (!scrubbable()) return;
    t = Math.min(vid.duration - 0.02, Math.max(0, t));
    var now = (global.performance || Date).now();
    /* Time-boxed rather than a bare flag: a dropped 'seeked' event would
       otherwise latch the clip forever. */
    if (seeking && now - seekAt < 350) { pending = t; return; }
    if (Math.abs(vid.currentTime - t) < 0.02) return;
    seeking = true; seekAt = now;
    try { vid.currentTime = t; } catch (e) { seeking = false; }
  }

  vid.addEventListener('seeked', function () {
    seeking = false;
    if (pending != null) { var p = pending; pending = null; seek(p); }
  });

  vid.addEventListener('error', function () { failed = true; teardown(); });

  vid.addEventListener('loadeddata', function () {
    if (failed) return;
    vid.pause();
    activate();
  });

  function activate() {
    if (ready || !scrubbable()) return;
    ready = true;
    layer.dataset.state = 'live';
    if (global.HiveCells) global.HiveCells.setResponseMode(true);
    loop();
  }

  function teardown() {
    ready = false;
    layer.dataset.state = 'off';
    if (global.HiveCells) global.HiveCells.setResponseMode(false);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  /* Seeking straight to the raw scroll position on every frame reads as
     chatter on a trackpad. Easing the target instead keeps the camera
     continuous while still stopping dead when the user does. */
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!ready || doc.hidden) return;
    if (!vid.paused) vid.pause();
    target = docProgress() * vid.duration;
    current += (target - current) * 0.18;
    if (Math.abs(target - current) < 0.004) current = target;
    seek(current);
  }

  doc.addEventListener('visibilitychange', function () {
    if (!doc.hidden && ready && !raf) loop();
  });

  /* A phone is portrait, so object-fit:cover on the 1920x996 landscape cut
     shows only about a quarter of the frame width — a different picture from
     the one on a desktop, and a still one at that. The narrow cut is a
     portrait crop of the same footage at 3.6 MB, so the background is both
     consistent and scrubbable on a phone. */
  var applied = '';
  function pick() {
    var k = narrow.matches ? 'narrow' : 'wide';
    if (applied === k) return false;
    applied = k;
    vid.poster = vid.dataset[k + 'Poster'] || '';
    vid.src = vid.dataset[k];
    return true;
  }

  function start() {
    var changed = pick();
    if (changed) { ready = false; layer.dataset.state = 'off'; }
    if (vid.readyState >= 2 && !changed) { activate(); return; }
    vid.preload = 'auto';
    vid.load();
  }

  if (doc.readyState === 'complete') start();
  else global.addEventListener('load', start);

  /* Crossing the breakpoint swaps the cut rather than switching the layer off. */
  var rt;
  global.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (!failed) start(); }, 200);
  }, { passive: true });

  global.HiveEnv = {
    state: function () { return layer.dataset.state; },
    time: function () { return ready ? vid.currentTime : 0; },
    duration: function () { return vid.duration || 0; }
  };
})(window, document);
