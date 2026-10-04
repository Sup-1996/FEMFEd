import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { eqBlock } from '../../render/equation-markup.js';
import { WAVE_EQ_GENERAL, WAVE_EQ_1D, WAVE_EQ_2D } from '../../render/wave-markup.js';
import { plainField } from '../wave-fields.js';
import { waveDomainSize } from '../../mesh/wave-info.js';
import { fmt } from '../structural-format.js';
import { renderInfo } from '../info-panel.js';
import { renderAll } from '../layout.js';

/**
 * Step 3 (Wave): the medium — wave speed c [m/s] and an optional linear
 * damping coefficient gamma [1/s]. The speed is entered directly (it is
 * sqrt(T/rho) for a string or membrane under tension T and mass density
 * rho, and sqrt(K/rho) for sound with bulk modulus K); the mass-matrix
 * type and time stepping are chosen in later steps.
 */

  export function renderWaveMaterialStep(main){
    const is1D = state.dimension==='1d';
    makeTitle(main, 'คุณสมบัติของสื่อ (Wave)',
      'กำหนดความเร็วคลื่น c (ความเร็วที่การรบกวนเดินทางในสื่อ) และค่าการหน่วง γ (ไม่บังคับ) — ใช้หน่วย SI ทั้งหมด');

    const applied = document.createElement('div'); applied.className='eq-applied'; applied.style.display='block'; applied.style.marginBottom='16px';
    const noteDyn = document.createElement('div'); noteDyn.className='eq-note'; noteDyn.style.marginBottom='12px';
    function refresh(edited){
      const w = state.wave;
      applied.textContent = `c = ${fmt(w.c,4)} m/s, γ = ${fmt(w.damping,4)} 1/s`;
      const {w:Wd, h:Hd} = waveDomainSize();
      const Lmax = is1D ? Wd : Math.max(Wd, Hd);
      noteDyn.textContent = `เวลาที่คลื่นเดินข้ามด้านที่ยาวที่สุดของโมเดล (L ≈ ${fmt(Lmax,4)} m) หนึ่งครั้ง ≈ L / c = ${fmt(Lmax/w.c,4)} s — ใช้เป็นแนวทางตั้งเวลาจำลองในขั้นตอนถัดไป`
        + (w.damping>0 ? ` · การหน่วงทำให้แอมพลิจูดลดลงแบบ e^(−γt/2) (ลดเหลือครึ่งหนึ่งใน ≈ ${fmt(2*Math.LN2/w.damping,3)} s)` : '');
      if(edited!==false) state.results = null; // a changed property invalidates any earlier result
      renderInfo();
    }

    const row = document.createElement('div'); row.className='field-row';
    row.appendChild(plainField('ความเร็วคลื่น c', state.wave.c, 'm/s', v=>{ state.wave.c=v; refresh(); }, {min:0, minExclusive:true}).field);
    row.appendChild(plainField('ค่าการหน่วง γ (damping)', state.wave.damping, '1/s  (0 = ไม่มีการหน่วง)', v=>{ state.wave.damping=v; refresh(); }, {min:0}).field);
    main.appendChild(row);
    main.appendChild(applied);
    main.appendChild(noteDyn);

    const body = eqBlock(main, 'Governing equation (wave equation with linear damping)', is1D ? WAVE_EQ_1D : WAVE_EQ_2D,
      `เมื่อ <b>u</b> คือการกระจัดของสาย/เยื่อ (หรือความดันของคลื่นเสียง) ที่ตำแหน่งและเวลาใด ๆ, <b>c</b> คือความเร็วคลื่น และ <b>γ</b> คือค่าการหน่วงแบบเชิงเส้น (γ = 0 คือคลื่นที่ไม่สูญเสียพลังงาน)<br>
       รูปทั่วไปของสมการ (ไม่ขึ้นกับมิติ) คือ:`);
    const eq2 = document.createElement('div'); eq2.className='equation'; eq2.style.marginTop='6px'; eq2.innerHTML = WAVE_EQ_GENERAL;
    body.appendChild(eq2);
    const hint = document.createElement('div'); hint.className='eq-note';
    hint.innerHTML = 'ตัวอย่างค่า c: สายหรือเยื่อที่ตึงด้วยแรง T และมีมวลต่อความยาว/พื้นที่ ρ ให้ c = √(T/ρ) · เสียงในอากาศ ≈ 343 m/s · เสียงในน้ำ ≈ 1,480 m/s · เสียงในเหล็ก ≈ 5,000 m/s';
    body.appendChild(hint);

    refresh(false);
    navButtons(main, { back:true, next:true, onNext:()=>{ state.step=3; renderAll(); } });
  }
