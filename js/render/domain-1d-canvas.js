/**
 * 1D-specific canvas rendering: the domain line (with x=0 / x=L end
 * caps and optional highlighted end), the node/element markers along
 * it, and the results line chart (numerical vs. exact, when available).
 *
 * All layout math below is in CSS-pixel space (canvas._cssW/_cssH, as
 * set by render/hidpi.js's sizeCanvas()) — the leading setTransform
 * call maps that space onto the canvas's real (possibly higher-
 * resolution) backing store, so none of the literal pixel values in
 * this file need to know about devicePixelRatio themselves.
 */

  /* ---- 1D rendering helpers ---- */
  export function draw1DDomain(canvas, length, opts){
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const dpr = canvas._dpr || 1;
    const W = canvas._cssW || canvas.width, H = canvas._cssH || canvas.height;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    const pad = 40;
    const y0 = H/2;
    const x0 = pad, x1 = W-pad;
    ctx.strokeStyle = '#3A4145'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
    // end caps
    ctx.beginPath(); ctx.moveTo(x0,y0-10); ctx.lineTo(x0,y0+10); ctx.moveTo(x1,y0-10); ctx.lineTo(x1,y0+10); ctx.stroke();
    ctx.fillStyle = '#7C8588'; ctx.font='11px sans-serif'; ctx.textAlign='center';
    ctx.fillText('x = 0', x0, y0+26);
    ctx.fillText(`x = L = ${length} m`, x1, y0+26);
    if(opts.highlight){
      ctx.strokeStyle = '#D9A441'; ctx.lineWidth=5;
      const hx = opts.highlight==='left' ? x0 : x1;
      ctx.beginPath(); ctx.moveTo(hx,y0-14); ctx.lineTo(hx,y0+14); ctx.stroke();
    }
    return {x0,x1,y0};
  }

  export function draw1DMesh(canvas, mesh){
    const {x0,x1,y0} = draw1DDomain(canvas, mesh.bbox.w);
    const ctx = canvas.getContext('2d');
    const scale = (x1-x0)/mesh.bbox.w;
    const isQuad = mesh.order==='quadratic';
    for(const el of mesh.elements){
      const corners = isQuad ? [el[0], el[2]] : [el[0], el[1]];
      corners.forEach(ci=>{
        const px = x0 + mesh.nodes[ci].x*scale;
        ctx.beginPath(); ctx.arc(px,y0,5,0,Math.PI*2); ctx.fillStyle='#3FAE8C'; ctx.fill();
      });
      if(isQuad){
        const px = x0 + mesh.nodes[el[1]].x*scale;
        ctx.beginPath(); ctx.arc(px,y0,5,0,Math.PI*2); ctx.fillStyle='#D9A441'; ctx.fill();
      }
    }
  }

  export function draw1DResultsChart(canvas, mesh, T, exactT){
    const ctx = canvas.getContext('2d');
    const dpr = canvas._dpr || 1;
    const W = canvas._cssW || canvas.width, H = canvas._cssH || canvas.height;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    const padL=50, padR=20, padT=20, padB=40;
    const plotW = W-padL-padR, plotH = H-padT-padB;
    let tmin=Infinity, tmax=-Infinity;
    for(const v of T){ if(v<tmin)tmin=v; if(v>tmax)tmax=v; }
    if(exactT) for(const v of exactT){ if(v<tmin)tmin=v; if(v>tmax)tmax=v; }
    if(tmax-tmin < 1e-9){ tmax+=0.5; tmin-=0.5; }
    const L = mesh.bbox.w;
    const xToPx = x => padL + (x/L)*plotW;
    const tToPx = t => padT + plotH - ((t-tmin)/(tmax-tmin))*plotH;

   // axes
   ctx.strokeStyle = '#D3DAD9'; ctx.lineWidth=1;
   ctx.beginPath(); ctx.moveTo(padL,padT); ctx.lineTo(padL,padT+plotH); ctx.lineTo(padL+plotW,padT+plotH); ctx.stroke();
   ctx.fillStyle='#7C8588'; ctx.font='11px sans-serif'; ctx.textAlign='right';
   ctx.fillText(tmax.toFixed(1), padL-6, tToPx(tmax)+4);
   ctx.fillText(tmin.toFixed(1), padL-6, tToPx(tmin)+4);
   ctx.textAlign='center';
   ctx.fillText('0', xToPx(0), padT+plotH+16);
   ctx.fillText(L.toFixed(2)+' m', xToPx(L), padT+plotH+16);

   const pts = mesh.nodes.map((nd,i)=>({x:nd.x, t:T[i]})).sort((a,b)=>a.x-b.x);

      if(exactT){
        const exPts = mesh.nodes.map((nd,i)=>({x:nd.x, t:exactT[i]})).sort((a,b)=>a.x-b.x);
        ctx.strokeStyle = '#D9A441'; ctx.lineWidth=2; ctx.setLineDash([6,4]);
        ctx.beginPath();
        exPts.forEach((p,i)=>{ const px=xToPx(p.x), py=tToPx(p.t); if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
        ctx.stroke(); ctx.setLineDash([]);
      }

      ctx.strokeStyle = '#3FAE8C'; ctx.lineWidth=2.5;
      ctx.beginPath();
      pts.forEach((p,i)=>{ const px=xToPx(p.x), py=tToPx(p.t); if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
      ctx.stroke();
      ctx.fillStyle='#3FAE8C';
      pts.forEach(p=>{ ctx.beginPath(); ctx.arc(xToPx(p.x), tToPx(p.t), 3, 0, Math.PI*2); ctx.fill(); });

      // legend
      ctx.textAlign='left';
      ctx.fillStyle='#3FAE8C'; ctx.fillRect(padL+plotW-150, padT+4, 14, 3);
      ctx.fillStyle='#3A4145'; ctx.font='11px sans-serif'; ctx.fillText('Numerical (FEM)', padL+plotW-130, padT+9);
      if(exactT){
        ctx.strokeStyle='#D9A441'; ctx.lineWidth=2; ctx.setLineDash([6,4]);
        ctx.beginPath(); ctx.moveTo(padL+plotW-150, padT+22); ctx.lineTo(padL+plotW-136, padT+22); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle='#3A4145'; ctx.fillText('Exact solution', padL+plotW-130, padT+26);
      }
  }
