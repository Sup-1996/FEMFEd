import { state } from '../../state.js';
import { makeTitle, navButtons, numField } from '../dom-helpers.js';
import { draw1DDomain } from '../../render/domain-1d-canvas.js';
import {
  drawPreviewShape,
  drawPolygonDraftCanvas,
  DRAW_SCALE,
  DRAW_SNAP,
} from '../../render/shape-preview-canvas.js';
import { sizeCanvas } from '../../render/hidpi.js';
import { bboxFor2DShape } from '../../mesh/shape-info.js';
import { isSimplePolygon } from '../../mesh/polygon-mesh.js';
import { renderAll, renderMain } from '../layout.js';

/**
 * Step 2: pick the model's dimension (1D / 2D) and shape.
 *
 * For 2D, either a rectangle (dimensions typed in directly) or a
 * freeform polygon drawn point-by-point on a snap-to-grid canvas
 * (renderPolygonDrawTool) - self-intersection is checked with
 * isSimplePolygon() before the shape can be "closed". A row of shape
 * templates (L/T/triangle/trapezoid) fills in a ready-made point list
 * as a starting point, which the user can still undo/adjust/close like
 * any hand-drawn shape.
 */

  // Ready-made point lists for the polygon draw tool's template buttons
  // (meters; POLYGON_TEMPLATES normalizes to a corner at the origin the
  // same way a hand-drawn shape does, via finalize, so any of these are
  // fine as-is).
  const POLYGON_TEMPLATES = {
    L: [[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]],
    T: [[0,0],[3,0],[3,1],[2,1],[2,2],[1,2],[1,1],[0,1]],
    triangle: [[0,0],[2,0],[1,1.6]],
    trapezoid: [[0,0],[2,0],[1.5,1],[0.5,1]],
  };

  export function renderGeometryStep(main){
    makeTitle(main, 'สร้างรูปทรงโมเดล', 'เลือกมิติของโมเดล และเลือกรูปทรงจากเทมเพลตสำเร็จรูป หรือวาดรูปร่างเองแล้วกำหนดขนาดเป็นตัวเลข (หน่วยเมตร)');

      const dimRow = document.createElement('div'); dimRow.className='eq-choice';
      const dim1D = document.createElement('button'); dim1D.type='button';
      dim1D.className='eq-btn'+(state.dimension==='1d'?' sel':'');
      dim1D.innerHTML = `1D — เส้น (line/rod)<span class="tag">เหมาะสำหรับเรียนพื้นฐาน</span>`;
      dim1D.onclick = ()=>{ state.dimension='1d'; state.shape='line'; state.mesh=null; state.results=null; renderAll(); };
      const dim2D = document.createElement('button'); dim2D.type='button';
      dim2D.className='eq-btn'+(state.dimension==='2d'?' sel':'');
      dim2D.innerHTML = `2D — พื้นที่ระนาบ<span class="tag">สี่เหลี่ยม/วาดเอง</span>`;
      dim2D.onclick = ()=>{ state.dimension='2d'; if(state.shape==='line') state.shape='rectangle'; state.mesh=null; state.results=null; renderAll(); };
      dimRow.appendChild(dim1D); dimRow.appendChild(dim2D);
      main.appendChild(dimRow);

      if(state.dimension==='1d'){
        const row = document.createElement('div'); row.className='field-row';
        row.appendChild(numField('ความยาวของเส้น/แท่ง (length)', state.geom.length, 'm', v=>{state.geom.length=v; state.mesh=null; state.results=null;}));
        main.appendChild(row);
        const note = document.createElement('div'); note.className='eq-note';
                                  note.textContent = state.equation==='structure'
                                    ? 'พื้นที่หน้าตัด A กำหนดในขั้นตอนคุณสมบัติวัสดุ (ขั้นตอนถัดไป)'
                                    : 'สมมติพื้นที่หน้าตัด A = 1 m² เพื่อความง่าย (ไม่ส่งผลต่อรูปแบบคำตอบของอุณหภูมิ)';
        main.appendChild(note);

         const wrap = document.createElement('div'); wrap.className='canvas-wrap';
         const cv = document.createElement('canvas'); sizeCanvas(cv, 460, 140);
         wrap.appendChild(cv);
         main.appendChild(wrap);
         draw1DDomain(cv, state.geom.length);

         navButtons(main, { back:true, next:true, onNext:()=>{ state.step=2; renderAll(); } });
          return;
      }

      const shapes = document.createElement('div'); shapes.className='shape-choice';
      const rectBtn = document.createElement('button'); rectBtn.type='button';
      rectBtn.className='shape-btn'+(state.shape==='rectangle'?' sel':'');
      rectBtn.innerHTML = `<svg viewBox="0 0 40 40"><rect x="5" y="10" width="30" height="20" fill="none" stroke="${state.shape==='rectangle'?'#3FAE8C':'#7C8588'}" stroke-width="2"/></svg><span>สี่เหลี่ยม</span>`;
      rectBtn.onclick = ()=>{ state.shape='rectangle'; state.mesh=null; state.results=null; renderAll(); };
      const polyBtn = document.createElement('button'); polyBtn.type='button';
      polyBtn.className='shape-btn'+(state.shape==='polygon'?' sel':'');
      polyBtn.innerHTML = `<svg viewBox="0 0 40 40"><polygon points="4,30 14,6 32,10 36,26 20,36" fill="none" stroke="${state.shape==='polygon'?'#3FAE8C':'#7C8588'}" stroke-width="2"/></svg><span>วาดรูปร่างเอง</span>`;
      polyBtn.onclick = ()=>{ state.shape='polygon'; state.mesh=null; state.results=null; renderAll(); };
      shapes.appendChild(rectBtn); shapes.appendChild(polyBtn);
      main.appendChild(shapes);

      if(state.shape==='rectangle'){
        const row = document.createElement('div'); row.className='field-row';
        row.appendChild(numField('ความกว้าง (width)', state.geom.width, 'm', v=>{state.geom.width=v; state.mesh=null; state.results=null;}));
        row.appendChild(numField('ความสูง (height)', state.geom.height, 'm', v=>{state.geom.height=v; state.mesh=null; state.results=null;}));
        main.appendChild(row);

          const wrap = document.createElement('div'); wrap.className='canvas-wrap';
          const cv = document.createElement('canvas'); sizeCanvas(cv, 460, 300);
          wrap.appendChild(cv);
          main.appendChild(wrap);
          drawPreviewShape(cv);

          navButtons(main, { back:true, next:true, onNext:()=>{ state.step=2; renderAll(); } });
          return;
      }

      renderPolygonDrawTool(main);
  }

  export function renderPolygonDrawTool(main){
    const p = state.polygon;

      if(!p.finalized){
        const desc = document.createElement('p'); desc.className='panel-desc';
        desc.textContent = `คลิกบนตารางเพื่อวางจุดต่อเนื่องกันเป็นเส้นตรง (พื้นที่วาดสูงสุด ${(460/DRAW_SCALE).toFixed(1)} × ${(340/DRAW_SCALE).toFixed(1)} ม., จุดจะสแนปเข้าตาราง ${DRAW_SNAP} ม.) เมื่อวางครบแล้วกด "ปิดรูปร่าง" เพื่อเชื่อมจุดสุดท้ายกลับไปยังจุดแรก หรือเริ่มจากเทมเพลตด้านล่างแล้วปรับแต่งเอาก็ได้`;
          main.appendChild(desc);

          const templateRow = document.createElement('div'); templateRow.className='shape-choice'; templateRow.style.marginBottom='10px';
          const templateLabels = { L:'ตัว L', T:'ตัว T', triangle:'สามเหลี่ยม', trapezoid:'สี่เหลี่ยมคางหมู' };
          Object.entries(templateLabels).forEach(([key,label])=>{
            const b = document.createElement('button'); b.type='button'; b.className='secondary';
            b.textContent = label;
            b.onclick = ()=>{
              p.vertices = POLYGON_TEMPLATES[key].map(([x,y])=>({x,y}));
              renderMain();
            };
            templateRow.appendChild(b);
          });
          main.appendChild(templateRow);

          const wrap = document.createElement('div'); wrap.className='canvas-wrap';
          const cv = document.createElement('canvas'); sizeCanvas(cv, 460, 340); cv.style.cursor='crosshair';
          wrap.appendChild(cv);
          main.appendChild(wrap);

          const hoverInfo = document.createElement('div'); hoverInfo.className='unit'; hoverInfo.style.marginTop='6px'; hoverInfo.style.minHeight='1.2em';
          main.appendChild(hoverInfo);

          const errDiv = document.createElement('div'); errDiv.className='error';
          main.appendChild(errDiv);

          function snappedPoint(e){
            const rect = cv.getBoundingClientRect();
            const px = e.clientX-rect.left, py = e.clientY-rect.top;
            const cssH = cv._cssH || cv.height;
            let x = Math.round((px/DRAW_SCALE)/DRAW_SNAP)*DRAW_SNAP;
            let y = Math.round(((cssH-py)/DRAW_SCALE)/DRAW_SNAP)*DRAW_SNAP;
            return { x: Math.max(0,x), y: Math.max(0,y) };
          }

          cv.addEventListener('mousemove', (e)=>{
            const pt = snappedPoint(e);
            hoverInfo.textContent = `ตำแหน่งเมาส์: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) ม.`;
            drawPolygonDraftCanvas(cv, pt);
          });
          cv.addEventListener('mouseleave', ()=>{
            hoverInfo.textContent = '';
            drawPolygonDraftCanvas(cv, null);
          });
          cv.addEventListener('click', (e)=>{
            p.vertices.push(snappedPoint(e));
            renderMain();
          });

          const actions = document.createElement('div'); actions.className='actions';
          const undoBtn = document.createElement('button'); undoBtn.className='secondary'; undoBtn.textContent='↩ ยกเลิกจุดล่าสุด';
          undoBtn.disabled = p.vertices.length===0;
          undoBtn.onclick = ()=>{ p.vertices.pop(); renderMain(); };
          const clearBtn = document.createElement('button'); clearBtn.className='secondary'; clearBtn.textContent='ล้างทั้งหมด';
          clearBtn.disabled = p.vertices.length===0;
          clearBtn.onclick = ()=>{ p.vertices=[]; renderMain(); };
          const closeBtn = document.createElement('button'); closeBtn.className='primary'; closeBtn.textContent='ปิดรูปร่าง';
          closeBtn.disabled = p.vertices.length<3;
          closeBtn.onclick = ()=>{
             if(!isSimplePolygon(p.vertices)){
               errDiv.textContent = 'รูปร่างที่วาดมีเส้นตัดกันเอง กรุณายกเลิกจุดล่าสุดหรือล้างแล้ววาดใหม่';
               errDiv.style.display='block';
               return;
             }
             let minX=Infinity, minY=Infinity;
             p.vertices.forEach(v=>{ if(v.x<minX) minX=v.x; if(v.y<minY) minY=v.y; });
             p.vertices = p.vertices.map(v=>({x:v.x-minX, y:v.y-minY}));
             p.finalized = true;
             state.mesh=null; state.results=null; state.bc={}; state.sbc={}; state.spl={};
             renderAll();
          };
          actions.appendChild(undoBtn); actions.appendChild(clearBtn); actions.appendChild(closeBtn);
          main.appendChild(actions);

          const info = document.createElement('div'); info.className='eq-note'; info.style.marginTop='10px';
          info.textContent = `จำนวนจุดที่วางแล้ว: ${p.vertices.length}`;
          main.appendChild(info);

        drawPolygonDraftCanvas(cv, null);
        navButtons(main, { back:true, next:false });
      } else {
        const bbox = bboxFor2DShape();
        const summary = document.createElement('div'); summary.className='eq-block'; summary.style.background='#fff'; summary.style.borderColor='var(--border-strong)';
        summary.innerHTML = `<div class="eq-caption" style="margin-bottom:10px;">รูปร่างที่วาด</div>
          <div style="display:flex; gap:32px; font-family:var(--mono);">
            <div><div class="unit">จำนวนจุด/ขอบ</div><div style="font-size:20px; font-weight:700; color:var(--mint-deep);">${state.polygon.vertices.length}</div></div>
            <div><div class="unit">ขนาดกรอบ (bounding box)</div><div style="font-size:20px; font-weight:700; color:var(--mint-deep);">${bbox.w.toFixed(2)} × ${bbox.h.toFixed(2)} m</div></div>
          </div>`;
        main.appendChild(summary);

          const wrap = document.createElement('div'); wrap.className='canvas-wrap';
          const cv = document.createElement('canvas'); sizeCanvas(cv, 460, 300);
          wrap.appendChild(cv);
          main.appendChild(wrap);
          drawPreviewShape(cv);

          const redrawBtn = document.createElement('button'); redrawBtn.className='secondary'; redrawBtn.style.marginTop='12px'; redrawBtn.textContent='✎ วาดรูปร่างใหม่';
          redrawBtn.onclick = ()=>{ state.polygon={vertices:[], finalized:false}; state.mesh=null; state.results=null; state.bc={}; state.sbc={}; state.spl={}; renderAll(); };
          main.appendChild(redrawBtn);

          navButtons(main, { back:true, next:true, onNext:()=>{ state.step=2; renderAll(); } });
      }
  }
