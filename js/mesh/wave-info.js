import { state } from '../state.js';
import { getEdgeNamesForShape, bboxFor2DShape } from './shape-info.js';

/**
 * Mesh-independent helpers for the Wave module (same spirit as
 * shape-info.js / structural-info.js: they only look at state, so the
 * boundary/initial-condition step, which runs BEFORE meshing, can use them).
 *
 * - state.wbc[edge].type: 'fixed' (u = 0) | 'free' (du/dn = 0, the natural BC).
 * - waveDomainSize(): the shape's length along x (1D) or its bounding box.
 * - icResolved(): the initial-condition parameters with every "auto" (null)
 *   value filled in from the geometry (pulse centre = middle of the box,
 *   width = 8 % of the shorter side).
 */

  export const WBC_TYPES = ['fixed','free'];

  export function waveDomainSize(){
    if(state.dimension==='1d') return { w:state.geom.length, h:0 };
    return bboxFor2DShape();
  }

  /* Creates/repairs state.wbc so every current edge has a valid entry
     (default: fixed — a string/drum clamped at its ends), drops stale edges. */
  export function ensureWaveDefaults(){
    const names = getEdgeNamesForShape();
    names.forEach(e=>{
      const b = state.wbc[e];
      if(!b || !WBC_TYPES.includes(b.type)) state.wbc[e] = { type:'fixed' };
    });
    Object.keys(state.wbc).forEach(k=>{ if(!names.includes(k)) delete state.wbc[k]; });
    // Mode-shaped initial conditions only exist for a bar and a rectangle
    if(state.dimension==='2d' && state.shape==='polygon' && state.wave.ic.type==='mode') state.wave.ic.type = 'gaussian';
  }

  export function icResolved(){
    const ic = state.wave.ic;
    const {w,h} = waveDomainSize();
    const is1D = state.dimension==='1d';
    const sizeMin = is1D ? w : Math.min(w,h);
    return {
      type: ic.type, amp: ic.amp,
      x0: ic.x0===null ? w/2 : ic.x0,
      y0: is1D ? 0 : (ic.y0===null ? h/2 : ic.y0),
      sigma: ic.sigma===null ? 0.08*sizeMin : ic.sigma,
      m: Math.max(1, Math.round(ic.m)), n: Math.max(1, Math.round(ic.n)),
      velType: ic.velType, v0: ic.v0,
    };
  }

  export function probeResolved(){
    const {w,h} = waveDomainSize();
    const p = state.wave.probe;
    return { x: p.x===null ? w/2 : p.x, y: state.dimension==='1d' ? 0 : (p.y===null ? h/2 : p.y) };
  }
