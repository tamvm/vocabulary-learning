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

/** Split transcript text into word / non-word tokens for click-to-define. */
export function tokenizeCueText(text) {
  if (!text) return [];
  return String(text).split(/(\b[\p{L}\p{N}']+\b)/u).filter((t) => t.length > 0);
}

function isWordToken(token) {
  return /^[\p{L}\p{N}']+$/u.test(token);
}

export default function TranscriptPanel({
  cues = [],
  onSeek,
  onWordClick,
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
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
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
        const tokens = tokenizeCueText(cue.text);

        return (
          <div
            key={`${cue.start}-${idx}`}
            ref={isActive ? activeRef : null}
            className={`w-full text-left px-3 py-2 rounded-lg transition border ${
              isActive
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                : hasWord
                ? 'border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/10'
                : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/60'
            }`}
          >
            <button
              type="button"
              onClick={() => onSeek?.(Number(cue.start) || 0)}
              className="text-[11px] font-mono text-primary-600 dark:text-primary-400 mr-2 hover:underline"
              title="Jump to this line"
            >
              {formatTime(cue.start)}
            </button>
            <span className="text-sm text-gray-800 dark:text-gray-200">
              {tokens.map((token, tIdx) => {
                if (!isWordToken(token)) {
                  return <span key={tIdx}>{token}</span>;
                }
                const isHighlight =
                  normalizedHighlight &&
                  token.toLowerCase() === normalizedHighlight;
                return (
                  <button
                    key={tIdx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWordClick?.(token);
                    }}
                    className={`rounded px-0.5 -mx-0.5 transition ${
                      isHighlight
                        ? 'bg-amber-200/80 dark:bg-amber-700/50 font-medium'
                        : onWordClick
                        ? 'hover:bg-primary-100 dark:hover:bg-primary-900/40 hover:text-primary-800 dark:hover:text-primary-200 cursor-pointer'
                        : ''
                    }`}
                    title={onWordClick ? `Look up “${token}”` : undefined}
                  >
                    {token}
                  </button>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
