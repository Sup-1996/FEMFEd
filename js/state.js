/**
 * Global application state for FEMFEd.
 *
 * `state` is a single mutable object that every other module reads from
 * and writes to directly (the same pattern the original single-file app
 * used). There is no framework here - UI modules mutate `state` and then
 * call `renderAll()` / `renderMain()` (see js/ui/layout.js) to redraw.
 *
 * `STEPS` describes the six-step wizard shown in the left-hand nav.
 */

export const state = {
    step: 0,
    equation: 'heat',           // only 'heat' implemented
    analysisType: 'steady',     // only 'steady' implemented
    dimension: '2d',            // '1d' | '2d'
    shape: 'rectangle',         // 'line' | 'rectangle' | 'polygon'
    geom: { width: 1.0, height: 0.6, length: 1.0 },
       polygon: { vertices: [] }, // freeform polygon drawn by the user (meters, normalized to touch x=0,y=0)
       material: { k: 1.0, Q: 0.0, rho: 1.0, cp: 1.0 },
       maxElements: 500,            // target max element count for auto mesh (capped at 5000)
       elementOrder: 'linear',      // 'linear' (3-node/2-node) | 'quadratic' (6-node/3-node)
       solverMethod: 'cg',          // 'cg' | 'direct'
       transient: { T0: 0, totalTime: 10, steps: 50 },
       mesh: null,                  // {nodes, elements, boundaries, order, dim}
       bc: {},                      // edgeName -> {type:'insulated'|'fixed'|'flux', value:number}
       results: null                // {T, min, max, iters, info, exact:{...}}
};

export const STEPS = [
     { key:'equation', label:'เลือกสมการ' },
     { key:'geometry', label:'สร้างรูปทรง' },
     { key:'material', label:'คุณสมบัติวัสดุ' },
     { key:'bc', label:'เงื่อนไขเริ่มต้น/ขอบเขต' },
     { key:'mesh', label:'ตีเมช' },
     { key:'solve', label:'รันและดูผล' },
];
