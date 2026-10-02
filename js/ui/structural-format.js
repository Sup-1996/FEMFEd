import { state } from '../state.js';

/**
 * Small shared helpers for the Structural module's UI (SI throughout):
 *
 * - pick*Unit(maxAbs): choose a readable display unit (Pa..GPa, m..nm, N..MN)
 *   for a quantity of the given magnitude.
 * - fmt(v), fmtWith(v, unit): number formatting.
 * - unitInput(...): a number input paired with a unit <select> that
 *   converts to/from the SI value kept in `state` — used for E, A, t,
 *   tractions and forces, where the natural unit differs by orders of
 *   magnitude (Pa vs GPa).
 * - structuralMaterialRows / structuralResultRows: the lines the
 *   right-hand model-summary panel (ui/info-panel.js) shows for a
 *   structural model.
 */

  export const UNITS_STRESS = [['Pa',1],['kPa',1e3],['MPa',1e6],['GPa',1e9]];
  export const UNITS_LENGTH_OUT = [['m',1],['mm',1e-3],['µm',1e-6],['nm',1e-9]];
  export const UNITS_FORCE = [['N',1],['kN',1e3],['MN',1e6]];

  function pick(units, maxAbs, fallbackIdx){
    if(!(maxAbs>0)) return { name:units[fallbackIdx][0], f:units[fallbackIdx][1] };
    for(let i=units.length-1;i>=0;i--){
      if(maxAbs >= units[i][1]) return { name:units[i][0], f:units[i][1] };
    }
    const last = units[units.length-1];
    return { name:last[0], f:last[1] };
  }
  export function pickStressUnit(maxAbs){ return pick(UNITS_STRESS, maxAbs, 2); }
  export function pickLenUnit(maxAbs){
    // length units run large -> small; pick the largest unit that still shows a value >= 0.1
    if(!(maxAbs>0)) return { name:'mm', f:1e-3 };
    for(const [name,f] of UNITS_LENGTH_OUT) if(maxAbs >= 0.1*f) return { name, f };
    return { name:'nm', f:1e-9 };
  }
  export function pickForceUnit(maxAbs){ return pick(UNITS_FORCE, maxAbs, 0); }

  export function fmt(v, d){
    d = d || 4;
    if(!isFinite(v)) return '–';
    if(v===0) return '0';
    const a = Math.abs(v);
    if(a>=1e6 || a<1e-3) return v.toExponential(d-1);
    return String(Number(v.toPrecision(d)));
  }
  export function fmtWith(v, unit, d){ return `${fmt(v/unit.f, d)} ${unit.name}`; }

  /**
   * unitInput(valueSI, units, defaultIdx, onChange, opts)
   *   units:      [[label, factorToSI], ...]
   *   defaultIdx: unit shown when the value is 0 (otherwise the largest
   *               unit that keeps the shown number >= 1 is chosen)
   *   onChange:   called with the new SI value whenever the number is valid
   *   opts:       { width, min, max } (min/max in SI; invalid input is ignored)
   * Returns a <div> (inline flex) containing the <input> and the <select>.
   */
  export function unitInput(valueSI, units, defaultIdx, onChange, opts){
    opts = opts || {};
    let si = valueSI;
    let idx = defaultIdx;
    if(si!==0){
      idx = 0;
      for(let i=0;i<units.length;i++) if(Math.abs(si) >= units[i][1]) idx = i;
    }
    const wrap = document.createElement('div');
    wrap.style.display='inline-flex'; wrap.style.gap='6px'; wrap.style.alignItems='center';
    const inp = document.createElement('input'); inp.type='number'; inp.step='any';
    inp.style.width = (opts.width || 110)+'px';
    const sel = document.createElement('select');
    sel.style.width = '78px';
    units.forEach(([label],i)=>{
      const o = document.createElement('option'); o.value=String(i); o.textContent=label;
      if(i===idx) o.selected = true;
      sel.appendChild(o);
    });
    function show(){ inp.value = String(Number((si/units[idx][1]).toPrecision(12))); }
    show();
    inp.addEventListener('input', ()=>{
      const v = parseFloat(inp.value);
      if(isNaN(v)) return;
      const next = v*units[idx][1];
      if(opts.min!==undefined && next < opts.min) return;
      if(opts.max!==undefined && next > opts.max) return;
      si = next; onChange(si);
    });
    sel.addEventListener('change', ()=>{ idx = parseInt(sel.value); show(); });
    wrap.appendChild(inp); wrap.appendChild(sel);
    return wrap;
  }

  /* ---- Right-hand summary panel rows ---- */
  export function structuralMaterialRows(rows){
    const s = state.structural;
    const su = pickStressUnit(s.E);
    if(state.dimension==='1d'){
      rows.push(['E', fmtWith(s.E, su)]);
      rows.push(['พื้นที่หน้าตัด A', fmt(s.area*1e4)+' cm²']);
      return;
    }
    rows.push(['สมมติฐาน', s.mode==='plane_stress' ? 'Plane stress' : 'Plane strain']);
    rows.push(['E', fmtWith(s.E, su)]);
    rows.push(['ν', String(s.nu)]);
    if(s.mode==='plane_stress') rows.push(['ความหนา t', fmt(s.thickness*1e3)+' mm']);
  }

  export function structuralResultRows(rows){
    const r = state.results;
    const methodLabels = {cg:'Conjugate Gradient', direct:'Direct (LU)'};
    rows.push(['Solver', methodLabels[state.solverMethod]]);
    const lu = pickLenUnit(r.maxU);
    rows.push(['max |u|', fmtWith(r.maxU, lu)]);
    const su = pickStressUnit(r.maxStress);
    rows.push([r.dim==='1d' ? 'max |σ|' : 'max σ von Mises', fmtWith(r.maxStress, su)]);
    rows.push(['รอบ/step', r.iters]);
    rows.push(['สมดุลแรง (residual)', r.equilibrium.relResidual.toExponential(1)]);
    if(r.exact.available){
      rows.push(['Exact solution', 'มี — ' + r.exact.method]);
    } else {
      rows.push(['Exact solution', 'ไม่มีสูตรอ้างอิงสำหรับกรณีนี้']);
    }
  }
