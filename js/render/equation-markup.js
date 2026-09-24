/**
 * Tiny DOM-building helpers used to render math notation as styled HTML
 * (see .equation / .frac / .eq-block etc. in css/styles.css) - this
 * project does not use MathJax/KaTeX, just span markup:
 *
 *   frac(num, den)  -> stacked fraction
 *   rm(text)        -> upright (non-italic) text inside the otherwise
 *                       italic .equation font, for operators/words
 *   bar(letter)     -> letter with an overline (e.g. a prescribed value)
 *   vec(letter)     -> bold-italic (vector) letter
 *   eqBlock(...)    -> a full captioned equation block, appended to `main`
 *
 * The GOVERNING_EQ_* constants are the four steady/transient governing
 * equation renderings shared by the equation step and reused elsewhere.
 */

  export function frac(num, den){ return `<span class="frac"><span class="num">${num}</span><span class="den">${den}</span></span>`; }
  export function rm(text){ return `<span class="rm">${text}</span>`; }
  export function bar(letter){ return `<span class="rm bar" style="text-decoration:overline;">${letter}</span>`; }
  export function vec(letter){ return `<span class="vec">${letter}</span>`; }

  export function eqBlock(main, caption, equationHtml, noteHtml){
    const box = document.createElement('div'); box.className='eq-block';
    if(caption){
      const cap = document.createElement('div'); cap.className='eq-caption'; cap.textContent = caption;
      box.appendChild(cap);
    }
    const eq = document.createElement('div'); eq.className='equation'; eq.innerHTML = equationHtml;
    box.appendChild(eq);
    if(noteHtml){
      const note = document.createElement('div'); note.className='eq-note'; note.innerHTML = noteHtml;
      box.appendChild(note);
    }
    main.appendChild(box);
  }

  export const GOVERNING_EQ_GENERAL = `∇ ${rm('·')} (k∇T) ${rm('+')} Q ${rm('=')} 0`;
  export const GOVERNING_EQ_EXPANDED = `k${rm('(')}${frac('∂²T','∂x²')}${rm('+')}${frac('∂²T','∂y²')}${rm(')')}${rm('+')} Q ${rm('=')} 0`;
  export const GOVERNING_EQ_TRANSIENT_GENERAL = `${rm('ρc')}${frac('∂T','∂t')} ${rm('=')} ∇ ${rm('·')} (k∇T) ${rm('+')} Q`;
  export const GOVERNING_EQ_TRANSIENT_EXPANDED = `${rm('ρc')}${frac('∂T','∂t')} ${rm('=')} k${rm('(')}${frac('∂²T','∂x²')}${rm('+')}${frac('∂²T','∂y²')}${rm(')')}${rm('+')} Q`;
