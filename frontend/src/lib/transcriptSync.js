/**
 * Map playback time to the active transcript cue / chapter.
 * Cues: prefer start <= t < end; otherwise last cue that has started.
 */

export function findActiveCueIndex(cues, time) {
  if (!cues?.length || time == null) return -1;
  const t = Number(time);
  if (!Number.isFinite(t)) return -1;

  let rangeIdx = -1;
  let startedIdx = -1;

  for (let i = 0; i < cues.length; i++) {
    const start = Number(cues[i].start);
    const end = Number(cues[i].end);
    if (!Number.isFinite(start)) continue;
    if (t < start) continue;
    startedIdx = i;
    if (Number.isFinite(end) && end > start && t < end) {
      rangeIdx = i;
    }
  }

  return rangeIdx >= 0 ? rangeIdx : startedIdx;
}

export function findActiveChapterIndex(chapters, time) {
  if (!chapters?.length || time == null) return -1;
  const t = Number(time);
  if (!Number.isFinite(t)) return -1;

  let idx = -1;
  for (let i = 0; i < chapters.length; i++) {
    const start = Number(chapters[i].start);
    if (Number.isFinite(start) && t >= start) idx = i;
  }
  return idx;
}

export function seekPlayer(player, seconds) {
  const t = Number(seconds);
  if (!player || typeof player.seekTo !== 'function' || !Number.isFinite(t)) {
    return false;
  }
  try {
    player.seekTo(Math.max(0, t), true);
    if (typeof player.playVideo === 'function') {
      player.playVideo();
    }
    return true;
  } catch (err) {
    console.warn('seek failed', err);
    return false;
  }
}

export function shouldUpdatePlaybackTime(prevTime, nextTime, cues, chapters) {
  if (prevTime == null) return true;
  const prev = Number(prevTime);
  const next = Number(nextTime);
  if (!Number.isFinite(next)) return false;
  if (!Number.isFinite(prev)) return true;
  return (
    findActiveCueIndex(cues, prev) !== findActiveCueIndex(cues, next) ||
    findActiveChapterIndex(chapters, prev) !== findActiveChapterIndex(chapters, next)
  );
}
