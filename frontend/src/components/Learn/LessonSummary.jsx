import React, { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { displaySummary } from '@/lib/lessonSummary';

export default function LessonSummary({
  summary = '',
  cues = [],
  defaultOpen = true,
  className = '',
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { text, source } = displaySummary(summary, cues);
  const title = source === 'excerpt' ? 'Summary (from transcript)' : 'Summary';

  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <BookOpen className="w-4 h-4 text-primary-500 flex-shrink-0" />
        <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </span>
        {source === 'empty' && (
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
            Unavailable
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 -mt-1">
          {text ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">
              {text}
            </pre>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No summary yet for this video. You can still study with the
              transcript and new words.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
