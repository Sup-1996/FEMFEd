/**
 * HiDPI canvas sizing helper.
 *
 * Call sizeCanvas(cv, cssWidth, cssHeight) right after creating a
 * <canvas> element, instead of setting cv.width/cv.height directly.
 * It sizes the backing pixel buffer to the device's real pixel
 * density (devicePixelRatio) so strokes, text and gradients render
 * crisp on high-density screens, while the element still occupies
 * the intended CSS size on the page.
 *
 * Render functions that build their own layout from "the canvas's
 * width/height" should read cv._cssW / cv._cssH (the original,
 * intended CSS-pixel size) rather than the raw cv.width / cv.height
 * attributes, which after this call hold the larger device-pixel
 * backing-store size. Pixel-level drawing (createImageData /
 * putImageData, as in render/contour-canvas.js) should keep using
 * the raw cv.width / cv.height directly — that IS the point of
 * sizing the buffer up — and instead scale any fixed padding/line-
 * width literals by cv._dpr so they stay visually proportionate.
 */
export function sizeCanvas(cv, cssWidth, cssHeight){
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cssWidth * dpr);
  cv.height = Math.round(cssHeight * dpr);
  cv.style.width = cssWidth + 'px';
  cv.style.height = cssHeight + 'px';
  cv._cssW = cssWidth;
  cv._cssH = cssHeight;
  cv._dpr = dpr;
  return cv;
}
