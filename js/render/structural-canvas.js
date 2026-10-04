import { state } from '../state.js';
import { fitTransform, getRenderTriangles } from './canvas-transform.js';
import { fillContourGradient, drawOutline, drawMeshWireframe } from './contour-canvas.js';
import { drawPreviewShape } from './shape-preview-canvas.js';
import { draw1DDomain } from './domain-1d-canvas.js';
import { showTip, hideTip } from './hover-tip.js';
import { bboxFor2DShape } from '../mesh/shape-info.js';
import { edgeSegments, cornerPositions } from '../mesh/structural-info.js';

/**
 * Canvas rendering for the Structural module:
 *
 * - drawStructuralField(): contour of a nodal field (|u|, von Mises, ...)
 *   on the (optionally exaggerated) deformed mesh, with the undeformed
 *   outline dashed behind it. Pass o.constant (a number) for a single-valued
 *   field to get one flat colour instead of a gradient. Like contour-canvas.js it works in raw
 *   device pixels (canvas._dpr scales literal sizes).
 * - attachFieldHover(): mouse readout for that contour, with a caller-
 *   supplied formatter (units differ per field).
 * - drawStructuralPreview() / drawBarPreview(): the supports-and-loads
 *   preview used on the BC step — the ordinary shape/bar drawing plus
 *   coloured supports and load arrows.
 * - drawBarChart() / attachBarChartHover(): 1D line chart (displacement
 *   or element stress along the bar) with an optional reference curve.
 *
 * The contour/fill/outline/wireframe routines themselves are reused from
 * contour-canvas.js; the deformed mesh is just a copy of the mesh with
 * displaced node positions.
 */

  const C_FIXED = '#C0483A', C_ROLLER = '#2F6FB5', C_LOAD = '#D9A441';

  /* ================= 2D deformed-contour plot ================= */
  export function drawStructuralField(cv, o){
    const ctx = cv.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    const W = cv.width, H = cv.height, dpr = cv._dpr || 1;
    ctx.clearRect(0,0,W,H);
    let { mesh, values, min, max, ux, uy } = o;
    if(o.constant!==undefined){
      // Single-valued field: paint one flat colour (middle of the scale) instead of
      // stretching round-off noise over the whole rainbow. `values` keeps the
      // true constant so the hover readout still reports it.
      values = new Float64Array(mesh.nodes.length).fill(o.constant);
      min = o.constant - 1; max = o.constant + 1;
    }
    const scale = o.scale || 0;
    const dnodes = mesh.nodes.map((nd,i)=>({ x:nd.x+scale*ux[i], y:nd.y+scale*uy[i] }));
    const dmesh = { nodes:dnodes, elements:mesh.elements, order:mesh.order, boundaries:mesh.boundaries, bbox:mesh.bbox };

    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for(const arr of [mesh.nodes, dnodes]) for(const nd of arr){
      if(nd.x<minX) minX=nd.x; if(nd.x>maxX) maxX=nd.x;
      if(nd.y<minY) minY=nd.y; if(nd.y>maxY) maxY=nd.y;
    }
    const w = (maxX-minX)||1, h = (maxY-minY)||1;
    const pad = 26*dpr;
    const s = Math.min((W-2*pad)/w, (H-2*pad)/h);
    const offX = pad + ((W-2*pad)-w*s)/2, offY = pad + ((H-2*pad)-h*s)/2;
    const tf = (x,y)=> [offX + (x-minX)*s, H - (offY + (y-minY)*s)];

    fillContourGradient(cv, dmesh, values, min, max, tf);
    ctx.strokeStyle = '#3A4145'; ctx.lineWidth = 1.4*dpr;
    drawOutline(ctx, dmesh, tf);
    if(scale>0 && o.showUndeformed){
      ctx.save();
      ctx.setLineDash([6*dpr,4*dpr]); ctx.strokeStyle = 'rgba(58,65,69,0.75)'; ctx.lineWidth = 1.2*dpr;
      drawOutline(ctx, mesh, tf);
      ctx.restore();
    }
    if(o.wire) drawMeshWireframe(cv, dmesh, tf);
    cv._hoverData = { mesh:dmesh, T:values, tf };
  }

  /* Mouse readout for the contour above; fmt(value) -> text. */
  export function attachFieldHover(cv, fmt){
    cv.style.cursor = 'crosshair';
    cv.addEventListener('mousemove', (e)=>{
      const data = cv._hoverData;
      if(!data){ hideTip(); return; }
      const rect = cv.getBoundingClientRect();
      const px = (e.clientX-rect.left) * (cv.width/rect.width);
      const py = (e.clientY-rect.top) * (cv.height/rect.height);
      const { mesh, T, tf } = data;
      const eps = -0.002;
      for(const [a,b,c] of getRenderTriangles(mesh)){
        const A=mesh.nodes[a], B=mesh.nodes[b], C=mesh.nodes[c];
        const [ax,ay]=tf(A.x,A.y), [bx,by]=tf(B.x,B.y), [cx,cy]=tf(C.x,C.y);
        const denom = (by-cy)*(ax-cx) + (cx-bx)*(ay-cy);
        if(Math.abs(denom) < 1e-10) continue;
        const w1 = ((by-cy)*(px-cx) + (cx-bx)*(py-cy)) / denom;
        const w2 = ((cy-ay)*(px-cx) + (ax-cx)*(py-cy)) / denom;
        const w3 = 1-w1-w2;
        if(w1>=eps && w2>=eps && w3>=eps){
          showTip(e.clientX, e.clientY, fmt(w1*T[a] + w2*T[b] + w3*T[c]));
          return;
        }
      }
      hideTip();
    });
    cv.addEventListener('mouseleave', hideTip);
  }

  /* ================= Supports / loads preview (BC step) ================= */
  function arrow(ctx, x0, y0, x1, y1, color){
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    const ang = Math.atan2(y1-y0, x1-x0), hl = 8;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x1-hl*Math.cos(ang-0.45), y1-hl*Math.sin(ang-0.45));
    ctx.lineTo(x1-hl*Math.cos(ang+0.45), y1-hl*Math.sin(ang+0.45));
    ctx.closePath(); ctx.fill();
  }

  export function drawStructuralPreview(cv, highlight){
    drawPreviewShape(cv, highlight);
    const ctx = cv.getContext('2d');
    const W = cv._cssW || cv.width, H = cv._cssH || cv.height;
    const tf = fitTransform(bboxFor2DShape(), W, H, 30);
    const segs = edgeSegments();
    for(const [name, seg] of Object.entries(segs)){
      const bc = state.sbc[name];
      if(!bc || bc.type==='free') continue;
      const [a,b] = seg;
      const [ax,ay] = tf(a[0],a[1]), [bx,by] = tf(b[0],b[1]);
      ctx.lineCap = 'round';
      if(bc.type==='fixed' || bc.type==='roller_x' || bc.type==='roller_y'){
        ctx.strokeStyle = bc.type==='fixed' ? C_FIXED : C_ROLLER; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
      } else if(bc.type==='traction'){
        ctx.strokeStyle = C_LOAD; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
        const mag = Math.hypot(bc.tx, bc.ty);
        if(mag>0){
          const dx = bc.tx/mag, dy = -bc.ty/mag; // screen y points down
          for(const f of [0.2,0.5,0.8]){
            const px = ax+(bx-ax)*f, py = ay+(by-ay)*f;
            arrow(ctx, px, py, px+dx*26, py+dy*26, '#A87715');
          }
        }
      }
    }
    // corner point loads
    const pos = cornerPositions();
    for(const [key, pl] of Object.entries(state.spl)){
      const p = pos[key];
      if(!p) continue;
      const mag = Math.hypot(pl.fx, pl.fy);
      if(mag===0) continue;
      const [px,py] = tf(p[0],p[1]);
      arrow(ctx, px, py, px+(pl.fx/mag)*36, py-(pl.fy/mag)*36, '#7A5420');
      ctx.fillStyle = '#7A5420'; ctx.beginPath(); ctx.arc(px,py,3.5,0,Math.PI*2); ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  export function drawBarPreview(cv, length, highlight){
    const {x0,x1,y0} = draw1DDomain(cv, length, { highlight });
    const ctx = cv.getContext('2d');
    for(const [name,x,outDir] of [['left',x0,-1],['right',x1,1]]){
      const bc = state.sbc[name];
      if(!bc || bc.type==='free') continue;
      if(bc.type==='fixed'){
        ctx.strokeStyle = C_FIXED; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x,y0-18); ctx.lineTo(x,y0+18); ctx.stroke();
        ctx.lineWidth = 1.5;
        for(let k=-3;k<=3;k++){
          ctx.beginPath(); ctx.moveTo(x, y0+k*5.5); ctx.lineTo(x+outDir*9, y0+k*5.5+7); ctx.stroke();
        }
      } else if(bc.type==='load' && bc.value!==0){
        const dir = Math.sign(bc.value);
        arrow(ctx, x, y0-16, x+dir*42, y0-16, '#A87715');
      }
    }
  }

  /* ================= 1D line chart ================= */
  /**
   * o = { L, series:[{label,color,dash,width,markers,lines:[[{x,y}...],...]}],
   *       yLabel, fmtY(v), yRange:[lo,hi] (optional fixed axis), xUnit (default ' m'),
   *       vline (optional x of a vertical cursor) }
   * x in metres, y already in display units. series[0] is the numerical
   * result the hover readout reports; later series are reference curves.
   */
  export function drawBarChart(cv, o){
    const ctx = cv.getContext('2d');
    const dpr = cv._dpr || 1;
    const W = cv._cssW || cv.width, H = cv._cssH || cv.height;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    const padL=64, padR=20, padT=26, padB=40;
    const plotW = W-padL-padR, plotH = H-padT-padB;
    let ymin=0, ymax=0;
    for(const s of o.series) for(const line of s.lines) for(const p of line){
      if(p.y<ymin) ymin=p.y; if(p.y>ymax) ymax=p.y;
    }
    if(o.yRange){ ymin = o.yRange[0]; ymax = o.yRange[1]; }
    if(ymax-ymin < 1e-12){ ymax += 1; ymin -= 1; }
    const span = ymax-ymin; if(!o.yRange){ ymax += 0.08*span; if(ymin<0) ymin -= 0.08*span; }
    const xToPx = x => padL + (x/o.L)*plotW;
    const yToPx = y => padT + plotH - ((y-ymin)/(ymax-ymin))*plotH;

    ctx.strokeStyle = '#E6EAEA'; ctx.lineWidth = 1;
    ctx.fillStyle = '#7C8588'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for(let i=0;i<=4;i++){
      const v = ymin + (ymax-ymin)*i/4, py = yToPx(v);
      ctx.beginPath(); ctx.moveTo(padL,py); ctx.lineTo(padL+plotW,py); ctx.stroke();
      ctx.fillText(o.fmtY(v), padL-6, py+4);
    }
    ctx.textAlign = 'center';
    for(let i=0;i<=4;i++){
      const x = o.L*i/4;
      ctx.fillText(x.toFixed(2)+(i===4 ? (o.xUnit!==undefined ? o.xUnit : ' m') : ''), xToPx(x), padT+plotH+16);
    }
    ctx.strokeStyle = '#7C8588'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(padL,padT); ctx.lineTo(padL,padT+plotH); ctx.lineTo(padL+plotW,padT+plotH); ctx.stroke();
    if(ymin<0 && ymax>0){
      ctx.strokeStyle = '#B9C2C0'; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(padL,yToPx(0)); ctx.lineTo(padL+plotW,yToPx(0)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = '#3A4145'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(o.yLabel, padL, 16);

    if(o.vline!==undefined){ // optional vertical cursor (e.g. the current time on a time-history chart)
      ctx.strokeStyle = '#C0483A'; ctx.lineWidth = 1.2; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(xToPx(o.vline),padT); ctx.lineTo(xToPx(o.vline),padT+plotH); ctx.stroke(); ctx.setLineDash([]);
    }

    // draw reference curves first so the numerical result sits on top
    for(const s of [...o.series].reverse()){
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2.4;
      ctx.setLineDash(s.dash || []);
      for(const line of s.lines){
        ctx.beginPath();
        line.forEach((p,i)=>{ const px=xToPx(p.x), py=yToPx(p.y); if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if(s.markers){
        ctx.fillStyle = s.color;
        for(const line of s.lines) for(const p of line){ ctx.beginPath(); ctx.arc(xToPx(p.x), yToPx(p.y), 2.8, 0, Math.PI*2); ctx.fill(); }
      }
    }
    // legend
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    o.series.forEach((s,i)=>{
      const lx = padL+plotW-170, ly = padT+6+i*16;
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.4; ctx.setLineDash(s.dash || []);
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx+16,ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#3A4145'; ctx.fillText(s.label, lx+22, ly+4);
    });
    cv._barData = { primary:o.series[0].lines, xToPx, fmtY:o.fmtY, xName:'x' };
  }

  export function attachBarChartHover(cv, fmtPoint){
    cv.style.cursor = 'crosshair';
    cv.addEventListener('mousemove', (e)=>{
      const d = cv._barData;
      if(!d){ hideTip(); return; }
      const rect = cv.getBoundingClientRect();
      const mx = (e.clientX-rect.left) * ((cv._cssW || cv.width)/rect.width);
      let best = null, bestDist = Infinity;
      for(const line of d.primary){
        for(let i=0;i<line.length-1;i++){
          const a = line[i], b = line[i+1];
          const pa = d.xToPx(a.x), pb = d.xToPx(b.x);
          const lo = Math.min(pa,pb), hi = Math.max(pa,pb);
          if(mx>=lo && mx<=hi){
            const f = hi>lo ? (mx-pa)/(pb-pa) : 0;
            const x = a.x + f*(b.x-a.x), y = a.y + f*(b.y-a.y);
            const dist = 0;
            if(dist<bestDist){ bestDist = dist; best = {x,y}; }
          }
        }
        for(const p of line){
          const dist = Math.abs(d.xToPx(p.x)-mx);
          if(dist<bestDist){ bestDist = dist; best = p; }
        }
      }
      if(best) showTip(e.clientX, e.clientY, fmtPoint(best));
    });
    cv.addEventListener('mouseleave', hideTip);
  }
