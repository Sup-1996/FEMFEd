import { state } from '../../state.js';
import { makeTitle, navButtons } from '../dom-helpers.js';
import { collapsibleBlock, frac, rm, bar } from '../../render/equation-markup.js';
import { edgeLabels, getEdgeNamesForShape } from '../../mesh/shape-info.js';
import { ensureStructuralDefaults, cornerKeys, cornerLabels } from '../../mesh/structural-info.js';
import { drawStructuralPreview, drawBarPreview } from '../../render/structural-canvas.js';
import { sizeCanvas } from '../../render/hidpi.js';
import { unitInput, fmt, fmtWith, pickStressUnit, pickForceUnit } from '../structural-format.js';
import { renderAll } from '../layout.js';

/**
 * Step 4 (Structural, labelled "boundary conditions" in the step rail but
 * running BEFORE meshing, like the heat version): supports and loads.
 *
 * Per edge (state.sbc[edge]):
 *   2D  free | fixed (ux=uy=0) | roller_x (ux=0) | roller_y (uy=0) |
 *       traction (uniform global tx, ty in force per unit area)
 *   1D  free | fixed (u=0) | load (axial force at that end)
 * plus, in 2D, point loads at the shape's corners (state.spl).
 *
 * Same live-update approach as the heat BC step: every control writes to
 * state immediately and only the applied-BC tags / Next button / one
 * row's value cell are patched, never the whole step. The preview canvas
 * (supports in red/blue, loads as arrows) stays pinned above the tables.
 */

  const UNITS_TRACTION = [['Pa',1],['kPa',1e3],['MPa',1e6]];
  const UNITS_FORCE = [['N',1],['kN',1e3],['MN',1e6]];

  export function renderStructuralBcStep(main){
    ensureStructuralDefaults();
    const is1D = state.dimension==='1d';
    makeTitle(main, 'กำหนดการยึดรั้งและแรงกระทำ (Supports & Loads)',
      is1D ? 'เลือกว่าปลายแต่ละด้านของแท่งถูกยึด (Fixed), อิสระ (Free) หรือรับแรงตามแกน (Point load) — ต้องยึดอย่างน้อยหนึ่งปลายเพื่อไม่ให้แท่งเลื่อนหลุด'
           : 'เลือกชนิดเงื่อนไขของแต่ละขอบ: Fixed (ยึดแน่น), Roller (กันการเคลื่อนที่เฉพาะแกนเดียว), Traction (แรงกระจายสม่ำเสมอ) หรือ Free (อิสระ ไม่มีแรง) และเพิ่มแรงจุดที่มุมได้ — ต้องมีการยึดรั้งที่กันทั้งการเลื่อนและการหมุน');

    // --- Theory (collapsed by default) ---
    const eqBody = collapsibleBlock(main, 'นิยามทางคณิตศาสตร์ของเงื่อนไขแต่ละแบบ', false);
    const defs = is1D ? [
      ['Fixed (Dirichlet)', `u ${rm('= 0 at the end')}`],
      ['Point load (Neumann)', `EA${frac('du','dx')} ${rm('= ±')}P ${rm('(P เป็นบวกเมื่อแรงชี้ทาง +x)')}`],
      ['Free', `EA${frac('du','dx')} ${rm('= 0')}`],
    ] : [
      ['Fixed', `u ${rm('=')} v ${rm('= 0 on Γ')}<sub>u</sub>`],
      ['Roller x / Roller y', `u ${rm('= 0 (Roller x)')} ${rm('หรือ')} v ${rm('= 0 (Roller y)')} ${rm('— อีกแกนเลื่อนได้อิสระ')}`],
      ['Traction (Neumann)', `${rm('{')}σ${rm('}·')}n ${rm('=')} ${bar('t')} ${rm('= (')}t<sub>x</sub>, t<sub>y</sub>${rm(') on Γ')}<sub>t</sub>`],
      ['Free', `${rm('{')}σ${rm('}·')}n ${rm('= 0')}`],
    ];
    defs.forEach(([label, html])=>{
      const line = document.createElement('div'); line.style.marginBottom='8px';
      const lbl = document.createElement('div'); lbl.className='eq-note'; lbl.style.marginTop='0'; lbl.style.fontWeight='600'; lbl.textContent=label;
      const eq = document.createElement('div'); eq.className='equation'; eq.style.fontSize='15px'; eq.innerHTML=html;
      line.appendChild(lbl); line.appendChild(eq);
      eqBody.appendChild(line);
    });
    const noteEq = document.createElement('div'); noteEq.className='eq-note';
    noteEq.innerHTML = is1D
      ? 'ปลายที่ไม่ได้กำหนดอะไรจะเป็น Free โดยอัตโนมัติ (ไม่มีแรงและเคลื่อนที่ได้)'
      : '<b>n</b> คือทิศตั้งฉากกับขอบ, t̄ คือแรงต่อหน่วยพื้นที่ที่ขอบ (Pa) แยกเป็นองค์ประกอบตามแกน x, y ของระบบพิกัดหลัก — ค่าบวก = ชี้ทาง +x / +y; ขอบที่ไม่ได้กำหนดอะไรเป็น Free (ไม่มีแรง) โดยอัตโนมัติ; Roller ล็อกตามแกนหลัก x หรือ y เท่านั้น (ไม่รองรับ roller ตั้งฉากกับขอบเฉียง)';
    eqBody.appendChild(noteEq);

    // --- Sticky preview + edge table ---
    const tableWrap = document.createElement('div');
    const previewBox = document.createElement('div'); previewBox.className='bc-preview-sticky';
    const previewCap = document.createElement('div'); previewCap.className='unit'; previewCap.style.marginBottom='6px';
    previewCap.innerHTML = 'ชี้เมาส์ที่ชื่อขอบในตารางเพื่อไฮไลต์บนรูป &nbsp;·&nbsp; <span style="color:#C0483A">■</span> Fixed &nbsp; <span style="color:#2F6FB5">■</span> Roller &nbsp; <span style="color:#A87715">→</span> แรง';
    previewBox.appendChild(previewCap);
    const wrap = document.createElement('div'); wrap.className='canvas-wrap'; wrap.style.marginTop='0';
    const cv = document.createElement('canvas'); cv.id='bcCanvas';
    if(is1D) sizeCanvas(cv, 340, 100); else sizeCanvas(cv, 300, 190);
    wrap.appendChild(cv); previewBox.appendChild(wrap);
    tableWrap.appendChild(previewBox);
    function drawPreview(highlight){
      if(is1D) drawBarPreview(cv, state.geom.length, highlight);
      else drawStructuralPreview(cv, highlight);
    }
    drawPreview(null);

    const labels = edgeLabels();
    const edgeNames = getEdgeNamesForShape();
    const table = document.createElement('table'); table.className='bc-table';
    table.innerHTML = `<thead><tr><th>ขอบ</th><th>ประเภท</th><th>ค่า</th></tr></thead>`;
    const tbody = document.createElement('tbody');

    const typeOptions = is1D ? [
      ['free','Free (อิสระ)'],['fixed','Fixed (u = 0)'],['load','Point load (แรงที่ปลาย)'],
    ] : [
      ['free','Free (อิสระ)'],['fixed','Fixed (ux = uy = 0)'],['roller_x','Roller x (ux = 0)'],['roller_y','Roller y (uy = 0)'],['traction','Traction (แรงกระจาย)'],
    ];

    function labelledInput(text, control){
      const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='6px'; row.style.marginBottom='4px';
      const l = document.createElement('span'); l.className='unit'; l.style.width='22px'; l.textContent = text;
      row.appendChild(l); row.appendChild(control);
      return row;
    }

    function fillValueCell(td, edgeName){
      td.innerHTML = '';
      const bc = state.sbc[edgeName];
      if(bc.type==='free'){
        td.innerHTML = '<span class="unit">— ขอบอิสระ ไม่มีแรงและไม่ถูกยึด —</span>';
      } else if(bc.type==='fixed'){
        td.innerHTML = `<span class="unit">— ${is1D ? 'u = 0' : 'ux = uy = 0'} (ไม่มีการเคลื่อนที่) —</span>`;
      } else if(bc.type==='roller_x'){
        td.innerHTML = '<span class="unit">— ux = 0 ขอบนี้เลื่อนตามแกน y ได้ —</span>';
      } else if(bc.type==='roller_y'){
        td.innerHTML = '<span class="unit">— uy = 0 ขอบนี้เลื่อนตามแกน x ได้ —</span>';
      } else if(bc.type==='load'){
        td.appendChild(unitInput(bc.value, UNITS_FORCE, 1, v=>{ bc.value=v; refreshLive(); }, {width:100}));
        const hint = document.createElement('div'); hint.className='unit'; hint.style.marginTop='4px';
        hint.textContent = 'แรงตามแกน (บวก = ชี้ทาง +x, ลบ = ชี้ทาง −x)';
        td.appendChild(hint);
      } else if(bc.type==='traction'){
        td.appendChild(labelledInput('tx', unitInput(bc.tx, UNITS_TRACTION, 2, v=>{ bc.tx=v; refreshLive(); }, {width:100})));
        td.appendChild(labelledInput('ty', unitInput(bc.ty, UNITS_TRACTION, 2, v=>{ bc.ty=v; refreshLive(); }, {width:100})));
        const hint = document.createElement('div'); hint.className='unit';
        hint.textContent = 'แรงต่อหน่วยพื้นที่ (บวก = ชี้ทาง +x / +y)';
        td.appendChild(hint);
      }
    }

    edgeNames.forEach(edgeName=>{
      const tr = document.createElement('tr');
      const tdName = document.createElement('td'); tdName.textContent = labels[edgeName];
      tdName.addEventListener('mouseenter', ()=> drawPreview(edgeName));
      tdName.addEventListener('mouseleave', ()=> drawPreview(null));
      const tdType = document.createElement('td');
      const sel = document.createElement('select');
      typeOptions.forEach(([v,l])=>{
        const o = document.createElement('option'); o.value=v; o.textContent=l;
        if(state.sbc[edgeName].type===v) o.selected=true;
        sel.appendChild(o);
      });
      const tdVal = document.createElement('td');
      sel.addEventListener('change', ()=>{
        state.sbc[edgeName].type = sel.value;
        fillValueCell(tdVal, edgeName);
        refreshLive();
      });
      tdType.appendChild(sel);
      fillValueCell(tdVal, edgeName);
      tr.appendChild(tdName); tr.appendChild(tdType); tr.appendChild(tdVal);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    // --- Corner point loads (2D only) ---
    if(!is1D){
      const ptTitle = document.createElement('div'); ptTitle.className='eq-note'; ptTitle.style.marginTop='18px'; ptTitle.style.fontWeight='600';
      ptTitle.textContent = 'แรงจุดที่มุม (Point loads) — ไม่บังคับ';
      tableWrap.appendChild(ptTitle);
      const ptTable = document.createElement('table'); ptTable.className='bc-table';
      ptTable.innerHTML = `<thead><tr><th>จุด</th><th>Fx</th><th>Fy</th></tr></thead>`;
      const ptBody = document.createElement('tbody');
      const clabels = cornerLabels();
      cornerKeys().forEach(key=>{
        const pl = state.spl[key];
        const tr = document.createElement('tr');
        const tdName = document.createElement('td'); tdName.textContent = clabels[key];
        const tdX = document.createElement('td'); tdX.appendChild(unitInput(pl.fx, UNITS_FORCE, 0, v=>{ pl.fx=v; refreshLive(); }, {width:90}));
        const tdY = document.createElement('td'); tdY.appendChild(unitInput(pl.fy, UNITS_FORCE, 0, v=>{ pl.fy=v; refreshLive(); }, {width:90}));
        tr.appendChild(tdName); tr.appendChild(tdX); tr.appendChild(tdY);
        ptBody.appendChild(tr);
      });
      ptTable.appendChild(ptBody);
      tableWrap.appendChild(ptTable);
      const ptHint = document.createElement('div'); ptHint.className='eq-note';
      ptHint.textContent = 'แรงจุดวางที่มุมของรูปทรงเท่านั้น (มุมเป็นโหนดของเมชเสมอ จึงกำหนดได้ก่อนตีเมช) — บวก = ชี้ทาง +x / +y หน่วยเป็นนิวตัน (ต่อความลึก 1 m ถ้าเป็น plane strain)';
      tableWrap.appendChild(ptHint);
    }
    main.appendChild(tableWrap);

    const noSupport = document.createElement('div'); noSupport.className='note';
    noSupport.textContent = is1D
      ? 'ต้องกำหนด Fixed อย่างน้อย 1 ปลาย ก่อนตีเมชและรันการจำลอง มิฉะนั้นแท่งจะเคลื่อนที่ได้อิสระและไม่มีคำตอบที่แน่นอน'
      : 'ต้องมีการยึดรั้งที่กันทั้งการเลื่อนและการหมุน — เช่น Fixed อย่างน้อย 1 ขอบ หรือ Roller x 1 ขอบ ร่วมกับ Roller y อีก 1 ขอบ — ก่อนตีเมชและรันการจำลอง';
    main.appendChild(noSupport);
    const noLoad = document.createElement('div'); noLoad.className='note';
    noLoad.textContent = 'ยังไม่ได้กำหนดแรงกระทำใด ๆ — ผลลัพธ์จะเป็นศูนย์ทั้งหมด (ไม่มีการเสียรูป)';
    main.appendChild(noLoad);

    const appliedWrap = document.createElement('div'); appliedWrap.style.margin='14px 0';
    main.appendChild(appliedWrap);

    const { nextBtn } = navButtons(main, { back:true, next:true, nextLabel:'ไปหน้าตีเมช →', onNext:()=>{ state.step=4; renderAll(); } });

    function force(v){ return fmtWith(v, pickForceUnit(Math.abs(v))); }
    function stress(v){ return fmtWith(v, pickStressUnit(Math.abs(v))); }

    function refreshLive(){
      state.results = null; // supports/loads changed: any earlier result is stale
      appliedWrap.innerHTML = '';
      const tags = [];
      edgeNames.forEach(e=>{
        const bc = state.sbc[e];
        let text = null;
        if(bc.type==='fixed') text = is1D ? `u = 0   on ${labels[e]}` : `u = v = 0   on ${labels[e]} (fixed)`;
        else if(bc.type==='roller_x') text = `u = 0   on ${labels[e]} (roller x)`;
        else if(bc.type==='roller_y') text = `v = 0   on ${labels[e]} (roller y)`;
        else if(bc.type==='traction') text = `t = (${stress(bc.tx)}, ${stress(bc.ty)})   on ${labels[e]}`;
        else if(bc.type==='load') text = `P = ${force(bc.value)}   at ${labels[e]}`;
        if(text) tags.push(text);
      });
      if(!is1D){
        const clabels = cornerLabels();
        for(const [key,pl] of Object.entries(state.spl)){
          if(pl.fx!==0 || pl.fy!==0) tags.push(`F = (${force(pl.fx)}, ${force(pl.fy)})   at ${clabels[key]}`);
        }
      }
      tags.forEach(text=>{
        const line = document.createElement('div'); line.className='eq-applied'; line.style.marginRight='8px';
        line.textContent = text;
        appliedWrap.appendChild(line);
      });

      const types = Object.values(state.sbc).map(b=>b.type);
      const canProceed = is1D ? types.includes('fixed')
        : (types.includes('fixed') || (types.includes('roller_x') && types.includes('roller_y')));
      if(nextBtn) nextBtn.disabled = !canProceed;
      noSupport.style.display = canProceed ? 'none' : 'block';

      const hasLoad = Object.values(state.sbc).some(b=> (b.type==='traction' && (b.tx!==0 || b.ty!==0)) || (b.type==='load' && b.value!==0))
        || Object.values(state.spl).some(p=> p.fx!==0 || p.fy!==0);
      noLoad.style.display = (canProceed && !hasLoad) ? 'block' : 'none';
      drawPreview(null);
    }
    // First paint must not discard an existing result (only edits do)
    const keepResults = state.results;
    refreshLive();
    state.results = keepResults;
  }
