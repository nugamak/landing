(() => {
  'use strict';
  const line = document.querySelector('#hero .htitle [data-k="ht2"]');
  if (!line) return;

  const enabled = matchMedia('(any-hover:hover) and (any-pointer:fine) and (prefers-reduced-motion:no-preference) and (forced-colors:none)');
  const glyphs = document.createRange();
  const ns = 'http://www.w3.org/2000/svg';

  function element(name, attributes) {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  // One smooth displacement field over the browser's own shaped glyphs.
  // Red and green encode signed x/y pull. Mid-grey leaves a pixel in place.
  let patch, blur, horizontal, vertical;
  function buildFilter() {
    const svg = element('svg', {width:0, height:0, 'aria-hidden':'true', focusable:'false'});
    svg.style.cssText = 'position:absolute;pointer-events:none';
    const filter = element('filter', {id:'escrow-headline-pull', x:'-8%', y:'-20%', width:'116%', height:'140%', 'color-interpolation-filters':'sRGB'});
    patch = element('feFlood', {'flood-color':'white', result:'contact'});
    blur = element('feGaussianBlur', {in:'contact', x:'-8%', y:'-20%', width:'116%', height:'140%', result:'falloff'});
    const black = element('feFlood', {'flood-color':'black', result:'ground'});
    const field = element('feComposite', {in:'falloff', in2:'ground', operator:'over'});
    const transfer = element('feComponentTransfer', {result:'drag'});
    horizontal = element('feFuncR', {type:'linear', intercept:'.5', slope:'0'});
    vertical = element('feFuncG', {type:'linear', intercept:'.5', slope:'0'});
    transfer.append(horizontal,vertical);
    filter.append(patch,blur,black,field,transfer,element('feDisplacementMap',
      {in:'SourceGraphic', in2:'drag', scale:12, xChannelSelector:'R', yChannelSelector:'G'}));
    svg.append(filter);
    document.body.append(svg);
  }

  let previous = null, frame = 0, last = 0, radius = 32;
  let mouseX = 0, mouseY = 0, centerX = 0, centerY = 0;
  let forceX = 0, forceY = 0, x = 0, y = 0, vx = 0, vy = 0;
  function reset() {
    cancelAnimationFrame(frame);
    frame = last = forceX = forceY = x = y = vx = vy = 0;
    previous = null;
    line.style.removeProperty('filter');
  }
  function relax() {
    previous = null;
    forceX = forceY = 0;
  }
  function draw(now) {
    const dt = last ? Math.min(.032,(now-last)/1000) : 1/60;
    last = now;
    const follow = 1-Math.exp(-dt/.044);
    centerX += (mouseX-centerX)*follow;
    centerY += (mouseY-centerY)*follow;
    const decay = Math.exp(-dt/.105);
    forceX *= decay; forceY *= decay;
    vx += ((forceX-x)*460 - vx*32)*dt;
    vy += ((forceY-y)*460 - vy*32)*dt;
    x += vx*dt; y += vy*dt;
    if (Math.hypot(x,y)<.025 && Math.hypot(forceX,forceY)<.035 && Math.hypot(vx,vy)<.25) {
      const position = previous;
      reset();
      previous = position;
      return;
    }
    patch.setAttribute('x',centerX-radius);
    patch.setAttribute('y',centerY-radius);
    const limit = Math.max(1, Math.hypot(x,y)/4.6);
    horizontal.setAttribute('slope',-x/(12*limit));
    vertical.setAttribute('slope',-y/(12*limit));
    line.style.filter = 'url(#escrow-headline-pull)';
    frame = requestAnimationFrame(draw);
  }

  line.addEventListener('pointermove', e => {
    if (e.pointerType!=='mouse' || e.buttons || !enabled.matches) { reset(); return; }
    // The original language switch replaces the text node inside this span.
    glyphs.selectNodeContents(line);
    const overText = [...glyphs.getClientRects()].some(r => e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom);
    if (!overText) { relax(); return; }
    const pos = {x:e.clientX,y:e.clientY};
    const from = previous;
    previous = pos;
    if (!from) return;
    const dx = pos.x-from.x, dy = pos.y-from.y;
    if (!dx && !dy) return;
    const rect = line.getBoundingClientRect();
    mouseX = pos.x-rect.left; mouseY = pos.y-rect.top;
    if (!frame) {
      if (!patch) buildFilter();
      radius = Math.min(36, Math.max(16, parseFloat(getComputedStyle(line).fontSize)*.39));
      patch.setAttribute('width',radius*2); patch.setAttribute('height',radius*2);
      blur.setAttribute('stdDeviation',radius*.48);
      centerX = mouseX; centerY = mouseY;
      frame = requestAnimationFrame(draw);
    }
    forceX += dx*.8; forceY += dy*.8;
    const limit = Math.max(1, Math.hypot(forceX,forceY)/7);
    forceX /= limit; forceY /= limit;
  }, {passive:true});
  line.addEventListener('pointerleave',relax);
  line.addEventListener('pointerdown',reset);
  line.addEventListener('pointercancel',reset);
  enabled.addEventListener('change',reset);
  window.addEventListener('scroll',reset,{passive:true});
  window.addEventListener('resize',reset);
  window.addEventListener('blur',reset);
  document.addEventListener('visibilitychange',() => { if (document.hidden) reset(); });
})();
