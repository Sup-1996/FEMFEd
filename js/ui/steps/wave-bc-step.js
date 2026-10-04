import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { collapsibleBlock, rm, frac } from '../../render/equation-markup.js';
import { edgeLabels, getEdgeNamesForShape } from '../../mesh/shape-info.js';
import { ensureWaveDefaults, icResolved, waveDomainSize } from '../../mesh/wave-info.js';
import { modalInfo, shapeFn } from '../../solver/wave-ic.js';
import { drawWavePreview, drawWaveBarPreview } from '../../render/wave-canvas.js';
import { drawBarChart } from '../../render/structural-canvas.js';
import { sizeCanvas } from '../../render/hidpi.js';
import { plainField, roundNice } from '../wave-fields.js';
import { fmt } from '../structural-format.js';
import { renderInfo } from '../info-panel.js';
import { renderAll } from '../layout.js';

/**
 * Step 4 (Wave, labelled "initial/boundary conditions" in the step rail but
 * running BEFORE meshing): the initial state of the wave, the simulated
 * time, and the edge conditions.
 *
 * Initial condition: a Gaussian pulse, or one eigenmode of the bar /
 * rectangle (shape follows the edge conditions chosen below, so changing an
 * edge re-derives the mode and its frequency). Velocity starts at zero, or
 * with the same shape scaled by v0.
 * Time: end time and number of steps (<= 2000).
 * Edges: Fixed (u = 0) or Free (du/dn = 0).
 *
 * Every control writes to `state` immediately; only the small bits that
 * depend on it (summary tags, mode info, 1D preview chart, edge preview)
 * are patched — the step is never re-rendered while typing.
 */

  export function renderWaveBcStep(main){
    ensureWaveDefaults();
    const is1D = state.dimension==='1d';
    const w = state.wave;
    makeTitle(main, 'กำหนดเงื่อนไขเริ่มต้นและเงื่อนไขขอบเขต',
      'เลือกรูปคลื่นเริ่มต้น (พัลส์เกาส์เซียน หรือโหมดสั่น) เวลาที่จำลอง และเงื่อนไขของแต่ละขอบ: Fixed (ยึดแน่น u = 0) หรือ Free (อิสระ ∂u/∂n = 0)');

    /* ============ Initial conditions ============ */
    const icBox = document.createElement('div'); icBox.className='eq-block';
    const icCap = document.createElement('div'); icCap.className='eq-caption'; icCap.textContent='เงื่อนไขเริ่มต้น (Initial Conditions)';
    icBox.appendChild(icCap);

    const typeRow = document.createElement('div'); typeRow.className='eq-choice'; typeRow.style.marginBottom='10px';
    const gBtn = document.createElement('button'); gBtn.type='button';
    gBtn.innerHTML = 'พัลส์เกาส์เซียน<span class="tag">ก้อนคลื่นที่ตำแหน่งที่เลือก</span>';
    const mBtn = document.createElement('button'); mBtn.type='button';
    const modeOK = is1D || state.shape==='rectangle';
    mBtn.innerHTML = `โหมดสั่น (eigenmode)<span class="tag">${modeOK ? 'รูปร่างของโหมดที่ n' : 'เฉพาะแท่ง/สี่เหลี่ยม'}</span>`;
    mBtn.disabled = !modeOK;
    typeRow.appendChild(gBtn); typeRow.appendChild(mBtn);
    icBox.appendChild(typeRow);

    const icFields = document.createElement('div');
    icBox.appendChild(icFields);
    const modeInfo = document.createElement('div'); modeInfo.className='eq-note'; modeInfo.style.marginBottom='8px';
    icBox.appendChild(modeInfo);

    function syncTypeButtons(){
      gBtn.className = 'eq-btn' + (w.ic.type==='gaussian' ? ' sel' : '');
      mBtn.className = 'eq-btn' + (w.ic.type==='mode' ? ' sel' : '');
    }
    gBtn.onclick = ()=>{ w.ic.type='gaussian'; syncTypeButtons(); buildIcFields(); refreshLive(); };
    mBtn.onclick = ()=>{ if(modeOK){ w.ic.type='mode'; syncTypeButtons(); buildIcFields(); refreshLive(); } };

    function buildIcFields(){
      icFields.innerHTML = '';
      const ic = icResolved();
      const row = document.createElement('div'); row.className='field-row';
      row.appendChild(plainField('แอมพลิจูด A', w.ic.amp, 'ขนาดสูงสุดของ u เริ่มต้น', v=>{ w.ic.amp=v; refreshLive(); }).field);
      if(w.ic.type==='gaussian'){
        row.appendChild(plainField(is1D ? 'ตำแหน่งพัลส์ x₀' : 'ตำแหน่งพัลส์ x₀', roundNice(ic.x0), 'm', v=>{ w.ic.x0=v; refreshLive(); }).field);
        if(!is1D) row.appendChild(plainField('ตำแหน่งพัลส์ y₀', roundNice(ic.y0), 'm', v=>{ w.ic.y0=v; refreshLive(); }).field);
        row.appendChild(plainField('ความกว้างพัลส์ σ', roundNice(ic.sigma), 'm', v=>{ w.ic.sigma=v; refreshLive(); }, {min:0, minExclusive:true}).field);
      } else {
        row.appendChild(plainField(is1D ? 'โหมดที่ m' : 'โหมดตามแกน x (m)', ic.m, 'จำนวนเต็ม ≥ 1', v=>{ w.ic.m=Math.round(v); refreshLive(); }, {min:1}).field);
        if(!is1D) row.appendChild(plainField('โหมดตามแกน y (n)', ic.n, 'จำนวนเต็ม ≥ 1', v=>{ w.ic.n=Math.round(v); refreshLive(); }, {min:1}).field);
      }
      icFields.appendChild(row);

      const vrow = document.createElement('div'); vrow.className='field-row'; vrow.style.alignItems='flex-end';
      const vf = document.createElement('div'); vf.className='field'; vf.style.minWidth='300px';
      vf.innerHTML = '<label>ความเร็วเริ่มต้น ∂u/∂t</label>';
      const vsel = document.createElement('select');
      [['zero','เริ่มจากหยุดนิ่ง (ความเร็ว = 0)'],['shape','มีรูปร่างเดียวกับ u เริ่มต้น (ค่าสูงสุด v₀)']].forEach(([v,l])=>{
        const o = document.createElement('option'); o.value=v; o.textContent=l; if(w.ic.velType===v) o.selected=true; vsel.appendChild(o);
      });
      vsel.addEventListener('change', ()=>{ w.ic.velType = vsel.value; buildIcFields(); refreshLive(); });
      vf.appendChild(vsel); vrow.appendChild(vf);
      if(w.ic.velType==='shape') vrow.appendChild(plainField('ความเร็วสูงสุด v₀', w.ic.v0, 'หน่วยของ u ต่อวินาที', v=>{ w.ic.v0=v; refreshLive(); }).field);
      icFields.appendChild(vrow);

      if(w.ic.type==='gaussian'){
        const auto = document.createElement('button'); auto.type='button'; auto.className='secondary'; auto.textContent='ใช้ตำแหน่ง/ความกว้างอัตโนมัติ (กลางโมเดล)';
        auto.style.marginBottom='8px';
        auto.onclick = ()=>{ w.ic.x0=null; w.ic.y0=null; w.ic.sigma=null; buildIcFields(); refreshLive(); };
        icFields.appendChild(auto);
      }
    }

    // 1D: a small plot of the initial displacement
    let icCv = null;
    if(is1D){
      const wrap = document.createElement('div'); wrap.className='canvas-wrap';
      icCv = document.createElement('canvas'); sizeCanvas(icCv, 460, 190);
      wrap.appendChild(icCv); icBox.appendChild(wrap);
    }
    function drawIcChart(){
      if(!icCv) return;
      const L = state.geom.length, s = shapeFn(), amp = w.ic.amp;
      const pts = []; for(let i=0;i<=200;i++){ const x = L*i/200; pts.push({x, y:amp*s(x)}); }
      drawBarChart(icCv, { L, series:[{ label:'u(x, 0)', color:'#3FAE8C', lines:[pts] }], yLabel:'u(x, 0) เริ่มต้น', fmtY:v=>fmt(v,3) });
    }
    main.appendChild(icBox);

    /* ============ Time ============ */
    const tBox = document.createElement('div'); tBox.className='eq-block';
    const tCap = document.createElement('div'); tCap.className='eq-caption'; tCap.textContent='เวลาที่จำลอง (Time stepping)';
    tBox.appendChild(tCap);
    const tRow = document.createElement('div'); tRow.className='field-row';
    const totalF = plainField('เวลาสิ้นสุดการจำลอง', w.transient.totalTime, 's', v=>{ w.transient.totalTime=v; refreshLive(); }, {min:0, minExclusive:true});
    const stepsF = plainField('จำนวน time step (ไม่เกิน 2,000)', w.transient.steps, 'steps', v=>{ w.transient.steps=Math.max(1,Math.min(2000,Math.round(v))); refreshLive(); }, {min:1});
    tRow.appendChild(totalF.field); tRow.appendChild(stepsF.field);
    tBox.appendChild(tRow);
    const tApplied = document.createElement('div'); tApplied.className='eq-applied'; tApplied.style.display='block'; tApplied.style.marginTop='6px';
    tBox.appendChild(tApplied);
    const tBtnRow = document.createElement('div'); tBtnRow.style.display='flex'; tBtnRow.style.gap='10px'; tBtnRow.style.flexWrap='wrap'; tBtnRow.style.marginTop='10px';
    tBox.appendChild(tBtnRow);
    const tNote = document.createElement('div'); tNote.className='eq-note'; tNote.style.marginTop='8px';
    tNote.textContent = 'ใช้ time step ละเอียดพอให้คลื่นเดินไม่เกินประมาณหนึ่งเอลิเมนต์ต่อ step (ค่า Courant c·Δt/h ≈ 1 หรือน้อยกว่า) จะได้ภาพคลื่นที่คมและแม่นยำ — Newmark เสถียรเสมอ แต่ step ที่หยาบเกินไปทำให้คลื่นเดินช้าเพี้ยน (numerical dispersion)';
    tBox.appendChild(tNote);
    main.appendChild(tBox);

    function setTime(t){
      w.transient.totalTime = Number(t.toPrecision(5));
      totalF.input.value = roundNice(w.transient.totalTime);
      refreshLive();
    }

    /* ============ BC theory ============ */
    const eqBody = collapsibleBlock(main, 'นิยามทางคณิตศาสตร์ของเงื่อนไขขอบเขตแต่ละแบบ', false);
    [
      ['Fixed (Dirichlet) — ยึดแน่น', `u ${rm('= 0 on Γ')}<sub>D</sub>`],
      ['Free (Neumann) — ปลายอิสระ', `${frac('∂u','∂n')} ${rm('= 0 on Γ')}<sub>N</sub>`],
    ].forEach(([label, html])=>{
      const line = document.createElement('div'); line.style.marginBottom='8px';
      const lbl = document.createElement('div'); lbl.className='eq-note'; lbl.style.marginTop='0'; lbl.style.fontWeight='600'; lbl.textContent=label;
      const eq = document.createElement('div'); eq.className='equation'; eq.style.fontSize='15px'; eq.innerHTML=html;
      line.appendChild(lbl); line.appendChild(eq); eqBody.appendChild(line);
    });
    const noteEq = document.createElement('div'); noteEq.className='eq-note';
    noteEq.innerHTML = '<b>n</b> คือทิศตั้งฉากกับขอบ — ปลายที่ <b>ยึดแน่น</b> คลื่นสะท้อนกลับโดยกลับเครื่องหมาย (พัลส์บวกกลับมาเป็นลบ) ส่วนปลาย <b>อิสระ</b> คลื่นสะท้อนกลับโดยไม่กลับเครื่องหมาย ขอบที่ไม่ได้ยึดจึงไม่ต้องกำหนดอะไรเพิ่ม (เป็นเงื่อนไขธรรมชาติของระเบียบวิธีไฟไนต์เอลิเมนต์)';
    eqBody.appendChild(noteEq);

    /* ============ Sticky preview + edge table ============ */
    const tableWrap = document.createElement('div');
    const previewBox = document.createElement('div'); previewBox.className='bc-preview-sticky';
    const previewCap = document.createElement('div'); previewCap.className='unit'; previewCap.style.marginBottom='6px';
    previewCap.innerHTML = 'ชี้เมาส์ที่ชื่อขอบในตารางเพื่อไฮไลต์บนรูป &nbsp;·&nbsp; <span style="color:#C0483A">■</span> Fixed &nbsp; <span style="color:#D9A441">◯</span> ตำแหน่งพัลส์';
    previewBox.appendChild(previewCap);
    const wrap = document.createElement('div'); wrap.className='canvas-wrap'; wrap.style.marginTop='0';
    const cv = document.createElement('canvas'); cv.id='bcCanvas';
    if(is1D) sizeCanvas(cv, 340, 100); else sizeCanvas(cv, 300, 190);
    wrap.appendChild(cv); previewBox.appendChild(wrap); tableWrap.appendChild(previewBox);
    function drawPreview(highlight){
      if(is1D) drawWaveBarPreview(cv, state.geom.length, highlight);
      else drawWavePreview(cv, highlight);
    }

    const labels = edgeLabels();
    const edgeNames = getEdgeNamesForShape();
    const table = document.createElement('table'); table.className='bc-table';
    table.innerHTML = `<thead><tr><th>ขอบ</th><th>ประเภท</th><th>คำอธิบาย</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    const desc = { fixed:'u = 0 — คลื่นสะท้อนและกลับเครื่องหมาย', free:'∂u/∂n = 0 — คลื่นสะท้อนโดยไม่กลับเครื่องหมาย' };
    edgeNames.forEach(edgeName=>{
      const tr = document.createElement('tr');
      const tdName = document.createElement('td'); tdName.textContent = labels[edgeName];
      tdName.addEventListener('mouseenter', ()=> drawPreview(edgeName));
      tdName.addEventListener('mouseleave', ()=> drawPreview(null));
      const tdType = document.createElement('td');
      const sel = document.createElement('select');
      [['fixed','Fixed (u = 0)'],['free','Free (∂u/∂n = 0)']].forEach(([v,l])=>{
        const o = document.createElement('option'); o.value=v; o.textContent=l; if(state.wbc[edgeName].type===v) o.selected=true; sel.appendChild(o);
      });
      const tdVal = document.createElement('td'); tdVal.innerHTML = `<span class="unit">— ${desc[state.wbc[edgeName].type]} —</span>`;
      sel.addEventListener('change', ()=>{
        state.wbc[edgeName].type = sel.value;
        tdVal.innerHTML = `<span class="unit">— ${desc[sel.value]} —</span>`;
        refreshLive();
      });
      tdType.appendChild(sel);
      tr.appendChild(tdName); tr.appendChild(tdType); tr.appendChild(tdVal);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); tableWrap.appendChild(table);
    main.appendChild(tableWrap);

    const appliedWrap = document.createElement('div'); appliedWrap.style.margin='14px 0';
    main.appendChild(appliedWrap);
    navButtons(main, { back:true, next:true, nextLabel:'ไปหน้าตีเมช →', onNext:()=>{ state.step=4; renderAll(); } });

    function refreshLive(){
      state.results = null; // an edit makes any earlier result stale
      const ic = icResolved();
      // time line + suggestion buttons
      const dt = w.transient.totalTime/Math.max(1,w.transient.steps);
      tApplied.textContent = `เวลาสิ้นสุด = ${fmt(w.transient.totalTime,4)} s, จำนวน step = ${w.transient.steps} (Δt = ${dt.toPrecision(4)} s ต่อ step)`;
      tBtnRow.innerHTML = '';
      const {w:Wd, h:Hd} = waveDomainSize();
      const Lmax = is1D ? Wd : Math.max(Wd, Hd);
      const mkBtn = (text, t)=>{ const b = document.createElement('button'); b.type='button'; b.className='secondary'; b.textContent = text; b.onclick = ()=>setTime(t); tBtnRow.appendChild(b); };
      mkBtn(`คลื่นเดินข้ามโมเดล 1 ครั้ง (L/c = ${fmt(Lmax/w.c,3)} s)`, Lmax/w.c);
      mkBtn(`ไป-กลับ 1 รอบ (2L/c = ${fmt(2*Lmax/w.c,3)} s)`, 2*Lmax/w.c);
      // mode info
      if(ic.type==='mode'){
        const mi = modalInfo();
        if(mi){
          const omega = w.c*Math.sqrt(mi.lambda2), f = omega/(2*Math.PI);
          modeInfo.textContent = `โหมดนี้สั่นที่ ω = c·√(λx² + λy²) = ${fmt(omega,5)} rad/s (f = ${fmt(f,5)} Hz, คาบ T = ${fmt(1/f,5)} s) — รูปร่างของโหมดขึ้นกับเงื่อนไขขอบด้านล่าง`;
          mkBtn(`2 คาบของโหมดนี้ (${fmt(2/f,3)} s)`, 2/f);
        }
      } else {
        modeInfo.textContent = 'พัลส์ที่หยุดนิ่งตอนเริ่มจะแยกเป็นสองพัลส์ครึ่งแอมพลิจูดวิ่งไปทางซ้ายและขวา (ใน 1 มิติ) หรือแผ่เป็นวงกลม (ใน 2 มิติ)';
      }
      // applied tags
      appliedWrap.innerHTML = '';
      const tags = [];
      tags.push(ic.type==='gaussian'
        ? `u(x,0) = ${fmt(ic.amp,4)}·exp(−r²/2σ²), x₀ = ${fmt(ic.x0,4)}${is1D?'':`, y₀ = ${fmt(ic.y0,4)}`}, σ = ${fmt(ic.sigma,4)} m`
        : `u(x,0) = ${fmt(ic.amp,4)}·φ(${is1D ? 'm = '+ic.m : 'm = '+ic.m+', n = '+ic.n})`);
      tags.push(ic.velType==='zero' ? '∂u/∂t(x,0) = 0' : `∂u/∂t(x,0) = ${fmt(ic.v0,4)}·(รูปร่างเดียวกับ u₀)`);
      edgeNames.forEach(e=> tags.push(state.wbc[e].type==='fixed' ? `u = 0   on ${labels[e]} (fixed)` : `∂u/∂n = 0   on ${labels[e]} (free)`));
      tags.forEach(text=>{
        const line = document.createElement('div'); line.className='eq-applied'; line.style.marginRight='8px'; line.textContent = text; appliedWrap.appendChild(line);
      });
      drawPreview(null);
      drawIcChart();
      renderInfo();
    }

    syncTypeButtons();
    buildIcFields();
    // First paint must not discard an existing result (only edits do)
    const keepResults = state.results;
    refreshLive();
    state.results = keepResults;
  }
