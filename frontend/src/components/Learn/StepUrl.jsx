import React from 'react';
import {
  Youtube,
  Sparkles,
  Loader2,
  Play,
  RotateCcw,
  BookOpen,
  Trash2,
  Pencil,
  RefreshCw,
  Search,
  Copy,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { copyToClipboard, formatRelativeTime } from '@/lib/utils';
import PrepareJobPanel from '@/components/Learn/PrepareJobPanel';
import {
  isUnfinishedLesson,
  isPreparingLesson,
  isVocabReady,
  latestUnfinished,
  lessonScoreLabel,
  lessonThumbnail,
  lessonVideoUrl,
  prepareJobFromLesson,
  statusTone,
  stepLabel,
} from '@/lib/learnSession';

function SessionRow({
  lesson,
  onOpen,
  onRetake,
  onDelete,
  onRename,
  onReextract,
  resumeLoadingId,
  deletingId,
  renamingId,
}) {
  const thumb = lessonThumbnail(lesson);
  const tone = statusTone(lesson);
  const unfinished = isUnfinishedLesson(lesson);
  const preparing = isPreparingLesson(lesson);
  const vocabReady = isVocabReady(lesson);
  const job = preparing ? prepareJobFromLesson(lesson) : null;
  const score = lessonScoreLabel(lesson);
  const busy =
    resumeLoadingId === lesson.id ||
    deletingId === lesson.id ||
    renamingId === lesson.id;
  const openLabel = preparing && !vocabReady
    ? 'Preparing…'
    : preparing && vocabReady
    ? 'View vocab'
    : unfinished
    ? 'Continue'
    : 'Open';
  const [editing, setEditing] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(lesson.title || '');
  const [copied, setCopied] = React.useState(false);
  const videoUrl = lessonVideoUrl(lesson);

  React.useEffect(() => {
    setTitleDraft(lesson.title || '');
  }, [lesson.title]);

  React.useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (!next || next === (lesson.title || '')) {
      setEditing(false);
      setTitleDraft(lesson.title || '');
      return;
    }
    onRename(lesson.id, next);
    setEditing(false);
  };

  const handleCopyLink = async () => {
    if (!videoUrl) {
      toast.error('This video has no saved URL');
      return;
    }
    try {
      await copyToClipboard(videoUrl);
      setCopied(true);
      toast.success('Video link copied');
    } catch (_) {
      toast.error('Could not copy link');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
          {editing ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveTitle();
                }
                if (e.key === 'Escape') {
                  setEditing(false);
                  setTitleDraft(lesson.title || '');
                }
              }}
              className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              aria-label="Video title"
            />
          ) : (
            <p className="font-medium text-gray-900 dark:text-white truncate">
              {lesson.title || 'YouTube lesson'}
            </p>
          )}
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
        <button
          type="button"
          onClick={() => onOpen(lesson.id)}
          disabled={busy}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white transition"
        >
          {busy ? 'Opening…' : openLabel}
        </button>
        {!unfinished && (
          <button
            type="button"
            onClick={() => onRetake(lesson.id)}
            disabled={busy}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition"
          >
            Quiz
          </button>
        )}
        <button
          type="button"
          onClick={handleCopyLink}
          disabled={busy || !videoUrl}
          aria-label="Copy video link"
          title="Copy video link"
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 disabled:opacity-50 transition"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          aria-label="Rename video"
          title="Rename"
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 disabled:opacity-50 transition"
        >
          {renamingId === lesson.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Pencil className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onReextract(lesson)}
          disabled={busy}
          aria-label="Re-extract video"
          title="Re-extract vocabulary"
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 disabled:opacity-50 transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(lesson.id)}
          disabled={busy}
          aria-label="Remove video"
          title="Remove video"
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
      {job?.steps?.length ? <PrepareJobPanel job={job} compact /> : null}
    </div>
  );
}

export default function StepUrl({
  onSubmit,
  loading,
  loadingLabel = 'Extracting transcript...',
  error,
  history,
  historyLoading,
  resumeLoadingId,
  onContinue,
  onRetake,
  onDelete,
  onClearAll,
  onRename,
  onReextract,
  deletingId,
  prepareJob = null,
  renamingId,
}) {
  const [url, setUrl] = React.useState('');
  const [query, setQuery] = React.useState('');
  const unfinished = latestUnfinished(history);
  const needle = query.trim().toLowerCase();
  const filtered = (history || []).filter((lesson) => {
    if (!needle) return true;
    const hay = `${lesson.title || ''} ${lesson.video_id || ''} ${lesson.video_url || ''}`.toLowerCase();
    return hay.includes(needle);
  });
  const remaining = filtered;

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
          Start a new video, or reopen one you already saved
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div>
          <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {(history || []).length ? 'Start another video' : 'YouTube Video URL'}
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
          disabled={loading || !url.trim() || historyLoading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {loadingLabel}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              {(history || []).length ? 'Start this video' : 'Extract Vocabulary'}
            </>
          )}
        </button>
      </form>

      {loading && (
        <div className="mb-8">
          <PrepareJobPanel job={prepareJob} />
        </div>
      )}

      {!needle && unfinished && (
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
              {isPreparingLesson(unfinished) ? (
                <div className="mt-3">
                  <PrepareJobPanel job={prepareJobFromLesson(unfinished)} compact />
                </div>
              ) : null}
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
                {isPreparingLesson(unfinished) && !isVocabReady(unfinished)
                  ? 'Preparing…'
                  : isVocabReady(unfinished) && isPreparingLesson(unfinished)
                  ? 'View vocab'
                  : 'Continue'}
              </button>
              <button
                type="button"
                onClick={() => onDelete(unfinished.id)}
                disabled={Boolean(resumeLoadingId) || loading || Boolean(deletingId)}
                aria-label="Remove video"
                title="Remove video"
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

      <div className="mt-10">
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Your videos
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

        {!historyLoading && (history || []).length > 0 && (
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved videos"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        )}

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
            No saved videos yet. Extract one to keep it here — you can reopen it anytime.
          </p>
        )}

        {!historyLoading && remaining.length === 0 && needle && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No videos match “{query.trim()}”.
          </p>
        )}

        {!historyLoading && remaining.length > 0 && (
          <div className="space-y-2">
            {remaining.map((lesson) => (
              <SessionRow
                key={lesson.id}
                lesson={lesson}
                onOpen={onContinue}
                onRetake={onRetake}
                onDelete={onDelete}
                onRename={onRename}
                onReextract={onReextract}
                resumeLoadingId={resumeLoadingId}
                deletingId={deletingId}
                renamingId={renamingId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
