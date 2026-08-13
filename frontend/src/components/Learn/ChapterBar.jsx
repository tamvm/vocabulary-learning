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

export default function ChapterBar({ chapters = [], onSeek, activeStart = null }) {
  if (!chapters.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {chapters.map((ch, idx) => {
        const isActive =
          activeStart != null && Math.abs(Number(ch.start) - Number(activeStart)) < 0.5;
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
