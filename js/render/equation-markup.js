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
