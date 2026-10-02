import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { eqBlock, rm, frac, vec } from '../../render/equation-markup.js';
import { solveStructural } from '../../solver/structural-solver.js';
import { draw1DMesh } from '../../render/domain-1d-canvas.js';
import { drawMeshCanvas, drawColorbarInto } from '../../render/contour-canvas.js';
import { rainbowColor } from '../../render/colormap.js';
import { drawStructuralField, attachFieldHover, drawBarChart, attachBarChartHover } from '../../render/structural-canvas.js';
import { sizeCanvas } from '../../render/hidpi.js';
import { downloadCanvasPNG, downloadCSV } from '../export-helpers.js';
import { fmt, fmtWith, pickLenUnit, pickStressUnit, pickForceUnit } from '../structural-format.js';
import { isPlaying, startPlayback, stopPlayback } from '../playback.js';
import { renderAll, renderMain } from '../layout.js';

/**
 * Step 6 (Structural): run the static solve and show the results.
 *
 * 2D results: a contour of the chosen field (|u|, ux, uy, von Mises,
 * sigma-x, sigma-y, tau-xy) drawn on the deformed mesh with an
 * adjustable exaggeration factor, plus hover readout, mesh overlay,
 * PNG/CSV export. 1D results: line chart of displacement or element
 * stress along the bar. Both show the equilibrium check (reactions vs
 * applied loads) and, where one exists, the comparison with a
 * closed-form reference (see solver/structural-exact.js).
 */

  const FIELDS = [
    ['umag','|u| — ขนาดการเคลื่อนที่รวม','len'],
    ['ux','ux — การเคลื่อนที่ตามแกน x','len'],
    ['uy','uy — การเคลื่อนที่ตามแกน y','len'],
    ['vm','σ von Mises','stress'],
    ['sx','σx — ความเค้นตั้งฉากแกน x','stress'],
    ['sy','σy — ความเค้นตั้งฉากแกน y','stress'],
    ['txy','τxy — ความเค้นเฉือน','stress'],
  ];

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

  export function renderStructuralSolveStep(main){
    const is1D = state.dimension==='1d';
    const elWord = is1D
      ? (state.elementOrder==='linear' ? 'linear (2-node) bar elements' : 'quadratic (3-node) bar elements')
      : `${state.structural.mode==='plane_stress' ? 'plane stress' : 'plane strain'}, ${state.elementOrder==='linear' ? 'linear (3-node, CST)' : 'quadratic (6-node, LST)'} triangular elements`;
    makeTitle(main, 'รันการจำลองและดูผลลัพธ์ (Static structural)', `ระบบจะประกอบสมการไฟไนต์เอลิเมนต์ (${elWord}) แล้วแก้ระบบสมการสมดุลสถิตด้วยวิธีที่เลือกด้านล่าง`);

    const body = eqBlock(main, 'ระบบสมการที่ถูกประกอบขึ้น (static FEM system)',
      `${rm('[')}K${rm(']{')}u${rm('} = {')}F${rm('}')}`,
      'เมทริกซ์ความแข็งเกร็ง [K] ประกอบจากทุกเอลิเมนต์ ส่วน {F} คือเวกเตอร์แรงที่โหนด จากนั้นบังคับเงื่อนไขการยึดรั้ง (การเคลื่อนที่ = 0) แล้วแก้หา {u}; ความเค้นคำนวณย้อนกลับจากการเคลื่อนที่ของแต่ละเอลิเมนต์ (σ = D B u):');
    const l1 = document.createElement('div'); l1.className='equation'; l1.style.fontSize='14.5px'; l1.style.marginTop='6px';
    const l2 = document.createElement('div'); l2.className='equation'; l2.style.fontSize='14.5px'; l2.style.marginTop='6px';
    if(is1D){
      l1.innerHTML = `K<sub>e</sub> ${rm('=')} ${rm('∫')}<sub>0</sub><sup>L</sup> EA${frac('dN','dx')}<sub>i</sub>${frac('dN','dx')}<sub>j</sub> ${rm('dx')} ${rm('(linear: ')}${frac('EA','L')}${rm('[[1, −1], [−1, 1]])')}`;
      l2.innerHTML = `F<sub>i</sub> ${rm('= P at the loaded end')}`;
    } else {
      l1.innerHTML = `${rm('[')}k<sub>e</sub>${rm('] =')} ${rm('∫∫')}<sub>Ω<sub>e</sub></sub> ${rm('[')}B${rm(']')}<sup>T</sup>${rm('[')}D${rm('][')}B${rm(']')} t ${rm('dA')}`;
      l2.innerHTML = `${rm('{')}F${rm('} =')} ${rm('∫')}<sub>Γ<sub>t</sub></sub> ${rm('[')}N${rm(']')}<sup>T</sup> ${bar_t()} t ${rm('dΓ')} ${rm('+ point loads')}`;
    }
    body.appendChild(l1); body.appendChild(l2);

    // --- Solver selection ---
    const methodInfo = {
      cg:{ label:'Conjugate Gradient (sparse)', desc:'วิธีวนซ้ำแบบมี Jacobi preconditioner บนเมทริกซ์ sparse และเฉพาะองศาอิสระที่ไม่ถูกยึด — เร็วและประหยัดหน่วยความจำ เหมาะกับเมชขนาดใหญ่' },
      direct:{ label:'Direct (LU decomposition)', desc:'วิธีตรง แยกตัวประกอบ LU ของเมทริกซ์เฉพาะองศาอิสระ ให้คำตอบในจำนวนขั้นตอนแน่นอน แต่ใช้เวลาและหน่วยความจำมาก (O(n³)) จึงจำกัดที่ 2,000 องศาอิสระ' },
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
    mf.appendChild(msel); methodRow.appendChild(mf); main.appendChild(methodRow);
    const methodDesc = document.createElement('div'); methodDesc.className='eq-note'; methodDesc.style.marginBottom='14px';
    methodDesc.textContent = methodInfo[state.solverMethod].desc;
    main.appendChild(methodDesc);
    const ndof = state.mesh.nodes.length*(is1D?1:2);
    if(state.solverMethod==='direct' && ndof>2000){
      const warn = document.createElement('div'); warn.className='note';
      warn.textContent = `เมชปัจจุบันมี ${ndof} องศาอิสระ (ก่อนหักส่วนที่ถูกยึด) — วิธี Direct รับได้ไม่เกิน 2,000 องศาอิสระ หากเกินระบบจะแจ้งให้เปลี่ยนเป็น Conjugate Gradient`;
      main.appendChild(warn);
    }

    const errDiv = document.createElement('div'); errDiv.className='error';
    main.appendChild(errDiv);
    const runBtn = document.createElement('button'); runBtn.className='primary'; runBtn.textContent='▶ รันการจำลอง (Solve)';
    runBtn.style.marginBottom='16px';
    runBtn.onclick = ()=>{
      errDiv.style.display='none';
      runBtn.disabled = true; runBtn.textContent = 'กำลังคำนวณ...';
      setTimeout(()=>{ // let the browser paint the busy state first (the solve itself is synchronous)
        try{ solveStructural(); }
        catch(e){ errDiv.textContent = e.message; errDiv.style.display='block'; state.results = null; }
        renderAll();
      }, 20);
    };
    main.appendChild(runBtn);

    if(!state.results || !state.results.structural){
      const wrap = document.createElement('div'); wrap.className='canvas-wrap';
      if(is1D){ const cv = document.createElement('canvas'); sizeCanvas(cv, 520, 140); wrap.appendChild(cv); main.appendChild(wrap); draw1DMesh(cv, state.mesh); }
      else { const cv = document.createElement('canvas'); sizeCanvas(cv, 480, 340); wrap.appendChild(cv); main.appendChild(wrap); drawMeshCanvas(cv, state.mesh, false); }
      navButtons(main, { back:true, next:false });
      return;
    }

    const info = document.createElement('div'); info.className='eq-applied'; info.style.display='block'; info.style.marginBottom='16px';
    info.textContent = state.results.info;
    main.appendChild(info);

    if(is1D) render1DResults(main); else render2DResults(main);
    renderEquilibrium(main);
    renderReference(main);
    navButtons(main, { back:true, next:false });
  }

  function bar_t(){ return `<span class="rm" style="text-decoration:overline;">t</span>`; }

  /* ================= 2D ================= */
  function render2DResults(main){
    const res = state.results, view = state.sview;
    if(!FIELDS.some(f=>f[0]===view.field)) view.field = 'vm';
    const bbox = state.mesh.bbox;
    const autoScale = res.maxU>0 ? 0.1*Math.max(bbox.w, bbox.h)/res.maxU : 1;

    // --- controls ---
    const ctrl = document.createElement('div'); ctrl.className='field-row'; ctrl.style.alignItems='flex-end';
    const ff = document.createElement('div'); ff.className='field'; ff.style.minWidth='280px';
    ff.innerHTML = '<label>ค่าที่แสดง (field)</label>';
    const fsel = document.createElement('select');
    FIELDS.forEach(([id,label])=>{ const o=document.createElement('option'); o.value=id; o.textContent=label; if(view.field===id) o.selected=true; fsel.appendChild(o); });
    ff.appendChild(fsel); ctrl.appendChild(ff);
    main.appendChild(ctrl);

    function check(text, checked, onChange){
      const l = document.createElement('label'); l.style.display='inline-flex'; l.style.alignItems='center'; l.style.gap='6px'; l.style.fontSize='13.5px'; l.style.color='var(--ink-soft)'; l.style.marginRight='16px';
      const c = document.createElement('input'); c.type='checkbox'; c.checked = checked;
      c.addEventListener('change', ()=> onChange(c.checked));
      l.appendChild(c); l.appendChild(document.createTextNode(text));
      return l;
    }
    const opts = document.createElement('div'); opts.style.marginBottom='8px';
    const deformLabel = check('แสดงรูปร่างที่เสียรูป (deformed)', view.deform, v=>{ view.deform=v; syncScaleUi(); drawField(); });
    opts.appendChild(deformLabel);
    opts.appendChild(check('แสดงเส้นเมชทับ contour', view.wire, v=>{ view.wire=v; drawField(); }));
    main.appendChild(opts);

    const scaleRow = document.createElement('div'); scaleRow.className='field-row'; scaleRow.style.alignItems='flex-end';
    const sf = document.createElement('div'); sf.className='field'; sf.style.minWidth='320px';
    const sLabel = document.createElement('label');
    const slider = document.createElement('input'); slider.type='range'; slider.min='0'; slider.max='300'; slider.step='5';
    sf.appendChild(sLabel); sf.appendChild(slider); scaleRow.appendChild(sf);
    const autoBtn = document.createElement('button'); autoBtn.type='button'; autoBtn.className='secondary'; autoBtn.textContent='Auto';
    const realBtn = document.createElement('button'); realBtn.type='button'; realBtn.className='secondary'; realBtn.textContent='ขนาดจริง (×1)';
    scaleRow.appendChild(autoBtn); scaleRow.appendChild(realBtn);
    main.appendChild(scaleRow);
    const scaleNote = document.createElement('div'); scaleNote.className='unit'; scaleNote.style.margin='0 0 10px 0';
    scaleNote.textContent = 'การเสียรูปในงานจริงมักเล็กมากจนมองไม่เห็น จึงขยายภาพเพื่อการสอน (เส้นประ = รูปร่างก่อนรับแรง) — ค่าตัวเลขในผลลัพธ์ไม่ได้ถูกขยาย';
    main.appendChild(scaleNote);

    function curScale(){ return view.deform ? (view.scale===null ? autoScale : view.scale) : 0; }
    function syncScaleUi(){
      const s = view.scale===null ? autoScale : view.scale;
      sLabel.textContent = `ตัวคูณขยายการเสียรูป: ×${fmt(s,3)} (1× = ขนาดจริง)`;
      slider.value = String(Math.max(0, Math.min(300, s/autoScale*100)));
      slider.disabled = autoBtn.disabled = realBtn.disabled = !view.deform;
    }
    slider.addEventListener('input', ()=>{ view.scale = autoScale*parseFloat(slider.value)/100; syncScaleUi(); drawField(); });
    autoBtn.onclick = ()=>{ view.scale = null; syncScaleUi(); drawField(); };
    realBtn.onclick = ()=>{ view.scale = 1; syncScaleUi(); drawField(); };

    // --- load-factor slider (the animation's "time" axis) ---
    // Linear elasticity: displacements and stresses scale in proportion to
    // the load, so the animation ramps the load factor f from 0 to 1 and
    // back; shape and field values are both multiplied by f while the
    // colour scale stays fixed at the full-load range.
    let phase = 1; // current load factor, 0..1 (starts at the full-load result)
    const phRow = document.createElement('div'); phRow.className='field-row'; phRow.style.alignItems='flex-end';
    const pf = document.createElement('div'); pf.className='field'; pf.style.minWidth='320px';
    const pLabel = document.createElement('label');
    const phSlider = document.createElement('input'); phSlider.type='range'; phSlider.min='0'; phSlider.max='100'; phSlider.step='1';
    pf.appendChild(pLabel); pf.appendChild(phSlider); phRow.appendChild(pf);
    main.appendChild(phRow);
    function syncPhaseUi(){
      pLabel.innerHTML = `ระดับแรงที่กระทำ (load factor): <b>${Math.round(phase*100)} %</b> ของแรงเต็ม`;
      phSlider.value = String(Math.round(phase*100));
    }

    // --- canvas + colorbar ---
    const wrap = document.createElement('div'); wrap.className='canvas-wrap'; wrap.style.display='flex'; wrap.style.gap='16px'; wrap.style.flexWrap='wrap';
    const cv = document.createElement('canvas'); sizeCanvas(cv, 440, 320);
    wrap.appendChild(cv);
    const CB_HEIGHT = 200;
    const cbWrap = document.createElement('div'); cbWrap.className='colorbar';
    const cbCanvas = document.createElement('canvas'); sizeCanvas(cbCanvas, 24, CB_HEIGHT);
    const ticksCol = document.createElement('div'); ticksCol.className='ticks'; ticksCol.style.height = CB_HEIGHT+'px'; ticksCol.style.width='70px';
    cbWrap.appendChild(cbCanvas); cbWrap.appendChild(ticksCol);
    const cbTitle = document.createElement('div'); cbTitle.className='unit'; cbTitle.style.marginBottom='4px';
    const cbCol = document.createElement('div'); cbCol.appendChild(cbTitle); cbCol.appendChild(cbWrap);
    wrap.appendChild(cbCol);
    main.appendChild(wrap);

    let curUnit = {name:'', f:1}, curLabel = '';
    attachFieldHover(cv, v=> `${curLabel} ≈ ${fmt(v/curUnit.f,4)} ${curUnit.name}`);

    /* A field is "constant" when its spread is negligible next to the
       largest value of its kind (all displacement fields, or all stress
       fields) — e.g. the uniform-tension plate has sigma_x = 50 MPa
       everywhere, with only round-off differences between nodes. Without
       this the colour scale would stretch that round-off over the whole
       rainbow while every tick label reads the same number. */
    function constantOf(key){
      const rng = res.ranges[key];
      const def = FIELDS.find(f=>f[0]===key);
      let ref = 0;
      for(const [k,,kind] of FIELDS) if(kind===def[2]) ref = Math.max(ref, Math.abs(res.ranges[k].min), Math.abs(res.ranges[k].max));
      if(!(ref>0)) return 0;
      if(rng.max-rng.min <= 1e-5*ref){
        let sum=0; const arr = res.fields[key]; for(let i=0;i<arr.length;i++) sum += arr[i];
        const mean = sum/arr.length;
        return Math.abs(mean) <= 1e-5*ref ? 0 : mean;
      }
      return undefined;
    }

    // Legend: rebuilt only when the displayed field changes, not per animation frame
    function updateLegend(){
      const def = FIELDS.find(f=>f[0]===view.field);
      const rng = res.ranges[view.field];
      const c = constantOf(view.field);
      const maxAbs = c!==undefined ? Math.abs(c) : Math.max(Math.abs(rng.min), Math.abs(rng.max));
      curUnit = def[2]==='len' ? pickLenUnit(maxAbs) : pickStressUnit(maxAbs);
      curLabel = def[1].split(' ')[0];
      ticksCol.innerHTML = '';
      const cctx = cbCanvas.getContext('2d');
      if(c!==undefined){
        cbTitle.textContent = `${curLabel} (${curUnit.name}) — ค่าคงที่ทั้งแผ่น`;
        cctx.setTransform(1,0,0,1,0,0);
        cctx.fillStyle = rainbowColor(0.5);
        cctx.fillRect(0, 0, cbCanvas.width, cbCanvas.height);
        const t = document.createElement('span'); t.style.top = ((CB_HEIGHT-1)/2)+'px'; t.textContent = fmt(c/curUnit.f, 4);
        ticksCol.appendChild(t);
      } else {
        cbTitle.textContent = `${curLabel} (${curUnit.name})`;
        drawColorbarInto(cbCanvas);
        for(let i=0;i<=10;i++){
          const yPx = (CB_HEIGHT-1)*(i/10);
          const v = rng.max - i*(rng.max-rng.min)/10;
          const t = document.createElement('span'); t.style.top = yPx+'px'; t.textContent = fmt(v/curUnit.f, 3);
          ticksCol.appendChild(t);
        }
      }
    }

    // One frame: shape and values both scaled by the load factor `phase`
    function drawField(){
      const rng = res.ranges[view.field];
      const c = constantOf(view.field);
      const base = res.fields[view.field];
      let values = base;
      if(c===undefined && phase!==1){
        values = new Float64Array(base.length);
        for(let i=0;i<base.length;i++) values[i] = base[i]*phase;
      }
      drawStructuralField(cv, { mesh:state.mesh, values, min:rng.min, max:rng.max, ux:res.ux, uy:res.uy,
        constant: c!==undefined ? c*phase : undefined,
        scale:curScale()*phase, showUndeformed:true, wire:view.wire });
    }
    function redraw(){ updateLegend(); drawField(); }
    fsel.addEventListener('change', ()=>{ view.field = fsel.value; redraw(); });
    syncScaleUi();
    syncPhaseUi();
    redraw();

    // --- playback: load factor 0 -> 1 -> 0, smooth (cosine) ramp, loops ---
    const FRAMES = 30; // frames from 0 to full load; a full cycle is 2*FRAMES
    let frame = 0;
    const playRow = document.createElement('div'); playRow.className='actions'; playRow.style.marginTop='10px';
    const playBtn = document.createElement('button'); playBtn.className='primary';
    const pauseBtn = document.createElement('button'); pauseBtn.className='secondary'; pauseBtn.textContent='⏸ หยุดชั่วคราว';
    const restartBtn = document.createElement('button'); restartBtn.className='secondary'; restartBtn.textContent='⏮ เริ่มใหม่';
    [playBtn, pauseBtn, restartBtn].forEach(b=>{ b.type='button'; playRow.appendChild(b); });
    main.appendChild(playRow);
    const fpsNote = document.createElement('div'); fpsNote.className='unit'; fpsNote.style.margin='4px 0 12px 0';
    fpsNote.textContent = 'เล่นภาพเคลื่อนไหวการเสียรูปขณะแรงค่อย ๆ เพิ่มจาก 0 ถึงเต็มแล้วลดกลับ วนซ้ำอัตโนมัติ (วัสดุยืดหยุ่นเชิงเส้น: การเสียรูปและความเค้นแปรผันตรงกับแรง) — สีของ contour ใช้สเกลของแรงเต็มคงที่ตลอด';
    main.appendChild(fpsNote);

    function syncButtons(){
      const playing = isPlaying();
      playBtn.textContent = playing ? '▶ กำลังเล่น...' : '▶ เล่น';
      playBtn.disabled = playing;
      pauseBtn.disabled = !playing;
    }
    function frameToPhase(k){ return (1-Math.cos(Math.PI*k/FRAMES))/2; }
    function phaseToFrame(f){ return Math.round(FRAMES*Math.acos(Math.max(-1, Math.min(1, 1-2*f)))/Math.PI); }

    phSlider.addEventListener('input', ()=>{
      stopPlayback();
      phase = parseFloat(phSlider.value)/100;
      syncPhaseUi(); drawField(); syncButtons();
    });
    playBtn.onclick = ()=>{
      if(!view.deform){ // nothing would move with the deformed shape switched off
        view.deform = true; deformLabel.firstChild.checked = true; syncScaleUi();
      }
      // continue from the current load factor, on the rising branch (restart from 0 if at full load)
      frame = phase>=1 ? 0 : phaseToFrame(phase);
      startPlayback(()=>{
        frame = (frame+1) % (2*FRAMES);
        phase = frameToPhase(frame);
        syncPhaseUi(); drawField();
      }, 50);
      syncButtons();
    };
    pauseBtn.onclick = ()=>{ stopPlayback(); syncButtons(); };
    restartBtn.onclick = ()=>{ stopPlayback(); frame = 0; phase = 0; syncPhaseUi(); drawField(); syncButtons(); };
    syncButtons();

    // --- export ---
    const exportRow = document.createElement('div'); exportRow.className='actions'; exportRow.style.marginTop='10px';
    const pngBtn = document.createElement('button'); pngBtn.className='secondary'; pngBtn.textContent='⬇ ภาพผลลัพธ์ (PNG)';
    pngBtn.onclick = ()=> downloadCanvasPNG(cv, `femfed-structural-${view.field}.png`);
    const csvBtn = document.createElement('button'); csvBtn.className='secondary'; csvBtn.textContent='⬇ ข้อมูลผลลัพธ์ (CSV)';
    csvBtn.onclick = ()=>{
      const f = res.fields;
      const rows = state.mesh.nodes.map((nd,i)=> [nd.x, nd.y, f.ux[i], f.uy[i], f.sx[i], f.sy[i], f.txy[i], f.vm[i]]);
      downloadCSV('femfed-structural-result.csv', ['x_m','y_m','ux_m','uy_m','sigma_x_Pa','sigma_y_Pa','tau_xy_Pa','von_mises_Pa'], rows);
    };
    exportRow.appendChild(pngBtn); exportRow.appendChild(csvBtn);
    main.appendChild(exportRow);

    const note = document.createElement('div'); note.className='eq-note'; note.style.marginTop='10px';
    note.textContent = 'ความเค้นคำนวณต่อเอลิเมนต์ (linear = ค่าคงที่ต่อเอลิเมนต์, quadratic = เปลี่ยนแปลงเชิงเส้นในเอลิเมนต์) แล้วเฉลี่ยที่โหนดร่วมเพื่อให้ contour ต่อเนื่อง — ใกล้มุมแหลมหรือจุดที่รับแรงเข้มข้นค่าที่ได้เป็น singularity ของโมเดล ไม่ใช่ข้อผิดพลาดของโปรแกรม และจะสูงขึ้นเรื่อย ๆ เมื่อทำเมชละเอียดขึ้น';
    main.appendChild(note);
  }

  /* ================= 1D ================= */
  function render1DResults(main){
    const res = state.results, mesh = state.mesh;
    if(state.sview.field!=='u' && state.sview.field!=='sigma') state.sview.field = 'u';
    const view = state.sview;

    const lu = pickLenUnit(res.maxU), su = pickStressUnit(res.maxStress);
    main.appendChild(statRow([
      ['max |u|', fmtWith(res.maxU, lu)],
      ['max |σ|', fmtWith(res.maxStress, su)],
      ['แรงปฏิกิริยารวม ΣR', fmtWith(res.equilibrium.Rx, pickForceUnit(Math.abs(res.equilibrium.Rx)))],
    ]));

    const ctrl = document.createElement('div'); ctrl.className='field-row';
    const ff = document.createElement('div'); ff.className='field'; ff.style.minWidth='280px';
    ff.innerHTML = '<label>กราฟที่แสดง</label>';
    const fsel = document.createElement('select');
    [['u','u(x) — การเคลื่อนที่ตามแกน'],['sigma','σ(x) — ความเค้นตามแกน (ต่อเอลิเมนต์)']].forEach(([id,label])=>{
      const o = document.createElement('option'); o.value=id; o.textContent=label; if(view.field===id) o.selected=true; fsel.appendChild(o);
    });
    ff.appendChild(fsel); ctrl.appendChild(ff); main.appendChild(ctrl);

    const wrap = document.createElement('div'); wrap.className='canvas-wrap';
    const cv = document.createElement('canvas'); sizeCanvas(cv, 560, 320);
    wrap.appendChild(cv); main.appendChild(wrap);

    let unit = lu, isU = true;
    attachBarChartHover(cv, p=> `x = ${p.x.toFixed(3)} m, ${isU?'u':'σ'} ≈ ${fmt(p.y,4)} ${unit.name}`);

    function redraw(){
      isU = view.field==='u';
      const L = mesh.bbox.w;
      let series;
      if(isU){
        unit = lu;
        const pts = mesh.nodes.map((nd,i)=>({x:nd.x, y:res.U[i]/unit.f})).sort((a,b)=>a.x-b.x);
        series = [{ label:'Numerical (FEM)', color:'#3FAE8C', markers:true, lines:[pts] }];
        if(res.exact.available){
          const ex = mesh.nodes.map((nd,i)=>({x:nd.x, y:res.exact.u[i]/unit.f})).sort((a,b)=>a.x-b.x);
          series.push({ label:'Exact solution', color:'#D9A441', dash:[6,4], width:2, lines:[ex] });
        }
      } else {
        unit = su;
        series = [{ label:'Numerical (FEM, ต่อเอลิเมนต์)', color:'#3FAE8C', markers:true,
          lines: res.elemStress.map(e=> [{x:e.xa, y:e.sa/unit.f},{x:e.xb, y:e.sb/unit.f}]) }];
        if(res.exact.available){
          const uL = res.exact.u[mesh.boundaries.left[0]], uR = res.exact.u[mesh.boundaries.right[0]];
          const sRef = state.structural.E*(uR-uL)/L/unit.f;
          series.push({ label:'Exact solution', color:'#D9A441', dash:[6,4], width:2, lines:[[{x:0,y:sRef},{x:L,y:sRef}]] });
        }
      }
      drawBarChart(cv, { L, series, yLabel: isU ? `u (${unit.name})` : `σ (${unit.name})`, fmtY: v=> fmt(v,3) });
    }
    fsel.addEventListener('change', ()=>{ view.field = fsel.value; redraw(); });
    redraw();

    const exportRow = document.createElement('div'); exportRow.className='actions'; exportRow.style.marginTop='10px';
    const pngBtn = document.createElement('button'); pngBtn.className='secondary'; pngBtn.textContent='⬇ ภาพผลลัพธ์ (PNG)';
    pngBtn.onclick = ()=> downloadCanvasPNG(cv, `femfed-structural-bar-${view.field}.png`);
    const csvBtn = document.createElement('button'); csvBtn.className='secondary'; csvBtn.textContent='⬇ ข้อมูลผลลัพธ์ (CSV)';
    csvBtn.onclick = ()=>{
      const rows = mesh.nodes.map((nd,i)=> [nd.x, res.U[i]]).sort((a,b)=>a[0]-b[0]);
      downloadCSV('femfed-structural-bar.csv', ['x_m','u_m'], rows);
    };
    exportRow.appendChild(pngBtn); exportRow.appendChild(csvBtn);
    main.appendChild(exportRow);

    const note = document.createElement('div'); note.className='eq-note'; note.style.marginTop='10px';
    note.textContent = 'ความเค้นตามแกนคำนวณจาก σ = E·du/dx ต่อเอลิเมนต์ — เอลิเมนต์ linear ให้ค่าคงที่ในแต่ละเอลิเมนต์ (กราฟเป็นขั้นบันได), เอลิเมนต์ quadratic ให้ค่าเปลี่ยนแปลงเชิงเส้น';
    main.appendChild(note);
  }

  /* ================= Equilibrium + reference panels ================= */
  function renderEquilibrium(main){
    const eq = state.results.equilibrium;
    const is1D = state.dimension==='1d';
    const box = document.createElement('div'); box.className='eq-block'; box.style.marginTop='16px';
    box.innerHTML = '<div class="eq-caption" style="margin-bottom:8px;">ตรวจสอบสมดุลของแรง (equilibrium check)</div>';
    const fu = pickForceUnit(Math.max(Math.abs(eq.Fx), Math.abs(eq.Fy), Math.abs(eq.Rx), Math.abs(eq.Ry)));
    const items = [
      [is1D ? 'แรงกระทำรวม ΣF' : 'แรงกระทำรวม ΣFx', fmtWith(eq.Fx, fu)],
    ];
    if(!is1D) items.push(['แรงกระทำรวม ΣFy', fmtWith(eq.Fy, fu)]);
    items.push([is1D ? 'แรงปฏิกิริยารวม ΣR' : 'ปฏิกิริยารวม ΣRx', fmtWith(eq.Rx, fu)]);
    if(!is1D) items.push(['ปฏิกิริยารวม ΣRy', fmtWith(eq.Ry, fu)]);
    items.push(['ส่วนที่ไม่สมดุล (สัมพัทธ์)', eq.relResidual.toExponential(2)]);
    box.appendChild(statRow(items));
    const n = document.createElement('div'); n.className='eq-note';
    n.textContent = 'แรงภายนอกที่กระทำรวมกับแรงปฏิกิริยาที่จุดยึดต้องหักล้างกันพอดี (ΣF + ΣR = 0) — เป็นการตรวจสอบพื้นฐานว่าผลการคำนวณถูกต้อง ค่าที่ไม่สมดุลควรเล็กมาก (ระดับ round-off)';
    box.appendChild(n);
    main.appendChild(box);
  }

  function renderReference(main){
    const ex = state.results.exact;
    const box = document.createElement('div'); box.className='eq-block'; box.style.marginTop='16px';
    if(!ex.available){
      box.innerHTML = '<div class="eq-caption" style="margin-bottom:8px;">ค่าอ้างอิง / Exact Solution</div>';
      const n = document.createElement('div'); n.className='eq-note'; n.textContent = ex.note;
      box.appendChild(n); main.appendChild(box); return;
    }
    box.innerHTML = `<div class="eq-caption" style="margin-bottom:8px;">เปรียบเทียบกับค่าอ้างอิง — ${ex.method}</div>`;
    if(ex.kind==='cantilever'){
      const lu = pickLenUnit(Math.max(Math.abs(ex.tipFEM), Math.abs(ex.tipEB), Math.abs(ex.tipTimo)));
      const pct = (a,b)=> `${((a-b)/Math.abs(b)*100).toFixed(2)} %`;
      box.appendChild(statRow([
        ['FEM (เฉลี่ยที่ขอบขวา)', fmtWith(ex.tipFEM, lu)],
        ['Euler–Bernoulli', fmtWith(ex.tipEB, lu)],
        ['Timoshenko (รวมแรงเฉือน)', fmtWith(ex.tipTimo, lu)],
        ['FEM เทียบกับ Timoshenko', pct(ex.tipFEM, ex.tipTimo)],
      ]));
    } else {
      const lu = pickLenUnit(ex.maxRef);
      box.appendChild(statRow([
        ['Max error |u − u_exact|', fmtWith(ex.maxErr, {name:lu.name, f:lu.f}, 3)],
        ['RMS error', fmtWith(ex.rmsErr, lu, 3)],
        ['เทียบกับ max |u| ของคำตอบ', ex.maxRef>0 ? `${(ex.maxErr/ex.maxRef*100).toExponential(2)} %` : '–'],
      ]));
    }
    const n = document.createElement('div'); n.className='eq-note'; n.textContent = ex.note;
    box.appendChild(n);
    main.appendChild(box);
  }
