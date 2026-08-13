import React, { useEffect, useMemo, useRef } from 'react';
import { formatTime } from './ChapterBar';

/**
 * Find the cue that should be active at `currentTime`.
 * Prefers [start, end); falls back to last cue with start <= t.
 */
export function findActiveCueIndex(cues, currentTime) {
  if (!Array.isArray(cues) || !cues.length || currentTime == null) return -1;
  const t = Number(currentTime);
  if (Number.isNaN(t)) return -1;

  let fallback = -1;
  for (let i = 0; i < cues.length; i++) {
    const start = Number(cues[i].start) || 0;
    const endRaw = cues[i].end;
    const end =
      endRaw != null && !Number.isNaN(Number(endRaw))
        ? Number(endRaw)
        : i + 1 < cues.length
        ? Number(cues[i + 1].start) || start + 3
        : start + 8;

    if (t >= start && t < end) return i;
    if (t >= start) fallback = i;
  }
  return fallback;
}

export default function TranscriptPanel({
  cues = [],
  onSeek,
  highlightWord = null,
  currentTime = null,
  activeStart = null,
}) {
  const listRef = useRef(null);
  const activeRef = useRef(null);
  const lastScrolledIdx = useRef(-1);

  const normalizedHighlight = highlightWord?.toLowerCase()?.trim() || null;

  const items = useMemo(() => cues.filter((c) => c?.text), [cues]);

  const activeIndex = useMemo(() => {
    if (currentTime != null) return findActiveCueIndex(items, currentTime);
    if (activeStart != null) {
      return items.findIndex(
        (c) => Math.abs(Number(c.start) - Number(activeStart)) < 0.35
      );
    }
    return -1;
  }, [items, currentTime, activeStart]);

  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastScrolledIdx.current) return;
    lastScrolledIdx.current = activeIndex;
    const parent = listRef.current;
    const el = activeRef.current;
    if (!parent || !el) return;

    const parentRect = parent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const visible =
      elRect.top >= parentRect.top + 8 && elRect.bottom <= parentRect.bottom - 8;
    if (visible) return;

    const next =
      parent.scrollTop +
      (elRect.top - parentRect.top) -
      parent.clientHeight / 2 +
      el.offsetHeight / 2;
    parent.scrollTo({ top: Math.max(0, next), behavior: 'smooth' });
  }, [activeIndex]);

  if (!items.length) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 p-4">
        No timed transcript available for this video.
      </div>
    );
  }

  return (
    <div ref={listRef} className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1 space-y-1">
      {items.map((cue, idx) => {
        const isActive = idx === activeIndex;
        const hasWord =
          normalizedHighlight &&
          cue.text.toLowerCase().includes(normalizedHighlight);

        return (
          <button
            key={`${cue.start}-${idx}`}
            type="button"
            ref={(node) => {
              if (isActive && node) activeRef.current = node;
            }}
            onClick={() => onSeek?.(Number(cue.start) || 0)}
            className={`w-full text-left px-3 py-2 rounded-lg transition border ${
              isActive
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                : hasWord
                ? 'border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/10'
                : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/60'
            }`}
          >
            <span className="text-[11px] font-mono text-primary-600 dark:text-primary-400 mr-2">
              {formatTime(cue.start)}
            </span>
            <span className="text-sm text-gray-800 dark:text-gray-200">{cue.text}</span>
          </button>
        );
      })}
    </div>
  );
}
