import { state } from '../state.js';
import { effectiveThickness } from './structural-assembly.js';

/**
 * Closed-form reference solutions for the Structural module, used on the
 * results step wherever one applies to the current model:
 *
 * 1D bar
 *   - one end fixed, axial force P at the other end (or both ends fixed):
 *     u(x) is linear (zero everywhere if both ends are fixed).
 *
 * 2D rectangle
 *   - "uniform stress state" (patch test): left edge Roller x, bottom edge
 *     Roller y, uniform traction on the right edge (tx only) and/or the
 *     top edge (ty only), the other two edges free. The stress is
 *     uniform everywhere, so displacements are linear and ANY mesh
 *     (linear or quadratic) must reproduce them to round-off.
 *   - end-loaded cantilever (reference value, not an exact solution of
 *     the elasticity problem): left edge Fixed, uniform traction ty on
 *     the right edge, other edges free. Compared against Euler-Bernoulli
 *     and Timoshenko beam theory for the tip deflection.
 *
 * Returns { available:false, note } when nothing applies, otherwise an
 * object with `kind` ('bar' | 'uniform' | 'cantilever') and the data the
 * results step needs to draw the comparison.
 */

  function isFree(bc){
    return !bc || bc.type==='free' || (bc.type==='traction' && bc.tx===0 && bc.ty===0);
  }
  function noPointLoads(){
    return Object.values(state.spl).every(p=> p.fx===0 && p.fy===0);
  }

  function exactBar(res){
    const {E, area:A} = state.structural;
    const L = state.geom.length;
    const lo = state.sbc.left || {type:'free'}, hi = state.sbc.right || {type:'free'};
    const nodes = state.mesh.nodes;
    const P = (bc)=> bc.type==='load' ? bc.value : 0;
    let f = null, desc = '';
    if(lo.type==='fixed' && hi.type!=='fixed'){
      const Pr = P(hi);
      f = (x)=> Pr*x/(E*A);
      desc = 'u(x) = P·x / (E·A) — ปลายซ้ายถูกยึด ปลายขวารับแรง P';
    } else if(hi.type==='fixed' && lo.type!=='fixed'){
      const Pl = P(lo);
      f = (x)=> Pl*(L-x)/(E*A);
      desc = 'u(x) = P·(L − x) / (E·A) — ปลายขวาถูกยึด ปลายซ้ายรับแรง P';
    } else if(lo.type==='fixed' && hi.type==='fixed'){
      f = ()=> 0;
      desc = 'ปลายทั้งสองถูกยึดและไม่มีแรงระหว่างปลาย จึงไม่มีการเคลื่อนที่ (u = 0 ทุกจุด)';
    }
    if(!f) return { available:false, note:'ไม่มีสูตรคำตอบปิดสำหรับเงื่อนไขนี้' };
    const u = Float64Array.from(nodes.map(nd=> f(nd.x)));
    let maxErr=0, sumSq=0;
    for(let i=0;i<u.length;i++){ const e=Math.abs(res.U[i]-u[i]); sumSq+=e*e; if(e>maxErr) maxErr=e; }
    let maxU = 0; for(const v of u) maxU = Math.max(maxU, Math.abs(v));
    return {
      available:true, kind:'bar', u, maxErr, rmsErr: Math.sqrt(sumSq/u.length), maxRef:maxU,
      method:'1D closed-form solution', note: desc,
    };
  }

  function exactUniform(res){
    const bc = state.sbc;
    const {E, nu, mode} = state.structural;
    const W = state.geom.width, H = state.geom.height;
    if(!(bc.left && bc.left.type==='roller_x' && bc.bottom && bc.bottom.type==='roller_y')) return null;
    if(!noPointLoads()) return null;
    const right = bc.right || {type:'free'}, top = bc.top || {type:'free'};
    let sx = 0, sy = 0;
    if(right.type==='traction'){ if(right.ty!==0) return null; sx = right.tx; }
    else if(right.type!=='free') return null;
    if(top.type==='traction'){ if(top.tx!==0) return null; sy = top.ty; }
    else if(top.type!=='free') return null;
    if(sx===0 && sy===0) return null;
    // uniform plane state: strains from Hooke's law
    let ex, ey;
    if(mode==='plane_strain'){
      ex = ((1-nu*nu)*sx - nu*(1+nu)*sy)/E;
      ey = ((1-nu*nu)*sy - nu*(1+nu)*sx)/E;
    } else {
      ex = (sx - nu*sy)/E;
      ey = (sy - nu*sx)/E;
    }
    const nodes = state.mesh.nodes;
    const ux = Float64Array.from(nodes.map(nd=> ex*nd.x));
    const uy = Float64Array.from(nodes.map(nd=> ey*nd.y));
    let maxErr=0, sumSq=0, maxRef=0;
    for(let i=0;i<nodes.length;i++){
      const e = Math.hypot(res.U[2*i]-ux[i], res.U[2*i+1]-uy[i]);
      sumSq += e*e; if(e>maxErr) maxErr=e;
      maxRef = Math.max(maxRef, Math.hypot(ux[i], uy[i]));
    }
    return {
      available:true, kind:'uniform', ux, uy, maxErr, rmsErr: Math.sqrt(sumSq/nodes.length), maxRef,
      sxRef:sx, syRef:sy,
      method:'สถานะความเค้นสม่ำเสมอ (patch test)',
      note:`ขอบซ้ายเป็น Roller x และขอบล่างเป็น Roller y ส่วนขอบอื่นรับแรงสม่ำเสมอหรืออิสระ ความเค้นจึงสม่ำเสมอทั้งแผ่น (σx = ${sx.toPrecision(4)} Pa, σy = ${sy.toPrecision(4)} Pa) และการเคลื่อนที่เป็นเชิงเส้น — เอลิเมนต์ทั้ง linear และ quadratic ต้องให้คำตอบตรงกับสูตรถึงระดับ round-off`,
    };
  }

  function exactCantilever(res){
    const bc = state.sbc;
    const {E, nu, mode} = state.structural;
    const L = state.geom.width, H = state.geom.height;
    if(!(bc.left && bc.left.type==='fixed')) return null;
    if(!(bc.right && bc.right.type==='traction' && bc.right.tx===0 && bc.right.ty!==0)) return null;
    if(!isFree(bc.top) || !isFree(bc.bottom)) return null;
    if(!noPointLoads()) return null;
    const t = effectiveThickness();
    const P = bc.right.ty*H*t; // resultant tip force (N), signed
    const Ep = mode==='plane_strain' ? E/(1-nu*nu) : E;
    const G = E/(2*(1+nu));
    const I = t*H*H*H/12, Area = t*H;
    const dEB = P*L*L*L/(3*Ep*I);
    const dShear = P*L/((5/6)*G*Area);
    const right = state.mesh.boundaries.right;
    let tip = 0;
    for(const nd of right) tip += res.U[2*nd+1];
    tip /= right.length;
    return {
      available:true, kind:'cantilever', P, tipFEM:tip, tipEB:dEB, tipTimo:dEB+dShear,
      method:'ทฤษฎีคาน (ค่าอ้างอิงของการแอ่นที่ปลาย)',
      note:`ค่าอ้างอิงของการแอ่นที่ปลายคานยื่น (cantilever) ที่รับแรงรวม P = ${P.toPrecision(4)} N — ไม่ใช่คำตอบแม่นตรงของปัญหา elasticity เพราะ (1) แรงที่กระทำเป็นแบบสม่ำเสมอไม่ใช่แบบพาราโบลา (2) ปลายยึดที่กันการเคลื่อนที่ทั้ง ux และ uy ทำให้เกิดผลเฉพาะที่ที่โคนคาน จึงคาดว่าจะต่างกันได้ไม่กี่เปอร์เซ็นต์แม้เมชละเอียด; เมชหยาบแบบ linear (CST) จะให้ค่าแอ่นต่ำกว่าจริงมาก (shear locking)`,
    };
  }

  export function computeStructuralExact(res){
    if(state.dimension==='1d') return exactBar(res);
    if(state.shape==='rectangle'){
      const u = exactUniform(res);
      if(u) return u;
      const c = exactCantilever(res);
      if(c) return c;
      return { available:false, note:'ไม่มีสูตรอ้างอิงสำหรับเงื่อนไขนี้ — มีให้เฉพาะ (1) แผ่นสี่เหลี่ยมที่ขอบซ้าย Roller x + ขอบล่าง Roller y + แรงดึงสม่ำเสมอที่ขอบขวา/บน และ (2) คานยื่นที่ขอบซ้าย Fixed รับแรงสม่ำเสมอที่ขอบขวา' };
    }
    return { available:false, note:'รูปทรงที่วาดเองไม่มีสูตรอ้างอิงทั่วไป' };
  }
