import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { eqBlock, frac, rm, bar } from '../../render/equation-markup.js';
import { ensureBcDefaults, edgeLabels, getEdgeNamesForShape } from '../../mesh/shape-info.js';
import { draw1DDomain } from '../../render/domain-1d-canvas.js';
import { drawPreviewShape } from '../../render/shape-preview-canvas.js';
import { renderAll, renderMain } from '../layout.js';

/**
 * Step 4 ("bc" - labelled step 4 of 6, but runs BEFORE meshing): initial
 * conditions (transient only) and boundary conditions per edge. This
 * intentionally does not need state.mesh - see mesh/shape-info.js for
 * why edge names/labels can be computed from the shape alone.
 *
 * highlightPreview() is a module-internal helper (used by the edge-name
 * table's mouseenter/mouseleave handlers) - not exported.
 */

  export function renderBcStep(main){
    ensureBcDefaults();
    const titleText = state.analysisType==='transient' ? 'กำหนดเงื่อนไขเริ่มต้นและเงื่อนไขขอบเขต' : 'กำหนดเงื่อนไขขอบเขต (Boundary Conditions)';
    makeTitle(main, titleText, 'เลือกประเภทเงื่อนไขของแต่ละขอบ: Insulated (ไม่มีการถ่ายเทความร้อนผ่านขอบ), Fixed temperature (กำหนดอุณหภูมิคงที่), หรือ Heat flux (กำหนดฟลักซ์ความร้อน)');

      if(state.analysisType==='transient'){
        const icBox = document.createElement('div'); icBox.className='eq-block';
        const icCap = document.createElement('div'); icCap.className='eq-caption'; icCap.textContent='เงื่อนไขเริ่มต้น (Initial Conditions)';
        icBox.appendChild(icCap);

          const icRow = document.createElement('div'); icRow.className='field-row';
          const t0f = document.createElement('div'); t0f.className='field';
          t0f.innerHTML = `<label>อุณหภูมิเริ่มต้น T₀ (สม่ำเสมอทั้งโมเดล)</label>`;
          const t0i = document.createElement('input'); t0i.type='number'; t0i.step='any'; t0i.value=state.transient.T0;
          t0i.addEventListener('input', ()=>{ const v=parseFloat(t0i.value); if(!isNaN(v)) state.transient.T0=v; });
          const t0u = document.createElement('span'); t0u.className='unit'; t0u.textContent='°C';
          t0f.appendChild(t0i); t0f.appendChild(t0u);
          icRow.appendChild(t0f);

          const ttf = document.createElement('div'); ttf.className='field';
          ttf.innerHTML = `<label>เวลาสิ้นสุดการจำลอง</label>`;
          const tti = document.createElement('input'); tti.type='number'; tti.step='any'; tti.min='0.0001'; tti.value=state.transient.totalTime;
          tti.addEventListener('input', ()=>{ const v=parseFloat(tti.value); if(!isNaN(v) && v>0) state.transient.totalTime=v; });
          const ttu = document.createElement('span'); ttu.className='unit'; ttu.textContent='s';
          ttf.appendChild(tti); ttf.appendChild(ttu);
          icRow.appendChild(ttf);

          const sf = document.createElement('div'); sf.className='field';
          sf.innerHTML = `<label>จำนวน time step (ไม่เกิน 300)</label>`;
          const si = document.createElement('input'); si.type='number'; si.min='1'; si.max='300'; si.step='1'; si.value=state.transient.steps;
          si.addEventListener('input', ()=>{ const v=parseInt(si.value); if(!isNaN(v)) state.transient.steps=Math.max(1,Math.min(300,v)); });
          const su = document.createElement('span'); su.className='unit'; su.textContent='steps';
          sf.appendChild(si); sf.appendChild(su);
          icRow.appendChild(sf);
          icBox.appendChild(icRow);

          const setBtn = document.createElement('button'); setBtn.className='secondary'; setBtn.textContent='Set';
      setBtn.style.marginTop='4px';
      const icApplied = document.createElement('div'); icApplied.className='eq-applied'; icApplied.style.display='block'; icApplied.style.marginTop='10px';
      function refreshIcApplied(){
        const dt = state.transient.totalTime/Math.max(1,state.transient.steps);
        icApplied.textContent = `ยืนยันแล้ว: T₀ = ${state.transient.T0} °C, เวลาสิ้นสุด = ${state.transient.totalTime} s, จำนวน step = ${state.transient.steps} (Δt = ${dt.toFixed(4)} s ต่อ step)`;
      }
      setBtn.onclick = refreshIcApplied;
      icBox.appendChild(setBtn);
      refreshIcApplied();
      icBox.appendChild(icApplied);

      const icNote = document.createElement('div'); icNote.className='eq-note'; icNote.style.marginTop='8px';
      icNote.textContent = 'อุณหภูมิเริ่มต้นใช้ค่าสม่ำเสมอทั้งโมเดล ยกเว้นขอบที่กำหนด Fixed temperature ด้านล่าง ซึ่งจะเริ่มที่ค่านั้นทันที่ ณ t=0 — พิมพ์ค่าแล้วกด Set เพื่อยืนยัน';
      icBox.appendChild(icNote);

      main.appendChild(icBox);
  }

  const eqList = document.createElement('div'); eqList.className='eq-block';
  const capEl = document.createElement('div'); capEl.className='eq-caption'; capEl.textContent='นิยามทางคณิตศาสตร์ของเงื่อนไขขอบเขตแต่ละแบบ';
  eqList.appendChild(capEl);
  const rowsEq = [
     ['Fixed temperature (Dirichlet)', `T ${rm('=')} ${bar('T')} ${rm('on Γ')}<sub>D</sub>`],
     ['Heat flux (Neumann)', `${rm('-')}k${frac('∂T','∂n')} ${rm('=')} ${bar('q')} ${rm('on Γ')}<sub>N</sub>`],
     ['Convective (Robin)', `${rm('-')}k${frac('∂T','∂n')} ${rm('=')} h${rm('(')}T ${rm('-')} T<sub>∞</sub>${rm(') on Γ')}<sub>conv</sub>`],
     ['Insulated', `${frac('∂T','∂n')} ${rm('=')} 0 ${rm('on Γ')}<sub>ins</sub>`],
  ];
  rowsEq.forEach(([label, html])=>{
     const line = document.createElement('div'); line.style.marginBottom='8px';
     const lbl = document.createElement('div'); lbl.className='eq-note'; lbl.style.marginTop='0'; lbl.style.fontWeight='600'; lbl.textContent=label;
     const eq = document.createElement('div'); eq.className='equation'; eq.style.fontSize='15px'; eq.innerHTML=html;
     line.appendChild(lbl); line.appendChild(eq);
     eqList.appendChild(line);
  });
  const noteEq = document.createElement('div'); noteEq.className='eq-note';
  noteEq.innerHTML = `<b>n</b> คือทิศทางตั้งฉากกับขอบ (normal direction), ${bar('T')} คืออุณหภูมิที่กำหนด, ${bar('q')} คือฟลักซ์ความร้อนที่กำหนด (ค่าบวก = ความร้อนไหลเข้าสู่โมเดล), <b>h</b> คือสัมประสิทธิ์การพาความร้อน (convective heat transfer coefficient), <b>T∞</b> คืออุณหภูมิของของไหลโดยรอบ (ambient/fluid temperature)`;
  eqList.appendChild(noteEq);
  main.appendChild(eqList);

  const labels = edgeLabels();
  const edgeNames = getEdgeNamesForShape();
  const table = document.createElement('table'); table.className='bc-table';
  table.innerHTML = `<thead><tr><th>ขอบ</th><th>ประเภท</th><th>ค่า</th></tr></thead>`;
  const tbody = document.createElement('tbody');

  edgeNames.forEach(edgeName=>{
    const tr = document.createElement('tr');
    const tdName = document.createElement('td'); tdName.textContent = labels[edgeName];
    tdName.addEventListener('mouseenter', ()=> highlightPreview(edgeName));
    tdName.addEventListener('mouseleave', ()=> highlightPreview(null));

      const tdType = document.createElement('td');
      const sel = document.createElement('select');
      [['insulated','Insulated'],['fixed','Fixed temperature'],['flux','Heat flux'],['convective','Convective (h, T∞)']].forEach(([v,l])=>{
        const o = document.createElement('option'); o.value=v; o.textContent=l;
        if(state.bc[edgeName].type===v) o.selected=true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', ()=>{
    state.bc[edgeName].type = sel.value;
    if(sel.value==='convective'){
      if(state.bc[edgeName].h===undefined) state.bc[edgeName].h = 10;
      if(state.bc[edgeName].Tinf===undefined) state.bc[edgeName].Tinf = 25;
    }
    renderMain();
  });
  tdType.appendChild(sel);

  const tdVal = document.createElement('td');
  if(state.bc[edgeName].type === 'insulated'){
    tdVal.innerHTML = '<span class="unit">— ไม่มกี ารไหลของความร้อนผ่านขอบนี้ —</span>';
  } else if(state.bc[edgeName].type === 'convective'){
    const hInp = document.createElement('input'); hInp.type='number'; hInp.step='any';
    hInp.value = state.bc[edgeName].h; hInp.placeholder='h';
    hInp.style.width='70px';
    hInp.addEventListener('input', ()=>{ const v=parseFloat(hInp.value); state.bc[edgeName].h = isNaN(v)?0:v; });
    const tInp = document.createElement('input'); tInp.type='number'; tInp.step='any';
    tInp.value = state.bc[edgeName].Tinf; tInp.placeholder='T∞';
    tInp.style.width='70px'; tInp.style.marginLeft='6px';
    tInp.addEventListener('input', ()=>{ const v=parseFloat(tInp.value); state.bc[edgeName].Tinf = isNaN(v)?0:v; });
    const commit = ()=>{
       state.bc[edgeName].h = isNaN(parseFloat(hInp.value)) ? 0 : parseFloat(hInp.value);
       state.bc[edgeName].Tinf = isNaN(parseFloat(tInp.value)) ? 0 : parseFloat(tInp.value);
       renderMain();
    };
    hInp.addEventListener('keydown', (e)=>{ if(e.key==='Enter') commit(); });
    tInp.addEventListener('keydown', (e)=>{ if(e.key==='Enter') commit(); });
    const setBtn = document.createElement('button'); setBtn.className='secondary'; setBtn.textContent='Set';
    setBtn.style.padding='6px 12px'; setBtn.style.fontSize='11.5px'; setBtn.style.marginLeft='6px';
    setBtn.onclick = commit;
    tdVal.appendChild(hInp); tdVal.appendChild(tInp); tdVal.appendChild(setBtn);
    const hint = document.createElement('div'); hint.className='unit'; hint.style.marginTop='4px';
    hint.textContent = 'h: W/(m²·K)     T∞: °C';
    tdVal.appendChild(hint);
  } else {
    const inp = document.createElement('input'); inp.type='number'; inp.step='any';
    inp.value = state.bc[edgeName].value;
    inp.placeholder = state.bc[edgeName].type==='fixed' ? '°C' : 'W/m²';
    inp.addEventListener('input', ()=>{
       const v = parseFloat(inp.value);
       state.bc[edgeName].value = isNaN(v)?0:v;
    });
    inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ renderMain(); } });
    tdVal.appendChild(inp);
    const setBtn = document.createElement('button'); setBtn.className='secondary'; setBtn.textContent='Set';
    setBtn.style.padding='6px 12px'; setBtn.style.fontSize='11.5px'; setBtn.style.marginLeft='6px';
    setBtn.onclick = ()=>{
       const v = parseFloat(inp.value);
       state.bc[edgeName].value = isNaN(v)?0:v;
       renderMain();
    };
    tdVal.appendChild(setBtn);
    const hint = document.createElement('span'); hint.className='unit'; hint.style.marginLeft='8px';
    hint.textContent = state.bc[edgeName].type==='fixed' ? '°C' : (state.dimension==='1d' ? 'W (A=1 m², เข้าสู่โมเดล = บวก)' : 'W/m² (เข้าสู่โมเดล = บวก)');
    tdVal.appendChild(hint);
  }

        tr.appendChild(tdName); tr.appendChild(tdType); tr.appendChild(tdVal);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      main.appendChild(table);
      const setHint = document.createElement('div'); setHint.className='eq-note';
      setHint.textContent = 'พิมพ์ค่าแล้วกด "Set" (หรือ Enter) เพื่อยืนยัน — กล่องสรุปด้านล่างจะอัปเดตทันที่ที่กดยืนยัน';
      main.appendChild(setHint);

      const appliedWrap = document.createElement('div'); appliedWrap.style.margin='14px 0';
      const fluxUnit = state.dimension==='1d' ? 'W' : 'W/m²';
      edgeNames.forEach(edgeName=>{
        const bc = state.bc[edgeName];
        let text;
        if(bc.type==='fixed') text = `T = ${bc.value} °C   on ${labels[edgeName]}`;
        else if(bc.type==='flux') text = `-k·∂T/∂n = ${bc.value} ${fluxUnit}   on ${labels[edgeName]}`;
        else if(bc.type==='convective') text = `-k·∂T/∂n = h(T-T∞), h=${bc.h} W/(m²·K), T∞=${bc.Tinf} °C   on ${labels[edgeName]}`;
        else text = `∂T/∂n = 0   on ${labels[edgeName]} (insulated)`;
        const line = document.createElement('div'); line.className='eq-applied'; line.style.marginRight='8px';
        line.textContent = text;
        appliedWrap.appendChild(line);
      });
      main.appendChild(appliedWrap);

      const wrap = document.createElement('div'); wrap.className='canvas-wrap';
      let cv;
      if(state.dimension==='1d'){
        cv = document.createElement('canvas'); cv.width=520; cv.height=140; cv.id='bcCanvas';
        wrap.appendChild(cv);
        main.appendChild(wrap);
        draw1DDomain(cv, state.geom.length);
      } else {
        cv = document.createElement('canvas'); cv.width=460; cv.height=300; cv.id='bcCanvas';
        wrap.appendChild(cv);
        main.appendChild(wrap);
        drawPreviewShape(cv);
      }

      const hasFixed = Object.values(state.bc).some(b=>b.type==='fixed');
      const hasConvective = Object.values(state.bc).some(b=>b.type==='convective');
      const canProceed = hasFixed || hasConvective;
      if(!canProceed){
        const note = document.createElement('div'); note.className='note';
        note.textContent = 'ต้องกำหนด Fixed temperature หรือ Convective อย่างน้อย 1 ขอบ ก่อนตีเมชและรันการจำลอง มิฉะนั้นระบบสมการจะไม่มีคำตอบที่แน่นอน';
          main.appendChild(note);
      }

      navButtons(main, { back:true, next:canProceed, nextDisabled:!canProceed, nextLabel:'ไปหน้าตีเมช →', onNext:()=>{ state.step=4; renderAll(); } });
  }

  function highlightPreview(edgeName){
    const cv = document.getElementById('bcCanvas');
    if(!cv) return;
    if(state.dimension==='1d'){
      draw1DDomain(cv, state.geom.length, {highlight: edgeName});
      return;
    }
    drawPreviewShape(cv, edgeName);
  }
