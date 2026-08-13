import React, { useMemo } from 'react';
import { formatTime } from './ChapterBar';

export default function TranscriptPanel({
  cues = [],
  onSeek,
  highlightWord = null,
  activeStart = null,
}) {
  const normalizedHighlight = highlightWord?.toLowerCase()?.trim() || null;

  const items = useMemo(() => cues.filter((c) => c?.text), [cues]);

  if (!items.length) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 p-4">
        No timed transcript available for this video.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-1">
      {items.map((cue, idx) => {
        const isActive =
          activeStart != null && Math.abs(Number(cue.start) - Number(activeStart)) < 0.35;
        const hasWord =
          normalizedHighlight &&
          cue.text.toLowerCase().includes(normalizedHighlight);

        return (
          <button
            key={`${cue.start}-${idx}`}
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
