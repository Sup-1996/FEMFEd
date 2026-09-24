import { state } from '../state.js';

/**
 * Closed-form ("exact") reference solutions, used on the results step
 * to show FEM error against a known analytical answer whenever one
 * exists for the current shape/BC combination (1D bar, insulated
 * rectangle reducing to 1D, or a fully Dirichlet rectangle via a
 * Fourier series). Falls back to { available:false, note } otherwise.
 *
 * Only computeExactSolution() is used outside this file.
 */

  /* ---- Exact solution engine ---- */
  function isZeroFlux(bc){ return !bc || bc.type==='insulated' || (bc.type==='flux' && bc.value===0); }

  /* General 1D closed-form solver for T(x) = -(Q/2k)x^2 + C1*x + C2 with any mix of
      Fixed / Flux(or insulated) / Convective conditions at the two ends x=0 and x=L.
      Each end contributes one linear equation "a*C1 + b*C2 = c"; solving the 2x2 system
      handles every combination uniformly (including Robin/convective) without special-casing. */
  function bcLinearEquation(end, bc, k, Q, L){
    if(bc.type==='fixed'){
       if(end==='left') return [0, 1, bc.value];
       return [L, 1, bc.value + (Q/(2*k))*L*L];
    }
    if(bc.type==='convective'){
       const h=bc.h, Tinf=bc.Tinf;
       if(end==='left') return [k, -h, -h*Tinf];
       return [k + h*L, h, Q*L + h*Q*L*L/(2*k) + h*Tinf];
       }
       // flux or insulated (insulated == flux with value 0)
       const q = bc.type==='flux' ? bc.value : 0;
       if(end==='left') return [1, 0, -q/k];
       return [1, 0, q/k + (Q/k)*L];
   }

   function exactSolution1D(L, k, Q, bcLo, bcHi){
     const [a1,b1,c1] = bcLinearEquation('left', bcLo, k, Q, L);
     const [a2,b2,c2] = bcLinearEquation('right', bcHi, k, Q, L);
     const det = a1*b2 - a2*b1;
     if(Math.abs(det) < 1e-10) return null; // ill-posed (e.g. both ends flux/insulated with no absolute reference)
    const C1 = (c1*b2 - c2*b1)/det;
    const C2 = (a1*c2 - a2*c1)/det;
    return (x)=> -(Q/(2*k))*x*x + C1*x + C2;
  }

  function stableSinhRatio(v, Lv, factor){
    if(v<=0) return 0;
    if(v>=Lv) return 1;
    const num = Math.exp(factor*(v-Lv)) * (1-Math.exp(-2*factor*v));
    const den = 1-Math.exp(-2*factor*Lv);
    return num/den;
  }

  function fourierRectangleSolution(x, y, W, H, Tleft, Tright, Ttop, Tbottom, nTerms){
    nTerms = nTerms || 60;
    function edgeContrib(u, v, Lu, Lv, Tval){
      if(Tval===0) return 0;
      let sum=0;
      for(let m=1; m<=nTerms; m++){
        const coeff = (1-Math.pow(-1,m))/m; // zero for even m
        if(coeff===0) continue;
        const factor = m*Math.PI/Lu;
        sum += coeff * Math.sin(m*Math.PI*u/Lu) * stableSinhRatio(v, Lv, factor);
      }
      return (2*Tval/Math.PI)*sum;
    }
    const top    = edgeContrib(x, y, W, H, Ttop);
    const bottom = edgeContrib(x, H-y, W, H, Tbottom);
    const right = edgeContrib(y, x, H, W, Tright);
    const left   = edgeContrib(y, W-x, H, W, Tleft);
    return top+bottom+right+left;
  }

  export function computeExactSolution(){
    const mesh = state.mesh;
    const k = state.material.k, Q = state.material.Q;

      if(state.dimension==='1d'){
        const f = exactSolution1D(state.geom.length, k, Q, state.bc.left, state.bc.right);
        if(!f) return { available:false, note:'ไม่สามารถหา exact solution ได้ (เงื่อนไขขอบเขตไม่เพียงพอ)' };
        const T = mesh.nodes.map(nd=>f(nd.x));
        return { available:true, T, method:'1D closed-form solution', note:'คำตอบปิดของสมการ 1D: T(x) = −(Q/2k)x² + C₁x + C₂ โดยหาค่าคงที่ C₁, C₂ จากเงื่อนไขขอบเขตทั้งสองด้าน' };
      }

      // trivial case: every boundary edge fixed to the SAME temperature and no internal heat source —
      // by uniqueness of the Laplace equation this applies to ANY 2D shape, so check it before the
      // shape-specific logic below.
      {
        const bcs = Object.values(state.bc);
        const allFixed = bcs.length>0 && bcs.every(b=> b.type==='fixed');
        if(allFixed && Q===0){
          const vals = bcs.map(b=>b.value);
          const same = vals.every(v=> Math.abs(v-vals[0]) < 1e-9);
          if(same){
            const T = mesh.nodes.map(()=> vals[0]);
            return { available:true, T, method:'คำตอบคงที่ (trivial)', note:'ทุกขอบกำหนดอุณหภูมิเท่ากันและไม่มีแหล่งความร้อนภายใน อุณหภูมิจึงคงที่เท่ากันทั่วทั้งโมเดลตามหลัก uniqueness ของสมการ Laplace' };
              }
          }
      }

      if(state.shape==='rectangle'){
        const W = state.geom.width, H = state.geom.height;
        const topIns=isZeroFlux(state.bc.top), botIns=isZeroFlux(state.bc.bottom);
        const leftIns=isZeroFlux(state.bc.left), rightIns=isZeroFlux(state.bc.right);

          if(topIns && botIns){
            const f = exactSolution1D(W, k, Q, state.bc.left, state.bc.right);
            if(f){
              const T = mesh.nodes.map(nd=>f(nd.x));
              return { available:true, T, method:'ลดรูปเป็น 1D ตามแกน x', note:'ขอบบนและขอบล่างเป็น insulated ทำให้ผลเฉลยไม่ขึ้นกับ y จึงลดรูปเหลือสมการ 1D ตามแกน x ที่มีคำตอบปิดเหมือนโมเดล 1D' };
            }
          }
          if(leftIns && rightIns){
            const f = exactSolution1D(H, k, Q, state.bc.bottom, state.bc.top);
            if(f){
              const T = mesh.nodes.map(nd=>f(nd.y));
              return { available:true, T, method:'ลดรูปเป็น 1D ตามแกน y', note:'ขอบซ้ายและขอบขวาเป็น insulated ทำให้ผลเฉลยไม่ขึ้นกับ x จึงลดรูปเหลือสมการ 1D ตามแกน y ที่มีคำตอบปิดเหมือนโมเดล 1D' };
            }
          }
          const allFixed4 = ['left','right','top','bottom'].every(e=> state.bc[e] && state.bc[e].type==='fixed');
          if(allFixed4 && Q===0){
            const T = mesh.nodes.map(nd=> fourierRectangleSolution(nd.x, nd.y, W, H,
              state.bc.left.value, state.bc.right.value, state.bc.top.value, state.bc.bottom.value, 60));
            return { available:true, T, method:'Fourier series (superposition, 60 พจน์)', excludeBoundaryFromError:true,
              note:'คำตอบอนุกรมฟูริเยร์ของสมการ Laplace สำหรับกรณี Dirichlet ครบทั้ง 4 ขอบ (Q=0) — ที่มุมและใกล้ขอบ ค่าจากอนุกรมจะมีความคลาดเคลื่อนโดยธรรมชาติจาก Gibbs phenomenon/corner singularity (เป็นคุณสมบัติทางคณิตศาสตร์ของวิธีนี้ไม่ใช่ข้อผิดพลาดของ FEM) ค่า error ที่แสดงจึงคำนวณเฉพาะโหนดภายในโมเดลเพื่อให้เห็นความแม่นยำที่แท้จริง' };
          }
          if(Q!==0){
            return { available:false, note:'ไม่มีสูตรคำตอบปิดสำหรับกรณีนี้เนื่องจากมีทั้งแหล่งกำเนิดความร้อนภายใน (Q≠0) และเงื่อนไขขอบเขตที่ไม่ลดรูปเป็น 1 มิติได้'};
          }
          return { available:false, note:'ไม่มีสูตรคำตอบปิดสำหรับเงื่อนไขขอบเขตแบบผสม (Dirichlet+Neumann/flux) ในทิศทางที่ไม่ลดรูปเป็น 1 มิติได้ — รองรับเฉพาะกรณี Dirichlet ครบ 4 ขอบ หรือกรณีลดรูปเป็น 1D' };
      }

      // custom polygon: no general closed form (handled by the trivial-case check above when it applies)
      return { available:false, note:'รูปทรงที่วาดเองไม่มีสูตรคำตอบปิดทั่วไป ยกเว้นกรณีพิเศษที่ทุกขอบมีอุณหภูมิเท่ากันและไม่มีแหล่งความร้อนภายใน (Q=0)' };
  }
