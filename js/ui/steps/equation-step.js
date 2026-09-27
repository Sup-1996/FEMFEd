import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import {
  eqBlock,
  GOVERNING_EQ_GENERAL,
  GOVERNING_EQ_EXPANDED,
  GOVERNING_EQ_TRANSIENT_GENERAL,
  GOVERNING_EQ_TRANSIENT_EXPANDED,
} from '../../render/equation-markup.js';
import { generateMesh } from '../../mesh/mesh-service.js';
import { solveHeatConduction } from '../../solver/steady-solver.js';
import { renderAll } from '../layout.js';

/**
 * Step 1: pick the governing equation (only Heat Transfer is
 * implemented; Structural is a visible-but-disabled placeholder for a
 * future physics module), the analysis type (steady / transient), and
 * optionally jump straight to a solved example via PRESETS below.
 */

  // Each preset fully specifies a model (geometry, material, BCs), meshes
  // it, solves it, and jumps to the results step (5) — for a quick class
  // demo, or as a concrete starting point to then walk back through via
  // "ย้อนกลับ" and see how it was built.
  const PRESETS = [
    { label:'แท่ง 1D: ปลายร้อน–เย็น', build(){
        state.equation='heat'; state.analysisType='steady';
        state.dimension='1d'; state.shape='line';
        state.geom.length = 1;
        state.material.k = 1; state.material.Q = 0;
        state.elementOrder='linear'; state.maxElements=50;
        state.bc = { left:{type:'fixed', value:100}, right:{type:'fixed', value:0} };
    }},
    { label:'แผ่น 2D: 4 ขอบ Dirichlet', build(){
        state.equation='heat'; state.analysisType='steady';
        state.dimension='2d'; state.shape='rectangle';
        state.geom.width=1; state.geom.height=0.6;
        state.material.k = 1; state.material.Q = 0;
        state.elementOrder='linear'; state.maxElements=500;
        state.bc = {
          left:{type:'fixed', value:100}, right:{type:'fixed', value:0},
          top:{type:'fixed', value:50}, bottom:{type:'fixed', value:0},
        };
    }},
    { label:'แผ่น 2D: ขอบพาความร้อน', build(){
        state.equation='heat'; state.analysisType='steady';
        state.dimension='2d'; state.shape='rectangle';
        state.geom.width=1; state.geom.height=0.6;
        state.material.k = 1; state.material.Q = 0;
        state.elementOrder='linear'; state.maxElements=500;
        state.bc = {
          left:{type:'fixed', value:100}, right:{type:'convective', h:10, Tinf:25},
          top:{type:'insulated', value:0}, bottom:{type:'insulated', value:0},
        };
    }},
  ];

  function applyPreset(preset){
    preset.build();
    generateMesh();
    try{ solveHeatConduction(); } catch(e){ state.results = null; }
    state.step = 5;
    renderAll();
  }

  export function renderEquationStep(main){
    makeTitle(main, 'เลือกสมการที่ใช้จำลอง', 'เวอร์ชันนี้รองรับการถ่ายเทความร้อน (heat transfer) ทั้งแบบคงตัว (steady-state) และแบบไม่คงตัวตามเวลา (transient)');
    const wrap = document.createElement('div'); wrap.className='eq-choice';
    const opts = [
        {id:'heat', label:'Heat Transfer', tag:'พร้อมใช้งาน', enabled:true},
        {id:'structure', label:'Structural (elastic)', tag:'coming soon', enabled:false},
    ];
    opts.forEach(o=>{
        const b = document.createElement('button'); b.type='button';
        b.className = 'eq-btn' + (state.equation===o.id?' sel':'') + (!o.enabled?' disabled':'');
        b.innerHTML = `${o.label}<span class="tag">${o.tag}</span>`;
        b.disabled = !o.enabled;
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
       const b = document.createElement('button'); b.type='button';
       b.className = 'eq-btn' + (state.analysisType===o.id?' sel':'') + (!o.enabled?' disabled':'');
       b.innerHTML = `${o.label}${!o.enabled?'<span class="tag">coming soon</span>':''}`;
       b.disabled = !o.enabled;
       if(o.enabled) b.onclick = ()=>{ state.analysisType=o.id; state.results=null; renderAll(); };
       wrap2.appendChild(b);
      });
      main.appendChild(wrap2);

      const presetBox = document.createElement('div'); presetBox.className='eq-block'; presetBox.style.background='var(--peach-tint)'; presetBox.style.borderColor='#EFDDB2';
      const presetCap = document.createElement('div'); presetCap.className='eq-caption'; presetCap.textContent='หรือเริ่มจากตัวอย่างสำเร็จรูป (ตั้งค่าและแก้ปัญหาให้ทันที แล้วข้ามไปดูผลลัพธ์)';
      presetBox.appendChild(presetCap);
      const presetRow = document.createElement('div'); presetRow.style.display='flex'; presetRow.style.gap='10px'; presetRow.style.flexWrap='wrap';
      PRESETS.forEach(preset=>{
        const b = document.createElement('button'); b.type='button'; b.className='secondary';
        b.textContent = preset.label;
        b.onclick = ()=> applyPreset(preset);
        presetRow.appendChild(b);
      });
      presetBox.appendChild(presetRow);
      main.appendChild(presetBox);

      if(state.analysisType==='steady'){
           const body = eqBlock(main, 'Governing equation (steady-state heat conduction)',
               GOVERNING_EQ_GENERAL,
      `เมื่อ <b>T</b> คืออุณหภูมิ, <b>k</b> คือสัมประสิทธิการนำความร้อนของวัสดุ, <b>Q</b> คือแหล่งกำเนิดความร้อนภายในเนื้อวัสดุ (ต่อหน่วยปริมาตร)<br>
                   สำหรับวัสดุที่มีค่า k คงที่สมการนี้เขียนแบบขยายได้เป็น:`
           );
           const eq2 = document.createElement('div'); eq2.className='equation'; eq2.style.marginTop='6px'; eq2.innerHTML = GOVERNING_EQ_EXPANDED;
           body.appendChild(eq2);
      } else {
           const body = eqBlock(main, 'Governing equation (transient heat conduction)',
               GOVERNING_EQ_TRANSIENT_GENERAL,
      `เมื่อ <b>T</b> คืออุณหภูมิ (เปลี่ยนแปลงตามเวลา), <b>ρc</b> คือความจุความร้อนต่อปริมาตร (volumetric heat capacity), <b>k</b> คือสัมประสิทธิการนำความร้อน, <b>Q</b> คือแหล่งกำเนิดความร้อนภายใน (สมมติคงที่ตามเวลา)<br>
                    สำหรับวัสดุที่มีค่า k คงที่สมการนี้เขียนแบบขยายได้เป็น:`
           );
           const eq2 = document.createElement('div'); eq2.className='equation'; eq2.style.marginTop='6px'; eq2.innerHTML = GOVERNING_EQ_TRANSIENT_EXPANDED;
           body.appendChild(eq2);
           const note = document.createElement('div'); note.className='eq-note';
           note.textContent = 'ระบบจะแปลงสมการนี้ เป็นระบบ [M]{dT/dt}+[K]{T}={F} ด้วยไฟไนต์เอลิเมนต์ แล้วเดินเวลาด้วยวิธี Backward Euler (implicit, เสถียรไม่มีเงื่อนไข) — เงื่อนไขขอบเขตและ Q สมมติว่าคงที่ตลอดช่วงเวลาที่จำลอง';
           body.appendChild(note);
      }

      navButtons(main, { next:true, onNext:()=>{ state.step=1; renderAll(); } });
  }
