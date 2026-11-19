(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: no-preference) and (forced-colors: none)');
  const mouse = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const wrap = (n, loop) => ((n % loop) + loop) % loop;
  // Separate capture and break distances give a strand a real outward drag.
  const senseRadius = 104;
  const captureRadius = 30;
  const breakRadius = 185;
  // Different amounts of honey collect along the lip each time it is touched.
  // Keep one distribution throughout a gesture, including its release.
  const pours = [
    { positions: [-.47,-.23,-.06,.21,.46], lengths: [.27,1,.54,.8,.36] },
    { positions: [-.45,-.28,.01,.18,.46], lengths: [.58,.25,1,.39,.72] },
    { positions: [-.47,-.21,.04,.23,.45], lengths: [.34,.76,.49,1,.26] }
  ];
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = (name, attrs = {}) => {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  // Distance along the actual pill, starting at the left end of its top straight.
  function edgeAt(s, straight, r) {
    const arc = Math.PI * r;
    s = wrap(s, 2 * (straight + arc));
    if (s < straight) return [r + s, 0, 0, -1];
    if (s >= straight + arc && s < 2 * straight + arc)
      return [r + 2 * straight + arc - s, 2 * r, 0, 1];
    const right = s < straight + arc;
    const angle = right ? (s - straight) / r - Math.PI / 2 : (s - 2 * straight - arc) / r + Math.PI / 2;
    const nx = Math.cos(angle), ny = Math.sin(angle);
    return [r + (right ? straight : 0) + r * nx, r + r * ny, nx, ny];
  }

  const point = (x, y) => x.toFixed(2) + ' ' + y.toFixed(2);

  function liquid(button, index) {
    const surface = svg('svg', {class: 'honey-threads', 'aria-hidden': 'true', focusable: 'false'});
    const defs = svg('defs');
    const id = 'otchive-nectar-' + index;
    const grad = svg('linearGradient', {id, gradientUnits:'userSpaceOnUse'});
    for (const [offset, color] of [[0,'#a75e1c'], [.075,'#e6a33f'], [.22,'#efb54e'], [.62,'#ce862a'], [.93,'#f1b34b'], [1,'#b47423']]) {
      grad.append(svg('stop', {offset, 'stop-color': color}));
    }
    const body = svg('path', {id:id+'-body', fill:'url(#'+id+')', stroke:'#9c631f', 'stroke-width':'.65','stroke-linejoin':'round'});
    const clip = svg('clipPath', {id:id+'-clip'});
    clip.append(svg('use',{href:'#'+id+'-body'}));
    const highlights = svg('g', {'clip-path':'url(#'+id+'-clip)'});
    defs.append(grad, clip);
    surface.append(defs, body, highlights);
    const strands = [3.6, 2.65, 4.25, 2.95, 4.5].map((bead, i) => {
      const glow = svg('path', {fill:'#ffcd70',opacity:'.56'});
      const shine = svg('path', {fill:'none',stroke:'#fff0bb','stroke-width':'.8','stroke-linecap':'round',opacity:'.83'});
      highlights.append(glow, shine);
      return {bead, glow, shine, x:0, y:0, volume:0, response:[.088,.052,.12,.072,.105][i]};
    });
    button.prepend(surface);
    let radius = 1, straight = 1, loop = 1;
    let root = 0, destination = 0, speed = 0, amount = 0, target = 0, velocity = 0;
    let raf = 0, last = 0, releaseAt = 0, inside = false;
    let attached = false, aimX = 0, aimY = 0, cursorX = 0, cursorY = 0;
    let nextPour = 0, pour = pours[0];

    function paint() {
      const a = clamp(amount, 0, 1.22);
      surface.style.opacity = String(Math.min(1, a * 5));
      const [x, y, nx, ny] = edgeAt(root, straight, radius);
      const edgeDistance = (aimX-x)*nx + (aimY-y)*ny;
      const outside = Math.max(0, edgeDistance);
      const lift = 33 + 6 * clamp(1 - Math.abs(edgeDistance)/radius, 0, 1);
      button.style.setProperty('--honey-light', (36 + (100 * x / (straight + 2 * radius) - 36) * .64 * a) + '%');
      button.style.setProperty('--honey-x', (nx * a * .95) + 'px');
      button.style.setProperty('--honey-y', (ny * a * .78) + 'px');
      const width = straight + 2*radius;
      const span = Math.min(width*.79, 142) * (1 - .63*Math.abs(nx));
      // End the sheet before the rim turns away from the pull. Wrapping roots
      // onto the far face would fold the outline through itself around a corner.
      function extent(sign) {
        const facing = distance => {
          const edge = edgeAt(root+sign*distance,straight,radius);
          return edge[2]*nx + edge[3]*ny;
        };
        let lo=0, hi=span*.58;
        if (facing(hi)>=.18) return hi;
        for (let i=0;i<6;i++) {
          const mid = (lo+hi)/2;
          if (facing(mid)>=.18) lo=mid; else hi=mid;
        }
        return lo;
      }
      const leftExtent = extent(-1), rightExtent = extent(1);
      const offsets = pour.positions.map(p=>p*(p<0?leftExtent:rightExtent)/.58);
      const thickness = a * (5 + 4*clamp(outside/100,0,1));
      const length = Math.max(2, a*Math.hypot(lift,outside));
      grad.setAttribute('x1', x); grad.setAttribute('y1', y);
      grad.setAttribute('x2', x+nx*length); grad.setAttribute('y2', y+ny*length);

      // Each valley belongs to both neighbouring drips. A single outline
      // makes their broad roots one continuous sheet, even around a round end.
      const banks = [-leftExtent];
      offsets.slice(1).forEach((v,i) => banks.push((offsets[i]+v)/2));
      banks.push(rightExtent);
      function valley(j, tangent = 0) {
        const [bx,by,ux,uy] = edgeAt(root+banks[j],straight,radius);
        const depth = j === 0 || j === banks.length-1 ? -1.1 : thickness*(.86+.12*Math.cos(j*2));
        return point(bx+nx*depth-uy*tangent,by+ny*depth+ux*tangent);
      }
      let outline = 'M '+valley(0);
      for (const [i,s] of strands.entries()) {
        const [bx,by,ux,uy] = edgeAt(root+offsets[i],straight,radius);
        const v = clamp(s.volume,0,1.18), weight = pour.lengths[i];
        const normal = Math.max(0,(s.x-x)*nx+(s.y-y)*ny);
        const h = v*weight*Math.hypot(lift,normal);
        const footSide = -(bx-x)*ny+(by-y)*nx;
        const side = v*(weight*clamp((-(s.x-x)*ny+(s.y-y)*nx)*.46,-104,104)
          + footSide*.18*Math.abs(nx)*clamp(outside/85,0,1));
        const dx = nx*h - ny*side, dy = ny*h + nx*side;
        const sag = v * Math.abs(nx) * Math.min(12,normal*.1);
        const neck = v * (.85 + (1-weight)*2.1 + 1.1/(1+normal/32));
        const cap = Math.min(s.bead*v,h*.22);
        // Gravity bends a sideways pull. The tip and its reflection share a
        // centreline, so the highlight stays inside even during a reversal.
        function at(t, across = 0, along = 0) {
          const bend = 4*t*(1-t);
          // Points at the same distance from the rim sag together. Short
          // droplets therefore cannot cut across a longer neighbouring neck.
          const fraction = clamp(t*h/length,0,1);
          return point(bx+dx*t+ux*thickness*.42*bend - ny*across + nx*along,
            by+dy*t+uy*thickness*.42*bend+sag*4*fraction*(1-fraction) + nx*across + ny*along);
        }
        const left = (offsets[i]-banks[i])*.67, right = (banks[i+1]-offsets[i])*.67;
        outline += ' C '+valley(i,left)+' '+at(.22,-neck*1.55)+' '+at(.51,-neck)
          +' C '+at(.74,-neck*.78)+' '+at(1,-cap*.62,-cap*2.1)+' '+at(1,-cap,-cap*.5)
          +' C '+at(1,-cap*1.12,cap*1.05)+' '+at(1,cap*1.2,cap*.95)+' '+at(1,cap,-cap*.45)
          +' C '+at(1,cap*.75,-cap*2.05)+' '+at(.69,neck*.73)+' '+at(.49,neck)
          +' C '+at(.22,neck*1.52)+' '+valley(i+1,-right)+' '+valley(i+1);
        s.glow.setAttribute('d','M '+at(.18,-neck*1.6)+' Q '+at(.63,-neck*.94)+' '+at(1,-cap*.7,-cap*.3)
          +' Q '+at(1,cap*.12,cap*.56)+' '+at(.85,neck*.1)+' Q '+at(.51,neck*.25)+' '+at(.18,-neck*1.6)+' Z');
        s.shine.setAttribute('d','M '+valley(i,left*.46)+' C '+valley(i,left*1.18)+' '+at(.32,-neck*.76)+' '+at(.62,-neck*.62)
          +' M '+at(1,-cap*.47,-cap*.42)+' Q '+at(1,-cap*.66,cap*.04)+' '+at(1,-cap*.32,cap*.22));
      }
      // Return just inside the bezel along its own curvature, never across the label.
      for (let j=12;j>=0;j--) {
        const offset = banks[0]+(banks.at(-1)-banks[0])*j/12;
        const [bx,by,ux,uy] = edgeAt(root+offset,straight,radius);
        outline += ' L '+point(bx-ux*1.8,by-uy*1.8);
      }
      body.setAttribute('d',outline+' Z');
    }
    function reset() {
      cancelAnimationFrame(raf);
      raf = last = releaseAt = target = amount = velocity = speed = 0;
      inside = attached = false;
      strands.forEach(s => { s.volume = 0; });
      surface.style.opacity = '0';
      for (const property of ['--honey-light','--honey-x','--honey-y']) button.style.removeProperty(property);
    }
    function frame(now) {
      const dt = last ? clamp((now - last) / 1000, .001, .028) : 1 / 60;
      last = now;
      if (releaseAt && now >= releaseAt) { target = 0; releaseAt = 0; }
      const follow = 1 - Math.exp(-dt/.074);
      aimX += (cursorX-aimX)*follow;
      aimY += (cursorY-aimY)*follow;
      const delta = wrap(destination - root + loop / 2, loop) - loop / 2;
      speed += (delta * 170 - speed * 24) * dt;
      root = wrap(root + speed * dt, loop);
      velocity += ((target - amount) * 190 - velocity * 23) * dt;
      amount += velocity * dt;
      let settledStrands = true;
      for (const s of strands) {
        const mix = 1-Math.exp(-dt/s.response);
        s.x += (cursorX-s.x)*mix; s.y += (cursorY-s.y)*mix;
        s.volume += (amount-s.volume)*mix;
        if (Math.abs(s.volume-amount)>.002 || Math.hypot(s.x-cursorX,s.y-cursorY)>.12) settledStrands = false;
      }
      if (!target && amount < .004 && settledStrands && !releaseAt) { reset(); return; }
      const settled = Math.abs(delta) < .12 && Math.abs(speed) < .6 && Math.abs(target - amount) < .002 && Math.abs(velocity) < .015
        && Math.hypot(cursorX-aimX,cursorY-aimY) < .1;
      if (settled && settledStrands && !releaseAt) {
        root = destination; amount = target; aimX = cursorX; aimY = cursorY; speed = velocity = last = raf = 0;
        strands.forEach(s => { s.x = cursorX; s.y = cursorY; s.volume = target; });
        paint();
        return;
      }
      paint();
      raf = requestAnimationFrame(frame);
    }
    function wake() { if (!raf) raf = requestAnimationFrame(frame); }
    function release() {
      if (!inside) return;
      inside = attached = false;
      target = Math.min(1.08, amount * 1.08);
      releaseAt = performance.now() + 90;
      wake();
    }
    function track(px, py) {
      const box = button.getBoundingClientRect();
      if (!box.width || !box.height) { reset(); return; }
      const r = box.height / 2, x = px - box.left, y = py - box.top;
      const dx = x - clamp(x, r, box.width - r), dy = y - r;
      const distance = Math.hypot(dx, dy) - r;
      if (distance >= (attached ? breakRadius : senseRadius)) { release(); return; }
      if (distance <= captureRadius) attached = true;
      radius = r; straight = box.width - r * 2; loop = 2 * (straight + Math.PI * r);
      const angle = Math.atan2(dy, dx);
      if (dx > 0) destination = straight + (angle + Math.PI / 2) * r;
      else if (dx < 0) destination = 2 * straight + Math.PI * r + wrap(angle - Math.PI / 2, 2 * Math.PI) * r;
      else if (Math.abs(dy) > 1 || !inside) destination = dy <= 0 ? x - r : 2 * straight + Math.PI * r - (x - r);
      cursorX = x; cursorY = y;
      if (!inside && !raf && amount === 0) {
        pour = pours[nextPour];
        nextPour = (nextPour+1) % pours.length;
        strands.forEach(s => { s.x=x; s.y=y; s.volume=0; });
      }
      if (amount < .008) { root = destination; aimX = x; aimY = y; }
      inside = true; releaseAt = 0;
      const near = clamp((senseRadius-distance)/(senseRadius-captureRadius),0,1);
      target = attached ? 1 : near * near * (3 - 2 * near);
      wake();
    }
    return {track, release, reset};
  }

  const buttons = [...document.querySelectorAll('a.honey-launch')];
  const controllers = buttons.map(liquid);
  let pointer = null;
  function follow() {
    if (pointer) controllers.forEach(c => c.track(pointer.x, pointer.y));
  }
  function clear() {
    pointer = null;
    controllers.forEach(c => c.reset());
  }
  function leave() {
    pointer = null;
    controllers.forEach(c => c.release());
  }
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !mouse.matches || !motion.matches) {
      if (pointer) clear();
      return;
    }
    pointer = {x: e.clientX, y: e.clientY};
    follow();
  }, {passive: true});
  document.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') clear(); }, {passive: true, capture: true});
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('scroll', follow, {passive: true});
  window.addEventListener('resize', follow);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  mouse.addEventListener('change', clear);
  motion.addEventListener('change', clear);

  // On mobile browsers :active can arrive only after the tap is recognized.
  let touched = null;
  function endTouch() {
    if (touched) delete touched.dataset.honeyPressed;
    touched = null;
  }
  for (const link of document.querySelectorAll('a.honey-launch,a.honey-paper,a.honey-investor')) {
    link.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      endTouch();
      touched = link;
      link.dataset.honeyPressed = '';
    }, {passive:true});
  }
  for (const type of ['pointerup','pointercancel','blur','pagehide']) window.addEventListener(type, endTouch);

  for (const button of buttons) {
    const clip = document.createElement('span');
    clip.className = 'honey-pulse';
    clip.setAttribute('aria-hidden','true');
    button.append(clip);
    function ripple(x, y) {
      if (!motion.matches || !Element.prototype.animate) return;
      const ring = document.createElement('b');
      ring.style.left = (x - 1) + 'px'; ring.style.top = (y - 1) + 'px';
      clip.replaceChildren(ring);
      const animation = ring.animate([{transform:'scale(2)',opacity:.85},{transform:'scale(89,43)',opacity:0}],
        {duration:430, easing:'cubic-bezier(.18,.62,.28,1)'});
      animation.onfinish = () => ring.remove();
    }
    button.addEventListener('pointerdown', e => {
      if (e.button || e.pointerType !== 'mouse') return;
      const box = button.getBoundingClientRect();
      ripple(e.clientX - box.left, e.clientY - box.top);
    });
    button.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.repeat) return;
      button.dataset.honeyPressed = '';
      ripple(button.clientWidth / 2, button.clientHeight / 2);
    });
    for (const type of ['blur','keyup','click']) button.addEventListener(type, () => { delete button.dataset.honeyPressed; });
  }
})();
