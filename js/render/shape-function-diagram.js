/**
 * Draws the small two-panel illustration used on the "mesh" step: panel
 * 1 shows the raw 1D shape functions N_i(x) (linear or quadratic);
 * panel 2 shows them used to interpolate a made-up example temperature
 * field between nodes. Purely illustrative - takes no mesh/state input,
 * just the element order.
 */

  /* --- Step 5: Mesh (runs after BC is already configured) --- */
  /* ---- Illustrative shape-function diagram for the Mesh step (1D-style, order-aware) ---- */
  export function drawShapeFunctionDiagram(canvas, order){
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

      const padL=48, padR=16;
      const plotW = W - padL - padR;
      const panelH = 88;
      const panelATop = 34;
      const panelBTop = panelATop + panelH + 66;
      const colors = ['#3FAE8C', '#D9A441', '#227A5E'];
      const isQuad = order==='quadratic';
      const nodesX = isQuad ? [0, 0.5, 1] : [0, 1];

      function xToPx(x){ return padL + x*plotW; }
      function labelAlign(x){ return x<=0.02 ? 'left' : (x>=0.98 ? 'right' : 'center'); }
      function N(i, x){
        if(!isQuad) return i===0 ? (1-x) : x;
        if(i===0) return 2*(x-0.5)*(x-1);
        if(i===1) return 4*x*(1-x);
        return 2*x*(x-0.5);
      }

      // ---- Panel A: the shape functions themselves ----
      const vMinA=-0.2, vMaxA=1.3;
      function yToPxA(v){ return panelATop + panelH*(vMaxA-v)/(vMaxA-vMinA); }
      ctx.fillStyle='#3A4145'; ctx.font='bold 12px sans-serif'; ctx.textAlign='left';
      ctx.fillText('1) รูปร่างของ Shape function Nᵢ(x)', padL, panelATop-16);

      ctx.strokeStyle='#D3DAD9'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(padL, yToPxA(0)); ctx.lineTo(padL+plotW, yToPxA(0)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padL, yToPxA(1)); ctx.lineTo(padL+plotW, yToPxA(1)); ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);

      for(let i=0;i<nodesX.length;i++){
        ctx.strokeStyle = colors[i]; ctx.lineWidth = 2.2;
        ctx.beginPath();
        for(let s=0;s<=60;s++){
          const x = s/60, v = N(i,x);
          const px=xToPx(x), py=yToPxA(v);
          if(s===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.stroke();
       }
       nodesX.forEach((nx,i)=>{
         ctx.fillStyle = colors[i]; ctx.font='bold 12px sans-serif'; ctx.textAlign=labelAlign(nx);
         ctx.fillText('N'+(i+1), xToPx(nx), yToPxA(1)-10);
         ctx.strokeStyle='#7C8588'; ctx.lineWidth=1;
         ctx.beginPath(); ctx.moveTo(xToPx(nx), yToPxA(0)-4); ctx.lineTo(xToPx(nx), yToPxA(0)+4); ctx.stroke();
       });
       ctx.fillStyle='#7C8588'; ctx.font='10px sans-serif'; ctx.textAlign='right';
       ctx.fillText('(= 1 ที่โหนดของตัวเอง, = 0 ที่โหนดอื่น)', padL+plotW, panelATop-16);

       // ---- Panel B: using them to interpolate real example nodal values ----
       const exampleT = isQuad ? [20,90,50] : [20,80];
       function interp(x){
         let v=0; for(let i=0;i<nodesX.length;i++) v += exampleT[i]*N(i,x);
         return v;
       }
       const sampledVals=[]; for(let s=0;s<=60;s++) sampledVals.push(interp(s/60));
       const vMinB = Math.min(...sampledVals, ...exampleT)-10, vMaxB = Math.max(...sampledVals, ...exampleT)+16;
       function yToPxB(v){ return panelBTop + panelH*(vMaxB-v)/(vMaxB-vMinB); }

       ctx.fillStyle='#3A4145'; ctx.font='bold 12px sans-serif'; ctx.textAlign='left';
       ctx.fillText('2) ใช้ประมาณค่า T(x) จากค่าโหนดตัวอย่าง', padL, panelBTop-16);

       ctx.strokeStyle='#3A4145'; ctx.lineWidth=2.6;
       ctx.beginPath();
       for(let s=0;s<=60;s++){
         const x=s/60, v=interp(x);
         const px=xToPx(x), py=yToPxB(v);
         if(s===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
       }
       ctx.stroke();

       nodesX.forEach((nx,i)=>{
         const px=xToPx(nx), py=yToPxB(exampleT[i]);
         ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2); ctx.fillStyle=colors[i]; ctx.fill();
         ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
         ctx.fillStyle='#3A4145'; ctx.font='bold 11.5px sans-serif'; ctx.textAlign=labelAlign(nx);
         const dy = (isQuad && i===1) ? 16 : -12; // keep the middle node's label from colliding with the curve's peak
         ctx.fillText('T'+(i+1)+' = '+exampleT[i], px, py + dy);
       });

       ctx.fillStyle='#7C8588'; ctx.font='10.5px sans-serif'; ctx.textAlign='center';
       ctx.fillText('ตำแหน่งภายในเอลิเมนต์', padL+plotW/2, panelBTop+panelH+18);
  }
