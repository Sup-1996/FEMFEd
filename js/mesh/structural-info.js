import { state } from '../state.js';
import { getEdgeNamesForShape, polygonVertexCount, bboxFor2DShape } from './shape-info.js';

/**
 * Mesh-independent helpers for the Structural module, in the same spirit
 * as shape-info.js: they only look at state.dimension / state.shape /
 * state.geom / state.polygon, so the supports-and-loads step (which runs
 * BEFORE meshing) can use them, and cornerNodeIds() maps the result onto
 * a mesh later, at assembly time.
 *
 * - Edge condition types (state.sbc[edge].type):
 *     1D: 'free' | 'fixed' (u = 0) | 'load' (axial point force, +x positive)
 *     2D: 'free' | 'fixed' (ux = uy = 0) | 'roller_x' (ux = 0) |
 *         'roller_y' (uy = 0) | 'traction' (uniform global tx, ty in Pa)
 * - Corner point loads (state.spl[cornerKey] = {fx, fy} in N): the
 *   rectangle's four corners ('bl','br','tr','tl'), or a polygon's
 *   vertices ('v0','v1',...). Corners are always mesh nodes, so a point
 *   load can be placed on them before any mesh exists.
 */

  /* Mesh-size cap for the UI: structural 2D models carry 2 DOF per node, so
     they are capped lower than the heat module's 5,000 elements (the wave
     module is capped at 2,000 because every time step's field is stored). */
  export function maxElementsCap(){
    if(state.dimension==='2d' && state.equation==='structure') return 1500;
    if(state.dimension==='2d' && state.equation==='wave') return 2000; // 2000 time steps x nodes of stored snapshots
    return 5000;
  }

  export const SBC_TYPES_1D = ['free','fixed','load'];
  export const SBC_TYPES_2D = ['free','fixed','roller_x','roller_y','traction'];

  export function cornerKeys(){
    if(state.dimension==='1d') return [];
    if(state.shape==='rectangle') return ['bl','br','tr','tl'];
    return Array.from({length: polygonVertexCount()}, (_,i)=>'v'+i);
  }

  export function cornerLabels(){
    if(state.shape==='rectangle'){
      return { bl:'มุมล่างซ้าย', br:'มุมล่างขวา', tr:'มุมบนขวา', tl:'มุมบนซ้าย' };
    }
    const labels = {};
    cornerKeys().forEach((k,i)=>{ labels[k] = `จุดยอดที่ ${i+1}`; });
    return labels;
  }

  /* Corner coordinates (metres), for drawing load arrows on the preview. */
  export function cornerPositions(){
    if(state.shape==='rectangle'){
      const {w,h} = bboxFor2DShape();
      return { bl:[0,0], br:[w,0], tr:[w,h], tl:[0,h] };
    }
    const pos = {};
    (state.polygon.vertices||[]).forEach((v,i)=>{ pos['v'+i] = [v.x, v.y]; });
    return pos;
  }

  /* Edge segments (metres) keyed by edge name — rectangle or polygon. */
  export function edgeSegments(){
    if(state.shape==='rectangle'){
      const {w,h} = bboxFor2DShape();
      return { bottom:[[0,0],[w,0]], right:[[w,0],[w,h]], top:[[w,h],[0,h]], left:[[0,h],[0,0]] };
    }
    const verts = state.polygon.vertices || [];
    const segs = {};
    verts.forEach((a,i)=>{ const b = verts[(i+1)%verts.length]; segs['edge'+i] = [[a.x,a.y],[b.x,b.y]]; });
    return segs;
  }

  /* Creates/repairs state.sbc and state.spl so every current edge/corner
     has a valid entry for the current dimension (e.g. switching 1D -> 2D
     keeps 'left'/'right' but resets a 1D-only type such as 'load'), and
     drops entries for edges that no longer exist. */
  export function ensureStructuralDefaults(){
    const valid = state.dimension==='1d' ? SBC_TYPES_1D : SBC_TYPES_2D;
    const names = getEdgeNamesForShape();
    names.forEach(e=>{
      let b = state.sbc[e];
      if(!b || !valid.includes(b.type)) b = state.sbc[e] = { type:'free' };
      if(b.tx===undefined) b.tx = 0;
      if(b.ty===undefined) b.ty = 0;
      if(b.value===undefined) b.value = 0;
    });
    Object.keys(state.sbc).forEach(k=>{ if(!names.includes(k)) delete state.sbc[k]; });
    const keys = cornerKeys();
    keys.forEach(k=>{
      if(!state.spl[k]) state.spl[k] = { fx:0, fy:0 };
    });
    Object.keys(state.spl).forEach(k=>{ if(!keys.includes(k)) delete state.spl[k]; });
  }

  /* Maps corner keys to node indices of an already-built mesh. */
  export function cornerNodeIds(mesh){
    const b = mesh.boundaries;
    const out = {};
    if(b.left && b.top && b.right && b.bottom){
      out.bl = b.left[0];            out.tl = b.left[b.left.length-1];
      out.br = b.right[0];           out.tr = b.right[b.right.length-1];
    } else {
      Object.keys(b).forEach(k=>{
        const m = /^edge(\d+)$/.exec(k);
        if(m) out['v'+m[1]] = b[k][0];
      });
    }
    return out;
  }
