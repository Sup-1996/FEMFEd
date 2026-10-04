/**
 * A labelled numeric input for the Wave module's steps, for values that may
 * be zero or negative (numField() in dom-helpers.js accepts only positive
 * values). onChange(v) is called only for a valid number inside the limits;
 * opts = { min, max, minExclusive } (all optional).
 * Returns { field, input } so a caller can refresh the input's text.
 */
  export function plainField(label, value, unit, onChange, opts){
    opts = opts || {};
    const f = document.createElement('div'); f.className='field';
    const l = document.createElement('label'); l.textContent = label;
    const i = document.createElement('input'); i.type='number'; i.step='any'; i.value = value;
    i.addEventListener('input', ()=>{
      const v = parseFloat(i.value);
      if(isNaN(v)) return;
      if(opts.min!==undefined && (opts.minExclusive ? v<=opts.min : v<opts.min)) return;
      if(opts.max!==undefined && v>opts.max) return;
      onChange(v);
    });
    f.appendChild(l); f.appendChild(i);
    if(unit){ const u = document.createElement('span'); u.className='unit'; u.textContent = unit; f.appendChild(u); }
    return { field:f, input:i };
  }

  export function roundNice(v){ return String(Number(v.toPrecision(6))); }
