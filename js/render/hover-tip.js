/**
 * A single reusable floating tooltip element, shared by every hover
 * feature in the app (the 2D contour plot's "T ≈ ..." readout, the 1D
 * results chart's nearest-point readout). One singleton rather than one
 * div per canvas, since a fresh canvas element is created on every
 * render — creating a matching tooltip div each time would leak stray
 * always-in-the-DOM elements that never get cleaned up.
 */

let tip = null;

function getTip(){
  if(!tip){
    tip = document.createElement('div');
    tip.className = 'contour-tip';
    document.body.appendChild(tip);
  }
  return tip;
}

export function showTip(clientX, clientY, text){
  const el = getTip();
  el.textContent = text;
  el.style.left = (clientX + 14) + 'px';
  el.style.top = (clientY + 14) + 'px';
  el.style.display = 'block';
}

export function hideTip(){
  if(tip) tip.style.display = 'none';
}
