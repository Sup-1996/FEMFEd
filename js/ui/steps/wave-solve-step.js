import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { eqBlock, rm, frac } from '../../render/equation-markup.js';
import { WAVE_EQ_SEMIDISCRETE } from '../../render/wave-markup.js';
import { solveWave } from '../../solver/wave-solver.js';
import { draw1DMesh } from '../../render/domain-1d-canvas.js';
import { drawMeshCanvas, drawColorbarInto, drawMeshWireframe, isUniformRange } from '../../render/contour-canvas.js';
import { drawBarChart, attachBarChartHover, attachFieldHover } from '../../render/structural-canvas.js';
import { sizeCanvas } from '../../render/hidpi.js';
import { downloadCanvasPNG, downloadCSV } from '../export-helpers.js';
import { fmt } from '../structural-format.js';
import { plainField, roundNice } from '../wave-fields.js';
import { probeResolved } from '../../mesh/wave-info.js';
import { isPlaying, startPlayback, stopPlayback } from '../playback.js';
import { renderAll, renderMain } from '../layout.js';

/**
 * Step 6 (Wave): run the time-domain solve and show the results.
 *
 * Results: the wave field u at the chosen time (2D contour with a fixed,
 * symmetric colour scale; 1D line chart with the reference curve when one
 * exists), a time slider with Play / Pause / Restart and a speed choice,
 * a probe (u at a chosen point against time), the energy history
 * (kinetic, potential, total) and, where a closed-form solution applies,
 * the error against it (see solver/wave-exact.js).
 *
 * Playback uses js/ui/playback.js so a full re-render stops it.
 */

  const COLOR_TOTAL = '#3A4145', COLOR_KE = '#3FAE8C', COLOR_PE = '#D9A441';

  function statCard(label, value){
    const d = document.createElement('div');
    d.innerHTML = `<div class="unit">${label}</div><div style="font-size:17px; font-weight:700; color:var(--mint-deep);">${value}</div>`;
    return d;
  }
  function statRow(items){
    const row = document.createElement('div');
    row.style.display='flex'; row.style.gap='28px'; row.style.flexWrap='wrap'; row.style.fontFamily='var(--mono)'; row.style.marginBottom='8px';
    items.forEach(([l,v])=> row.appendChild(statCard(l,v)));
    return row;
  }

  export function renderWaveSolveStep(main){
    const is1D = state.dimension==='1d';
    const elWord = is1D ? (state.elementOrder==='linear' ? 'linear (2-node) bar elements' : 'quadratic (3-node) bar elements')
      : (state.elementOrder==='linear' ? 'linear (3-node) triangular elements' : 'quadratic (6-node) triangular elements');
    makeTitle(main, 'รันการจำลองและดูผลลัพธ์ (Wave)', `ระบบจะประกอบสมการไฟไนต์เอลิเมนต์ (${elWord}) แล้วเดินเวลาด้วยวิธี Newmark-β`);

    const body = eqBlock(main, 'ระบบสมการที่ถูกประกอบขึ้น (semi-discrete FEM system)', WAVE_EQ_SEMIDISCRETE,
      'เมทริกซ์มวล [M] (จาก ∫NᵢNⱼ) และเมทริกซ์ [K] (จาก c²∫∇Nᵢ·∇Nⱼ) ประกอบจากทุกเอลิเมนต์ แล้วเดินเวลาด้วย Newmark-β แบบ average acceleration (β = 1/4, γ = 1/2) ซึ่งเสถียรเสมอและไม่สูญเสียพลังงานในกรณีไม่มีการหน่วง:');
    const l1 = document.createElement('div'); l1.className='equation'; l1.style.fontSize='14.5px'; l1.style.marginTop='6px';
    l1.innerHTML = `${rm('(')}K ${rm('+')} ${frac('γ<sub>N</sub>γ','βΔt')}M ${rm('+')} ${frac('1','βΔt²')}M${rm(')')} u<sup>n+1</sup> ${rm('= {')}F<sub>n</sub>${rm('}')}`;
    body.appendChild(l1);
    const nd = document.createElement('div'); nd.className='eq-note';
    nd.textContent = 'เมทริกซ์ด้านซ้ายไม่เปลี่ยนตามเวลา (Δt คงที่) จึงสร้างครั้งเดียวแล้วใช้ซ้ำทุก time step โดยด้านขวา {Fₙ} คำนวณจากผลของ step ก่อนหน้า';
    body.appendChild(nd);

    // --- Solver + mass matrix selection ---
    const methodInfo = {
      cg:{ label:'Conjugate Gradient (sparse)', desc:'วิธีวนซ้ำแบบมี Jacobi preconditioner บนเมทริกซ์ sparse โดยเริ่มจากผลของ step ก่อนหน้า (warm start) — เร็วและประหยัดหน่วยความจำ เหมาะกับเมชขนาดใหญ่' },
      direct:{ label:'Direct (LU decomposition)', desc:'วิธีตรง แยกตัวประกอบ LU ครั้งเดียวก่อนเริ่มเดินเวลา แล้วใช้ซ้ำทุก step — แม่นยำ แต่ใช้หน่วยความจำและเวลามาก (O(n³)) จึงจำกัดที่ 1,000 องศาอิสระ' },
    };
    const massInfo = {
      consistent:{ label:'Consistent mass', desc:'เมทริกซ์มวลเต็ม (∫NᵢNⱼ) — โดยทั่วไปแม่นยำกว่า ความถี่เชิงตัวเลขสูงกว่าจริงเล็กน้อย' },
      lumped:{ label:'Lumped mass (HRZ)', desc:'เมทริกซ์มวลแบบรวมศูนย์ที่โหนด (แนวทางเดียวกับฝั่ง Heat) — ความถี่เชิงตัวเลขต่ำกว่าจริงเล็กน้อย ทิศความคลาดเคลื่อนตรงข้ามกับ consistent จึงใช้เปรียบเทียบ numerical dispersion ได้'},
    };
    const optRow = document.createElement('div'); optRow.className='field-row';
    function selectField(label, info, current, onChange){
      const f = document.createElement('div'); f.className='field'; f.style.minWidth='260px';
      f.innerHTML = `<label>${label}</label>`;
      const s = document.createElement('select');
      Object.entries(info).forEach(([v,i])=>{ const o = document.createElement('option'); o.value=v; o.textContent=i.label; if(current===v) o.selected=true; s.appendChild(o); });
      s.addEventListener('change', ()=> onChange(s.value));
      f.appendChild(s); return f;
    }
    optRow.appendChild(selectField('วิธีแก้ระบบสมการ (solver method)', methodInfo, state.solverMethod, v=>{ state.solverMethod=v; state.results=null; renderMain(); }));
    optRow.appendChild(selectField('ชนิดเมทริกซ์มวล (mass matrix)', massInfo, state.wave.massType, v=>{ state.wave.massType=v; state.results=null; renderMain(); }));
    main.appendChild(optRow);
    const optDesc = document.createElement('div'); optDesc.className='eq-note'; optDesc.style.marginBottom='14px';
    optDesc.textContent = `${methodInfo[state.solverMethod].desc} · ${massInfo[state.wave.massType].desc}`;
    main.appendChild(optDesc);
    const nNodes = state.mesh.nodes.length;
    if(state.solverMethod==='direct' && nNodes>1000){
      const warn = document.createElement('div'); warn.className='note';
      warn.textContent = `เมชปัจจุบันมี ${nNodes} โหนด — วิธี Direct รับได้ไม่เกิน 1,000 องศาอิสระ หากเกินระบบจะแจ้งให้เปลี่ยนเป็น Conjugate Gradient`;
      main.appendChild(warn);
    }
    if(nNodes*state.wave.transient.steps > 1.5e6){
      const warn = document.createElement('div'); warn.className='note';
      warn.textContent = `เมชมี ${nNodes} โหนดและจะรัน ${state.wave.transient.steps} time steps — การจำลองอาจใช้เวลาหลายวินาที (หน้าเว็บจะหยุดตอบสนองชั่วคราวระหว่างคำนวณ)`;
      main.appendChild(warn);
    }

    const errDiv = document.createElement('div'); errDiv.className='error';
    main.appendChild(errDiv);
    const runBtn = document.createElement('button'); runBtn.className='primary'; runBtn.textContent='▶ รันการจำลอง (Solve)'; runBtn.style.marginBottom='16px';
    runBtn.onclick = ()=>{
      errDiv.style.display='none';
      runBtn.disabled = true; runBtn.textContent = 'กำลังคำนวณ...';
      setTimeout(()=>{ // let the browser paint the busy state first (the solve itself is synchronous)
        try{ solveWave(); state.wave.view.step = null; }
        catch(e){ errDiv.textContent = e.message; errDiv.style.display='block'; state.results = null; }
        renderAll();
      }, 20);
    };
    main.appendChild(runBtn);

    if(!state.results || !state.results.wave){
      const wrap = document.createElement('div'); wrap.className='canvas-wrap';
      if(is1D){ const cv = document.createElement('canvas'); sizeCanvas(cv, 520, 140); wrap.appendChild(cv); main.appendChild(wrap); draw1DMesh(cv, state.mesh); }
      else { const cv = document.createElement('canvas'); sizeCanvas(cv, 480, 340); wrap.appendChild(cv); main.appendChild(wrap); drawMeshCanvas(cv, state.mesh, false); }
      navButtons(main, { back:true, next:false });
      return;
    }

    const info = document.createElement('div'); info.className='eq-applied'; info.style.display='block'; info.style.marginBottom='16px';
    info.textContent = state.results.info;
    main.appendChild(info);
    renderWaveResults(main);
    navButtons(main, { back:true, next:false });
  }

  function renderWaveResults(main){
    const res = state.results, mesh = state.mesh, view = state.wave.view;
    const is1D = state.dimension==='1d';
    const { steps, dt } = res;
    const A = res.maxAbs;
    if(view.step===null || view.step===undefined) view.step = steps;
    view.step = Math.max(0, Math.min(steps, view.step));
    const damped = state.wave.damping>0;
    const E0 = res.total[0];
    let eDev = 0; for(let k=0;k<=steps;k++) eDev = Math.max(eDev, Math.abs(res.total[k]-E0));

    // --- summary numbers ---
    const items = [
      ['max |u| ตลอดการจำลอง', fmt(A,4)],
      ['Courant c·Δt/h', res.courant>0 ? fmt(res.courant,3) : '–'],
      damped ? ['พลังงานที่เหลือตอนจบ', E0>0 ? `${(res.total[steps]/E0*100).toFixed(1)} %` : '–']
             : ['พลังงานคลาดเคลื่อนสูงสุด', E0>0 ? (eDev/E0).toExponential(1) : '–'],
    ];
    if(res.exact.available) items.push(['error สูงสุดเทียบ exact', `${fmt(res.exact.maxErr,3)} (${res.exact.maxRef>0 ? (res.exact.maxErr/res.exact.maxRef*100).toFixed(2) : '0'} % ของ max |u|)`]);
    main.appendChild(statRow(items));

    // --- time slider ---
    const timeRow = document.createElement('div'); timeRow.className='field-row'; timeRow.style.alignItems='flex-end';
    const tf = document.createElement('div'); tf.className='field'; tf.style.minWidth='320px';
    const tLabel = document.createElement('label');
    const tslider = document.createElement('input'); tslider.type='range'; tslider.min='0'; tslider.max=String(steps); tslider.value=String(view.step);
    tf.appendChild(tLabel); tf.appendChild(tslider); timeRow.appendChild(tf); main.appendChild(timeRow);

    // --- field display ---
    let cv, wire = false;
    const nodeOrder1D = is1D ? mesh.nodes.map((_,i)=>i).sort((a,b)=>mesh.nodes[a].x-mesh.nodes[b].x) : null;
    if(is1D){
      const wrap = document.createElement('div'); wrap.className='canvas-wrap';
      cv = document.createElement('canvas'); sizeCanvas(cv, 560, 320); wrap.appendChild(cv); main.appendChild(wrap);
      attachBarChartHover(cv, p=> `x = ${p.x.toFixed(3)} m, u ≈ ${fmt(p.y,4)}`);
    } else {
      const wrap = document.createElement('div'); wrap.className='canvas-wrap'; wrap.style.display='flex'; wrap.style.gap='16px'; wrap.style.flexWrap='wrap';
      cv = document.createElement('canvas'); sizeCanvas(cv, 440, 320); wrap.appendChild(cv);
      attachFieldHover(cv, v=> `u ≈ ${fmt(v,4)}`);
      const CB_HEIGHT = 200;
      const cbWrap = document.createElement('div'); cbWrap.className='colorbar';
      const cbCanvas = document.createElement('canvas'); sizeCanvas(cbCanvas, 24, CB_HEIGHT);
      const ticksCol = document.createElement('div'); ticksCol.className='ticks'; ticksCol.style.height = CB_HEIGHT+'px'; ticksCol.style.width='60px';
      const uniform = isUniformRange(-A, A);
      if(uniform){
        const t = document.createElement('span'); t.style.top = ((CB_HEIGHT-1)/2)+'px'; t.textContent = '0'; ticksCol.appendChild(t);
      } else for(let i=0;i<=10;i++){
        const t = document.createElement('span'); t.style.top = ((CB_HEIGHT-1)*(i/10))+'px'; t.textContent = fmt(A - i*(2*A)/10, 3); ticksCol.appendChild(t);
      }
      cbWrap.appendChild(cbCanvas); cbWrap.appendChild(ticksCol);
      const cbTitle = document.createElement('div'); cbTitle.className='unit'; cbTitle.style.marginBottom='4px'; cbTitle.textContent = uniform ? 'u — ค่าเป็นศูนย์ทั้งหมด' : 'u';
      const cbCol = document.createElement('div'); cbCol.appendChild(cbTitle); cbCol.appendChild(cbWrap);
      wrap.appendChild(cbCol); main.appendChild(wrap);
      drawColorbarInto(cbCanvas, uniform);
      const lbl = document.createElement('label'); lbl.style.display='inline-flex'; lbl.style.alignItems='center'; lbl.style.gap='6px'; lbl.style.fontSize='13.5px'; lbl.style.color='var(--ink-soft)'; lbl.style.marginTop='8px';
      const chk = document.createElement('input'); chk.type='checkbox'; chk.addEventListener('change', ()=>{ wire = chk.checked; drawFrame(); });
      lbl.appendChild(chk); lbl.appendChild(document.createTextNode('แสดงเส้นเมชทับ contour'));
      main.appendChild(lbl);
      const sc = document.createElement('div'); sc.className='eq-note';
      sc.textContent = 'สเกลสีคงที่ตลอดการจำลอง (สมมาตรรอบศูนย์: สีเขียว = u เป็นศูนย์) เพื่อเปรียบเทียบแอมพลิจูดระหว่างเวลาต่าง ๆ ได้ถูกต้อง';
      main.appendChild(sc);
    }

    // --- playback ---
    const playRow = document.createElement('div'); playRow.className='actions'; playRow.style.marginTop='10px'; playRow.style.alignItems='center';
    const playBtn = document.createElement('button'); playBtn.className='primary';
    const pauseBtn = document.createElement('button'); pauseBtn.className='secondary'; pauseBtn.textContent='⏸ หยุดชั่วคราว';
    const restartBtn = document.createElement('button'); restartBtn.className='secondary'; restartBtn.textContent='⏮ เริ่มใหม่';
    const speedSel = document.createElement('select'); speedSel.style.width='110px'; speedSel.style.fontFamily='var(--mono)';
    [[0.5,'ช้า ×0.5'],[1,'ปกติ ×1'],[2,'เร็ว ×2'],[4,'เร็ว ×4']].forEach(([v,l])=>{ const o = document.createElement('option'); o.value=String(v); o.textContent=l; if(view.speed===v) o.selected=true; speedSel.appendChild(o); });
    speedSel.addEventListener('change', ()=>{ view.speed = parseFloat(speedSel.value); if(isPlaying()){ stopPlayback(); play(); } });
    [playBtn, pauseBtn, restartBtn].forEach(b=>{ b.type='button'; playRow.appendChild(b); }); playRow.appendChild(speedSel);
    main.appendChild(playRow);
    const fpsNote = document.createElement('div'); fpsNote.className='unit'; fpsNote.style.margin='4px 0 12px 0';
    fpsNote.textContent = 'เล่นภาพเคลื่อนไหวต่อเนื่อง 20 เฟรม/วินาที โดยข้าม time step ให้พอดีกับความเร็วที่เลือก (ปกติใช้เวลาเล่นทั้งหมดประมาณ 10 วินาที) — วนซ้ำอัตโนมัติเมื่อจบ';
    main.appendChild(fpsNote);

    // --- probe + history charts ---
    const probeRow = document.createElement('div'); probeRow.className='field-row'; probeRow.style.alignItems='flex-end';
    const pr = probeResolved();
    const probeInfo = document.createElement('div'); probeInfo.className='eq-note'; probeInfo.style.marginTop='0';
    let probeNode = 0, probeExact = null;
    function findProbe(){
      let best = 0, bd = Infinity;
      for(let i=0;i<mesh.nodes.length;i++){ const d = Math.hypot(mesh.nodes[i].x-pr.x, mesh.nodes[i].y-pr.y); if(d<bd){ bd = d; best = i; } }
      probeNode = best; probeExact = null;
      const nd = mesh.nodes[best];
      probeInfo.textContent = `โหนดที่ใกล้ที่สุด: ${is1D ? `x = ${nd.x.toFixed(4)} m` : `(${nd.x.toFixed(4)}, ${nd.y.toFixed(4)}) m`}`;
    }
    probeRow.appendChild(plainField(is1D ? 'จุดตรวจวัด (probe) x' : 'จุดตรวจวัด (probe) x', roundNice(pr.x), 'm', v=>{ state.wave.probe.x=v; pr.x=v; findProbe(); drawHistory(); }).field);
    if(!is1D) probeRow.appendChild(plainField('จุดตรวจวัด (probe) y', roundNice(pr.y), 'm', v=>{ state.wave.probe.y=v; pr.y=v; findProbe(); drawHistory(); }).field);
    const probeBox = document.createElement('div'); probeBox.style.paddingBottom='10px'; probeBox.appendChild(probeInfo); probeRow.appendChild(probeBox);
    main.appendChild(probeRow);
    const hWrap = document.createElement('div'); hWrap.className='canvas-wrap'; hWrap.style.display='flex'; hWrap.style.gap='16px'; hWrap.style.flexWrap='wrap';
    const probeCv = document.createElement('canvas'); sizeCanvas(probeCv, 460, 230);
    const energyCv = document.createElement('canvas'); sizeCanvas(energyCv, 460, 230);
    hWrap.appendChild(probeCv); hWrap.appendChild(energyCv); main.appendChild(hWrap);
    attachBarChartHover(probeCv, p=> `t = ${p.x.toFixed(3)} s, u ≈ ${fmt(p.y,4)}`);
    attachBarChartHover(energyCv, p=> `t = ${p.x.toFixed(3)} s, E ≈ ${fmt(p.y,4)}`);

    function drawHistory(){
      const t = view.step*dt;
      const pts = []; for(let k=0;k<=steps;k++) pts.push({x:k*dt, y:res.snapshots[k][probeNode]});
      const series = [{ label:'Numerical (FEM)', color:'#3FAE8C', lines:[pts] }];
      if(res.exact.available){
        if(!probeExact){ probeExact = []; for(let k=0;k<=steps;k++) probeExact.push({x:k*dt, y:res.exact.at(k*dt)[probeNode]}); }
        series.push({ label:'Exact solution', color:'#D9A441', dash:[6,4], width:2, lines:[probeExact] });
      }
      drawBarChart(probeCv, { L:res.totalTime, series, yLabel:'u ที่จุดตรวจวัด ตามเวลา', fmtY:v=>fmt(v,3), xUnit:' s', vline:t });
      const mk = arr=>{ const p = []; for(let k=0;k<=steps;k++) p.push({x:k*dt, y:arr[k]}); return p; };
      drawBarChart(energyCv, { L:res.totalTime, yLabel:'พลังงาน (KE + PE = รวม)', fmtY:v=>fmt(v,3), xUnit:' s', vline:t, series:[
        { label:'รวม (KE+PE)', color:COLOR_TOTAL, lines:[mk(res.total)], width:2.6 },
        { label:'จลน์ (KE)', color:COLOR_KE, lines:[mk(res.kinetic)], width:1.8 },
        { label:'ศักย์ (PE)', color:COLOR_PE, lines:[mk(res.potential)], width:1.8 },
      ] });
    }

    function drawFrame(){
      const k = view.step, snap = res.snapshots[k], t = k*dt;
      tslider.value = String(k);
      tLabel.innerHTML = `เวลา (time): <b>t = ${t.toFixed(4)} s</b> (step ${k} / ${steps})`;
      if(is1D){
        const pts = nodeOrder1D.map(i=>({ x:mesh.nodes[i].x, y:snap[i] }));
        const series = [{ label:'Numerical (FEM)', color:'#3FAE8C', markers: mesh.nodes.length<=120, lines:[pts] }];
        if(res.exact.available){
          const ue = res.exact.at(t);
          series.push({ label:'Exact solution', color:'#D9A441', dash:[6,4], width:2, lines:[nodeOrder1D.map(i=>({ x:mesh.nodes[i].x, y:ue[i] }))] });
        }
        const yr = A>0 ? 1.1*A : 1;
        drawBarChart(cv, { L:mesh.bbox.w, series, yLabel:`u(x, t = ${t.toFixed(3)} s)`, fmtY:v=>fmt(v,3), yRange:[-yr, yr] });
      } else {
        drawMeshCanvas(cv, mesh, true, { T:snap, min:-A, max:A });
        if(wire) drawMeshWireframe(cv, mesh, cv._hoverData.tf);
      }
      drawHistory();
    }

    // --- controls ---
    const FPS_MS = 50;
    function play(){
      if(view.step>=steps) view.step = 0;
      const stride = Math.max(1, Math.round(steps/200*view.speed));
      startPlayback(()=>{
        view.step += stride;
        if(view.step>steps) view.step = 0; // loop
        drawFrame();
      }, FPS_MS);
      syncButtons();
    }
    function syncButtons(){
      const playing = isPlaying();
      playBtn.textContent = playing ? '▶ กำลังเล่น...' : '▶ เล่น';
      playBtn.disabled = playing; pauseBtn.disabled = !playing;
    }
    tslider.addEventListener('input', ()=>{ stopPlayback(); view.step = parseInt(tslider.value); drawFrame(); syncButtons(); });
    playBtn.onclick = play;
    pauseBtn.onclick = ()=>{ stopPlayback(); syncButtons(); };
    restartBtn.onclick = ()=>{ stopPlayback(); view.step = 0; drawFrame(); syncButtons(); };

    findProbe();
    drawFrame();
    syncButtons();

    // --- export ---
    const exportRow = document.createElement('div'); exportRow.className='actions'; exportRow.style.marginTop='6px'; exportRow.style.flexWrap='wrap';
    const pngBtn = document.createElement('button'); pngBtn.className='secondary'; pngBtn.textContent='⬇ ภาพเฟรมนี้ (PNG)';
    pngBtn.onclick = ()=> downloadCanvasPNG(cv, `femfed-wave-t${(view.step*dt).toFixed(4)}s.png`);
    const csvBtn = document.createElement('button'); csvBtn.className='secondary'; csvBtn.textContent='⬇ ข้อมูลเฟรมนี้ (CSV)';
    csvBtn.onclick = ()=>{
      const s = res.snapshots[view.step];
      const rows = mesh.nodes.map((nd,i)=> is1D ? [nd.x, s[i]] : [nd.x, nd.y, s[i]]);
      downloadCSV(`femfed-wave-t${(view.step*dt).toFixed(4)}s.csv`, is1D ? ['x_m','u'] : ['x_m','y_m','u'], rows);
    };
    const histBtn = document.createElement('button'); histBtn.className='secondary'; histBtn.textContent='⬇ ประวัติตามเวลา (CSV)';
    histBtn.onclick = ()=>{
      const rows = []; for(let k=0;k<=steps;k++) rows.push([k*dt, res.snapshots[k][probeNode], res.kinetic[k], res.potential[k], res.total[k]]);
      downloadCSV('femfed-wave-history.csv', ['t_s','u_probe','kinetic_energy','potential_energy','total_energy'], rows);
    };
    exportRow.appendChild(pngBtn); exportRow.appendChild(csvBtn); exportRow.appendChild(histBtn);
    main.appendChild(exportRow);

    // --- reference-solution panel ---
    const ex = res.exact;
    const exBox = document.createElement('div'); exBox.className='eq-block'; exBox.style.marginTop='16px';
    if(ex.available){
      exBox.innerHTML = `<div class="eq-caption" style="margin-bottom:8px;">เปรียบเทียบกับ Exact Solution — ${ex.method}</div>`;
      const stats = [['Max error |u − u_exact| (ทุกโหนด ทุกเวลา)', fmt(ex.maxErr,3)], ['เทียบกับ max |u|', ex.maxRef>0 ? `${(ex.maxErr/ex.maxRef*100).toFixed(3)} %` : '–']];
      if(ex.freq!==undefined) stats.push(['ความถี่ธรรมชาติของโหมด', `${fmt(ex.freq,5)} Hz`]);
      exBox.appendChild(statRow(stats));
    } else {
      exBox.innerHTML = '<div class="eq-caption" style="margin-bottom:8px;">Exact Solution</div>';
    }
    const exNote = document.createElement('div'); exNote.className='eq-note'; exNote.textContent = ex.note; exBox.appendChild(exNote);
    main.appendChild(exBox);

    const disp = document.createElement('div'); disp.className='eq-note'; disp.style.marginTop='10px';
    disp.textContent = 'ข้อสังเกต: พลังงานรวมคงที่เมื่อไม่มีการหน่วง (Newmark average acceleration อนุรักษ์พลังงาน) — ความต่างจากคำตอบจริงที่เห็นมักมาจาก numerical dispersion ของเมชและ time step (คลื่นความยาวสั้นเดินช้าหรือเร็วกว่าจริง) ลองเพิ่มจำนวนเอลิเมนต์ ใช้ quadratic หรือเปลี่ยนชนิดเมทริกซ์มวลเพื่อดูผล';
    main.appendChild(disp);
  }
