import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { eqBlock, frac, rm, bar } from '../../render/equation-markup.js';
import { solveHeatConduction } from '../../solver/steady-solver.js';
import { solveTransientHeatConduction } from '../../solver/transient-solver.js';
import { draw1DMesh, draw1DResultsChart } from '../../render/domain-1d-canvas.js';
import { drawMeshCanvas, drawColorbarInto, drawExactContour } from '../../render/contour-canvas.js';
import { isPlaying, startPlayback, stopPlayback } from '../playback.js';
import { renderAll } from '../layout.js';

/**
 * Step 6: run the solver and show results.
 *
 * renderTransientResults() and renderSteadyResults() are module-internal
 * (renderSolveStep dispatches to one or the other based on
 * state.results.transient) - only renderSolveStep is used elsewhere.
 *
 * The transient time-scrubber's "play" button uses js/ui/playback.js
 * instead of a local `setInterval`/module variable, so that a full
 * re-render (see ui/layout.js) reliably stops it.
 */

  /* --- Step 6: Solve & Results --- */
  export function renderSolveStep(main){
    const dimWord = state.dimension==='1d' ? '1D bar elements' : (state.elementOrder==='linear' ? 'linear (3-node) triangular elements' : 'quadratic (6-node) triangular elements');
  const isTransient = state.analysisType==='transient';
  makeTitle(main, 'รันการจำลองและดูผลลัพธ์', `ระบบจะประกอบสมการไฟไนต์เอลิเมนต์ (${dimWord}) แล้วแก้ระบบสมการด้วยวิธีที่เลือกด้านล่าง`);

  eqBlock(main, isTransient ? 'ระบบสมการที่ถูกประกอบขึ้น (semi-discrete FEM system)' : 'ระบบสมการที่ถูกประกอบขึ้น (discretized FEM system)',
      isTransient ? `${rm('[')}M${rm(']{')}dT/dt${rm('} + [')}K${rm(']{')}T${rm('} = {')}F${rm('}')}` : `${rm('[')}K${rm(']{')}T${rm('} = {')}F${rm('}')}`,
      isTransient ? 'เมทริกซ์มวลความร้อน (mass matrix [M], จาก ρc) และเมทริกซ์ความแข็งเกร็ง [K] ประกอบจากทุกเอลิเมนต์แล้วเดินเวลาด้วย Backward Euler:'
         : 'เมทริกซ์ความแข็งเกร็ง (stiffness matrix) และเวกเตอร์โหลด (load vector) คำนวณจากทุกเอลิเมนต์ในเมชและเงื่อนไขขอบเขตที่กำหนดไว้:'
  );
  const solveDetail = document.createElement('div'); solveDetail.className='eq-block';
  if(isTransient){
     const l1 = document.createElement('div'); l1.className='equation'; l1.style.fontSize='14.5px';
     l1.innerHTML = `${rm('(')}M ${rm('+')} ${rm('Δt')}K${rm(')')} T<sup>n+1</sup> ${rm('=')} M T<sup>n</sup> ${rm('+')} ${rm('Δt')} F`;
     solveDetail.appendChild(l1);
     const noteDetail = document.createElement('div'); noteDetail.className='eq-note';
     noteDetail.textContent = 'สมการนี้เป็นระบบเชิงเส้นคงที่ (ไม่เปลี่ยนตามเวลา เพราะ Δt คงที่) จึงแก้ครั้งเดียวแล้วนำกลับมาใช้ซ้ำทุก time step ได้อย่างมีประสิทธิภาพ';
     solveDetail.appendChild(noteDetail);
  } else if(state.dimension==='1d'){
     const l1 = document.createElement('div'); l1.className='equation'; l1.style.fontSize='14.5px';
     l1.innerHTML = `K<sub>ij</sub> ${rm('=')} ${rm('∫')}<sub>0</sub><sup>L</sup> k${frac('dN','dx')}<sub>i</sub>${frac('dN','dx')}<sub>j</sub> ${rm('dx')}`;
     const l2 = document.createElement('div'); l2.className='equation'; l2.style.fontSize='14.5px'; l2.style.marginTop='6px';
     l2.innerHTML = `F<sub>i</sub> ${rm('=')} ${rm('∫')}<sub>0</sub><sup>L</sup> Q N<sub>i</sub> ${rm('dx')} ${rm('+')} ${bar('q')}N<sub>i</sub>${rm('|')}<sub>boundary</sub>`;
     solveDetail.appendChild(l1); solveDetail.appendChild(l2);
     const noteDetail = document.createElement('div'); noteDetail.className='eq-note';
     noteDetail.textContent = 'จากนั้นบังคับเงื่อนไข Fixed temperature ลงในระบบสมการ แล้วแก้หา {T} ด้วยวิธีที่เลือกด้านล่าง';
     solveDetail.appendChild(noteDetail);
  } else {
     const l1 = document.createElement('div'); l1.className='equation'; l1.style.fontSize='14.5px';
     l1.innerHTML = `K<sub>ij</sub> ${rm('=')} ${rm('∫∫')}<sub>Ω</sub> k${rm('(')}${frac('∂N','∂x')}<sub>i</sub>${frac('∂N','∂x')}<sub>j</sub> ${rm('+')} ${frac('∂N','∂y')}<sub>i</sub>${frac('∂N','∂y')}<sub>j</sub>${rm(') dA')}`;
     const l2 = document.createElement('div'); l2.className='equation'; l2.style.fontSize='14.5px'; l2.style.marginTop='6px';
     l2.innerHTML = `F<sub>i</sub> ${rm('=')} ${rm('∫∫')}<sub>Ω</sub> Q N<sub>i</sub> ${rm('dA')} ${rm('+')} ${rm('∫')}<sub>Γ<sub>N</sub></sub> ${bar('q')} N<sub>i</sub> ${rm('dΓ')}`;
     solveDetail.appendChild(l1); solveDetail.appendChild(l2);
     const noteDetail = document.createElement('div'); noteDetail.className='eq-note';
     noteDetail.textContent = 'จากนั้นบังคับเงื่อนไข Fixed temperature ลงในระบบสมการ แล้วแก้หา {T} ด้วยวิธีที่เลือกด้านล่าง';
     solveDetail.appendChild(noteDetail);
  }
  main.appendChild(solveDetail);

  // --- Solver method selection ---
  const methodInfo = {
     cg:              { label:'Conjugate Gradient', desc: isTransient
      ? 'วิธีวนซ้ำ (iterative) — สำหรับ transient จะเริ่มจากคำตอบของ step ก่อนหน้าเสมอ (warm start) ทำให้ลู่เข้าเร็วในแต่ละ step'
      : 'วิธีวนซ้ำ (iterative) สำหรับระบบสมการที่มี matrix สมมาตรบวกแน่นอน (SPD) — เร็วและประหยัดหน่วยความจำสำหรับเมชขนาดใหญ่' },
     direct:{ label:'Direct (LU decomposition)', desc: isTransient
      ? 'วิธีตรง (direct) — แยกตัวประกอบ (factorize) เมทริกซ์เพียงครั้งเดียวก่อนเริ่มเดินเวลา แล้วใช้ซ้ำทุก step (เร็วกว่าการแก้ใหม่ทุกครั้งมาก)'
      : 'วิธีตรง (direct) แก้สมการด้วยการแยกตัวประกอบ LU ให้คำตอบในจำนวนขั้นตอนที่แน่นอน แต่ใช้เวลานานขึ้นมากเมื่อเมชมีขนาดใหญ่ (O(n³))' },
  };
  const methodRow = document.createElement('div'); methodRow.className='field-row';
  const mf = document.createElement('div'); mf.className='field'; mf.style.minWidth='280px';
  mf.innerHTML = `<label>วิธีแก้ระบบสมการ (solver method)</label>`;
  const msel = document.createElement('select');
  Object.entries(methodInfo).forEach(([v,info])=>{
    const o = document.createElement('option'); o.value=v; o.textContent=info.label;
    if(state.solverMethod===v) o.selected=true;
    msel.appendChild(o);
  });
  msel.addEventListener('change', ()=>{ state.solverMethod = msel.value; renderMain(); });
  mf.appendChild(msel);
  methodRow.appendChild(mf);
  main.appendChild(methodRow);
  const methodDesc = document.createElement('div'); methodDesc.className='eq-note'; methodDesc.style.marginBottom='14px';
  methodDesc.textContent = methodInfo[state.solverMethod].desc;
  main.appendChild(methodDesc);
  if(state.solverMethod==='direct' && state.mesh.nodes.length>600 && !isTransient){
    const warn = document.createElement('div'); warn.className='note';
    warn.textContent = `เมชปัจจุบันมี ${state.mesh.nodes.length} โหนด — วิธี Direct อาจใช้เวลาคำนวณนานพอสมควร (O(n³)) ลองลดความละเอียดเมชหรือเลือกวิธี Conjugate Gradient แทนหากต้องการความเร็ว`;
    main.appendChild(warn);
  }
  if(isTransient && state.mesh.nodes.length>500){
    const warn = document.createElement('div'); warn.className='note';
    warn.textContent = `เมชปัจจุบันมี ${state.mesh.nodes.length} โหนด และจะรัน ${state.transient.steps} time steps — การจำลอง transient บนเมชขนาดใหญ่อาจใช้เวลาสักครู่`;
    main.appendChild(warn);
  }

  const errDiv = document.createElement('div'); errDiv.className='error';
  main.appendChild(errDiv);

  const runBtn = document.createElement('button'); runBtn.className='primary'; runBtn.textContent='▶ รันการจำลอง (Solve)';
  runBtn.style.marginBottom='16px';
  runBtn.onclick = ()=>{
     errDiv.style.display='none';
     try{
       if(isTransient) solveTransientHeatConduction();
       else solveHeatConduction();
     } catch(e){
       errDiv.textContent = e.message;
       errDiv.style.display='block';
       state.results = null;
     }
     if(state.results) state.transientViewStep = state.results.transient ? state.results.steps : 0;
     renderAll();
  };
  main.appendChild(runBtn);

  if(!state.results){
    const wrap = document.createElement('div'); wrap.className='canvas-wrap';
    if(state.dimension==='1d'){
      const cv = document.createElement('canvas'); cv.width=520; cv.height=140;
      wrap.appendChild(cv); main.appendChild(wrap);
      draw1DMesh(cv, state.mesh);
    } else {
      const cv = document.createElement('canvas'); cv.width=480; cv.height=340;
      wrap.appendChild(cv); main.appendChild(wrap);
      drawMeshCanvas(cv, state.mesh, false);
    }
    navButtons(main, { back:true, next:false });
    return;
  }

  // --- Solver info ---
  const solverInfoBox = document.createElement('div'); solverInfoBox.className='eq-applied'; solverInfoBox.style.display='block'; solverInfoBox.style.marginBottom='16px';
  solverInfoBox.textContent = state.results.info;
  main.appendChild(solverInfoBox);

  if(state.results.transient){
    renderTransientResults(main);
  } else {
          renderSteadyResults(main);
      }

      navButtons(main, { back:true, next:false });
  }

  function renderTransientResults(main){
    const results = state.results;
    if(state.transientViewStep===undefined || state.transientViewStep===null) state.transientViewStep = results.steps;
    state.transientViewStep = Math.max(0, Math.min(results.steps, state.transientViewStep));

      const timeRow = document.createElement('div'); timeRow.className='field-row'; timeRow.style.alignItems='flex-end';
      const tf = document.createElement('div'); tf.className='field'; tf.style.minWidth='320px';
      tf.innerHTML = `<label>เวลา (time): <b id="tVal">t = ${results.timeSeries[state.transientViewStep].t.toFixed(4)} s</b> (step ${state.transientViewStep} / ${results.steps})</label>`;
      const tslider = document.createElement('input'); tslider.type='range'; tslider.min='0'; tslider.max=String(results.steps); tslider.value=String(state.transientViewStep);
      tf.appendChild(tslider);
      timeRow.appendChild(tf);
      main.appendChild(timeRow);

      let cv, cbCanvas=null;
      if(state.dimension==='1d'){
        const wrap = document.createElement('div'); wrap.className='canvas-wrap';
        cv = document.createElement('canvas'); cv.width=560; cv.height=320;
        wrap.appendChild(cv); main.appendChild(wrap);
      } else {
        const wrap = document.createElement('div'); wrap.className='canvas-wrap'; wrap.style.display='flex'; wrap.style.gap='16px'; wrap.style.flexWrap='wrap';
        cv = document.createElement('canvas'); cv.width=440; cv.height=320;
        wrap.appendChild(cv);

          const CB_HEIGHT = 200;
          const cbWrap = document.createElement('div'); cbWrap.className='colorbar';
          cbCanvas = document.createElement('canvas'); cbCanvas.width=24; cbCanvas.height=CB_HEIGHT;
          const ticksCol = document.createElement('div'); ticksCol.className='ticks';
          ticksCol.style.height = CB_HEIGHT+'px'; ticksCol.style.width='46px';
          for(let i=0;i<=10;i++){
            const yPx = (CB_HEIGHT-1)*(i/10);
            const val = results.max - i*(results.max-results.min)/10;
            const t = document.createElement('span'); t.style.top=yPx+'px'; t.textContent=val.toFixed(1)+'°';
            ticksCol.appendChild(t);
          }
          cbWrap.appendChild(cbCanvas); cbWrap.appendChild(ticksCol);
          wrap.appendChild(cbWrap);
          main.appendChild(wrap);
          drawColorbarInto(cbCanvas);
      }

      function renderFrame(){
        const idx = state.transientViewStep;
        const s = results.timeSeries[idx];
        tslider.value = String(idx);
        const tValEl = document.getElementById('tVal');
        if(tValEl) tValEl.textContent = `t = ${s.t.toFixed(4)} s`;
        const lbl = tslider.parentElement.querySelector('label');
        if(lbl) lbl.innerHTML = `เวลา (time): <b id="tVal">t = ${s.t.toFixed(4)} s</b> (step ${idx} / ${results.steps})`;
        if(state.dimension==='1d'){
          draw1DResultsChart(cv, state.mesh, s.T, null);
        } else {
          drawMeshCanvas(cv, state.mesh, true, {T:s.T, min:results.min, max:results.max});
        }
      }
      renderFrame();

      // --- Playback controls (10 fps, like a short video of the simulation) ---
      const playRow = document.createElement('div'); playRow.className='actions'; playRow.style.marginTop='10px';
      const playBtn = document.createElement('button'); playBtn.className='primary';
      const pauseBtn = document.createElement('button'); pauseBtn.className='secondary'; pauseBtn.textContent='⏸ หยุดชั่วคราว';
      const restartBtn = document.createElement('button'); restartBtn.className='secondary'; restartBtn.textContent='⏮ เริ่มใหม่';
      playRow.appendChild(playBtn); playRow.appendChild(pauseBtn); playRow.appendChild(restartBtn);
      main.appendChild(playRow);
      const fpsNote = document.createElement('div'); fpsNote.className='unit'; fpsNote.style.margin='4px 0 12px 0';
      fpsNote.textContent = `เล่นผลลัพธ์ทุก time step ต่อเนื่องกันที่ 10 เฟรม/วินาที (100 ms ต่อเฟรม) — วนซ้ำอัตโนมัติเมื่อจบ`;
      main.appendChild(fpsNote);

      function syncButtons(){
        const playing = isPlaying();
        playBtn.textContent = playing ? '▶ กำลังเล่น...' : '▶ เล่น';
        playBtn.disabled = playing;
        pauseBtn.disabled = !playing;
      }

      tslider.addEventListener('input', ()=>{
         stopPlayback();
         state.transientViewStep = parseInt(tslider.value);
         renderFrame();
         syncButtons();
      });
      playBtn.onclick = () => {
         if(state.transientViewStep >= results.steps) state.transientViewStep = 0;
         startPlayback(()=>{
           state.transientViewStep++;
           if(state.transientViewStep > results.steps) state.transientViewStep = 0; // loop
           renderFrame();
         }, 100);
         syncButtons();
      };
      pauseBtn.onclick = () => { stopPlayback(); syncButtons(); };
      restartBtn.onclick = () => { stopPlayback(); state.transientViewStep=0; renderFrame(); syncButtons(); };
      syncButtons();

      const note = document.createElement('div'); note.className='eq-note'; note.style.marginTop='10px';
      note.textContent = `สเกลสีคงที่ตลอดช่วงเวลา (${results.min.toFixed(2)}–${results.max.toFixed(2)} °C) เพื่อให้เปรียบเทียบระหว่างช่วงเวลาต่าง ๆ ได้อย่างถูกต้อง — ${results.exact.note}`;
      main.appendChild(note);
  }

  function renderSteadyResults(main){
    if(state.dimension==='1d'){
      const wrap = document.createElement('div'); wrap.className='canvas-wrap';
      const cv = document.createElement('canvas'); cv.width=560; cv.height=320;
      wrap.appendChild(cv); main.appendChild(wrap);
      draw1DResultsChart(cv, state.mesh, state.results.T, state.results.exact.available ? state.results.exact.T : null);
    } else {
      const wrap = document.createElement('div'); wrap.className='canvas-wrap'; wrap.style.display='flex'; wrap.style.gap='16px'; wrap.style.flexWrap='wrap';
      const cv = document.createElement('canvas'); cv.width=440; cv.height=320;
      wrap.appendChild(cv);

        const CB_HEIGHT = 200;
        const cbWrap = document.createElement('div'); cbWrap.className='colorbar';
        const cbCanvas = document.createElement('canvas'); cbCanvas.width=24; cbCanvas.height=CB_HEIGHT;
        const ticksCol = document.createElement('div'); ticksCol.className='ticks';
        ticksCol.style.height = CB_HEIGHT+'px';
        ticksCol.style.width = '46px';
          for(let i=0;i<=10;i++){
            const yPx = (CB_HEIGHT-1) * (i/10);
            const val = state.results.max - i*(state.results.max-state.results.min)/10;
            const t = document.createElement('span'); t.style.top = yPx+'px'; t.textContent = val.toFixed(1)+'°';
            ticksCol.appendChild(t);
          }
          cbWrap.appendChild(cbCanvas); cbWrap.appendChild(ticksCol);
          wrap.appendChild(cbWrap);

          let cvExact=null;
          if(state.results.exact.available){
            const exactWrap = document.createElement('div');
            const exactLbl = document.createElement('div'); exactLbl.className='unit'; exactLbl.style.marginBottom='4px'; exactLbl.textContent='Exact solution (สำหรับเปรียบเทียบ)';
              exactWrap.appendChild(exactLbl);
              cvExact = document.createElement('canvas'); cvExact.width=300; cvExact.height=220;
              exactWrap.appendChild(cvExact);
              wrap.appendChild(exactWrap);
          }
          main.appendChild(wrap);

          drawMeshCanvas(cv, state.mesh, true);
          drawColorbarInto(cbCanvas);
          if(cvExact) drawExactContour(cvExact, state.mesh, state.results.exact.T, state.results.min, state.results.max);
      }

      // --- Exact solution comparison panel ---
      const exact = state.results.exact;
      const exBox = document.createElement('div'); exBox.className='eq-block'; exBox.style.marginTop='16px';
      if(exact.available){
        exBox.innerHTML = `<div class="eq-caption" style="margin-bottom:8px;">เปรียบเทียบกับ Exact Solution — ${exact.method}</div>`;
        const statsRow = document.createElement('div'); statsRow.style.display='flex'; statsRow.style.gap='28px'; statsRow.style.fontFamily='var(--mono)'; statsRow.style.marginBottom='8px';
        statsRow.innerHTML = `
          <div><div class="unit">Max error</div><div style="font-size:17px; font-weight:700; color:var(--mint-deep);">${exact.maxErr.toExponential(3)} °C</div></div>
          <div><div class="unit">RMS error</div><div style="font-size:17px; font-weight:700; color:var(--mint-deep);">${exact.rmsErr.toExponential(3)} °C</div></div>`;
        exBox.appendChild(statsRow);
        const noteEl = document.createElement('div'); noteEl.className='eq-note'; noteEl.textContent = exact.note + (exact.statsExcludeBoundary ? ' (คำนวณ error จากโหนดภายในเท่านั้น)' : '');
        exBox.appendChild(noteEl);
      } else {
        exBox.innerHTML = `<div class="eq-caption" style="margin-bottom:8px;">Exact Solution</div>`;
        const noteEl = document.createElement('div'); noteEl.className='eq-note'; noteEl.textContent = exact.note;
        exBox.appendChild(noteEl);
      }
      main.appendChild(exBox);
  }
