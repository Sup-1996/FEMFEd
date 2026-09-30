/**
 * Quality triangular mesh for a freeform simple polygon.
 *
 * Pipeline (all dependency-free):
 *   1. Discretize every polygon edge into roughly equal pieces of length ~h.
 *   2. Build a Delaunay triangulation of the points (incremental
 *      Bowyer-Watson inside a large super-triangle).
 *   3. Ruppert refinement:
 *        - a boundary segment is split at its midpoint whenever some vertex
 *          lies inside (or on) its diametral circle ("encroached") — once no
 *          segment is encroached, every boundary segment is guaranteed to be
 *          an edge of the Delaunay triangulation, so no constrained-edge
 *          recovery is needed;
 *        - a triangle inside the polygon is refined by inserting its
 *          circumcenter when it is too big (circumradius > ~h) or too skinny
 *          (circumradius / shortest edge > RADIUS_EDGE_BOUND, i.e. a minimum
 *          angle of about 20.7 degrees); if that circumcenter would encroach
 *          a segment (or fall outside the polygon), the encroached segment(s)
 *          are split instead.
 *   4. Drop triangles outside the polygon, then a few passes of Laplacian
 *      smoothing of the interior nodes (a move is only accepted if no
 *      incident triangle flips).
 *   5. Validate (every boundary segment present as an edge; triangle areas
 *      sum to the polygon area). Anything that fails validation returns null
 *      so the caller can fall back to the older mesher instead of handing the
 *      solver a broken mesh.
 *
 * The target element count is a cap, like the rectangle mesher's: h is
 * calibrated over a few runs so the result lands just under maxElements.
 *
 * Output matches the other mesh builders: { nodes, elements, boundaries,
 * bbox } with boundaries['edge'+i] = ordered node chain from polygon
 * vertex i to vertex i+1 (including the nodes added along the way), which
 * quadratic-mesh.js and the solver's edge integrals rely on.
 */

const SUPER = 3;                 // indices 0..2 are the super-triangle's corners
const RADIUS_EDGE_BOUND = 1.414; // Ruppert's classic bound (~20.7 deg min angle)
const K = 1 << 20;               // edge-key multiplier (point indices stay far below this)

function polygonAreaAbs(V){
  let a = 0;
  for(let i=0;i<V.length;i++){
    const p = V[i], q = V[(i+1)%V.length];
    a += p.x*q.y - q.x*p.y;
  }
  return Math.abs(a)/2;
}

function pointInPolygon(x, y, V){
  let inside = false;
  for(let i=0, j=V.length-1; i<V.length; j=i++){
    const xi=V[i].x, yi=V[i].y, xj=V[j].x, yj=V[j].y;
    if(((yi>y) !== (yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi) + xi)) inside = !inside;
  }
  return inside;
}

/* One full meshing run for a given target edge length h. Returns
   { pts, tris, chains } or null if the run could not be completed/validated. */
function runMesh(V, h, opts){
  const n = V.length;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for(const v of V){ minX=Math.min(minX,v.x); maxX=Math.max(maxX,v.x); minY=Math.min(minY,v.y); maxY=Math.max(maxY,v.y); }
  const size = Math.max(maxX-minX, maxY-minY) || 1;
  const areaEps = 1e-14 * size * size;
  const polyArea = polygonAreaAbs(V);
  let budget = opts.budget;

  /* ---- points, triangles ---- */
  const pts = [];
  const cx0 = (minX+maxX)/2, cy0 = (minY+maxY)/2, M = 50*size;
  pts.push({x:cx0-M, y:cy0-M}, {x:cx0+M, y:cy0-M}, {x:cx0, y:cy0+M});

  let tris = [];
  let deadCount = 0;
  let collectNew = false;      // phase B: push newly created inside triangles to the work queue
  const triQueue = [];

  function makeTri(a, b, c){
    const A = pts[a], B = pts[b], C = pts[c];
    const cross = (B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x);
    if(Math.abs(cross) < 2*areaEps) return null;
    if(cross < 0){ const t=b; b=c; c=t; }
    const P = pts[a], Q = pts[b], R = pts[c];
    const bx=Q.x-P.x, by=Q.y-P.y, cx=R.x-P.x, cy=R.y-P.y;
    const d = 2*(bx*cy - by*cx);
    const b2=bx*bx+by*by, c2=cx*cx+cy*cy;
    const ux=(cy*b2 - by*c2)/d, uy=(bx*c2 - cx*b2)/d;
    return { a, b, c, cx:P.x+ux, cy:P.y+uy, r2:ux*ux+uy*uy, alive:true, inside:false, skip:false };
  }

  function classify(t){
    if(t.a<SUPER || t.b<SUPER || t.c<SUPER) return false;
    const A=pts[t.a], B=pts[t.b], C=pts[t.c];
    return pointInPolygon((A.x+B.x+C.x)/3, (A.y+B.y+C.y)/3, V);
  }

  tris.push(makeTri(0,1,2));

  /* Bowyer-Watson insertion. Returns the new point's index, or -1 if the
     insertion was rejected (duplicate point / degenerate result). */
  function insertPoint(x, y){
    const bad = [];
    for(let i=0;i<tris.length;i++){
      const t = tris[i];
      if(!t.alive) continue;
      const dx = x-t.cx, dy = y-t.cy;
      if(dx*dx + dy*dy < t.r2*(1-1e-12)) bad.push(t);
    }
    if(!bad.length) return -1;
    const dupTol2 = (1e-7*size)*(1e-7*size);
    const edges = new Map();
    for(const t of bad){
      for(const k of [0,1,2]){
        const u = k===0?t.a:(k===1?t.b:t.c), v = k===0?t.b:(k===1?t.c:t.a);
        const pu = pts[u];
        if((pu.x-x)*(pu.x-x)+(pu.y-y)*(pu.y-y) < dupTol2) return -1;
        const key = u<v ? u*K+v : v*K+u;
        const e = edges.get(key);
        if(e) e.count++; else edges.set(key, {u, v, count:1});
      }
    }
    const p = pts.length;
    pts.push({x, y});
    const created = [];
    for(const e of edges.values()){
      if(e.count !== 1) continue;
      const t = makeTri(e.u, e.v, p);
      if(!t){ pts.pop(); return -1; }
      created.push(t);
    }
    for(const t of bad) t.alive = false;
    deadCount += bad.length;
    for(const t of created){
      t.inside = classify(t);
      tris.push(t);
      if(collectNew && t.inside) triQueue.push(t);
    }
    if(deadCount > 3000 && deadCount > tris.length/2){
      tris = tris.filter(t=>t.alive);
      deadCount = 0;
    }
    return p;
  }

  /* ---- boundary segments (directed along the polygon's own direction) ---- */
  let segs = [];
  const segQueue = [];
  const minSeg = 0.08*h;

  function addSeg(a, b, edge){
    const s = {a, b, edge, alive:true};
    segs.push(s);
    return s;
  }
  function encroachedBy(s, px, py, idx){
    if(idx===s.a || idx===s.b) return false;
    const A = pts[s.a], B = pts[s.b];
    const mx=(A.x+B.x)/2, my=(A.y+B.y)/2;
    const r2 = ((A.x-B.x)*(A.x-B.x) + (A.y-B.y)*(A.y-B.y))/4;
    return (px-mx)*(px-mx) + (py-my)*(py-my) <= r2*(1+1e-9);
  }
  function isEncroached(s){
    for(let i=SUPER;i<pts.length;i++){
      if(encroachedBy(s, pts[i].x, pts[i].y, i)) return true;
    }
    return false;
  }
  function splitSeg(s){
    const A = pts[s.a], B = pts[s.b];
    if(Math.hypot(A.x-B.x, A.y-B.y) < minSeg) return false;
    const m = insertPoint((A.x+B.x)/2, (A.y+B.y)/2);
    if(m < 0) return false;
    s.alive = false;
    const s1 = addSeg(s.a, m, s.edge), s2 = addSeg(m, s.b, s.edge);
    segQueue.push(s1, s2);
    for(const t of segs){
      if(t.alive && t!==s1 && t!==s2 && encroachedBy(t, pts[m].x, pts[m].y, m)) segQueue.push(t);
    }
    if(segs.length > 400 && segs.filter(t=>!t.alive).length > segs.length/2) segs = segs.filter(t=>t.alive);
    return true;
  }
  function processSegments(){
    while(segQueue.length){
      if(--budget < 0) throw new Error('mesh budget exceeded');
      const s = segQueue.pop();
      if(!s.alive) continue;
      if(isEncroached(s)) splitSeg(s);
    }
  }

  /* ---- Phase A: boundary points + segments ---- */
  for(let i=0;i<n;i++){
    if(insertPoint(V[i].x, V[i].y) < 0) return null;   // duplicate/degenerate vertex
  }
  for(let i=0;i<n;i++){
    const P = V[i], Q = V[(i+1)%n];
    const len = Math.hypot(Q.x-P.x, Q.y-P.y);
    if(len < 1e-12) return null;
    const k = Math.max(1, Math.round(len/h));
    let prev = i + SUPER;
    for(let j=1;j<k;j++){
      const idx = insertPoint(P.x+(Q.x-P.x)*j/k, P.y+(Q.y-P.y)*j/k);
      if(idx < 0) return null;
      addSeg(prev, idx, i);
      prev = idx;
    }
    addSeg(prev, ((i+1)%n) + SUPER, i);
  }
  for(const s of segs) segQueue.push(s);
  processSegments();

  /* ---- Phase B: Ruppert refinement of the interior ---- */
  collectNew = true;
  for(const t of tris) if(t.alive && t.inside) triQueue.push(t);
  const hR = 0.62*h;               // size bound (an equilateral triangle of side h has R = 0.577h)
  const minQ = 0.15*h;             // don't chase shape below this edge length (acute corners)
  let head = 0;
  while(head < triQueue.length){
    if(--budget < 0) throw new Error('mesh budget exceeded');
    const t = triQueue[head++];
    if(head > 5000){ triQueue.splice(0, head); head = 0; }
    if(!t.alive || !t.inside || t.skip) continue;
    const A=pts[t.a], B=pts[t.b], C=pts[t.c];
    const l1=Math.hypot(A.x-B.x,A.y-B.y), l2=Math.hypot(B.x-C.x,B.y-C.y), l3=Math.hypot(C.x-A.x,C.y-A.y);
    const lmin = Math.min(l1,l2,l3);
    const R = Math.sqrt(t.r2);
    const needs = R > hR || (R/lmin > RADIUS_EDGE_BOUND && lmin > minQ);
    if(!needs) continue;

    const enc = [];
    for(const s of segs) if(s.alive && encroachedBy(s, t.cx, t.cy, -1)) enc.push(s);
    if(enc.length || !pointInPolygon(t.cx, t.cy, V)){
      if(!enc.length){ t.skip = true; continue; }
      let did = false;
      for(const s of enc) if(s.alive && splitSeg(s)) did = true;
      processSegments();
      if(did && t.alive) triQueue.push(t); else if(!did) t.skip = true;
      continue;
    }
    if(insertPoint(t.cx, t.cy) < 0) t.skip = true;
  }

  /* ---- Phase C: collect result ---- */
  const inside = tris.filter(t=>t.alive && t.inside);
  if(!inside.length) return null;

  // validation 1: areas add up to the polygon's area (no gaps / overlaps)
  let areaSum = 0;
  for(const t of inside){
    const A=pts[t.a], B=pts[t.b], C=pts[t.c];
    areaSum += Math.abs((B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x))/2;
  }
  if(Math.abs(areaSum - polyArea) > 1e-6*polyArea) return null;

  // validation 2: every live boundary segment is an edge of an inside triangle
  const edgeSet = new Set();
  for(const t of inside){
    for(const [u,v] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]]) edgeSet.add(u<v ? u*K+v : v*K+u);
  }
  const liveSegs = segs.filter(s=>s.alive);
  for(const s of liveSegs){
    const key = s.a<s.b ? s.a*K+s.b : s.b*K+s.a;
    if(!edgeSet.has(key)) return null;
  }

  // ordered node chain for each polygon edge
  const chains = [];
  for(let i=0;i<n;i++){
    const next = new Map();
    for(const s of liveSegs) if(s.edge===i) next.set(s.a, s.b);
    const chain = [i+SUPER];
    let cur = i+SUPER;
    const end = ((i+1)%n)+SUPER;
    let guard = 0;
    while(cur !== end){
      cur = next.get(cur);
      if(cur === undefined || ++guard > 100000) return null;
      chain.push(cur);
    }
    chains.push(chain);
  }

  /* ---- Laplacian smoothing of interior nodes ---- */
  const boundary = new Set();
  for(const s of liveSegs){ boundary.add(s.a); boundary.add(s.b); }
  const incident = new Map();
  const neighbors = new Map();
  for(const t of inside){
    for(const [u,v,w] of [[t.a,t.b,t.c],[t.b,t.c,t.a],[t.c,t.a,t.b]]){
      if(!incident.has(u)){ incident.set(u, []); neighbors.set(u, new Set()); }
      incident.get(u).push(t);
      neighbors.get(u).add(v); neighbors.get(u).add(w);
    }
  }
  const triArea2 = (t)=>{
    const A=pts[t.a], B=pts[t.b], C=pts[t.c];
    return (B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x);
  };
  const minAngleOf = (t)=>{
    const P=[pts[t.a],pts[t.b],pts[t.c]];
    let m = Math.PI;
    for(let i=0;i<3;i++){
      const A=P[i], B=P[(i+1)%3], C=P[(i+2)%3];
      const ux=B.x-A.x, uy=B.y-A.y, vx=C.x-A.x, vy=C.y-A.y;
      const c = (ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy));
      m = Math.min(m, Math.acos(Math.max(-1,Math.min(1,c))));
    }
    return m;
  };
  for(let pass=0; pass<opts.smoothPasses; pass++){
    for(const [i, nb] of neighbors){
      if(boundary.has(i)) continue;
      let sx=0, sy=0;
      for(const j of nb){ sx+=pts[j].x; sy+=pts[j].y; }
      const nx = sx/nb.size, ny = sy/nb.size;
      const ox = pts[i].x, oy = pts[i].y;
      const inc = incident.get(i);
      let before = Infinity; for(const t of inc) before = Math.min(before, minAngleOf(t));
      pts[i].x = nx; pts[i].y = ny;
      let ok = true, after = Infinity;
      for(const t of inc){
        if(triArea2(t) <= 2*areaEps){ ok = false; break; }
        after = Math.min(after, minAngleOf(t));
      }
      // keep the move only if nothing flipped AND the worst incident angle didn't get worse
      if(!ok || after < before - 1e-9){ pts[i].x = ox; pts[i].y = oy; }
    }
  }

  return { pts, tris: inside, chains };
}

/**
 * Public entry: mesh `vertices` (simple polygon, any winding) with at most
 * about `maxElements` triangles. Returns a mesh object, or null if the
 * mesher could not produce a validated result.
 */
export function buildQualityPolygonMesh(vertices, maxElements){
  const V = vertices;
  const A = polygonAreaAbs(V);
  if(V.length < 3 || A < 1e-12) return null;
  const maxEl = Math.max(1, maxElements);
  const opts = { budget: 60*maxEl + 20000, smoothPasses: 8 };

  // a mesh of equilateral triangles with side h has A / (0.433 h^2) elements;
  // Ruppert output runs somewhat denser, hence the 1.2 fudge for the first guess
  let h = Math.sqrt(A/(0.433*maxEl)) * 1.2;
  let best = null, smallest = null;
  for(let iter=0; iter<9; iter++){
    let res = null;
    try{ res = runMesh(V, h, opts); } catch(e){ res = null; }
    if(!res){ h *= 1.15; continue; }
    const cnt = res.tris.length;
    if(!smallest || cnt < smallest.cnt) smallest = { res, cnt, h };
    if(cnt <= maxEl){
      if(!best || cnt > best.cnt) best = { res, cnt, h };
      if(cnt >= 0.85*maxEl) break;
    }
    // aim for ~93% of the cap; element count scales roughly like 1/h^2
    let f = Math.sqrt(cnt/(0.93*maxEl));
    f = Math.max(0.6, Math.min(1.6, f));
    if(Math.abs(f-1) < 0.02) f = cnt > maxEl ? 1.05 : 0.98;
    h *= f;
  }
  // Cap unreachable so far (absurdly small maxElements): coarsen h until it
  // fits, or settle for the coarsest mesh found.
  if(!best && smallest){
    let hh = smallest.h;
    for(let iter=0; iter<6 && smallest.cnt > maxEl; iter++){
      hh *= 1.6;
      let res = null;
      try{ res = runMesh(V, hh, opts); } catch(e){ res = null; }
      if(res && res.tris.length < smallest.cnt) smallest = { res, cnt:res.tris.length, h:hh };
    }
    if(smallest.cnt <= maxEl) best = smallest;
  }
  const chosen = best || smallest;
  if(!chosen) return null;

  const { pts, tris, chains } = chosen.res;
  const nodes = [];
  for(let i=SUPER;i<pts.length;i++) nodes.push({x:pts[i].x, y:pts[i].y});
  const elements = tris.map(t=>[t.a-SUPER, t.b-SUPER, t.c-SUPER]);
  const boundaries = {};
  chains.forEach((chain, i)=>{ boundaries['edge'+i] = chain.map(idx=>idx-SUPER); });

  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for(const v of V){ minX=Math.min(minX,v.x); maxX=Math.max(maxX,v.x); minY=Math.min(minY,v.y); maxY=Math.max(maxY,v.y); }
  return { nodes, elements, boundaries, bbox:{w:maxX-minX, h:maxY-minY} };
}
