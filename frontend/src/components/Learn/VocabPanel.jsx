import React from 'react';
import { getCefrColor } from '@/lib/utils';

export default function VocabPanel({ words = [], selectedWord, onSelectWord }) {
  if (!words.length) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 p-4">
        No vocabulary selected for this lesson.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-2">
      {words.map((item, idx) => {
        const active =
          selectedWord &&
          item.word?.toLowerCase() === selectedWord.toLowerCase();
        return (
          <button
            key={`${item.word}-${idx}`}
            type="button"
            onClick={() => onSelectWord?.(item.word)}
            className={`w-full text-left p-3 rounded-lg border transition ${
              active
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 dark:text-white">
                {item.word}
              </span>
              {item.cefrLevel && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getCefrColor(
                    item.cefrLevel
                  )}`}
                >
                  {item.cefrLevel}
                </span>
              )}
            </div>
            {item.definition && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                {item.definition}
              </p>
            )}
            {item.vietnameseTranslation && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                {item.vietnameseTranslation}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
