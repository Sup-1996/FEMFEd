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
