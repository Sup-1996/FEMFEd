import { state } from '../state.js';
import { bboxFor2DShape, polygonVertexCount } from '../mesh/shape-info.js';

/**
 * Right-hand "model summary" panel: a running dump of every relevant
 * state.* value for the current step (equation, geometry, material,
 * mesh stats once meshed, solver results once solved).
 */

  export function renderInfo(){
    const info = document.getElementById('infoPanel');
    info.innerHTML = '<h2>สรุปโมเดล</h2>';

      const rows = [];
      rows.push(['สมการ', state.equation==='heat' ? 'Heat Transfer' : '-']);
      rows.push(['รูปแบบ', state.analysisType==='steady' ? 'Steady state' : 'Transient']);
      rows.push(['มิติ', state.dimension==='1d' ? '1D' : '2D']);
      if(state.dimension==='1d'){
        rows.push(['ความยาว', `${state.geom.length} m`]);
      } else if(state.shape==='rectangle'){
        rows.push(['รูปทรง', 'สี่เหลี่ยม']);
        rows.push(['ขนาด', `${state.geom.width} × ${state.geom.height} m`]);
      } else {
        const bbox = bboxFor2DShape();
        rows.push(['รูปทรง', 'วาดเอง (custom polygon)']);
        rows.push(['จำนวนจุด/ขอบ', polygonVertexCount()]);
        rows.push(['ขนาดกรอบ', `${bbox.w.toFixed(2)} × ${bbox.h.toFixed(2)} m`]);
      }
      rows.push(['k', state.material.k + ' W/(m·K)']);
      if(state.material.Q) rows.push(['Q', state.material.Q + ' W/m³']);
      if(state.analysisType==='transient'){
        rows.push(['ρ', state.material.rho + ' kg/m³']);
        rows.push(['cp', state.material.cp + ' J/(kg·K)']);
        rows.push(['ρc', (state.material.rho*state.material.cp) + ' J/(m³·K)']);
        rows.push(['T₀', state.transient.T0 + ' °C']);
        rows.push(['เวลาสิ้นสุด', state.transient.totalTime + ' s']);
        rows.push(['time steps', state.transient.steps]);
      }
      if(state.mesh){
        rows.push(['Element order', state.elementOrder==='linear' ? 'First order' : 'Second order']);
        rows.push(['จำนวนโหนด', state.mesh.nodes.length]);
        rows.push(['จำนวนเอลิเมนต์', state.mesh.elements.length]);
      }
      if(state.results){
        const methodLabels = {cg:'Conjugate Gradient', direct:'Direct (LU)'};
        rows.push(['Solver', methodLabels[state.solverMethod]]);
        if(state.results.transient){
          const idx = (state.transientViewStep!==undefined && state.transientViewStep!==null) ? state.transientViewStep : state.results.steps;
          const snap = state.results.timeSeries[Math.max(0,Math.min(state.results.steps, idx))];
          rows.push(['กำลังดูที่ t', snap.t.toFixed(4)+' s']);
          rows.push(['T min (ทุกเวลา)', state.results.min.toFixed(3)+' °C']);
          rows.push(['T max (ทุกเวลา)', state.results.max.toFixed(3)+' °C']);
          rows.push(['Exact solution', 'ยังไม่รองรับสำหรับ transient']);
        } else {
          rows.push(['T min', state.results.min.toFixed(3)+' °C']);
          rows.push(['T max', state.results.max.toFixed(3)+' °C']);
          rows.push(['รอบ/step', state.results.iters]);
          if(state.results.exact.available){
            rows.push(['Exact solution', 'มี — ' + state.results.exact.method]);
            rows.push(['Max error', state.results.exact.maxErr.toExponential(2)+' °C']);
          } else {
            rows.push(['Exact solution', 'ไม่มีสูตรปิดสำหรับกรณีนี้']);
          }
        }
      }

      rows.forEach(([k,v])=>{
        const d = document.createElement('div'); d.className='stat-line';
        d.innerHTML = `<span>${k}</span><span>${v}</span>`;
        info.appendChild(d);
      });

      const note = document.createElement('div'); note.className='note';
      note.textContent = 'แอปนี้ทำงานในเบราว์เซอร์ทั้งหมด ไม่มีการส่งหรือบันทึกข้อมูลใด ๆ — ปิดหน้าต่างแล้วข้อมูลทั้งหมดจะหายไป';
      info.appendChild(note);
  }
