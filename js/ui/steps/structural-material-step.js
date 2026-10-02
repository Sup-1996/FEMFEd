import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { eqBlock, collapsibleBlock, rm } from '../../render/equation-markup.js';
import { planeD } from '../../solver/structural-assembly.js';
import { unitInput, fmt, fmtWith, pickStressUnit } from '../structural-format.js';
import { renderInfo } from '../info-panel.js';
import { renderAll, renderMain } from '../layout.js';

/**
 * Step 3 (Structural): linear-elastic material — E and nu, plus the
 * plane-stress/plane-strain choice and thickness in 2D, or the cross-
 * section area A for the 1D bar. Everything is stored in SI in
 * state.structural; the unit selectors only change how a value is shown.
 *
 * The Hooke's-law block shows the D matrix with the current numbers and
 * updates live as E / nu / mode change.
 */

  const UNITS_E = [['Pa',1],['MPa',1e6],['GPa',1e9]];
  const UNITS_T = [['m',1],['cm',1e-2],['mm',1e-3]];
  const UNITS_A = [['m²',1],['cm²',1e-4],['mm²',1e-6]];

  export function renderStructuralMaterialStep(main){
    const s = state.structural;
    const is1D = state.dimension==='1d';
    makeTitle(main, 'คุณสมบัติของวัสดุ (Structural)',
      is1D ? 'กำหนดโมดูลัสของยัง (E) และพื้นที่หน้าตัด (A) ของแท่งที่รับแรงตามแกน — วัสดุยืดหยุ่นเชิงเส้น (linear elastic) และเป็นเนื้อเดียวกันตลอดแท่ง'
           : 'กำหนดสมมติฐานของปัญหา 2 มิติและค่าคงที่ของวัสดุยืดหยุ่นเชิงเส้น (isotropic linear elastic): โมดูลัสของยัง E และอัตราส่วนปัวซอง ν');

    if(!is1D){
      const modeRow = document.createElement('div'); modeRow.className='eq-choice';
      [
        ['plane_stress','Plane stress','แผ่นบางรับแรงในระนาบ (σz = 0)'],
        ['plane_strain','Plane strain','วัตถุยาวมากตามแกน z (εz = 0)'],
      ].forEach(([id,label,tag])=>{
        const b = document.createElement('button'); b.type='button';
        b.className = 'eq-btn' + (s.mode===id ? ' sel' : '');
        b.innerHTML = `${label}<span class="tag">${tag}</span>`;
        b.onclick = ()=>{ s.mode = id; state.results = null; renderMain(); renderInfo(); };
        modeRow.appendChild(b);
      });
      main.appendChild(modeRow);
    }

    const applied = document.createElement('div'); applied.className='eq-applied'; applied.style.display='block'; applied.style.marginBottom='16px';
    const dBox = document.createElement('div');

    function refresh(edited){
      const su = pickStressUnit(s.E);
      let txt = `E = ${fmtWith(s.E, su)}`;
      if(is1D) txt += `, A = ${fmt(s.area*1e4)} cm²`;
      else {
        txt += `, ν = ${s.nu}`;
        if(s.mode==='plane_stress') txt += `, t = ${fmt(s.thickness*1e3)} mm`;
      }
      applied.textContent = txt;
      if(!is1D) fillDMatrix(dBox);
      if(edited!==false) state.results = null; // a changed property invalidates any earlier result
      renderInfo();
    }

    function field(label, control, hint){
      const f = document.createElement('div'); f.className='field';
      const l = document.createElement('label'); l.textContent = label;
      f.appendChild(l); f.appendChild(control);
      if(hint){ const u = document.createElement('span'); u.className='unit'; u.textContent = hint; f.appendChild(u); }
      return f;
    }

    const row = document.createElement('div'); row.className='field-row';
    row.appendChild(field('โมดูลัสของยัง E', unitInput(s.E, UNITS_E, 2, v=>{ s.E=v; refresh(); }, {min:1}), 'ตัวอย่าง: เหล็ก ≈ 200 GPa, อะลูมิเนียม ≈ 70 GPa'));
    if(is1D){
      row.appendChild(field('พื้นที่หน้าตัด A', unitInput(s.area, UNITS_A, 1, v=>{ s.area=v; refresh(); }, {min:1e-12}), 'คงที่ตลอดความยาวแท่ง'));
    } else {
      const nuInp = document.createElement('input'); nuInp.type='number'; nuInp.step='any'; nuInp.min='0'; nuInp.max='0.49'; nuInp.value = s.nu;
      nuInp.addEventListener('input', ()=>{
        const v = parseFloat(nuInp.value);
        if(!isNaN(v) && v>=0 && v<0.5){ s.nu = v; refresh(); }
      });
      row.appendChild(field('อัตราส่วนปัวซอง ν', nuInp, 'ใช้ได้ในช่วง 0 – 0.49 (เหล็ก ≈ 0.3)'));
      if(s.mode==='plane_stress'){
        row.appendChild(field('ความหนาของแผ่น t', unitInput(s.thickness, UNITS_T, 2, v=>{ s.thickness=v; refresh(); }, {min:1e-9}), 'ตั้งฉากกับระนาบ 2D'));
      }
    }
    main.appendChild(row);
    if(!is1D && s.mode==='plane_strain'){
      const n = document.createElement('div'); n.className='eq-note'; n.style.marginBottom='10px';
      n.textContent = 'Plane strain พิจารณาชิ้นส่วนความลึก 1 m ตามแกน z จึงไม่ต้องกำหนดความหนา (แรงที่กระทำมีหน่วยต่อความลึก 1 m)';
      main.appendChild(n);
    }
    main.appendChild(applied);

    if(is1D){
      eqBlock(main, "Hooke's law (แท่งรับแรงตามแกน)",
        `σ ${rm('=')} E ε ${rm(',')} ε ${rm('=')} du/dx`,
        'σ คือความเค้นตามแกน (Pa), ε คือความเครียด, u คือการเคลื่อนที่ตามแกน x — แรงภายในคือ N = σA = EA·(du/dx) ความแข็งเกร็งของแท่งยาว L เท่ากับ EA/L');
    } else {
      const body = collapsibleBlock(main, "Hooke's law และเมทริกซ์ [D] ของสมมติฐานที่เลือก", true);
      const eq = document.createElement('div'); eq.className='equation';
      eq.innerHTML = `${rm('{')}σ${rm('} = [')}D${rm(']{')}ε${rm('}')}`;
      body.appendChild(eq);
      const note = document.createElement('div'); note.className='eq-note';
      note.innerHTML = '{σ} = {σ<sub>x</sub> σ<sub>y</sub> τ<sub>xy</sub>}<sup>T</sup> และ {ε} = {ε<sub>x</sub> ε<sub>y</sub> γ<sub>xy</sub>}<sup>T</sup> — เมทริกซ์ [D] ที่ใช้อยู่ตอนนี้ (ตัวเลขอัปเดตตามค่าที่กรอกด้านบน):';
      body.appendChild(note);
      body.appendChild(dBox);
      fillDMatrix(dBox);
    }

    refresh(false);
    navButtons(main, { back:true, next:true, onNext:()=>{ state.step=3; renderAll(); } });
  }

  function fillDMatrix(box){
    const s = state.structural;
    const D = planeD(s.E, s.nu, s.mode);
    const su = pickStressUnit(s.E);
    box.innerHTML = '';
    const head = document.createElement('div'); head.className='eq-note';
    head.style.fontWeight='600';
    head.textContent = s.mode==='plane_stress'
      ? 'Plane stress: [D] = E/(1−ν²) · [[1, ν, 0], [ν, 1, 0], [0, 0, (1−ν)/2]]'
      : 'Plane strain: [D] = E/((1+ν)(1−2ν)) · [[1−ν, ν, 0], [ν, 1−ν, 0], [0, 0, (1−2ν)/2]]';
    box.appendChild(head);
    const table = document.createElement('table');
    table.style.borderCollapse='collapse'; table.style.margin='8px 0'; table.style.fontFamily='var(--sans)';
    D.forEach(r=>{
      const tr = document.createElement('tr');
      r.forEach(v=>{
        const td = document.createElement('td');
        td.style.padding='4px 14px'; td.style.textAlign='right'; td.style.borderLeft='1px solid var(--border-strong)';
        td.textContent = fmt(v/su.f, 4);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    box.appendChild(table);
    const u = document.createElement('div'); u.className='unit'; u.textContent = `หน่วยของสมาชิกในเมทริกซ์: ${su.name}`;
    box.appendChild(u);
  }
