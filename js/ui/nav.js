import { state, STEPS } from '../state.js';
import { renderAll } from './layout.js';

/**
 * Left-hand step navigation: draws the six step items (marking the
 * active one, completed ones, and locked ones), and clicking an
 * unlocked item jumps straight to it.
 *
 * Each item is a real <button disabled> rather than a plain <div> with
 * a conditional click handler, so locked/active steps are properly
 * keyboard-focusable (or properly excluded from the tab order when
 * locked) and announced correctly by screen readers.
 */

  export function renderNav(){
    const nav = document.getElementById('stepsNav');
    nav.innerHTML = '';
    STEPS.forEach((s, i)=>{
      const btn = document.createElement('button'); btn.type='button';
      const locked = i > maxReachableStep();
      btn.className = 'step-item' + (i===state.step?' active':'') + (i<state.step?' done':'') + (locked?' locked':'');
      btn.innerHTML = `<span class="n">${i+1}</span><span>${s.label}</span>`;
      btn.disabled = locked;
      if(i===state.step) btn.setAttribute('aria-current', 'step');
      if(!locked){
        btn.addEventListener('click', ()=>{ state.step=i; renderAll(); });
      }
      nav.appendChild(btn);
    });
  }

  export function maxReachableStep(){
    // equation, geometry, material, bc, and mesh steps have no hard prerequisite —
    // mesh generation itself happens inside the mesh step, so it must always be reachable.
    let m = 4;
    if(state.mesh) m = Math.max(m, 5); // solve step unlocks once a mesh exists
    return m;
  }
