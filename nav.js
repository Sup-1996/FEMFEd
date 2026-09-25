import { state, STEPS } from '../state.js';
import { renderAll } from './layout.js';

/**
 * Left-hand step navigation: draws the six step items (marking the
 * active one, completed ones, and locked ones), and clicking an
 * unlocked item jumps straight to it.
 */

  export function renderNav(){
    const nav = document.getElementById('stepsNav');
    nav.innerHTML = '';
    STEPS.forEach((s, i)=>{
      const div = document.createElement('div');
      const locked = i > maxReachableStep();
      div.className = 'step-item' + (i===state.step?' active':'') + (i<state.step?' done':'') + (locked?' locked':'');
      div.innerHTML = `<span class="n">${i+1}</span><span>${s.label}</span>`;
      if(!locked){
        div.addEventListener('click', ()=>{ state.step=i; renderAll(); });
      }
      nav.appendChild(div);
    });
  }

  export function maxReachableStep(){
    // equation, geometry, material, bc, and mesh steps have no hard prerequisite —
    // mesh generation itself happens inside the mesh step, so it must always be reachable.
    let m = 4;
    if(state.mesh) m = Math.max(m, 5); // solve step unlocks once a mesh exists
    return m;
  }
