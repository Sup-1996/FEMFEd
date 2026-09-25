import { state, STEPS } from '../state.js';
import { draw1DDomain } from '../render/domain-1d-canvas.js';
import { drawPreviewShape } from '../render/shape-preview-canvas.js';
import { renderInfo } from './info-panel.js';
import { renderAll } from './layout.js';

/**
 * Small DOM-building helpers shared by every wizard step:
 *
 * - makeTitle(main, title, desc): the h2/description pair at the top
 *   of every step panel.
 * - navButtons(main, opts): the "back" / "next" button row, rendered
 *   into the persistent #actionsBar footer rather than into `main`
 *   itself (see the function body for why).
 * - numField(label, value, unit, onChange): a labelled numeric input,
 *   used by the geometry and material steps.
 * - refreshPreviewIfPresent(): re-draws the geometry step's preview
 *   canvas in place (without a full re-render) when a numeric field
 *   changes, and refreshes the info panel.
 */

  export function makeTitle(main, title, desc){
    const h = document.createElement('h2'); h.className='panel-title'; h.textContent=title;
    const p = document.createElement('p'); p.className='panel-desc'; p.textContent=desc;
    main.appendChild(h); main.appendChild(p);
  }

  export function navButtons(main, {back, next, nextLabel, onNext, nextDisabled}){
    const div = document.createElement('div'); div.className='actions';
    if(back){
      const b = document.createElement('button'); b.className='secondary'; b.textContent='← ย้อนกลับ';
      b.onclick = ()=>{ state.step--; renderAll(); };
      div.appendChild(b);
    }
    if(next){
      const n = document.createElement('button'); n.className='primary'; n.textContent = nextLabel || 'ถัดไป →';
      n.disabled = !!nextDisabled;
      n.onclick = onNext;
      div.appendChild(n);
    }
    // Rendered into the persistent #actionsBar footer (a flex sibling of
    // #mainPanel, outside its scroll area — see index.html/layout.js) so
    // Back/Next stay visible without ever overlapping scrolled content,
    // rather than as position:sticky content inside the scrolling `main`
    // itself. The `main` parameter is accepted for a stable call signature
    // across every step file, even though this appends elsewhere.
    document.getElementById('actionsBar').appendChild(div);
  }

  export function numField(labelText, value, unit, onChange){
    const f = document.createElement('div'); f.className='field';
    const l = document.createElement('label'); l.textContent = labelText;
    const i = document.createElement('input'); i.type='number'; i.step='any'; i.value=value; i.min='0.0001';
    i.addEventListener('input', ()=>{
      const v = parseFloat(i.value);
      if(!isNaN(v) && v>0){ onChange(v); refreshPreviewIfPresent(); }
    });
    const u = document.createElement('span'); u.className='unit'; u.textContent=unit;
    f.appendChild(l); f.appendChild(i); f.appendChild(u);
    return f;
  }

  export function refreshPreviewIfPresent(){
    const cv = document.querySelector('#mainPanel .canvas-wrap canvas');
    if(cv && STEPS[state.step].key==='geometry'){
      if(state.dimension==='1d') draw1DDomain(cv, state.geom.length);
      else drawPreviewShape(cv);
    }
    renderInfo();
  }
