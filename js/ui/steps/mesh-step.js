import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { eqBlock, collapsibleBlock, frac, rm } from '../../render/equation-markup.js';
import { drawShapeFunctionDiagram } from '../../render/shape-function-diagram.js';
import { draw1DMesh } from '../../render/domain-1d-canvas.js';
import { drawMeshCanvas } from '../../render/contour-canvas.js';
import { sizeCanvas } from '../../render/hidpi.js';
import { generateMesh } from '../../mesh/mesh-service.js';
import { meshQuality } from '../../mesh/mesh-quality.js';
import { renderAll } from '../layout.js';

/**
 * Step 5 (labelled "mesh" - runs after boundary conditions, see the
 * comment in bc-step.js): choose element order (linear/quadratic), the
 * target max element count, then generate the mesh and preview it.
 */

  export function renderMeshStep(main){
    const meshDesc = state.dimension==='1d'
      ? 'กำหนดระดับของเอลิเมนต์และความละเอียดของเมช ระบบจะแบ่งเส้นออกเป็นเอลิเมนต์แท่ง (bar    element) โดยอัตโนมัติ'
      : 'กำหนดระดับของเอลิเมนต์และความละเอียดของเมช ระบบจะสร้างเมชรูปสามเหลี่ยมโดยอัตโนมัติ';
        makeTitle(main, 'ตีเมช (Auto mesh)', meshDesc);

       // --- Element order selection ---
       const orderRow = document.createElement('div'); orderRow.className='shape-choice';
       let svgLinear, svgQuad;
       if(state.dimension==='1d'){
         svgLinear = `<svg viewBox="0 0 60 52"><line x1="6" y1="30" x2="54" y2="30" stroke="#7C8588" stroke-width="1.6"/>
           <circle cx="6" cy="30" r="4" fill="#3FAE8C"/><circle cx="54" cy="30" r="4" fill="#3FAE8C"/></svg>`;
         svgQuad = `<svg viewBox="0 0 60 52"><line x1="6" y1="30" x2="54" y2="30" stroke="#7C8588" stroke-width="1.6"/>
           <circle cx="6" cy="30" r="4" fill="#3FAE8C"/><circle cx="54" cy="30" r="4" fill="#3FAE8C"/><circle cx="30" cy="30" r="4" fill="#D9A441"/></svg>`;
       } else {
         svgLinear = `<svg viewBox="0 0 60 52"><polygon points="6,44 30,8 54,44" fill="none" stroke="#7C8588" stroke-width="1.6"/>
        <circle cx="6" cy="44" r="4" fill="#3FAE8C"/><circle cx="30" cy="8" r="4" fill="#3FAE8C"/><circle cx="54" cy="44" r="4" fill="#3FAE8C"/></svg>`;
      svgQuad = `<svg viewBox="0 0 60 52"><polygon points="6,44 30,8 54,44" fill="none" stroke="#7C8588" stroke-width="1.6"/>
        <circle cx="6" cy="44" r="4" fill="#3FAE8C"/><circle cx="30" cy="8" r="4" fill="#3FAE8C"/><circle cx="54" cy="44" r="4" fill="#3FAE8C"/>
        <circle cx="18" cy="26" r="4" fill="#D9A441"/><circle cx="42" cy="26" r="4" fill="#D9A441"/><circle cx="30" cy="44" r="4" fill="#D9A441"/></svg>`;
  }
  const nodeCountLinear = state.dimension==='1d' ? '2 nodes/element' : '3 nodes/element';
  const nodeCountQuad = state.dimension==='1d' ? '3 nodes/element' : '6 nodes/element';
  const orderLinearBtn = document.createElement('button'); orderLinearBtn.type='button';
  orderLinearBtn.className='shape-btn'+(state.elementOrder==='linear'?' sel':'');
  orderLinearBtn.style.width='150px';
  orderLinearBtn.innerHTML = svgLinear + `<span>First order (linear)<br><span class="unit">${nodeCountLinear}</span></span>`;
  orderLinearBtn.onclick = ()=>{ state.elementOrder='linear'; state.mesh=null; state.results=null; renderAll(); };
  const orderQuadBtn = document.createElement('button'); orderQuadBtn.type='button';
  orderQuadBtn.className='shape-btn'+(state.elementOrder==='quadratic'?' sel':'');
  orderQuadBtn.style.width='150px';
  orderQuadBtn.innerHTML = svgQuad + `<span>Second order (quadratic)<br><span class="unit">${nodeCountQuad}</span></span>`;
  orderQuadBtn.onclick = ()=>{ state.elementOrder='quadratic'; state.mesh=null; state.results=null; renderAll(); };
  orderRow.appendChild(orderLinearBtn); orderRow.appendChild(orderQuadBtn);
  main.appendChild(orderRow);
  const legend = document.createElement('div'); legend.className='eq-note'; legend.style.marginBottom='16px';
  legend.innerHTML = `<span style="color:#3FAE8C">●</span> โหนดมุม (corner node) &nbsp; <span style="color:#D9A441">●</span> โหนดกลาง${state.dimension==='1d'?'เอลิเมนต์':'ขอบ'} (mid node, มีเฉพาะ quadratic)`;
  main.appendChild(legend);

  if(state.elementOrder==='quadratic' && state.analysisType==='transient'){
    const warn = document.createElement('div'); warn.className='note';
    warn.textContent = 'ข้อควรทราบ: สำหรับการวิเคราะห์แบบ transient เอลิเมนต์ quadratic อาจให้อุณหภูมิที่เกินขอบเขตจริงเล็กน้อย (สูงกว่าค่าสูงสุดหรือต่ำกว่าค่าต่ำสุดที่กำหนดไว้) ในช่วงเวลาสั้น ๆ หลังจากอุณหภูมิขอบเปลี่ยนแปลงอย่างฉับพลัน โดยเฉพาะเมื่อใช้ time step ที่ละเอียดมาก — เป็นคุณสมบัติทางคณิตศาสตร์ที่ทราบกันดีของเอลิเมนต์อันดับสูง (ไม่ใช่ข้อผิดพลาดของโปรแกรม) หากต้องการผลลัพธ์ที่เคารพขอบเขตทางฟิสิกส์อย่างเคร่งครัด แนะนำให้ใช้ element order แบบ linear แทน หรือลดจำนวน time step ลง';
      main.appendChild(warn);
  }

  // --- Shape function interpolation (depends on order & dimension) — the
  // core concept for this step, so it stays open by default. ---
  if(state.dimension==='1d'){
    if(state.elementOrder==='linear'){
      eqBlock(main, 'การประมาณค่าอุณหภูมิภายในแต่ละเอลิเมนต์',
        `T${rm('(')}x${rm(')')} ${rm('≈')} N<sub>1</sub>T<sub>1</sub> ${rm('+')} N<sub>2</sub>T<sub>2</sub>`,
   `เอลิเมนต์แท่ง 2 โหนด ประมาณค่าอุณหภูมิแบบเชิงเส้นระหว่างสองปลาย`
           );
       } else {
           eqBlock(main, 'การประมาณค่าอุณหภูมิภายในแต่ละเอลิเมนต์',
               `T${rm('(')}x${rm(')')} ${rm('≈')} N<sub>1</sub>T<sub>1</sub> ${rm('+')} N<sub>2</sub>T<sub>2</sub> ${rm('+')} N<sub>3</sub>T<sub>3</sub>`,
    `เอลิเมนต์แท่ง 3 โหนด (2 ปลาย + 1 กลาง) ประมาณค่าอุณหภูมิแบบพาราโบลา (quadratic) ให้ความแม่นยำสูงกว่าโดยใช้จำนวนเอลิเมนต์เท่ากัน`
           );
       }
  } else if(state.elementOrder==='linear'){
       eqBlock(main, 'การประมาณค่าอุณหภูมิภายในแต่ละเอลิเมนต์ (shape function interpolation)',
           `T${rm('(')}x,y${rm(')')} ${rm('≈')} N<sub>1</sub>T<sub>1</sub> ${rm('+')} N<sub>2</sub>T<sub>2</sub> ${rm('+')} N<sub>3</sub>T<sub>3</sub>`,
  `เอลิเมนต์สามเหลี่ยม 3 โหนด ประมาณค่าอุณหภูมิแบบเชิงเส้น (linear) ภายในเอลิเมนต์`
       );
  } else {
       eqBlock(main, 'การประมาณค่าอุณหภูมิภายในแต่ละเอลิเมนต์ (shape function interpolation)',
           `T${rm('(')}x,y${rm(')')} ${rm('≈')} ${rm('Σ')}<sub>i=1</sub><sup>6</sup> N<sub>i</sub>T<sub>i</sub>`,
  `เอลิเมนต์สามเหลี่ยม 6 โหนด (3 มุม + 3 กลางขอบ) ประมาณค่าอุณหภูมิแบบพาราโบลา (quadratic) ภายในเอลิเมนต์ ให้ความแม่นยำสูงกว่าแบบ linear โดยใช้จำนวนเอลิเมนต์เท่ากัน`
      );
   }

   // --- Illustration: what shape function interpolation actually means, and why it's needed ---
   // Secondary/supplementary material, so it starts collapsed.
   const diagBody = collapsibleBlock(main, 'shape function interpolation คืออะไร และมีไว้ทำไม', false);
   const diagIntro = document.createElement('div'); diagIntro.className='eq-note'; diagIntro.style.marginBottom='8px';
   diagIntro.innerHTML = 'FEM รู้ค่าอุณหภูมิเฉพาะที่ <b>โหนด</b> เท่านั้น แต่ในความเป็นจริงอุณหภูมิมีค่าทุกจุดต่อเนื่องกันภายในเอลิเมนต์ — shape function N<sub>i</sub>(x) คือฟังก์ชันน้ำหนักที่ใช้ "เติมเต็ม" ค่าระหว่างโหนด ให้กลายเป็นฟังก์ชันต่อเนื่องที่คำนวณอนุพันธ์/อินทิกรัลต่อได้ (จำเป็นสำหรับการประกอบเมทริกซ์ [k<sub>e</sub>]) ตัวอย่างด้านล่างสาธิตด้วยเอลิเมนต์เส้นตรง 1 มิติ — แนวคิดเดียวกันนี้ขยายไปใช้กับเอลิเมนต์สามเหลี่ยมใน 2 มิติด้วย';
   diagBody.appendChild(diagIntro);
   const diagCv = document.createElement('canvas'); sizeCanvas(diagCv, 460, 320);
   diagBody.appendChild(diagCv);
   drawShapeFunctionDiagram(diagCv, state.elementOrder);

    // --- Brief discretized elemental equation --- (a summary aside, starts collapsed)
    eqBlock(main, 'สมการเอลิเมนต์ที่ได้จากการ discretize (โดยสังเขป)',
       `${rm('[')}k<sub>e</sub>${rm(']{')}T<sub>e</sub>${rm('} = {')}F<sub>e</sub>${rm('}')}`,
  `เมทริกซ์ [k<sub>e</sub>] และเวกเตอร์ {F<sub>e</sub>} ของแต่ละเอลิเมนต์คำนวณจากอินทิกรัลของ k(∇N<sub>i</sub>·∇N<sub>j</sub>) และ Q·N<sub>i</sub> ตามลำดับ แล้วนำไปประกอบรวม (assemble) เป็นระบบสมการรวมทั้งโมเดลในขั้นตอนถัดไป`,
   {open:false}
   );

   // --- Mesh density: quick presets (หยาบ/กลาง/ละเอียด) plus the exact
   // number field for fine control — clicking a preset just fills the
   // field, it doesn't generate the mesh by itself. ---
   const presets = state.dimension==='1d'
     ? [['หยาบ',20],['กลาง',100],['ละเอียด',500]]
     : [['หยาบ',60],['กลาง',500],['ละเอียด',2000]];
   const presetRow = document.createElement('div'); presetRow.className='shape-choice'; presetRow.style.marginBottom='6px';
   const presetBtns = [];
   const row = document.createElement('div'); row.className='field-row';
   const f = document.createElement('div'); f.className='field'; f.style.minWidth='220px';
   f.innerHTML = `<label>จำนวน Element สูงสุด (max elements)</label>`;
   const numInp = document.createElement('input'); numInp.type='number'; numInp.min='1'; numInp.max='5000'; numInp.step='1'; numInp.value=state.maxElements;
   function syncPresetHighlight(){
     presetBtns.forEach(({btn,val})=>{ btn.classList.toggle('sel', state.maxElements===val); });
   }
   presets.forEach(([label,val])=>{
     const b = document.createElement('button'); b.type='button'; b.className='secondary';
     b.textContent = `${label} (~${val})`;
     b.onclick = ()=>{ state.maxElements = val; numInp.value = val; syncPresetHighlight(); };
     presetRow.appendChild(b);
     presetBtns.push({btn:b, val});
   });
   main.appendChild(presetRow);
   numInp.addEventListener('input', ()=>{
     const v = parseInt(numInp.value);
     if(!isNaN(v)){ state.maxElements = Math.max(1, Math.min(5000, v)); syncPresetHighlight(); }
   });
   numInp.addEventListener('blur', ()=>{ numInp.value = state.maxElements; });
   f.appendChild(numInp);
   const u = document.createElement('span'); u.className='unit'; u.textContent='element (ไม่เกิน 5,000)';
   f.appendChild(u);
   row.appendChild(f);
   main.appendChild(row);
   syncPresetHighlight();

   const errDiv = document.createElement('div'); errDiv.className='error';

   const genBtn = document.createElement('button'); genBtn.className='primary'; genBtn.textContent='สร้างเมช';
   genBtn.style.marginBottom='14px';
   genBtn.onclick = ()=>{
      errDiv.style.display='none';
      genBtn.disabled = true;
      genBtn.textContent = 'กำลังสร้างเมช...';
      // Same "let the browser paint first" trick as the Solve button in
      // solve-step.js — meshing a fine polygon is synchronous and can
      // take a moment, so this at least shows the button react before
      // the (still blocking) work runs.
      setTimeout(()=>{
        try{
          generateMesh();
          state.results = null;
        } catch(e){
          errDiv.textContent = 'สร้างเมชไม่สำเร็จ: ' + e.message;
          errDiv.style.display='block';
          state.mesh = null;
        }
        renderAll();
      }, 20);
   };
   main.appendChild(genBtn);
   main.appendChild(errDiv);

   if(state.mesh){
     const q = meshQuality(state.mesh);
     const qualityCols = q ? `
         <div><div class="unit">มุมเล็กสุด (min angle)</div><div style="font-size:20px; font-weight:700; color:var(--mint-deep);">${q.minAngle.toFixed(1)}°</div></div>
         <div><div class="unit">มุมเล็กสุดเฉลี่ย</div><div style="font-size:20px; font-weight:700; color:var(--mint-deep);">${q.meanMinAngle.toFixed(1)}°</div></div>` : '';
     const summary = document.createElement('div'); summary.className='eq-block'; summary.style.background='#fff'; summary.style.borderColor='var(--border-strong)';
     summary.innerHTML = `<div class="eq-caption" style="margin-bottom:10px;">สรุปข้อมูลเมช (${state.elementOrder==='linear'?'first order':'second order'})</div>
       <div style="display:flex; gap:32px; flex-wrap:wrap; font-family:var(--mono);">
         <div><div class="unit">จำนวน Element</div><div style="font-size:20px; font-weight:700; color:var(--mint-deep);">${state.mesh.elements.length}</div></div>
         <div><div class="unit">จำนวน Node</div><div style="font-size:20px; font-weight:700; color:var(--mint-deep);">${state.mesh.nodes.length}</div></div>${qualityCols}
            </div>`;
          main.appendChild(summary);

          const wrap = document.createElement('div'); wrap.className='canvas-wrap';
          if(state.dimension==='1d'){
            const cv = document.createElement('canvas'); sizeCanvas(cv, 520, 140);
            wrap.appendChild(cv);
            main.appendChild(wrap);
            draw1DMesh(cv, state.mesh);
          } else {
            const cv = document.createElement('canvas'); sizeCanvas(cv, 520, 340);
            wrap.appendChild(cv);
            main.appendChild(wrap);
            drawMeshCanvas(cv, state.mesh, false);
          }
      }

      navButtons(main, { back:true, next: !!state.mesh, onNext:()=>{ state.step=5; renderAll(); } });
  }
