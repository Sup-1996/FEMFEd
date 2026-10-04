import { state } from '../state.js';
import { icResolved } from '../mesh/wave-info.js';
import { fmt } from './structural-format.js';

/**
 * Lines the right-hand model-summary panel (ui/info-panel.js) shows for a
 * wave model. waveRows(rows, 'material') adds the medium, initial
 * condition and time stepping; waveRows(rows, 'results') adds the result
 * lines once a wave run exists (it is called after the mesh lines, so the
 * order in the panel stays: model -> mesh -> results).
 */
  export function waveRows(rows, part){
    const w = state.wave;
    if(part==='material'){
      const ic = icResolved();
      rows.push(['c', fmt(w.c,4)+' m/s']);
      if(w.damping>0) rows.push(['γ (หน่วง)', fmt(w.damping,4)+' 1/s']);
      rows.push(['u เริ่มต้น', ic.type==='gaussian' ? 'พัลส์เกาส์เซียน' : (state.dimension==='1d' ? `โหมดที่ ${ic.m}` : `โหมด (${ic.m}, ${ic.n})`)]);
      rows.push(['เวลาสิ้นสุด', fmt(w.transient.totalTime,4)+' s']);
      rows.push(['time steps', w.transient.steps]);
      rows.push(['Mass matrix', w.massType==='lumped' ? 'Lumped' : 'Consistent']);
      return;
    }
    const r = state.results;
    if(!r || !r.wave) return;
    const methodLabels = {cg:'Conjugate Gradient', direct:'Direct (LU)'};
    rows.push(['Solver', methodLabels[state.solverMethod]]);
    const view = state.wave.view;
    const k = (view.step===null || view.step===undefined) ? r.steps : Math.max(0, Math.min(r.steps, view.step));
    rows.push(['กำลังดูที่ t', (k*r.dt).toFixed(4)+' s']);
    rows.push(['max |u|', fmt(r.maxAbs,4)]);
    rows.push(['Courant c·Δt/h', r.courant>0 ? fmt(r.courant,3) : '–']);
    rows.push(['Exact solution', r.exact.available ? 'มี — ' + r.exact.method : 'ไม่มีสูตรอ้างอิงสำหรับกรณีนี้']);
    if(r.exact.available) rows.push(['Max error', fmt(r.exact.maxErr,3)]);
  }
