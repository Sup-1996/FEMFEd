import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import {
  eqBlock,
  GOVERNING_EQ_GENERAL,
  GOVERNING_EQ_EXPANDED,
  GOVERNING_EQ_TRANSIENT_GENERAL,
  GOVERNING_EQ_TRANSIENT_EXPANDED,
} from '../../render/equation-markup.js';
import { renderAll } from '../layout.js';

/**
 * Step 1: pick the governing equation (only Heat Transfer is
 * implemented; Structural is a visible-but-disabled placeholder for a
 * future physics module) and the analysis type (steady / transient).
 */

  export function renderEquationStep(main){
    makeTitle(main, 'เลือกสมการที่ใช้จำลอง', 'เวอร์ชันนี้รองรับการถ่ายเทความร้อน (heat transfer) ทั้งแบบคงตัว (steady-state) และแบบไม่คงตัวตามเวลา (transient)');
    const wrap = document.createElement('div'); wrap.className='eq-choice';
    const opts = [
        {id:'heat', label:'Heat Transfer', tag:'พร้อมใช้งาน', enabled:true},
        {id:'structure', label:'Structural (elastic)', tag:'coming soon', enabled:false},
    ];
    opts.forEach(o=>{
        const b = document.createElement('div');
        b.className = 'eq-btn' + (state.equation===o.id?' sel':'') + (!o.enabled?' disabled':'');
        b.innerHTML = `${o.label}<span class="tag">${o.tag}</span>`;
        if(o.enabled) b.onclick = ()=>{ state.equation=o.id; renderAll(); };
        wrap.appendChild(b);
    });
    main.appendChild(wrap);

    const wrap2 = document.createElement('div'); wrap2.className='eq-choice';
    const opts2 = [
       {id:'steady', label:'Steady state', enabled:true},
       {id:'transient', label:'Time-dependent (transient)', enabled:true},
    ];
    opts2.forEach(o=>{
       const b = document.createElement('div');
       b.className = 'eq-btn' + (state.analysisType===o.id?' sel':'') + (!o.enabled?' disabled':'');
       b.innerHTML = `${o.label}${!o.enabled?'<span class="tag">coming soon</span>':''}`;
       if(o.enabled) b.onclick = ()=>{ state.analysisType=o.id; state.results=null; renderAll(); };
       wrap2.appendChild(b);
      });
      main.appendChild(wrap2);

      if(state.analysisType==='steady'){
           eqBlock(main, 'Governing equation (steady-state heat conduction)',
               GOVERNING_EQ_GENERAL,
      `เมื่อ <b>T</b> คืออุณหภูมิ, <b>k</b> คือสัมประสิทธิการนำความร้อนของวัสดุ, <b>Q</b> คือแหล่งกำเนิดความร้อนภายในเนื้อวัสดุ (ต่อหน่วยปริมาตร)<br>
                   สำหรับวัสดุที่มีค่า k คงที่สมการนี้เขียนแบบขยายได้เป็น:`
           );
           const box2 = document.createElement('div'); box2.className='eq-block';
           const eq2 = document.createElement('div'); eq2.className='equation'; eq2.innerHTML = GOVERNING_EQ_EXPANDED;
           box2.appendChild(eq2);
           main.appendChild(box2);
      } else {
           eqBlock(main, 'Governing equation (transient heat conduction)',
               GOVERNING_EQ_TRANSIENT_GENERAL,
      `เมื่อ <b>T</b> คืออุณหภูมิ (เปลี่ยนแปลงตามเวลา), <b>ρc</b> คือความจุความร้อนต่อปริมาตร (volumetric heat capacity), <b>k</b> คือสัมประสิทธิการนำความร้อน, <b>Q</b> คือแหล่งกำเนิดความร้อนภายใน (สมมติคงที่ตามเวลา)<br>
                    สำหรับวัสดุที่มีค่า k คงที่สมการนี้เขียนแบบขยายได้เป็น:`
           );
           const box2 = document.createElement('div'); box2.className='eq-block';
           const eq2 = document.createElement('div'); eq2.className='equation'; eq2.innerHTML = GOVERNING_EQ_TRANSIENT_EXPANDED;
           box2.appendChild(eq2);
           main.appendChild(box2);
           const note = document.createElement('div'); note.className='eq-note';
           note.textContent = 'ระบบจะแปลงสมการนี้ เป็นระบบ [M]{dT/dt}+[K]{T}={F} ด้วยไฟไนต์เอลิเมนต์ แล้วเดินเวลาด้วยวิธี Backward Euler (implicit, เสถียรไม่มีเงื่อนไข) — เงื่อนไขขอบเขตและ Q สมมติว่าคงที่ตลอดช่วงเวลาที่จำลอง';
           main.appendChild(note);
      }

      navButtons(main, { next:true, onNext:()=>{ state.step=1; renderAll(); } });
  }
