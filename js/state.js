export const state = {
    step: 0,
    equation: 'heat',           // 'heat' | 'structure'
    analysisType: 'steady',     // heat: 'steady' | 'transient'; structure: always 'steady' (= static)
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
       results: null,               // heat: {T, min, max, iters, info, exact:{...}}; structure: {structural:true, ...} (see solver/structural-solver.js)

       // ---- Structural (static, linear elastic) module — all values in SI ----
       structural: { mode:'plane_stress', E:200e9, nu:0.3, thickness:0.01, area:1e-4 }, // E [Pa], thickness [m], area [m^2] (1D bar)
       sbc: {},                     // structural edge BCs: edgeName -> {type:'free'|'fixed'|'roller_x'|'roller_y'|'traction'|'load', tx, ty, value}
       spl: {},                     // structural point loads at shape corners: cornerKey -> {fx, fy} [N]
       sview: { field:'vm', deform:true, scale:null, wire:false } // results-view options (scale null = auto)
};

export const STEPS = [
     { key:'equation', label:'เลือกสมการ' },
     { key:'geometry', label:'สร้างรูปทรง' },
     { key:'material', label:'คุณสมบัติวัสดุ' },
     { key:'bc', label:'เงื่อนไขเริ่มต้น/ขอบเขต' },
     { key:'mesh', label:'ตีเมช' },
     { key:'solve', label:'รันและดูผล' },
];
