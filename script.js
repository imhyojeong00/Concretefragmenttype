/* ============================================================
   Stone Typing — bottom bar, zoom/pan, version toggle, gap sliders,
   infinite stacking. data.js: FAMILIES, FAMID, DIST_FAMILY, DIST_ALL
   ============================================================ */

const STONE = 560;            // stone size (px) — must match --stone in CSS
let   OVERLAP = 410;          // closer stones (larger overlap)
let   TOWER_OVERLAP = 0.94;   // towers packed very tightly
const MIN_STEP = Math.round(STONE*0.22);  // never let two stones fully coincide
const MAX_HOP = 13;
const MIN_ANGLE = 8;
const MAX_ANGLE = 80;

let IMG_DIR = 'images';       // 'images' | 'images-dither' (version toggle)

// travel distances, clamped so consecutive stones always shift at least MIN_STEP
const STEP      = () => Math.max(MIN_STEP, STONE - OVERLAP);
const TOWER_GAP = () => Math.max(MIN_STEP, STONE - Math.round(OVERLAP*TOWER_OVERLAP));

/* ---------- DOM ---------- */
const viewport = document.getElementById('viewport');
const world    = document.getElementById('world');
const mainInput= document.getElementById('mainInput');

/* ---------- family / distance ---------- */
function famOf(ch){ const u=ch.toUpperCase(); return (u in FAMID)?FAMID[u]:9; }
function sameFamily(a,b){ return famOf(a)===famOf(b) && famOf(a)!==9; }
function distance(a,b){
  const A=a.toUpperCase(), B=b.toUpperCase();
  if(sameFamily(A,B) && DIST_FAMILY[A] && (B in DIST_FAMILY[A])) return DIST_FAMILY[A][B];
  if(DIST_ALL[A] && (B in DIST_ALL[A])) return DIST_ALL[A][B];
  return null;
}
// Angle reveals hierarchy. Within a family, distance 1..6 maps to clear steps
// so closer kin stack near-vertical and distant kin lean more. Different family
// (or no relation) leans hardest but still continues upward.
function tiltFor(a,b){
  const A=a.toUpperCase(), B=b.toUpperCase();
  if(sameFamily(A,B)){
    const d = (DIST_FAMILY[A] && (B in DIST_FAMILY[A])) ? DIST_FAMILY[A][B] : 6;
    // within-family ladder: 1->8, 2->18, 3->28, 4->38, 5->48, 6+->58
    return Math.min(8 + (d-1)*10, 58);
  }
  // different family: lean a lot but keep rising
  const d = (DIST_ALL[A] && (B in DIST_ALL[A])) ? DIST_ALL[A][B] : null;
  if(d===null) return 78;            // unrelated
  return 65 + Math.min(d,13);        // ~65-78 by overall distance
}

// "very far" => break into a side tower instead of rising
function isVeryFar(a,b){
  const A=a.toUpperCase(), B=b.toUpperCase();
  if(sameFamily(A,B)) return false;          // same family always rises
  const d = (DIST_ALL[A] && (B in DIST_ALL[A])) ? DIST_ALL[A][B] : null;
  return (d===null) || d>=9;                 // unrelated or 9+ hops apart -> new tower
}

// cross-family distance (whole-graph hops, bridges included) for baseline steps
function crossFamilyDistance(a,b){
  const A=a.toUpperCase(), B=b.toUpperCase();
  const d = (DIST_ALL[A] && (B in DIST_ALL[A])) ? DIST_ALL[A][B] : null;
  return d===null ? 13 : d;
}

/* ---------- stones ---------- */
let zCounter=1;
const placed=[];  // {ch, cx, cy, rot, z}

function makeStone(ch, cx, cy, rotDeg){
  const el=document.createElement('div');
  el.className='stone';
  el.style.left=(cx-STONE/2)+'px';
  el.style.top =(cy-STONE/2)+'px';
  el.style.zIndex=(zCounter++);

  const rot=document.createElement('div');
  rot.className='stone-rot';
  rot.style.setProperty('--rot', rotDeg+'deg');

  const lower=ch.toLowerCase();
  const img=document.createElement('img');
  img.src=IMG_DIR+'/'+lower+'.png'; img.alt=lower;
  img.onerror=()=>{rot.innerHTML='';const fb=document.createElement('div');
    fb.className='fallback';fb.textContent=lower.toUpperCase();rot.appendChild(fb);};
  rot.appendChild(img);
  el.appendChild(rot);
  world.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  placed.push({ch:lower, cx, cy, rot:rotDeg, z:zCounter});
  return el;
}

/* ---------- Latin rules: J -> gap, U/W -> V ---------- */
function latinMap(ch){
  const u=ch.toUpperCase();
  if(u==='J') return ' ';
  if(u==='U'||u==='W') return 'V';
  return ch;
}

/* ---------- typing ---------- */
let busy=false;

async function type(text, latin){
  if(busy) return;
  let chars=[...text].filter(c=>/[a-zA-Z ]/.test(c));
  if(latin) chars=chars.map(latinMap);
  if(!chars.length) return;
  busy=true;
  [...new Set(chars.filter(c=>c!==' ').map(c=>c.toLowerCase()))]
    .forEach(c=>loadImg(IMG_DIR+'/'+c+'.png'));

  // Reset view to a clean default so typing always starts visibly,
  // regardless of previous zoom/pan. Start at a fixed world anchor.
  const baseScreenX = 160, baseScreenY = viewport.clientHeight - 260;
  let start = { x: 0, y: 0 };          // world anchor (origin)
  scale = tScale = 1;
  panX = tPanX = baseScreenX;
  panY = tPanY = baseScreenY;
  applyTransform();

  let towerX = start.x;
  let x = towerX;
  let y = start.y;
  let baseline = start.y;     // current "underline" level for the running tower
  let prev=null, stepInTower=0;

  // baseline step per "tier" (every 3 hops of cross-family distance = one tier up).
  // Kept modest so towers don't drift too far apart vertically.
  const TIER = STONE * 0.30;

  for(const ch of chars){
    if(ch===' '){ prev=null; await sleep(150); continue; }

    if(prev===null){
      makeStone(ch, x, y, 0); stepInTower=1;
    }
    else if(!sameFamily(ch,prev)){
      // Different family -> start a NEW side tower.
      // Its baseline is lifted by tiers: 1..3 hops = 1 tier, 4..6 = 2, 7..9 = 3, ...
      await sleep(200);
      const fd = crossFamilyDistance(prev, ch);      // whole-graph hops (bridges incl.)
      const tier = Math.min(Math.ceil(fd/3), 4);     // cap at 4 tiers so it never spreads too far
      towerX += TOWER_GAP();
      baseline = start.y - tier*TIER;                // lifted underline for this group
      x = towerX; y = baseline;
      makeStone(ch, x, y, 0); stepInTower=1;
    }
    else{
      // Same family -> keep rising on the current tower; angle = within-family distance.
      const tilt=tiltFor(ch,prev);
      const dir=(stepInTower%2===0)?1:-1;
      const rad=tilt*Math.PI/180;
      x += Math.sin(rad)*STEP()*dir;
      y -= Math.cos(rad)*STEP();           // upward
      makeStone(ch, x, y, tilt*dir); stepInTower++;
    }
    if(prev) highlightPair(prev, ch);
    prev=ch;
    // Follow-cam: keep the newest stone comfortably in view as stacks grow (smoothed).
    const sx = x*tScale + tPanX;
    const sy = y*tScale + tPanY;
    const marginTop = 200, marginRight = 240;
    const barH = document.querySelector('.bar').offsetHeight + 40;
    let nx=tPanX, ny=tPanY;
    if(sy < marginTop)      ny += (marginTop - sy);
    if(sy > viewport.clientHeight - barH) ny -= (sy - (viewport.clientHeight - barH));
    if(sx > viewport.clientWidth - marginRight) nx -= (sx - (viewport.clientWidth - marginRight));
    if(sx < marginRight)    nx += (marginRight - sx);
    if(nx!==tPanX || ny!==tPanY) setTarget(nx, ny);
    await sleep(220);
  }
  busy=false;
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function clearStage(){ world.querySelectorAll('.stone').forEach(e=>e.remove()); zCounter=1; placed.length=0; }

/* ============================================================
   ZOOM & PAN  (smoothed via rAF interpolation)
   ============================================================ */
let scale=1, panX=0, panY=0;            // rendered values
let tScale=1, tPanX=0, tPanY=0;          // target values
let animating=false;

function applyTransform(){ world.style.transform='translate('+panX+'px,'+panY+'px) scale('+scale+')'; }
function screenToWorld(sx, sy){ return {x:(sx-tPanX)/tScale, y:(sy-tPanY)/tScale}; }

function ensureLoop(){
  if(animating) return; animating=true;
  const tick=()=>{
    const e=0.22;                        // easing factor (higher = snappier)
    scale += (tScale-scale)*e;
    panX  += (tPanX -panX )*e;
    panY  += (tPanY -panY )*e;
    applyTransform();
    if(Math.abs(tScale-scale)>0.0005 || Math.abs(tPanX-panX)>0.3 || Math.abs(tPanY-panY)>0.3){
      requestAnimationFrame(tick);
    }else{
      scale=tScale; panX=tPanX; panY=tPanY; applyTransform(); animating=false;
    }
  };
  requestAnimationFrame(tick);
}

function zoomAt(factor, sx, sy){
  const before=screenToWorld(sx,sy);
  tScale=Math.min(4, Math.max(0.05, tScale*factor));
  tPanX = sx - before.x*tScale;
  tPanY = sy - before.y*tScale;
  ensureLoop();
}
function setTarget(px,py,sc){ tPanX=px; tPanY=py; if(sc!=null) tScale=sc; ensureLoop(); }

// wheel zoom — smooth, proportional to scroll delta
viewport.addEventListener('wheel', e=>{
  e.preventDefault();
  const intensity = Math.min(Math.abs(e.deltaY), 60) / 60;   // 0..1
  const step = 1 + 0.18*intensity;                            // gentle per-event step
  const factor = e.deltaY < 0 ? step : 1/step;
  zoomAt(factor, e.clientX, e.clientY);
}, {passive:false});

// drag to pan — direct (1:1) for natural feel; sync targets so it doesn't snap back
let dragging=false, lastX=0, lastY=0;
viewport.addEventListener('pointerdown', e=>{
  if(e.target.closest('.bar')||e.target.closest('.zoombar')) return;
  dragging=true; lastX=e.clientX; lastY=e.clientY;
  // stop any easing and lock targets to current
  tScale=scale; tPanX=panX; tPanY=panY; animating=false;
  viewport.classList.add('panning'); viewport.setPointerCapture(e.pointerId);
});
viewport.addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx=e.clientX-lastX, dy=e.clientY-lastY;
  panX+=dx; panY+=dy; tPanX=panX; tPanY=panY;
  lastX=e.clientX; lastY=e.clientY; applyTransform();
});
viewport.addEventListener('pointerup', ()=>{ dragging=false; viewport.classList.remove('panning'); });
viewport.addEventListener('pointercancel', ()=>{ dragging=false; viewport.classList.remove('panning'); });

function fitAll(){
  if(!placed.length){ setTarget(0,0,1); return; }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of placed){
    minX=Math.min(minX,s.cx-STONE/2); minY=Math.min(minY,s.cy-STONE/2);
    maxX=Math.max(maxX,s.cx+STONE/2); maxY=Math.max(maxY,s.cy+STONE/2);
  }
  const pad=80;
  const w=maxX-minX+pad*2, h=maxY-minY+pad*2;
  const barH=document.querySelector('.bar').offsetHeight+20;
  const vw=viewport.clientWidth, vh=viewport.clientHeight-barH;
  const sc=Math.min(vw/w, vh/h, 1.2);
  setTarget(-(minX-pad)*sc + (vw-w*sc)/2, -(minY-pad)*sc + (vh-h*sc)/2, sc);
}

document.getElementById('zoomIn').onclick =()=> zoomAt(1.18, viewport.clientWidth/2, viewport.clientHeight/2);
document.getElementById('zoomOut').onclick=()=> zoomAt(1/1.18, viewport.clientWidth/2, viewport.clientHeight/2);
document.getElementById('zoomFit').onclick = fitAll;
document.getElementById('zoomReset').onclick=()=> setTarget(0,0,1);

// Arrow keys / WASD move the CAMERA in the pressed direction.
// (ArrowLeft = camera goes left = content shifts right.)
window.addEventListener('keydown', e=>{
  if(document.activeElement && document.activeElement.tagName==='INPUT') return;
  const STEP_PAN=140;
  let used=true;
  switch(e.key){
    case 'ArrowUp': case 'w': case 'W':    setTarget(tPanX, tPanY+STEP_PAN); break; // camera up
    case 'ArrowDown': case 's': case 'S':  setTarget(tPanX, tPanY-STEP_PAN); break; // camera down
    case 'ArrowLeft': case 'a': case 'A':  setTarget(tPanX-STEP_PAN, tPanY); break; // camera left
    case 'ArrowRight': case 'd': case 'D': setTarget(tPanX+STEP_PAN, tPanY); break; // camera right
    case '+': case '=': zoomAt(1.18, viewport.clientWidth/2, viewport.clientHeight/2); break;
    case '-': case '_': zoomAt(1/1.18, viewport.clientWidth/2, viewport.clientHeight/2); break;
    case '0': setTarget(0,0,1); break;
    case 'f': case 'F': fitAll(); break;
    default: used=false;
  }
  if(used) e.preventDefault();
});

/* ============================================================
   VERSION TOGGLE & SLIDERS
   ============================================================ */
function setVersion(dir, btnOn, btnOff){
  IMG_DIR=dir;
  btnOn.classList.add('active'); btnOff.classList.remove('active');
  // re-point existing stone images to new folder
  world.querySelectorAll('.stone img').forEach(im=>{
    const name=im.getAttribute('alt'); if(name) im.src=IMG_DIR+'/'+name+'.png';
  });
}
const verO=document.getElementById('verOriginal'), verD=document.getElementById('verDither');
verO.onclick=()=> setVersion('images', verO, verD);
verD.onclick=()=> setVersion('images-dither', verD, verO);

/* ============================================================
   GENEALOGY MINIMAP (black & white)
   ============================================================ */
// all relations drawn in grayscale; bridges dashed
const REL_BRIDGE=new Set(['친구','이웃','사제']);
// families distinguished by grayscale fill shade (no color)
const FAM_FILL={0:'#111',1:'#555',2:'#999',3:'#cfcfcf',9:'#eee'};
const FAM_TEXT={0:'#fff',1:'#fff',2:'#fff',3:'#222',9:'#222'};

function renderGraph(){
  const svg=document.getElementById('graphSvg');
  const W=300,H=300,P=24;
  const X=v=>P+v*(W-2*P), Y=v=>P+(1-v)*(H-2*P);
  let s='';
  for(const [a,b,r] of GRAPH_EDGES){
    const pa=GRAPH_NODES[a], pb=GRAPH_NODES[b];
    if(!pa||!pb) continue;
    const dash=REL_BRIDGE.has(r)?'stroke-dasharray="4 3"':'';
    s+=`<line id="ge_${a}_${b}" x1="${X(pa[0])}" y1="${Y(pa[1])}" x2="${X(pb[0])}" y2="${Y(pb[1])}" stroke="#888" stroke-width="1.4" ${dash}/>`;
  }
  for(const [n,p] of Object.entries(GRAPH_NODES)){
    const fam=famOf(n);
    s+=`<g><circle id="gn_${n}" cx="${X(p[0])}" cy="${Y(p[1])}" r="11" fill="${FAM_FILL[fam]}" stroke="#000" stroke-width="1.5"/>`;
    s+=`<text x="${X(p[0])}" y="${Y(p[1])+4}" font-size="11" font-weight="700" fill="${FAM_TEXT[fam]}" text-anchor="middle">${n}</text></g>`;
  }
  svg.innerHTML=s;
}

function highlightPair(a,b){
  const svg=document.getElementById('graphSvg');
  if(!svg) return;
  svg.querySelectorAll('circle').forEach(c=>{ c.setAttribute('stroke','#000'); c.setAttribute('stroke-width','1.5'); });
  const A=a.toUpperCase(),B=b.toUpperCase();
  const na=document.getElementById('gn_'+A), nb=document.getElementById('gn_'+B);
  [na,nb].forEach(el=>{ if(el){ el.setAttribute('stroke','#000'); el.setAttribute('stroke-width','4'); } });
  const d=distance(A,B), ang=tiltFor(A,B);
  const info=document.getElementById('graphInfo');
  if(info){
    const dtxt = d===null ? 'no relation' : d+' hop'+(d===1?'':'s');
    info.textContent = `${A} → ${B}:  ${dtxt}  →  ${Math.round(ang)}°`;
  }
}

document.getElementById('graphToggle').onclick=()=>{
  const p=document.getElementById('graphPanel');
  p.classList.toggle('hidden');
  if(!p.classList.contains('hidden') && !p.dataset.rendered){ renderGraph(); p.dataset.rendered='1'; }
};
document.getElementById('graphClose').onclick=()=> document.getElementById('graphPanel').classList.add('hidden');

/* ============================================================
   TRANSLATE — converts the input text to Latin in place
   ============================================================ */
async function translate(){
  const src=mainInput.value.trim(); if(!src) return;
  const btn=document.getElementById('translate'); const old=btn.textContent;
  btn.textContent='...'; btn.disabled=true;
  try{
    const url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(src)+'&langpair=en|la';
    const res=await fetch(url); const data=await res.json();
    mainInput.value=data?.responseData?.translatedText || src;
  }catch(e){
    btn.textContent='offline'; setTimeout(()=>btn.textContent=old,1200); btn.disabled=false; return;
  }
  btn.textContent=old; btn.disabled=false;
}

/* ============================================================
   EXPORT TRANSPARENT PNG
   ============================================================ */
const imgCache={};
function loadImg(src){
  if(imgCache[src]!==undefined) return Promise.resolve(imgCache[src]);
  return new Promise(res=>{
    const im=new Image(); im.crossOrigin='anonymous';
    im.onload=()=>{imgCache[src]=im;res(im);};
    im.onerror=()=>{imgCache[src]=null;res(null);};
    im.src=src;
  });
}
async function exportPNG(){
  if(!placed.length) return;
  const PAD=20;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of placed){
    minX=Math.min(minX,s.cx-STONE/2); minY=Math.min(minY,s.cy-STONE/2);
    maxX=Math.max(maxX,s.cx+STONE/2); maxY=Math.max(maxY,s.cy+STONE/2);
  }
  const W=Math.ceil(maxX-minX)+PAD*2, H=Math.ceil(maxY-minY)+PAD*2;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  const order=[...placed].sort((a,b)=>a.z-b.z);
  for(const s of order){
    const img=await loadImg(IMG_DIR+'/'+s.ch+'.png');
    const px=s.cx-minX+PAD, py=s.cy-minY+PAD;
    ctx.save(); ctx.translate(px,py); ctx.rotate(s.rot*Math.PI/180);
    if(img){ ctx.drawImage(img,-STONE/2,-STONE/2,STONE,STONE); }
    else{
      const r=STONE*0.15,w=STONE;
      ctx.fillStyle='#f0f0f0';ctx.strokeStyle='#ccc';ctx.lineWidth=2;
      roundRect(ctx,-w/2,-w/2,w,w,r);ctx.fill();ctx.stroke();
      ctx.fillStyle='#333';ctx.font='800 '+(STONE*0.42)+'px system-ui,sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s.ch.toUpperCase(),0,0);
    }
    ctx.restore();
  }
  cv.toBlob(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='stone-typing.png';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  },'image/png');
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}

/* ---------- wire typing ---------- */
const latinMode=document.getElementById('latinMode');
function doType(){ clearStage(); type(mainInput.value, latinMode.checked); }
document.getElementById('mainType').addEventListener('click', doType);
document.getElementById('translate').addEventListener('click', translate);
document.getElementById('clear').addEventListener('click', clearStage);
document.getElementById('save').addEventListener('click', exportPNG);
mainInput.addEventListener('keydown', e=>{ if(e.key==='Enter') doType(); });

applyTransform();