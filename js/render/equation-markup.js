export function frac(num, den){ return `<span class="frac"><span class="num">${num}</span><span class="den">${den}</span></span>`; }
  export function rm(text){ return `<span class="rm">${text}</span>`; }
  export function bar(letter){ return `<span class="rm bar" style="text-decoration:overline;">${letter}</span>`; }
  export function vec(letter){ return `<span class="vec">${letter}</span>`; }

  /**
   * A foldable "theory" card: a <details>/<summary> pair styled like the
   * old plain .eq-block div, so every long explanation in the wizard can
   * be collapsed after a first read instead of permanently taking up
   * scroll space. <summary> is natively focusable and toggles on
   * Enter/Space, so this is also a free accessibility win over the old
   * plain div.
   *
   * Returns the inner .eq-body element — append whatever content
   * (equations, notes, canvases, more prose) into that, not into the
   * <details> itself, so it lands after the summary.
   */
  export function collapsibleBlock(main, caption, open){
    const details = document.createElement('details'); details.className='eq-block';
    if(open) details.open = true;
    if(caption){
      const summary = document.createElement('summary'); summary.className='eq-caption'; summary.textContent = caption;
      details.appendChild(summary);
    }
    const body = document.createElement('div'); body.className='eq-body';
    details.appendChild(body);
    main.appendChild(details);
    return body;
  }

  /**
   * eqBlock(main, caption, equationHtml, noteHtml, opts): as before, but
   * now built on collapsibleBlock() and returning the .eq-body element
   * so a caller that used to append a *second* related div right after
   * (an expanded form, extra derivation lines) can instead append into
   * the same foldable card via the returned body — see equation-step.js
   * and solve-step.js for that pattern. opts.open defaults to true;
   * pass {open:false} for secondary/illustrative material that doesn't
   * need to be visible on every visit.
   */
  export function eqBlock(main, caption, equationHtml, noteHtml, opts){
    const open = !opts || opts.open !== false;
    const body = collapsibleBlock(main, caption, open);
    const eq = document.createElement('div'); eq.className='equation'; eq.innerHTML = equationHtml;
    body.appendChild(eq);
    if(noteHtml){
      const note = document.createElement('div'); note.className='eq-note'; note.innerHTML = noteHtml;
      body.appendChild(note);
    }
    return body;
  }

  export const GOVERNING_EQ_GENERAL = `∇ ${rm('·')} (k∇T) ${rm('+')} Q ${rm('=')} 0`;
  export const GOVERNING_EQ_EXPANDED = `k${rm('(')}${frac('∂²T','∂x²')}${rm('+')}${frac('∂²T','∂y²')}${rm(')')}${rm('+')} Q ${rm('=')} 0`;
  export const GOVERNING_EQ_TRANSIENT_GENERAL = `${rm('ρc')}${frac('∂T','∂t')} ${rm('=')} ∇ ${rm('·')} (k∇T) ${rm('+')} Q`;
  export const GOVERNING_EQ_TRANSIENT_EXPANDED = `${rm('ρc')}${frac('∂T','∂t')} ${rm('=')} k${rm('(')}${frac('∂²T','∂x²')}${rm('+')}${frac('∂²T','∂y²')}${rm(')')}${rm('+')} Q`;
