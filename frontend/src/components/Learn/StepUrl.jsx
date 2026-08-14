import React from 'react';
import {
  Youtube,
  Sparkles,
  Loader2,
  Play,
  RotateCcw,
  BookOpen,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatRelativeTime } from '@/lib/utils';
import {
  isUnfinishedLesson,
  latestUnfinished,
  lessonScoreLabel,
  lessonThumbnail,
  statusTone,
  stepLabel,
} from '@/lib/learnSession';

function SessionRow({
  lesson,
  onContinue,
  onReview,
  onRetake,
  onDelete,
  resumeLoadingId,
  deletingId,
}) {
  const thumb = lessonThumbnail(lesson);
  const tone = statusTone(lesson);
  const unfinished = isUnfinishedLesson(lesson);
  const score = lessonScoreLabel(lesson);
  const busy = resumeLoadingId === lesson.id || deletingId === lesson.id;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-3 min-w-0 flex-1">
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="w-20 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-700"
        />
      ) : (
        <div className="w-20 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <Youtube className="w-5 h-5 text-red-400" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-white truncate">
          {lesson.title || 'YouTube lesson'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className={`px-1.5 py-0.5 rounded font-medium ${tone.className}`}>
            {tone.label}
          </span>
          <span>{stepLabel(lesson)}</span>
          {score && <span>Score {score}</span>}
          <span>{formatRelativeTime(lesson.updated_at || lesson.created_at)}</span>
        </div>
      </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {unfinished ? (
          <button
            type="button"
            onClick={() => onContinue(lesson.id)}
            disabled={busy}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white transition"
          >
            {busy ? 'Opening…' : 'Continue'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onReview(lesson.id)}
              disabled={busy}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => onRetake(lesson.id)}
              disabled={busy}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white transition"
            >
              Retake
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onDelete(lesson.id)}
          disabled={busy}
          aria-label="Remove session"
          title="Remove session"
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 transition"
        >
          {deletingId === lesson.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export default function StepUrl({
  onSubmit,
  loading,
  error,
  history,
  historyLoading,
  resumeLoadingId,
  onContinue,
  onReview,
  onRetake,
  onDelete,
  onClearAll,
  deletingId,
}) {
  const [url, setUrl] = React.useState('');
  const unfinished = latestUnfinished(history);
  const remaining = (history || []).filter((lesson) => lesson.id !== unfinished?.id);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const youtubeRegex =
      /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    if (!youtubeRegex.test(trimmed)) {
      toast.error('Please enter a valid YouTube URL');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 mb-4">
          <Youtube className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Learn from YouTube
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Paste a YouTube video URL to extract vocabulary and test your listening comprehension
        </p>
      </div>

      {unfinished && (
        <div className="mb-6 p-4 rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            {lessonThumbnail(unfinished) ? (
              <img
                src={lessonThumbnail(unfinished)}
                alt=""
                className="w-28 h-16 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-28 h-16 rounded-lg bg-white/60 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-6 h-6 text-primary-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                Continue where you left off
              </p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-white line-clamp-2">
                {unfinished.title || 'Unfinished lesson'}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {stepLabel(unfinished)} · {formatRelativeTime(unfinished.updated_at || unfinished.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => onContinue(unfinished.id)}
                disabled={Boolean(resumeLoadingId) || loading || Boolean(deletingId)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition"
              >
                {resumeLoadingId === unfinished.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Continue
              </button>
              <button
                type="button"
                onClick={() => onDelete(unfinished.id)}
                disabled={Boolean(resumeLoadingId) || loading || Boolean(deletingId)}
                aria-label="Remove session"
                title="Remove session"
                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 transition"
              >
                {deletingId === unfinished.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            YouTube Video URL
          </label>
          <input
            id="videoUrl"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            disabled={loading}
            autoFocus
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Extracting transcript...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Extract Vocabulary
            </>
          )}
        </button>
      </form>

      {loading && (
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            This may take 30-60 seconds for long videos...
          </div>
        </div>
      )}

      <div className="mt-10">
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Recent sessions
          </h2>
          {!historyLoading && (history || []).length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              disabled={Boolean(deletingId) || Boolean(resumeLoadingId) || loading}
              className="ml-auto text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 disabled:opacity-50 transition"
            >
              Clear all
            </button>
          )}
        </div>

        {historyLoading && (
          <div className="space-y-2">
            {[0, 1].map((key) => (
              <div
                key={key}
                className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        )}

        {!historyLoading && remaining.length === 0 && !unfinished && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No previous sessions yet. Extract a video to start one — it will sync across your devices.
          </p>
        )}

        {!historyLoading && remaining.length > 0 && (
          <div className="space-y-2">
            {remaining.map((lesson) => (
              <SessionRow
                key={lesson.id}
                lesson={lesson}
                onContinue={onContinue}
                onReview={onReview}
                onRetake={onRetake}
                onDelete={onDelete}
                resumeLoadingId={resumeLoadingId}
                deletingId={deletingId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
