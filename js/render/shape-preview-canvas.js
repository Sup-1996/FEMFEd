import { state } from '../state.js';
import { fitTransform } from './canvas-transform.js';
import { bboxFor2DShape } from '../mesh/shape-info.js';

/**
 * Canvas rendering for the 2D shape preview used across the geometry,
 * boundary-condition and mesh steps: the live polygon-drawing canvas
 * (grid + placed points + closing dashed segment), and the "preview
 * shape" outline (rectangle or finalized polygon) with an optional
 * highlighted edge.
 *
 * DRAW_SCALE / DRAW_GRID_SPACING / DRAW_SNAP describe the freeform
 * drawing canvas specifically (pixels-per-metre, grid line spacing,
 * and the snap-to-grid resolution for placed points) and are exported
 * so the geometry step's click handler can use the same values — that
 * handler works from getBoundingClientRect(), i.e. CSS pixels, so it
 * reads canvas._cssH (see render/hidpi.js) rather than canvas.height
 * when flipping the y axis.
 *
 * Both draw functions below read the canvas's intended CSS-pixel size
 * from _cssW/_cssH and apply a matching setTransform so their literal
 * pixel math (grid spacing, point radii, padding) doesn't need to know
 * about devicePixelRatio.
 */

  export const DRAW_SCALE = 80; // pixels per meter for the freeform drawing canvas
  export const DRAW_GRID_SPACING = 0.5; // meters between grid lines
  export const DRAW_SNAP = 0.05; // meters — clicked points snap to this grid

  export function drawPolygonDraftCanvas(cv){
    const ctx = cv.getContext('2d');
    const dpr = cv._dpr || 1;
    const W = cv._cssW || cv.width, H = cv._cssH || cv.height;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
      ctx.strokeStyle='rgba(58,65,69,0.08)'; ctx.lineWidth=1;
      const stepPx = DRAW_GRID_SPACING*DRAW_SCALE;
      for(let x=0;x<=W;x+=stepPx){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for(let y=0;y<=H;y+=stepPx){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      const verts = state.polygon.vertices;
      const toPx = (v)=> [v.x*DRAW_SCALE, H - v.y*DRAW_SCALE];
      if(verts.length>0){
        ctx.strokeStyle='#3FAE8C'; ctx.lineWidth=2;
        ctx.beginPath();
        verts.forEach((v,i)=>{ const [x,y]=toPx(v); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
        ctx.stroke();
        if(verts.length>=3){
          const [x0,y0]=toPx(verts[0]), [xl,yl]=toPx(verts[verts.length-1]);
          ctx.setLineDash([6,4]); ctx.strokeStyle='rgba(63,174,140,0.5)';
          ctx.beginPath(); ctx.moveTo(xl,yl); ctx.lineTo(x0,y0); ctx.stroke();
          ctx.setLineDash([]);
        }
        verts.forEach((v,i)=>{
          const [x,y]=toPx(v);
          ctx.beginPath(); ctx.arc(x,y, i===0?7:5, 0, Math.PI*2);
          ctx.fillStyle = i===0 ? '#D9A441' : '#3FAE8C';
          ctx.fill();
        });
      }
  }

  export function drawPreviewShape(cv, highlight){
    const ctx = cv.getContext('2d');
    const dpr = cv._dpr || 1;
    const W = cv._cssW || cv.width, H = cv._cssH || cv.height;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    const bbox = bboxFor2DShape();
    ctx.strokeStyle='#3FAE8C'; ctx.lineWidth=2; ctx.fillStyle='rgba(63,174,140,0.06)';

      if(state.shape==='rectangle'){
        const tf = fitTransform(bbox, W, H, 30);
        const pts = [[0,0],[bbox.w,0],[bbox.w,bbox.h],[0,bbox.h]];
        ctx.beginPath();
        pts.forEach((p,i)=>{ const [x,y]=tf(p[0],p[1]); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if(highlight){
          const edges = { bottom:[[0,0],[bbox.w,0]], right:[[bbox.w,0],[bbox.w,bbox.h]], top:[[bbox.w,bbox.h],[0,bbox.h]], left:[[0,bbox.h],[0,0]] };
          const seg = edges[highlight];
          if(seg){
            ctx.strokeStyle='#D9A441'; ctx.lineWidth=5;
            ctx.beginPath();
            seg.forEach((p,i)=>{ const [x,y]=tf(p[0],p[1]); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
            ctx.stroke();
          }
        }
        return;
      }

      // custom polygon
      const verts = state.polygon.vertices;
      if(verts.length<3) return;
      const tf = fitTransform(bbox, W, H, 30);
      ctx.beginPath();
      verts.forEach((p,i)=>{ const [x,y]=tf(p.x,p.y); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if(highlight){
        const idx = parseInt(String(highlight).replace('edge',''), 10);
        if(!isNaN(idx)){
          const a=verts[idx], b=verts[(idx+1)%verts.length];
          const [ax,ay]=tf(a.x,a.y), [bx,by]=tf(b.x,b.y);
          ctx.strokeStyle='#D9A441'; ctx.lineWidth=5;
          ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
        }
      }
  }
