import React, { useState } from 'react';
import { BookOpen, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { displaySummary } from '@/lib/lessonSummary';

export default function LessonSummary({
  summary = '',
  defaultOpen = true,
  className = '',
  onGenerate,
  generating = false,
  error = '',
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { text, items, source } = displaySummary(summary);
  const canGenerate = typeof onGenerate === 'function';

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
          Highlights
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
          {items.length > 1 ? (
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              {items.map((item, index) => (
                <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
              ))}
            </ul>
          ) : text ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">{text}</p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {generating
                ? 'Generating bullet-point takeaways from the transcript…'
                : error ||
                  'No highlights yet for this video. Generate takeaways from the transcript, or study with the transcript and new words.'}
            </p>
          )}
          {canGenerate && (source === 'empty' || generating) ? (
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100 disabled:opacity-60 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {generating ? 'Generating…' : error ? 'Try again' : 'Generate highlights'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
