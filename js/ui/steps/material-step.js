import { state } from '../../state.js';
import { makeTitle, navButtons, numField } from '../dom-helpers.js';
import { eqBlock, rm, vec } from '../../render/equation-markup.js';
import { renderAll } from '../layout.js';

/**
 * Step 3: material properties (k, and rho/cp when the analysis is
 * transient) plus the optional internal heat source Q.
 */

  /* --- Step 3: Material --- */
  export function renderMaterialStep(main){
    makeTitle(main, 'คุณสมบัติของวัสดุ', 'กำหนดค่าที่จำเป็นสำหรับสมการการนำความร้อน (หนา 1 หน่วยตั้งฉากกับระนาบ 2D)');

      const applied = document.createElement('div'); applied.className='eq-applied'; applied.style.display='block'; applied.style.marginBottom='16px';
      const noteT = document.createElement('div'); noteT.className='eq-note'; noteT.style.marginTop='8px';
      function refreshApplied(){
        let txt = `k = ${state.material.k} W/(m·K), Q = ${state.material.Q} W/m³`;
        if(state.analysisType==='transient'){
          txt += `, ρ = ${state.material.rho} kg/m³, cp = ${state.material.cp} J/(kg·K)`;
          noteT.textContent = `ρc (ความจุความร้อนต่อปริมาตร) = ρ × cp = ${(state.material.rho*state.material.cp).toLocaleString()} J/(m³·K) — ใช้ในสมการ transient governing equation ที่แสดงไว้ในขั้นตอนก่อนหน้า ส่วนอุณหภูมิเริ่มต้นและระยะเวลาการจำลองกำหนดในขั้นตอนถัดไป`;
         }
         applied.textContent = txt;
      }

      const row = document.createElement('div'); row.className='field-row';
      row.appendChild(numField('สัมประสิทธิการนำความร้อน k', state.material.k, 'W/(m·K)', v=>{state.material.k=v; refreshApplied();}));
      if(state.analysisType==='transient'){
        row.appendChild(numField('ความหนาแน่น ρ', state.material.rho, 'kg/m³', v=>{state.material.rho=v; refreshApplied();}));
        row.appendChild(numField('ความจุความร้อนจำเพาะ cp', state.material.cp, 'J/(kg·K)', v=>{state.material.cp=v; refreshApplied();}));
      }
      main.appendChild(row);

      const row2 = document.createElement('div'); row2.className='field-row';
      const f2 = document.createElement('div'); f2.className='field';
      f2.innerHTML = `<label>แหล่งกำเนิดความร้อนภายใน Q (ไม่บังคับ)</label>`;
      const i2 = document.createElement('input'); i2.type='number'; i2.step='any'; i2.value=state.material.Q;
      i2.addEventListener('input', ()=>{ const v=parseFloat(i2.value); state.material.Q = isNaN(v)?0:v; refreshApplied(); });
      const u2 = document.createElement('span'); u2.className='unit'; u2.textContent='W/m³';
      f2.appendChild(i2); f2.appendChild(u2);
      row2.appendChild(f2);
      main.appendChild(row2);

      refreshApplied();
      main.appendChild(applied);

      const body = eqBlock(main, "Fourier's law (ความสัมพันธ์ของฟลักซ์ความร้อนกับ k)",
         `${vec('q')} ${rm('=')} ${rm('-')}k∇T`,
         `<b>q</b> (ตัวหนา) คือเวกเตอร์ฟลักซ์ความร้อน (W/m²) เครื่องหมายลบแสดงว่าความร้อนไหลจากบริเวณอุณหภูมิสูง ไปยังบริเวณอุณหภูมิต่ำ ค่า <b>k</b> ที่กำหนดด้านบนจะถูกใช้ในสมการนี้ และในสมการการนำความร้อนหลัก (governing equation) ที่แสดงไว้ในขั้นตอนก่อนหน้า`
      );

      if(state.analysisType==='transient'){
        body.appendChild(noteT);
      }

      navButtons(main, { back:true, next:true, onNext:()=>{ state.step=3; renderAll(); } });
  }
