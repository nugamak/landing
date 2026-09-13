/* ============================================================================
   OTCHive — HIVE CELLS
   ----------------------------------------------------------------------------
   Replaces the flat honeycomb wash with the look of the reference renders:
   glossy near-black cells set in bevelled metal frames, warm gold light
   catching individual edges, and real depth of field between the near and far
   rows.

   Performance shape matters more than the drawing does. The old version rebuilt
   every gradient of every cell on every frame. Here the structure is painted
   once into two offscreen plates (one sharp, one blurred) at resize, and each
   frame only composites those plates and adds a light pass built from a single
   pre-rendered glow sprite. Per-frame gradient construction: zero.
   ========================================================================== */
(function () {
  'use strict';

  var cv = document.getElementById('globalHive');
  if (!cv) return;
  /* alpha:true so the canvas can sit over the environment video; in response
     mode it paints only the hive's answer, not a second honeycomb. */
  var ctx = cv.getContext('2d', { alpha: true });
  var responseMode = false;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarse = window.matchMedia('(pointer: coarse)');

  var W = 0, H = 0, DPR = 1;
  var cells = [], lit = [];
  var plateBase, vignette, glowSprite;
  var mx = null, my = null, t = 0, raf = 0;
  /* How much the pointer light is suppressed because the cursor is over
     something the visitor is trying to read. 0 = free, 1 = fully damped. */
  var overContent = 0, overTarget = 0, hitTick = 0;
  var CONTENT = 'nav,.hero-left,.wrap,footer,#iModal,.fcard,.sb,.tfc,.phone-frame,.dslide';

  /* Palette — the page's own tokens, nothing new introduced. */
  var GOLD = '255,176,42';
  var HOT = '255,146,30';

  function hexPath(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 3 * i - Math.PI / 6;
      var px = x + r * Math.cos(a), py = y + r * Math.sin(a);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  /* Both loops in ONE path. Calling hexPath twice restarted the path, so the
     even-odd ring was never formed and the bevel simply did not exist. */
  function hexRing(c, x, y, ro, ri) {
    c.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 3 * i - Math.PI / 6;
      var px = x + ro * Math.cos(a), py = y + ro * Math.sin(a);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    for (var j = 5; j >= 0; j--) {
      var b = Math.PI / 3 * j - Math.PI / 6;
      var qx = x + ri * Math.cos(b), qy = y + ri * Math.sin(b);
      if (j === 5) c.moveTo(qx, qy); else c.lineTo(qx, qy);
    }
    c.closePath();
  }

  function edgePoint(x, y, r, i) {
    var a = Math.PI / 3 * i - Math.PI / 6;
    return [x + r * Math.cos(a), y + r * Math.sin(a)];
  }

  /* ── build ──────────────────────────────────────────────────────────── */
  function build() {
    /* Cells are large, as in the references: a wall of tiles you are close to,
       not a fine mesh seen from far away. */
    var R = Math.max(56, Math.min(104, Math.round(Math.min(W, H) * 0.105)));
    var cw = R * Math.sqrt(3), rh = R * 1.5;
    var cols = Math.ceil(W / cw) + 3, rows = Math.ceil(H / rh) + 3;

    cells = [];
    for (var row = -1; row < rows; row++) {
      for (var col = -1; col < cols; col++) {
        var cx = col * cw + (row % 2 === 0 ? 0 : cw / 2) - cw * 0.5;
        var cy = row * rh - rh * 0.5;
        var seed = (row * 73856093 ^ col * 19349663) >>> 0;
        var r1 = ((seed % 1000) / 1000);
        var r2 = (((seed >> 10) % 1000) / 1000);
        var r3 = (((seed >> 20) % 1000) / 1000);

        /* Depth pushes a cell back: smaller, darker, and into the blurred
           plate. The references get most of their richness from this. */
        var depth = r1;
        cells.push({
          x: cx, y: cy, r: R * (0.94 + r2 * 0.06),
          depth: depth,
          /* which edge catches the light — one or two per cell, never all six */
          lightEdge: Math.floor(r3 * 6),
          twin: r2 > 0.34,
          /* a minority of cells glow from the inside, as in the reference */
          inner: r3 > 0.36 ? (0.38 + r1 * 0.62) : 0,
          phase: r1 * Math.PI * 2,
          speed: 0.20 + r2 * 0.30
        });
      }
    }
    /* every cell can catch an edge; the amount varies. The reference wall
       has gold somewhere on most tiles, not on a scattered few. */
    lit = cells;
  }

  /* One radial sprite, reused for every glow. Building gradients per cell per
     frame was the single most expensive thing in the old renderer. */
  function makeGlow() {
    var s = 128;
    var g = document.createElement('canvas');
    g.width = g.height = s;
    var c = g.getContext('2d');
    var rg = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(255,196,104,0.95)');
    rg.addColorStop(0.18, 'rgba(' + GOLD + ',0.55)');
    rg.addColorStop(0.55, 'rgba(' + GOLD + ',0.14)');
    rg.addColorStop(1, 'rgba(' + GOLD + ',0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, s, s);
    glowSprite = g;
  }

  /* Paint the tile structure once: face, bevelled frame, specular edge. */
  function paintCell(c, cell, sharp) {
    var x = cell.x, y = cell.y, r = cell.r;
    var d = cell.depth;
    /* far cells sit darker and flatter */
    var body = sharp ? 1 : 0.72;

    hexPath(c, x, y, r * 0.82);
    var fg = c.createLinearGradient(x - r, y - r, x + r * 0.6, y + r);
    if (cell.inner) {
      /* Honey. The reference faces are a warm, granular material rather than a
         flat wash, so the texture is baked in here — once, not per frame. */
      var hv = cell.inner * body;
      fg.addColorStop(0, 'rgba(' + Math.round(158 * hv) + ',' + Math.round(94 * hv) + ',' + Math.round(18 * hv) + ',1)');
      fg.addColorStop(0.5, 'rgba(' + Math.round(102 * hv) + ',' + Math.round(58 * hv) + ',' + Math.round(10 * hv) + ',1)');
      fg.addColorStop(1, 'rgba(' + Math.round(44 * hv) + ',' + Math.round(24 * hv) + ',' + Math.round(5 * hv) + ',1)');
    } else {
      /* everything else stays glossy near-black, which is what lets the lit
         cells read as lit */
      fg.addColorStop(0, 'rgba(' + Math.round(22 * body) + ',' + Math.round(17 * body) + ',' + Math.round(11 * body) + ',1)');
      fg.addColorStop(0.45, 'rgba(' + Math.round(10 * body) + ',' + Math.round(8 * body) + ',' + Math.round(5 * body) + ',1)');
      fg.addColorStop(1, 'rgba(3,2,2,1)');
    }
    c.fillStyle = fg;
    c.fill();

    if (cell.inner) {
      c.save();
      hexPath(c, x, y, r * 0.80);
      c.clip();
      var sd = Math.abs(Math.round(cell.x * 7919 + cell.y * 104729)) % 233280;
      var n = Math.round(34 * cell.inner);
      for (var q = 0; q < n; q++) {
        sd = (sd * 9301 + 49297) % 233280; var u = sd / 233280;
        sd = (sd * 9301 + 49297) % 233280; var v = sd / 233280;
        var ang = u * 6.2832, dd = Math.sqrt(v) * r * 0.72;
        c.fillStyle = 'rgba(255,' + (186 + Math.round(u * 50)) + ',96,' + (0.10 + v * 0.26).toFixed(2) + ')';
        c.beginPath();
        c.arc(x + Math.cos(ang) * dd, y + Math.sin(ang) * dd, 0.6 + u * 1.7, 0, 6.2832);
        c.fill();
      }
      c.restore();
    }

    /* frame: the ring between the outer and inner hex, lit like brushed metal */
    c.save();
    hexRing(c, x, y, r, r * 0.82);
    c.clip('evenodd');
    var mg = c.createLinearGradient(x - r, y - r, x + r, y + r);
    var k = (1.42 + d * 0.92) * body;
    var cl = function (v) { return Math.max(0, Math.min(255, Math.round(v))); };
    mg.addColorStop(0.00, 'rgba(' + cl(182 * k) + ',' + cl(112 * k) + ',' + cl(32 * k) + ',1)');
    mg.addColorStop(0.22, 'rgba(' + cl(104 * k) + ',' + cl(61 * k) + ',' + cl(16 * k) + ',1)');
    mg.addColorStop(0.52, 'rgba(' + cl(38 * k) + ',' + cl(22 * k) + ',' + cl(7 * k) + ',1)');
    mg.addColorStop(0.80, 'rgba(' + cl(154 * k) + ',' + cl(93 * k) + ',' + cl(26 * k) + ',1)');
    mg.addColorStop(1.00, 'rgba(' + cl(70 * k) + ',' + cl(41 * k) + ',' + cl(12 * k) + ',1)');
    c.fillStyle = mg;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();

    /* a hairline where the frame meets the face reads as a machined edge */
    hexPath(c, x, y, r * 0.82);
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.lineWidth = 1;
    c.stroke();
  }

  function buildPlates() {
    var mk = function (scale) {
      var o = document.createElement('canvas');
      o.width = Math.max(1, Math.round(W * scale));
      o.height = Math.max(1, Math.round(H * scale));
      return o;
    };
    /* Far rows go onto a half-resolution plate and are blurred ONCE, here.
       Running a canvas blur filter over a full-screen image every frame was
       costing more than everything else combined: 17fps at 1920. */
    var far = mk(DPR * 0.5);
    var cb = far.getContext('2d');
    cb.setTransform(DPR * 0.5, 0, 0, DPR * 0.5, 0, 0);
    cb.fillStyle = '#060403';
    cb.fillRect(0, 0, W, H);

    plateBase = mk(DPR);
    var cs = plateBase.getContext('2d');

    cells.forEach(function (cell) {
      if (cell.depth <= 0.52) paintCell(cb, cell, false);
    });

    cs.setTransform(1, 0, 0, 1, 0, 0);
    cs.fillStyle = '#060403';
    cs.fillRect(0, 0, plateBase.width, plateBase.height);
    cs.save();
    if (cs.filter !== undefined) cs.filter = 'blur(' + (3 * DPR).toFixed(1) + 'px)';
    cs.globalAlpha = 0.9;
    cs.drawImage(far, 0, 0, plateBase.width, plateBase.height);
    cs.restore();

    cs.setTransform(DPR, 0, 0, DPR, 0, 0);
    cells.forEach(function (cell) {
      if (cell.depth > 0.52) paintCell(cs, cell, true);
    });

    /* The vignette never changes either, so bake it instead of rebuilding a
       full-screen radial gradient on every frame. */
    vignette = mk(DPR);
    var cvg = vignette.getContext('2d');
    var vg = cvg.createRadialGradient(
      vignette.width / 2, vignette.height / 2, vignette.height * 0.18,
      vignette.width / 2, vignette.height / 2, vignette.height * 0.92);
    vg.addColorStop(0, 'rgba(0,0,0,0.30)');
    vg.addColorStop(0.45, 'rgba(0,0,0,0.44)');
    vg.addColorStop(1, 'rgba(0,0,0,0.88)');
    cvg.fillStyle = vg;
    cvg.fillRect(0, 0, vignette.width, vignette.height);
  }

  /* ── frame ──────────────────────────────────────────────────────────── */
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (responseMode) { drawResponse(); return; }
    /* one composite of pre-baked structure: no filters, no gradients */
    ctx.globalAlpha = 1;
    ctx.drawImage(plateBase, 0, 0);

    /* light pass: edge highlights and inner glow, additive */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'lighter';

    var pmx = mx == null ? -9999 : mx, pmy = my == null ? -9999 : my;
    for (var i = 0; i < lit.length; i++) {
      var cell = lit[i];
      var pulse = reduce.matches ? 0.55
        : 0.5 + 0.5 * Math.sin(t * cell.speed + cell.phase);
      var near = 0;
      if (mx != null) {
        var dx = cell.x - pmx, dy = cell.y - pmy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        near = Math.max(0, 1 - dist / 300);
      }
      var amp = (0.34 + pulse * 0.40 + near * 1.05 * (1 - overContent * 0.80)) *
                (0.55 + cell.depth * 0.45);
      /* Cells this dim contribute nothing visible, and skipping them early is
         what keeps the extra edge strokes affordable at 1920. */
      if (amp < 0.12) continue;

      /* inner glow for the honey-filled cells */
      if (cell.inner) {
        var g = cell.r * 2.1;
        ctx.globalAlpha = Math.min(0.44, amp * cell.inner * 0.52);
        ctx.drawImage(glowSprite, cell.x - g / 2, cell.y - g / 2, g, g);
      }

      /* one or two edges catch the light, never the whole outline */
      ctx.globalAlpha = Math.min(0.72, amp * 0.78);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2.2, cell.r * 0.082);
      ctx.strokeStyle = 'rgba(' + HOT + ',0.9)';
      strokeEdge(cell, cell.lightEdge);
      if (cell.twin) {
        ctx.globalAlpha = Math.min(0.78, amp * 0.66);
        strokeEdge(cell, (cell.lightEdge + 3) % 6);
      }
      /* A third edge was tried and dropped: it cost roughly 10fps at 1920 and
         the wall already reads as lit from two. */
    }

    if (mx != null && !reduce.matches) {
      var halo = 0.22 * (1 - overContent * 0.88);
      if (halo > 0.004) {
        var hr = 340;
        ctx.globalAlpha = halo;
        ctx.drawImage(glowSprite, mx - hr / 2, my - hr / 2, hr, hr);
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(vignette, 0, 0);
  }

  /* Response mode: the environment video IS the hive, so drawing cells here
     would put a second honeycomb over the first. All this layer does then is
     carry the hive's answer to the pointer — a small local cluster, capped at
     five cells, never a full-screen flash. */
  function drawResponse() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (mx == null || reduce.matches) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    var lit = 0;
    for (var i = 0; i < cells.length && lit < 5; i++) {
      var c = cells[i];
      var dd = Math.hypot(c.x - mx, c.y - my);
      if (dd > 250) continue;
      lit++;
      var near = 1 - dd / 250;
      var pulse = 0.6 + 0.4 * Math.sin(t * c.speed + c.phase);
      var a = near * near * pulse * 0.55;
      if (a < 0.012) continue;
      var g = c.r * 2.4;
      ctx.globalAlpha = a;
      ctx.drawImage(glowSprite, c.x - g / 2, c.y - g / 2, g, g);
      ctx.globalAlpha = Math.min(0.7, a * 1.5);
      ctx.lineWidth = Math.max(2, c.r * 0.07);
      ctx.strokeStyle = 'rgba(' + HOT + ',0.9)';
      ctx.lineCap = 'round';
      strokeEdge(c, c.lightEdge);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function strokeEdge(cell, i) {
    var a = edgePoint(cell.x, cell.y, cell.r * 0.91, i);
    var b = edgePoint(cell.x, cell.y, cell.r * 0.91, (i + 1) % 6);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  /* Hit-testing every frame would be wasteful and pointless — the cursor
     cannot cross a card boundary in 16ms in any way that matters. Ten times a
     second is imperceptible and costs nothing. */
  function sampleContent(now) {
    if (mx == null) { overTarget = 0; return; }
    if (now - hitTick < 100) return;
    hitTick = now;
    var el = document.elementFromPoint(mx, my);
    overTarget = (el && el.closest && el.closest(CONTENT)) ? 1 : 0;
  }

  function loop(now) {
    t += 0.016;
    sampleContent(now || 0);
    /* eased, so the light fades away from type rather than snapping off */
    overContent += (overTarget - overContent) * 0.08;
    draw();
    raf = requestAnimationFrame(loop);
  }

  /* ── lifecycle ──────────────────────────────────────────────────────── */
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    build();
    buildPlates();
    draw();
  }

  if (!coarse.matches) {
    window.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    window.addEventListener('mouseout', function () { mx = my = null; }, { passive: true });
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(resize, 160);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf && !reduce.matches) { raf = requestAnimationFrame(loop); }
  });

  /* hive-env.js flips this on only once the environment video is genuinely
     playable, so a failed or slow video never leaves a blank page. */
  window.HiveCells = {
    setResponseMode: function (on) {
      if (responseMode === on) return;
      responseMode = on;
      if (!raf && !reduce.matches) raf = requestAnimationFrame(loop);
      draw();
    }
  };

  makeGlow();
  resize();
  /* Reduced motion gets the same wall, lit and still. */
  if (reduce.matches) draw();
  else raf = requestAnimationFrame(loop);
})();
