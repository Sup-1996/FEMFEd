/**
 * Tiny download helpers used by the results step: save the current
 * result canvas as a PNG (useful for a report/slide — since the canvas
 * backing store is already HiDPI-sized, see render/hidpi.js, the
 * exported image is higher-resolution than the on-screen display size),
 * and save the raw node/temperature data as a CSV.
 */

  export function downloadCanvasPNG(canvas, filename){
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  export function downloadCSV(filename, header, rows){
    const lines = [header.join(','), ...rows.map(r=>r.join(','))];
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
