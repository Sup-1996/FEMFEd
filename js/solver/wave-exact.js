import { state } from '../state.js';
import { icResolved, waveDomainSize } from '../mesh/wave-info.js';
import { modalInfo, shapeFn } from './wave-ic.js';

/**
 * Closed-form reference solutions for the Wave module. Returns
 * { available, method, note, at(t) -> Float64Array of nodal values }.
 *
 * 1) Eigenmode initial condition (1D bar or rectangle, any mix of fixed /
 *    free edges, any damping): u(x,y,t) = phi(x,y) q(t) with
 *    q'' + gamma q' + omega^2 q = 0, q(0) = amp, q'(0) = v0 (or 0).
 * 2) 1D Gaussian pulse at rest, no damping: d'Alembert's solution
 *    u = (F(x - ct) + F(x + ct)) / 2, where F is the initial profile
 *    continued beyond the ends by reflection (odd at a fixed end, even
 *    at a free end) — exact for all times, including the reflections.
 * Everything else (2D pulse, damped pulse, initial velocity on a pulse,
 * polygons) has no reference here, and the note says why.
 */

  function modalTimeFn(omega, gamma, A, V){
    const disc = gamma*gamma/4 - omega*omega;
    if(disc < -1e-12*omega*omega){ // under-damped (the usual case)
      const wd = Math.sqrt(-disc);
      return t=> Math.exp(-gamma*t/2)*(A*Math.cos(wd*t) + (V+gamma*A/2)/wd*Math.sin(wd*t));
    }
    if(Math.abs(disc) <= 1e-12*omega*omega){ // critically damped
      return t=> Math.exp(-gamma*t/2)*(A + (V+gamma*A/2)*t);
    }
    const sq = Math.sqrt(disc), r1 = -gamma/2+sq, r2 = -gamma/2-sq; // over-damped
    const c1 = (V - r2*A)/(r1-r2), c2 = A - c1;
    return t=> c1*Math.exp(r1*t) + c2*Math.exp(r2*t);
  }

  export function computeWaveExact(nodes){
    const ic = icResolved();
    const { c, damping:gamma } = state.wave;
    const is1D = state.dimension==='1d';

    if(ic.type==='mode'){
      const mi = modalInfo();
      if(!mi) return { available:false, note:'รูปทรงที่วาดเองไม่มีโหมดสั่นแบบปิด จึงไม่มีคำตอบอ้างอิง' };
      const omega = c*Math.sqrt(mi.lambda2);
      const q = modalTimeFn(omega, gamma, ic.amp, ic.velType==='shape' ? ic.v0 : 0);
      const phi = nodes.map(nd=> mi.phi(nd.x, nd.y));
      const fn = Number.isFinite(omega) ? omega/(2*Math.PI) : 0;
      return {
        available:true, method:'Eigenmode (separation of variables)',
        omega, freq:fn,
        at:(t)=>{ const qt = q(t); return Float64Array.from(phi, p=>p*qt); },
        note:`เริ่มต้นด้วยรูปร่างของโหมดสั่นหนึ่งโหมด จึงสั่นเป็น u(x,t) = φ(x)·q(t) ที่ความถี่เชิงมุม ω = c·√(λx² + λy²) = ${omega.toPrecision(5)} rad/s (f = ${fn.toPrecision(5)} Hz)${gamma>0 ? ` โดยแอมพลิจูดลดลงแบบ e^(−γt/2) จากการหน่วง γ = ${gamma} 1/s` : ''} — ค่า error ที่แสดงมาจาก discretization ของเมช (ความหนาแน่นของเมช) และของ time step`,
      };
    }

    if(is1D && ic.type==='gaussian' && ic.velType==='zero' && gamma===0){
      const L = state.geom.length;
      const lo = state.wbc.left ? state.wbc.left.type : 'fixed', hi = state.wbc.right ? state.wbc.right.type : 'fixed';
      const f0 = (x)=> ic.amp*Math.exp(-((x-ic.x0)**2)/(2*ic.sigma*ic.sigma));
      if((lo==='fixed' && Math.abs(f0(0)) > 1e-4*Math.abs(ic.amp)) || (hi==='fixed' && Math.abs(f0(L)) > 1e-4*Math.abs(ic.amp))){
        return { available:false, note:'พัลส์เริ่มต้นกว้างจนซ้อนทับกับปลายที่ยึด (u ≠ 0 ที่ปลาย) จึงไม่ตรงกับสมมติฐานของคำตอบ d\'Alembert — ลดความกว้าง σ หรือย้ายตำแหน่งพัลส์ให้ห่างปลายที่ยึด' };
      }
      const sL = lo==='fixed' ? -1 : 1, sR = hi==='fixed' ? -1 : 1;
      function F(s){ // initial profile continued past the ends by reflection
        let x = s, sign = 1;
        for(let k=0;k<100000;k++){
          if(x<0){ x = -x; sign *= sL; }
          else if(x>L){ x = 2*L-x; sign *= sR; }
          else break;
        }
        return sign*f0(x);
      }
      return {
        available:true, method:"d'Alembert (reflection of a travelling pulse)",
        at:(t)=> Float64Array.from(nodes, nd=> 0.5*(F(nd.x-c*t)+F(nd.x+c*t))),
        note:"พัลส์ที่หยุดนิ่งตอนเริ่มจะแยกเป็นสองพัลส์ครึ่งแอมพลิจูดวิ่งไปทางซ้ายและขวาด้วยความเร็ว c เมื่อชนปลายที่ยึดจะสะท้อนกลับโดยกลับเครื่องหมาย (ปลายอิสระสะท้อนโดยไม่กลับเครื่องหมาย) — d'Alembert ให้คำตอบแม่นตรงทุกเวลา รวมถึงหลังการสะท้อน",
      };
    }

    let why;
    if(!is1D) why = 'พัลส์ 2 มิติไม่มีคำตอบปิดแบบง่าย (คลื่นแผ่เป็นวงกลมและสะท้อนจากขอบ) — เลือก "โหมดสั่น" เพื่อเปรียบเทียบกับคำตอบแม่นตรง';
    else if(gamma!==0) why = 'พัลส์ที่มีการหน่วงไม่มีคำตอบ d\'Alembert แบบง่าย (รูปพัลส์จะบิดเบี้ยว) — ตั้งการหน่วงเป็น 0 หรือเลือก "โหมดสั่น"';
    else why = 'พัลส์ที่มีความเร็วเริ่มต้นไม่เป็นศูนย์ ไม่รองรับในสูตรอ้างอิงเวอร์ชันนี้ — ตั้งความเร็วเริ่มต้นเป็นศูนย์ หรือเลือก "โหมดสั่น"';
    return { available:false, note:why };
  }
