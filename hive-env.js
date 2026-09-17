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
    loop();
  }

  function teardown() {
    ready = false;
    layer.dataset.state = 'off';
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  /* Seeking straight to the raw scroll position on every frame reads as
     chatter on a trackpad. Easing the target instead keeps the camera
     continuous while still stopping dead when the user does. */
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!ready || doc.hidden) return;
    if (!vid.paused) vid.pause();
    var prog = docProgress();
    target = prog * vid.duration;
    current += (target - current) * 0.18;
    if (Math.abs(target - current) < 0.004) current = target;
    seek(current);

    /* The clip's own camera moves about 24 units per pixel across a viewport
       of scroll, which reads as a change of texture rather than as travel. A
       slow scale on top turns it into a continuous push: the cells grow as you
       descend, so the page feels like going deeper rather than sliding past.
       Deliberately gentle - 18% over the whole document, not per section. */
    var z = 1 + prog * 0.18;
    if (Math.abs(z - lastZoom) > 0.0008) {
      lastZoom = z;
      vid.style.transform = 'scale(' + z.toFixed(4) + ')';
    }
  }
  var lastZoom = 0;

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

  /* The page opens on the hive, so the fetch starts at once. The poster is
     the clip's own first frame, painted as the layer's background, so the
     first thing drawn is already the environment — there is nothing else
     behind it and nothing to swap in later. */
  if (doc.readyState === 'complete') start();
  else global.addEventListener('load', start);

  /* The hive answers the pointer with a soft light. No cell geometry: the
     honeycomb lives in the footage, and any grid drawn on top of it lines up
     with nothing. */
  var glow = layer.querySelector('.hive-glow');
  if (glow && !reduce.matches && !global.matchMedia('(pointer: coarse)').matches) {
    var gx = -9999, gy = -9999, cx = -9999, cy = -9999, gOn = 0, gTarget = 0;
    var CONTENT = 'nav,.hero-left,.wrap,footer,#iModal,.fcard,.sb,.tfc,.phone-frame,.dslide';
    var tick = 0;
    doc.addEventListener('mousemove', function (ev) {
      gx = ev.clientX; gy = ev.clientY; gTarget = 1;
    }, { passive: true });
    doc.addEventListener('mouseout', function () { gTarget = 0; }, { passive: true });
    (function paint(now) {
      requestAnimationFrame(paint);
      if (gTarget && now - tick > 100) {
        tick = now;
        var el = doc.elementFromPoint(gx, gy);
        /* dimmed over anything the visitor is reading */
        gTarget = (el && el.closest && el.closest(CONTENT)) ? 0.22 : 1;
      }
      cx += (gx - cx) * 0.12;
      cy += (gy - cy) * 0.12;
      gOn += (gTarget - gOn) * 0.07;
      if (gOn < 0.004) { glow.style.opacity = '0'; return; }
      glow.style.opacity = gOn.toFixed(3);
      glow.style.transform = 'translate3d(' + (cx - 260) + 'px,' + (cy - 260) + 'px,0)';
    })(0);
  }

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
