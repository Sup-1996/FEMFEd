/**
 * Tiny shared module for the transient-results "play" animation.
 *
 * A single timer lives here (not in the solve step itself) so that
 * ui/layout.js can stop it on every full re-render, no matter which
 * step is on screen - mirroring the original app's single module-level
 * `playbackTimer` variable that both renderMain() and the solve step's
 * play/pause buttons touched.
 */

let playbackTimer = null;

export function isPlaying(){
  return !!playbackTimer;
}

export function startPlayback(onTick, intervalMs){
  stopPlayback();
  playbackTimer = setInterval(onTick, intervalMs);
}

export function stopPlayback(){
  if(playbackTimer){ clearInterval(playbackTimer); playbackTimer = null; }
}
