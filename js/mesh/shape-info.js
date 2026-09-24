import { state } from '../state.js';

/**
 * Pure, mesh-independent helpers that describe a shape's edges/bounds.
 * These only look at state.dimension / state.shape / state.geom /
 * state.polygon - they do NOT require state.mesh to exist yet, which is
 * why the boundary-condition step (js/ui/steps/bc-step.js) can use them
 * before meshing has happened.
 */

  export const edgeLabelsRect   = { left:'ขอบซ้าย', right:'ขอบขวา', top:'ขอบบน', bottom:'ขอบล่าง' };
  export const edgeLabels1D     = { left:'ปลายด้าน x = 0', right:'ปลายด้าน x = L' };

  export function edgeLabels(){
    if(state.dimension==='1d') return edgeLabels1D;
    if(state.shape==='rectangle') return edgeLabelsRect;
    const n = polygonVertexCount();
    const labels = {};
    for(let i=0;i<n;i++) labels['edge'+i] = `ขอบที่ ${i+1}`;
    return labels;
  }

  export function polygonVertexCount(){
    return (state.polygon && state.polygon.vertices) ? state.polygon.vertices.length : 0;
  }

  /* ---- Mesh-independent edge names (needed since BC step now precedes meshing) ---- */
  export function getEdgeNamesForShape(){
     if(state.dimension==='1d') return ['left','right'];
     if(state.shape==='rectangle') return ['left','right','top','bottom'];
     return Array.from({length: polygonVertexCount()}, (_,i)=>'edge'+i);
  }
  export function ensureBcDefaults(){
     getEdgeNamesForShape().forEach(e=>{
       if(!state.bc[e]) state.bc[e] = {type:'insulated', value:0};
     });
  }

  export function bboxFor2DShape(){
    if(state.shape==='rectangle') return {w:state.geom.width, h:state.geom.height};
    const verts = state.polygon.vertices;
    if(verts.length===0) return {w:1,h:1};
    let maxX=0, maxY=0;
    verts.forEach(v=>{ if(v.x>maxX) maxX=v.x; if(v.y>maxY) maxY=v.y; });
    return {w:maxX||1, h:maxY||1};
  }
