import React from 'react';

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function findActiveChapterIndex(chapters, currentTime) {
  if (!Array.isArray(chapters) || !chapters.length || currentTime == null) return -1;
  const t = Number(currentTime);
  if (Number.isNaN(t)) return -1;
  let active = -1;
  for (let i = 0; i < chapters.length; i++) {
    const start = Number(chapters[i].start) || 0;
    if (t >= start) active = i;
    else break;
  }
  return active;
}

export default function ChapterBar({
  chapters = [],
  onSeek,
  currentTime = null,
  activeStart = null,
}) {
  if (!chapters.length) return null;

  const activeIdx =
    currentTime != null
      ? findActiveChapterIndex(chapters, currentTime)
      : activeStart != null
      ? findActiveChapterIndex(chapters, activeStart)
      : -1;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {chapters.map((ch, idx) => {
        const isActive = idx === activeIdx;
        return (
          <button
            key={`${ch.start}-${idx}`}
            type="button"
            onClick={() => onSeek?.(Number(ch.start) || 0)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              isActive
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-primary-400'
            }`}
            title={`${formatTime(ch.start)}${ch.source ? ` · ${ch.source}` : ''}`}
          >
            {formatTime(ch.start)} · {ch.title || `Chapter ${idx + 1}`}
          </button>
        );
      })}
    </div>
  );
}

export { formatTime };
