import React, { useEffect, useMemo, useRef } from 'react';
import { formatTime } from './ChapterBar';
import { findActiveCueIndex } from '@/lib/transcriptSync';

export default function TranscriptPanel({
  cues = [],
  onSeek,
  highlightWord = null,
  currentTime = null,
}) {
  const normalizedHighlight = highlightWord?.toLowerCase()?.trim() || null;
  const listRef = useRef(null);
  const activeRef = useRef(null);

  const items = useMemo(() => cues.filter((c) => c?.text), [cues]);
  const activeIndex = useMemo(
    () => findActiveCueIndex(items, currentTime),
    [items, currentTime]
  );

  useEffect(() => {
    const parent = listRef.current;
    const el = activeRef.current;
    if (!parent || !el || activeIndex < 0) return;

    const parentRect = parent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const visible =
      elRect.top >= parentRect.top + 8 && elRect.bottom <= parentRect.bottom - 8;
    if (visible) return;

    const top =
      el.getBoundingClientRect().top -
      parent.getBoundingClientRect().top +
      parent.scrollTop -
      parent.clientHeight / 2 +
      el.offsetHeight / 2;
    parent.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeIndex]);

  if (!items.length) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 p-4">
        No timed transcript available for this video.
      </div>
    );
  }

  return (
    <div ref={listRef} className="h-full overflow-y-auto pr-1 space-y-1">
      {items.map((cue, idx) => {
        const isActive = idx === activeIndex;
        const hasWord =
          normalizedHighlight &&
          cue.text.toLowerCase().includes(normalizedHighlight);

        return (
          <button
            key={`${cue.start}-${idx}`}
            ref={isActive ? activeRef : undefined}
            type="button"
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
