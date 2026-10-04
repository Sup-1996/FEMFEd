import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import {
  eqBlock, rm, frac,
  GOVERNING_EQ_GENERAL,
  GOVERNING_EQ_EXPANDED,
  GOVERNING_EQ_TRANSIENT_GENERAL,
  GOVERNING_EQ_TRANSIENT_EXPANDED,
} from '../../render/equation-markup.js';
import { generateMesh } from '../../mesh/mesh-service.js';
import { solveHeatConduction } from '../../solver/steady-solver.js';
import { solveStructural } from '../../solver/structural-solver.js';
import { ensureStructuralDefaults } from '../../mesh/structural-info.js';
import { solveWave } from '../../solver/wave-solver.js';
import { ensureWaveDefaults } from '../../mesh/wave-info.js';
import { WAVE_EQ_GENERAL, WAVE_EQ_1D, WAVE_EQ_2D, WAVE_EQ_SEMIDISCRETE } from '../../render/wave-markup.js';
import {
  STRUCT_EQ_EQUILIBRIUM, STRUCT_EQ_PLANE_X, STRUCT_EQ_PLANE_Y,
  STRUCT_EQ_CONSTITUTIVE, STRUCT_EQ_KINEMATIC, STRUCT_EQ_BAR,
} from '../../render/structural-markup.js';
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

  // Structural presets: each sets geometry, material, supports and loads (SI),
  // meshes, solves and jumps to the results step, like the heat presets above.
  function structuralBase(dim){
    state.equation='structure'; state.analysisType='steady';
    state.dimension=dim; state.shape = dim==='1d' ? 'line' : 'rectangle';
    state.structural.E = 200e9; state.structural.nu = 0.3;
    state.sbc = {}; state.spl = {};
    state.sview = { field: dim==='1d' ? 'u' : 'vm', deform:true, scale:null, wire:false };
  }
  const STRUCT_PRESETS = [
    { label:'แท่ง 1D: ดึงตามแกน', build(){
        structuralBase('1d');
        state.geom.length = 1; state.structural.area = 1e-4;
        state.elementOrder='linear'; state.maxElements=20;
        ensureStructuralDefaults();
        state.sbc.left.type='fixed'; state.sbc.right.type='load'; state.sbc.right.value=10e3;
    }},
    { label:'แผ่น 2D: ดึงสม่ำเสมอ (patch test)', build(){
        structuralBase('2d');
        state.structural.mode='plane_stress'; state.structural.thickness=0.01;
        state.geom.width=1; state.geom.height=0.6;
        state.elementOrder='linear'; state.maxElements=200;
        ensureStructuralDefaults();
        state.sbc.left.type='roller_x'; state.sbc.bottom.type='roller_y';
        state.sbc.right.type='traction'; state.sbc.right.tx=50e6;
    }},
    { label:'คานยื่น: แรงที่ปลาย', build(){
        structuralBase('2d');
        state.structural.mode='plane_stress'; state.structural.thickness=0.01;
        state.geom.width=1; state.geom.height=0.2;
        state.elementOrder='quadratic'; state.maxElements=400;
        ensureStructuralDefaults();
        state.sbc.left.type='fixed';
        state.sbc.right.type='traction'; state.sbc.right.ty=-1e6;
    }},
  ];

  // Wave presets: each sets geometry, medium, initial condition, edges and time stepping,
  // meshes, solves and jumps to the results step, like the presets above.
  function waveBase(dim){
    state.equation='wave'; state.analysisType='steady'; // (wave runs are always time-dependent; analysisType is unused)
    state.dimension=dim; state.shape = dim==='1d' ? 'line' : 'rectangle';
    state.wave.c = 1; state.wave.damping = 0; state.wave.massType = 'consistent';
    state.wave.ic = { type:'gaussian', amp:1, x0:null, y0:null, sigma:null, m:1, n:1, velType:'zero', v0:0 };
    state.wave.probe = { x:null, y:null }; state.wave.view = { step:null, speed:1 };
    state.wbc = {}; ensureWaveDefaults();
  }
  const WAVE_PRESETS = [
    { label:'สาย 1D: พัลส์เกาส์เซียน (ปลายยึด)', build(){
        waveBase('1d');
        state.geom.length = 1; state.elementOrder='linear'; state.maxElements=400;
        Object.assign(state.wave.ic, { x0:0.3, sigma:0.05 });
        state.wave.transient = { totalTime:2.5, steps:1000 }; // Courant number 1; the pulse reflects twice off the fixed ends
    }},
    { label:'สาย 1D: โหมดที่ 3 (มีคำตอบ exact)', build(){
        waveBase('1d');
        state.geom.length = 1; state.elementOrder='quadratic'; state.maxElements=30;
        Object.assign(state.wave.ic, { type:'mode', m:3 });
        state.wave.transient = { totalTime:4/3, steps:200 }; // two periods of mode 3 (T = 2/3 s)
    }},
    { label:'เยื่อ 2D: พัลส์กลางแผ่น', build(){
        waveBase('2d');
        state.geom.width = 1; state.geom.height = 0.6; state.elementOrder='linear'; state.maxElements=600;
        state.wave.transient = { totalTime:1.2, steps:240 };
    }},
    { label:'เยื่อ 2D: โหมด (2,1) (มีคำตอบ exact)', build(){
        waveBase('2d');
        state.geom.width = 1; state.geom.height = 0.6; state.elementOrder='quadratic'; state.maxElements=200;
        Object.assign(state.wave.ic, { type:'mode', m:2, n:1 });
        const f = Math.sqrt(4+1/0.36)/2; // Hz for c = 1 on a 1 x 0.6 membrane
        state.wave.transient = { totalTime:Number((2/f).toPrecision(5)), steps:300 }; // two periods
    }},
  ];

  function applyPreset(preset){
    preset.build();
    state.mesh = null; state.results = null;
    generateMesh();
    try{
      if(state.equation==='structure') solveStructural();
      else if(state.equation==='wave') solveWave();
      else solveHeatConduction();
    } catch(e){ state.results = null; }
    state.step = 5;
    renderAll();
  }

  export function renderEquationStep(main){
    makeTitle(main, 'เลือกสมการที่ใช้จำลอง', 'เวอร์ชันนี้รองรับการถ่ายเทความร้อน (heat transfer) ทั้งแบบคงตัวและแบบไม่คงตัวตามเวลา, การวิเคราะห์โครงสร้างแบบสถิต (static structural, ยืดหยุ่นเชิงเส้น) และสมการคลื่น (wave equation) ในโดเมนเวลา');
    const wrap = document.createElement('div'); wrap.className='eq-choice';
    const opts = [
        {id:'heat', label:'Heat Transfer', tag:'พร้อมใช้งาน', enabled:true},
        {id:'structure', label:'Structural (elastic)', tag:'static • พร้อมใช้งาน', enabled:true},
        {id:'wave', label:'Wave equation', tag:'time-domain • พร้อมใช้งาน', enabled:true},
    ];
    opts.forEach(o=>{
        const b = document.createElement('button'); b.type='button';
        b.className = 'eq-btn' + (state.equation===o.id?' sel':'') + (!o.enabled?' disabled':'');
        b.innerHTML = `${o.label}<span class="tag">${o.tag}</span>`;
        b.disabled = !o.enabled;
        if(o.enabled) b.onclick = ()=>{
          if(state.equation!==o.id){
            // physics changed: the mesh can stay (a mesh is a mesh), but the old result cannot
            state.equation=o.id; state.results=null; state.analysisType='steady';
          }
          renderAll();
        };
        wrap.appendChild(b);
    });
    main.appendChild(wrap);

    const isStruct = state.equation==='structure';
    const isWave = state.equation==='wave';
    if(isWave){
      const wrap2 = document.createElement('div'); wrap2.className='eq-choice';
      const b = document.createElement('button'); b.type='button'; b.className='eq-btn sel';
      b.innerHTML = 'Time-dependent (transient)<span class="tag">เดินเวลาด้วย Newmark-β • คลื่นสั่นและเคลื่อนที่ตามเวลา</span>';
      wrap2.appendChild(b);
      main.appendChild(wrap2);
    } else if(!isStruct){
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
    } else {
      const wrap2 = document.createElement('div'); wrap2.className='eq-choice';
      const b = document.createElement('button'); b.type='button'; b.className='eq-btn sel';
      b.innerHTML = 'Static (สถิต)<span class="tag">โหลดคงที่ ไม่คิดผลตามเวลา/ความเฉื่อย</span>';
      wrap2.appendChild(b);
      main.appendChild(wrap2);
    }

    const presetBox = document.createElement('div'); presetBox.className='eq-block'; presetBox.style.background='var(--peach-tint)'; presetBox.style.borderColor='#EFDDB2';
    const presetCap = document.createElement('div'); presetCap.className='eq-caption'; presetCap.textContent='หรือเริ่มจากตัวอย่างสำเร็จรูป (ตั้งค่าและแก้ปัญหาให้ทันที แล้วข้ามไปดูผลลัพธ์)';
    presetBox.appendChild(presetCap);
    const presetRow = document.createElement('div'); presetRow.style.display='flex'; presetRow.style.gap='10px'; presetRow.style.flexWrap='wrap';
    (isWave ? WAVE_PRESETS : (isStruct ? STRUCT_PRESETS : PRESETS)).forEach(preset=>{
      const b = document.createElement('button'); b.type='button'; b.className='secondary';
      b.textContent = preset.label;
      b.onclick = ()=> applyPreset(preset);
      presetRow.appendChild(b);
    });
    presetBox.appendChild(presetRow);
    main.appendChild(presetBox);

    if(isWave){
      const body = eqBlock(main, 'Governing equation (wave equation with linear damping)', WAVE_EQ_GENERAL,
        `เมื่อ <b>u</b> คือการกระจัดของสายหรือเยื่อ (หรือความดันของคลื่นเสียง) ที่ตำแหน่งและเวลาใด ๆ, <b>c</b> คือความเร็วคลื่น และ <b>γ</b> คือค่าการหน่วงแบบเชิงเส้น (γ = 0 คือไม่มีการสูญเสียพลังงาน)<br>
         เขียนแยกตามมิติได้เป็น (1 มิติ — สาย/แท่ง, และ 2 มิติ — เยื่อ/แผ่น):`);
      const e1 = document.createElement('div'); e1.className='equation'; e1.style.marginTop='6px'; e1.innerHTML = WAVE_EQ_1D; body.appendChild(e1);
      const e2 = document.createElement('div'); e2.className='equation'; e2.style.marginTop='6px'; e2.innerHTML = WAVE_EQ_2D; body.appendChild(e2);
      const body2 = eqBlock(main, 'ผลเฉลยจะต้องการเงื่อนไขเริ่มต้นสองชุด', `u${rm('(')}x,0${rm(') = ')}u<sub>0</sub>${rm('(')}x${rm('),  ')}${frac('∂u','∂t')}${rm('(')}x,0${rm(') = ')}v<sub>0</sub>${rm('(')}x${rm(')')}`,
        'เพราะสมการเป็นอันดับสองในเวลา ต้องกำหนดทั้งรูปร่างเริ่มต้น u₀ และความเร็วเริ่มต้น v₀ — กำหนดในขั้นตอนเงื่อนไขเริ่มต้น/ขอบเขต', {open:false});
      const note = document.createElement('div'); note.className='eq-note';
      note.textContent = 'ระบบจะแปลงสมการนี้เป็นระบบ [M]{ü}+γ[M]{u̇}+[K]{u}={0} ด้วยไฟไนต์เอลิเมนต์ แล้วเดินเวลาด้วยวิธี Newmark-β (average acceleration, เสถียรไม่มีเงื่อนไข) — ใช้หน่วย SI ทั้งหมด (m, s, m/s)';
      body2.appendChild(note);
    } else if(isStruct){
      const body = eqBlock(main, 'Governing equation (static equilibrium, linear elasticity)',
        STRUCT_EQ_EQUILIBRIUM,
        `เมื่อ <b>σ</b> คือเทนเซอร์ความเค้น (stress) และ <b>b</b> คือแรงต่อหน่วยปริมาตร (body force, เช่น น้ำหนักตัวเอง — ในเวอร์ชันนี้ตั้งเป็น 0)<br>
         สำหรับปัญหา 2 มิติ (plane stress / plane strain) เขียนแยกตามแกนได้เป็น:`);
      const e1 = document.createElement('div'); e1.className='equation'; e1.style.marginTop='6px'; e1.innerHTML = STRUCT_EQ_PLANE_X; body.appendChild(e1);
      const e2 = document.createElement('div'); e2.className='equation'; e2.style.marginTop='6px'; e2.innerHTML = STRUCT_EQ_PLANE_Y; body.appendChild(e2);

      const body2 = eqBlock(main, 'ความสัมพันธ์เสริม: ความเครียด–การเคลื่อนที่ และกฎของฮุก',
        STRUCT_EQ_KINEMATIC,
        'u, v คือการเคลื่อนที่ตามแกน x, y — ความเครียด (strain) หาได้จากอนุพันธ์ของการเคลื่อนที่ ส่วนความเค้นหาได้จากกฎของฮุกในรูปเมทริกซ์:');
      const e3 = document.createElement('div'); e3.className='equation'; e3.style.marginTop='6px'; e3.innerHTML = STRUCT_EQ_CONSTITUTIVE; body2.appendChild(e3);
      const n3 = document.createElement('div'); n3.className='eq-note';
      n3.innerHTML = 'เมทริกซ์ [D] ขึ้นกับ E, ν และสมมติฐาน <b>plane stress</b> (แผ่นบาง σ<sub>z</sub> = 0) หรือ <b>plane strain</b> (ชิ้นงานยาว ε<sub>z</sub> = 0) — เลือกในขั้นตอนคุณสมบัติวัสดุ';
      body2.appendChild(n3);

      const body3 = eqBlock(main, 'กรณี 1 มิติ: แท่งรับแรงตามแกน (bar)', STRUCT_EQ_BAR,
        'E คือโมดูลัสของยัง, A คือพื้นที่หน้าตัด, u คือการเคลื่อนที่ตามแกน — เมื่อ EA คงที่และไม่มีแรงกระจาย แท่งจะมี u(x) เป็นเส้นตรง', {open:false});
      const note = document.createElement('div'); note.className='eq-note';
      note.textContent = 'ระบบจะแปลงสมการนี้เป็นระบบ [K]{u}={F} ด้วยไฟไนต์เอลิเมนต์ (องศาอิสระ: การเคลื่อนที่ u, v ที่แต่ละโหนด) แล้วแก้หาการเคลื่อนที่และคำนวณความเค้นย้อนกลับ — ใช้หน่วย SI ทั้งหมด (m, Pa, N), วัสดุยืดหยุ่นเชิงเส้น เนื้อเดียวกัน และการเสียรูปน้อย (small deformation)';
      body3.appendChild(note);
    } else
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
