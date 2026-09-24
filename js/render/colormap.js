/**
 * Smooth rainbow color scale used for temperature contour plots
 * (blue = low, red = high).
 */

  /* ============================= COLOR MAP (smooth rainbow gradient) ============================= */
  export function hslToRgb01(h, s, l){
    h = ((h%360)+360)%360;
    const c = (1-Math.abs(2*l-1))*s;
    const x = c*(1-Math.abs((h/60)%2-1));
    const m = l-c/2;
    let r,g,b;
    if(h<60){ r=c;g=x;b=0; } else if(h<120){ r=x;g=c;b=0; }
    else if(h<180){ r=0;g=c;b=x; } else if(h<240){ r=0;g=x;b=c; }
    else if(h<300){ r=x;g=0;b=c; } else { r=c;g=0;b=x; }
    return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
  }
  export function rainbowColorRGB(t){
    t = Math.max(0, Math.min(1, t));
    const hue = 240*(1-t); // 240=blue (low) -> 0=red (high)
    return hslToRgb01(hue, 1, 0.5);
  }
  export function rainbowColor(t){
    const [r,g,b] = rainbowColorRGB(t);
    return `rgb(${r},${g},${b})`;
  }
