import { state } from '../state.js';
import { rainbowColorRGB, rainbowColor } from './colormap.js';
import { fitTransform, getRenderTriangles } from './canvas-transform.js';
import { showTip, hideTip } from './hover-tip.js';

/**
 * 2D contour-plot rendering: per-pixel (Gouraud-style) gradient fill of
 * a mesh's temperature field, the mesh/shape outline, the colorbar
 * legend, the optional mesh-wireframe overlay, the mouse-hover
 * temperature readout, and the small side-by-side "exact solution"
 * contour.
 *
 * Unlike the other render/*.js files, this one deliberately keeps
 * working in the canvas's real (device-pixel) buffer size rather than
 * its CSS-pixel size — createImageData/putImageData always operate in
 * device pixels regardless of any canvas transform, so filling at full
 * backing-store resolution is what makes the gradient crisp on a
 * high-density screen. The tradeoff: literal padding/line-width values
 * are scaled by canvas._dpr (see render/hidpi.js) so they still look
 * the intended CSS-pixel size once the browser scales the larger
 * buffer back down to the canvas's displayed CSS size.
 *
 * highlightEdge() is not currently called anywhere in the app (the BC
 * step highlights edges via drawPreviewShape/draw1DDomain instead) -
 * kept here, exported, in case a future BC-step redesign wants to
 * highlight an edge directly on the meshed/contoured canvas.
 */

  /* ---- True per-pixel (Gouraud-style) smooth gradient contour fill ---- */
  export function fillContourGradient(canvas, mesh, T, min, max, tf){
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    for(let i=0;i<data.length;i+=4){ data[i]=255; data[i+1]=255; data[i+2]=255; data[i+3]=255; }
    const range = (max-min) || 1;

      for(const [a,b,c] of getRenderTriangles(mesh)){
        const A=mesh.nodes[a], B=mesh.nodes[b], C=mesh.nodes[c];
        const [ax,ay]=tf(A.x,A.y), [bx,by]=tf(B.x,B.y), [cx,cy]=tf(C.x,C.y);
        const denom = (by-cy)*(ax-cx) + (cx-bx)*(ay-cy);
        if(Math.abs(denom) < 1e-10) continue;
        const minX = Math.max(0, Math.floor(Math.min(ax,bx,cx)));
        const maxX = Math.min(W-1, Math.ceil(Math.max(ax,bx,cx)));
        const minY = Math.max(0, Math.floor(Math.min(ay,by,cy)));
        const maxY = Math.min(H-1, Math.ceil(Math.max(ay,by,cy)));
        const Ta=T[a], Tb=T[b], Tc=T[c];
        const eps = -0.002;
        for(let py=minY; py<=maxY; py++){
          for(let px=minX; px<=maxX; px++){
            const fx=px+0.5, fy=py+0.5;
            const w1 = ((by-cy)*(fx-cx) + (cx-bx)*(fy-cy)) / denom;
            const w2 = ((cy-ay)*(fx-cx) + (ax-cx)*(fy-cy)) / denom;
            const w3 = 1-w1-w2;
            if(w1>=eps && w2>=eps && w3>=eps){
              const val = w1*Ta + w2*Tb + w3*Tc;
              const [r,g,bl] = rainbowColorRGB((val-min)/range);
              const idx = (py*W+px)*4;
              data[idx]=r; data[idx+1]=g; data[idx+2]=bl; data[idx+3]=255;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);
  }

  export function drawMeshCanvas(canvas, mesh, showResults, overrideData){
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0); // this canvas draws in raw device pixels throughout, see file header
    const W = canvas.width, H = canvas.height;
    const dpr = canvas._dpr || 1;
    ctx.clearRect(0,0,W,H);
    const tf = fitTransform(mesh.bbox, W, H, 26*dpr);
    const T = overrideData ? overrideData.T : (showResults && state.results ? state.results.T : null);
    const min = overrideData ? overrideData.min : (T ? state.results.min : 0);
    const max = overrideData ? overrideData.max : (T ? state.results.max : 1);

   if(T){
     fillContourGradient(canvas, mesh, T, min, max, tf);
   } else {
     for(const [a,b,c] of getRenderTriangles(mesh)){
       const A=mesh.nodes[a], B=mesh.nodes[b], C=mesh.nodes[c];
       const [ax,ay]=tf(A.x,A.y), [bx,by]=tf(B.x,B.y), [cx,cy]=tf(C.x,C.y);
       ctx.beginPath();
       ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy); ctx.closePath();
       ctx.fillStyle = '#EEF3F1';
       ctx.fill();
       ctx.strokeStyle = 'rgba(58,65,69,0.35)';
       ctx.lineWidth = 0.6*dpr;
       ctx.stroke();
          }
      }

      // boundary highlight (only in bc step, drawn separately) — outline shape
      ctx.strokeStyle = '#3A4145';
      ctx.lineWidth = 1.4*dpr;
      drawOutline(ctx, mesh, tf);

      // Feeds attachContourHover() (below): the mouse handler reads this
      // fresh off the canvas element on every mousemove, so redrawing
      // (a new time step, a re-solve) automatically keeps hover current
      // without needing to re-attach anything. Only set when there's an
      // actual temperature field to report — hovering a bare mesh
      // preview shows no tooltip.
      canvas._hoverData = T ? { mesh, T, min, max, tf } : null;
  }

  /* ---- Optional wireframe overlay: call right after drawMeshCanvas()
     (never instead of it — this draws on top, it doesn't clear first)
     when the user wants to see element boundaries against the contour
     fill. ---- */
  export function drawMeshWireframe(canvas, mesh, tf){
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    const dpr = canvas._dpr || 1;
    ctx.strokeStyle = 'rgba(24,34,38,0.35)';
    ctx.lineWidth = 0.6*dpr;
    for(const [a,b,c] of getRenderTriangles(mesh)){
      const A=mesh.nodes[a], B=mesh.nodes[b], C=mesh.nodes[c];
      const [ax,ay]=tf(A.x,A.y), [bx,by]=tf(B.x,B.y), [cx,cy]=tf(C.x,C.y);
      ctx.beginPath();
      ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy); ctx.closePath();
      ctx.stroke();
    }
  }

  /* ---- Mouse-hover temperature readout. Safe to call multiple times
     on the same canvas (e.g. if a step re-renders and creates a fresh
     canvas each time) since listeners go with the old element when it's
     discarded; reads canvas._hoverData fresh on every move, so it always
     reports whatever drawMeshCanvas() most recently drew — including
     across transient playback frames. ---- */
  export function attachContourHover(canvas){
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('mousemove', (e)=>{
      const data = canvas._hoverData;
      if(!data){ hideTip(); return; }
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
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
          const val = w1*T[a] + w2*T[b] + w3*T[c];
          showTip(e.clientX, e.clientY, `T ≈ ${val.toFixed(2)} °C`);
          return;
        }
      }
      hideTip();
    });
    canvas.addEventListener('mouseleave', hideTip);
  }

  export function drawOutline(ctx, mesh, tf){
    let loop = [];
    if(mesh.boundaries.left && mesh.boundaries.top){
      const {left,right,bottom,top} = mesh.boundaries;
      loop = [...bottom, ...right.slice(1), ...[...top].reverse().slice(1), ...[...left].reverse().slice(1)];
    } else if(mesh.boundaries.base){
      const {base, hyp, side} = mesh.boundaries;
      loop = [...base, ...hyp.slice(1), ...[...side].reverse().slice(1)];
    } else if(Object.keys(mesh.boundaries).every(k=>/^edge\d+$/.test(k))){
      // freeform polygon: one node chain per edge (edge0, edge1, ...), each
      // starting where the previous one ended — concatenate them in order.
      // (This used to fall through to the branch below and draw only edge0.)
      const keys = Object.keys(mesh.boundaries).sort((a,b)=>parseInt(a.slice(4))-parseInt(b.slice(4)));
      keys.forEach((k,i)=>{
        const chain = mesh.boundaries[k];
        loop.push(...(i===0 ? chain : chain.slice(1)));
      });
    } else {
      // single continuous boundary loop (e.g. circle) — already closed
      loop = mesh.boundaries[Object.keys(mesh.boundaries)[0]];
    }
    ctx.beginPath();
    loop.forEach((nd,i)=>{
      const [x,y]=tf(mesh.nodes[nd].x, mesh.nodes[nd].y);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  export function highlightEdge(ctx, mesh, tf, edgeName, color){
    const list = mesh.boundaries[edgeName];
    const dpr = (ctx.canvas && ctx.canvas._dpr) || 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4*dpr;
    ctx.beginPath();
    list.forEach((nd,i)=>{
      const [x,y]=tf(mesh.nodes[nd].x, mesh.nodes[nd].y);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }

  export function drawColorbarInto(canvas){
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    const H = canvas.height;
    for(let y=0;y<H;y++){
      const t = 1 - y/(H-1);
      ctx.fillStyle = rainbowColor(t);
      ctx.fillRect(0,y,canvas.width,1);
    }
  }

  export function drawExactContour(canvas, mesh, Texact, min, max){
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      const dpr = canvas._dpr || 1;
      const tf = fitTransform(mesh.bbox, canvas.width, canvas.height, 18*dpr);
      fillContourGradient(canvas, mesh, Texact, min, max, tf);
      ctx.strokeStyle = '#3A4145'; ctx.lineWidth=1.2*dpr;
      drawOutline(ctx, mesh, tf);
  }
