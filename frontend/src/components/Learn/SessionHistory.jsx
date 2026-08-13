import React from 'react';
import { Clock, Play, CheckCircle2, BookOpen, Loader2 } from 'lucide-react';

const STEP_LABELS = {
  vocab: 'Vocabulary',
  study: 'Study',
  quiz: 'Quiz',
  completed: 'Completed',
};

function formatRelativeDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function SessionRow({ lesson, onContinue, busyId, emphasize = false }) {
  const step = lesson.currentStep || 'vocab';
  const isCompleted = lesson.status === 'completed' || step === 'completed';
  const loading = busyId === lesson.id;

  return (
    <button
      type="button"
      onClick={() => onContinue(lesson)}
      disabled={!!busyId}
      className={`w-full flex items-center gap-3 p-3 text-left rounded-xl border transition ${
        emphasize
          ? 'border-primary-300 dark:border-primary-700 bg-primary-50/80 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600'
      } disabled:opacity-60`}
    >
      {lesson.thumbnailUrl ? (
        <img
          src={lesson.thumbnailUrl}
          alt=""
          className="w-20 h-12 object-cover rounded-md flex-shrink-0 bg-gray-100 dark:bg-gray-700"
        />
      ) : (
        <div className="w-20 h-12 rounded-md flex-shrink-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-gray-400" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
          {lesson.title || 'YouTube lesson'}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          <span className="inline-flex items-center gap-1">
            {isCompleted ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
            {isCompleted
              ? lesson.quizTotal != null
                ? `Score ${lesson.quizScore ?? 0}/${lesson.quizTotal}`
                : 'Completed'
              : `At ${STEP_LABELS[step] || step}`}
          </span>
          <span>·</span>
          <span>{formatRelativeDate(lesson.updatedAt || lesson.createdAt)}</span>
        </div>
      </div>

      <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        {isCompleted ? 'Review' : 'Continue'}
      </span>
    </button>
  );
}

export default function SessionHistory({
  lessons,
  continueLesson,
  loading,
  busyId,
  onContinue,
}) {
  if (loading) {
    return (
      <div className="mt-10 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading previous sessions…
      </div>
    );
  }

  if (!lessons?.length) return null;

  const others = continueLesson
    ? lessons.filter((l) => l.id !== continueLesson.id)
    : lessons;

  return (
    <div className="mt-10 space-y-4">
      {continueLesson && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Continue where you left off
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Pick up on this device — progress syncs with your account
          </p>
          <SessionRow
            lesson={continueLesson}
            onContinue={onContinue}
            busyId={busyId}
            emphasize
          />
        </div>
      )}

      {others.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Previous sessions
          </h2>
          <div className="space-y-2">
            {others.map((lesson) => (
              <SessionRow
                key={lesson.id}
                lesson={lesson}
                onContinue={onContinue}
                busyId={busyId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
