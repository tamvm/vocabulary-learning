import React, { useEffect } from 'react';
import { Loader2, Plus, Volume2, X, Check } from 'lucide-react';
import { getCefrColor, speakWord } from '@/lib/utils';

/**
 * Modal showing definition, glossary fields, and sample sentence for a Learn word.
 */
export default function WordDetailModal({
  open,
  wordData = null,
  loading = false,
  error = null,
  alreadyAdded = false,
  adding = false,
  onClose,
  onAdd,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const word = wordData?.word || '';
  const synonyms = Array.isArray(wordData?.synonyms)
    ? wordData.synonyms
    : typeof wordData?.synonyms === 'string' && wordData.synonyms.trim()
    ? wordData.synonyms.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        aria-label="Close word details"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-100 dark:border-gray-800">
          <div className="min-w-0">
            <h2
              id="word-detail-title"
              className="text-2xl font-bold text-gray-900 dark:text-white truncate"
            >
              {loading && !word ? 'Looking up…' : word || 'Word'}
            </h2>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {wordData?.ipaPronunciation ? (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  /{wordData.ipaPronunciation}/
                </span>
              ) : null}
              {word ? (
                <button
                  type="button"
                  onClick={() => speakWord(word)}
                  className="p-1 rounded text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                  title="Pronounce"
                  aria-label={`Pronounce ${word}`}
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              ) : null}
              {wordData?.wordType ? (
                <span className="text-xs italic text-gray-500 dark:text-gray-400">
                  {wordData.wordType}
                </span>
              ) : null}
              {wordData?.cefrLevel ? (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getCefrColor(
                    wordData.cefrLevel
                  )}`}
                >
                  {wordData.cefrLevel}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
              Analyzing word…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">{error}</p>
          ) : (
            <>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  Definition
                </h3>
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                  {wordData?.definition || 'No definition available.'}
                </p>
              </section>

              {wordData?.vietnameseTranslation ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Glossary
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {wordData.vietnameseTranslation}
                  </p>
                </section>
              ) : null}

              {synonyms.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Synonyms
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {synonyms.join(', ')}
                  </p>
                </section>
              ) : null}

              {wordData?.exampleSentence ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Sample sentence
                  </h3>
                  <p className="text-sm text-gray-800 dark:text-gray-200 italic leading-relaxed border-l-2 border-primary-300 dark:border-primary-700 pl-3">
                    {wordData.exampleSentence}
                  </p>
                </section>
              ) : null}

              {wordData?.notes ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Notes
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{wordData.notes}</p>
                </section>
              ) : null}
            </>
          )}
        </div>

        {!loading && !error && wordData ? (
          <div className="sticky bottom-0 px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur flex gap-2">
            {alreadyAdded ? (
              <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                <Check className="w-4 h-4" />
                In new words
              </div>
            ) : (
              <button
                type="button"
                onClick={onAdd}
                disabled={adding || !wordData?.definition}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white transition"
              >
                {adding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {adding ? 'Adding…' : 'Add to new words'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Normalize API / vocab item shapes into camelCase used by the modal. */
export function normalizeWordDetail(raw, fallbackWord = '') {
  if (!raw || typeof raw !== 'object') {
    return { word: fallbackWord };
  }
  return {
    word: raw.word || fallbackWord,
    definition: raw.definition || '',
    wordType: raw.wordType || raw.word_type || '',
    cefrLevel: raw.cefrLevel || raw.cefr_level || '',
    ipaPronunciation: raw.ipaPronunciation || raw.ipa_pronunciation || '',
    exampleSentence: raw.exampleSentence || raw.example_sentence || '',
    vietnameseTranslation:
      raw.vietnameseTranslation || raw.vietnamese_translation || '',
    synonyms: raw.synonyms || '',
    notes: raw.notes || '',
    tags: raw.tags || [],
  };
}
