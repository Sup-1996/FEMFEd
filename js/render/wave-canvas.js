import { state } from '../state.js';
import { fitTransform } from './canvas-transform.js';
import { drawPreviewShape } from './shape-preview-canvas.js';
import { draw1DDomain } from './domain-1d-canvas.js';
import { bboxFor2DShape } from '../mesh/shape-info.js';
import { edgeSegments } from '../mesh/structural-info.js';
import { icResolved } from '../mesh/wave-info.js';

/**
 * Canvas drawing for the Wave module's boundary/initial-condition step:
 * the ordinary shape (or bar) preview plus the clamped (fixed) edges in
 * red and a marker at the Gaussian pulse centre. The results step reuses
 * contour-canvas.js (2D) and structural-canvas.js's line chart (1D / time
 * histories) directly.
 */

  const C_FIXED = '#C0483A', C_PULSE = '#D9A441';

  export function drawWavePreview(cv, highlight){
    drawPreviewShape(cv, highlight);
    const ctx = cv.getContext('2d');
    const W = cv._cssW || cv.width, H = cv._cssH || cv.height;
    const tf = fitTransform(bboxFor2DShape(), W, H, 30);
    ctx.lineCap = 'round';
    for(const [name, seg] of Object.entries(edgeSegments())){
      const bc = state.wbc[name];
      if(!bc || bc.type!=='fixed') continue;
      const [ax,ay] = tf(seg[0][0],seg[0][1]), [bx,by] = tf(seg[1][0],seg[1][1]);
      ctx.strokeStyle = C_FIXED; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    const ic = icResolved();
    if(ic.type==='gaussian'){
      const [px,py] = tf(ic.x0, ic.y0);
      const {w,h} = bboxFor2DShape();
      const rpx = Math.abs(tf(ic.x0+ic.sigma, ic.y0)[0]-px);
      ctx.strokeStyle = C_PULSE; ctx.lineWidth = 1.6; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.arc(px,py,Math.max(3,rpx),0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(px-6,py); ctx.lineTo(px+6,py); ctx.moveTo(px,py-6); ctx.lineTo(px,py+6); ctx.stroke();
    }
  }

  export function drawWaveBarPreview(cv, length, highlight){
    const {x0,x1,y0} = draw1DDomain(cv, length, { highlight });
    const ctx = cv.getContext('2d');
    for(const [name,x,outDir] of [['left',x0,-1],['right',x1,1]]){
      const bc = state.wbc[name];
      if(!bc || bc.type!=='fixed') continue;
      ctx.strokeStyle = C_FIXED; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x,y0-18); ctx.lineTo(x,y0+18); ctx.stroke();
      ctx.lineWidth = 1.5;
      for(let k=-3;k<=3;k++){
        ctx.beginPath(); ctx.moveTo(x, y0+k*5.5); ctx.lineTo(x+outDir*9, y0+k*5.5+7); ctx.stroke();
      }
    }
    const ic = icResolved();
    if(ic.type==='gaussian'){
      const px = x0 + (ic.x0/length)*(x1-x0);
      ctx.strokeStyle = C_PULSE; ctx.lineWidth = 1.6; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(px,y0-26); ctx.lineTo(px,y0+26); ctx.stroke(); ctx.setLineDash([]);
    }
  }
