import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Youtube,
  ArrowRight,
  Check,
  X,
  Sparkles,
  BarChart3,
  Clock,
  ThumbsUp,
  BookOpen,
  RotateCcw,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { youtubeAPI, wordsAPI } from '@/lib/api';
import { getCefrColor } from '@/lib/utils';
import GroupSelector from '@/components/GroupSelector';
import StepStudy from '@/components/Learn/StepStudy';
import SessionHistory from '@/components/Learn/SessionHistory';
import toast from 'react-hot-toast';

// ─── Constants ────────────────────────────────────────────
const STEPS = {
  URL: 1,
  VOCAB: 2,
  STUDY: 3,
  QUIZ: 4,
};

const STEP_FROM_KEY = {
  vocab: STEPS.VOCAB,
  study: STEPS.STUDY,
  quiz: STEPS.QUIZ,
  completed: STEPS.STUDY,
};

// ─── Step 1: YouTube URL Input ────────────────────────────
function StepUrl({
  onSubmit,
  loading,
  error,
  history,
  historyLoading,
  continueLesson,
  resumeBusyId,
  onResume,
}) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    // Basic YouTube URL validation
    const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
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
            disabled={loading || !!resumeBusyId}
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
          disabled={loading || !!resumeBusyId || !url.trim()}
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

      {!loading && (
        <SessionHistory
          lessons={history}
          continueLesson={continueLesson}
          loading={historyLoading}
          busyId={resumeBusyId}
          onContinue={onResume}
        />
      )}
    </div>
  );
}

// ─── Step 2: Vocabulary Selection ─────────────────────────
function StepVocab({
  videoInfo,
  vocabulary,
  userCefrLevel,
  onLearn,
  onSkip,
  onToggleKnown,
  onBack,
  saving,
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedIndices, setSelectedIndices] = useState(() => {
    // Pre-select only truly new words (not known, not already in vocabulary)
    const set = new Set();
    vocabulary.forEach((item, idx) => {
      if (!item.isKnown && !item.isLearned) set.add(idx);
    });
    return set;
  });

  const toggleWord = (idx) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIndices.size === vocabulary.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(vocabulary.map((_, i) => i)));
    }
  };

  const markKnown = (idx) => {
    const item = vocabulary[idx];
    onToggleKnown(item.word, !item.isKnown);
  };

  const handleLearn = () => {
    const wordsToLearn = vocabulary
      .filter((_, idx) => selectedIndices.has(idx))
      .map((item) => ({
        word: item.word,
        definition: item.definition,
        wordType: item.wordType,
        cefrLevel: item.cefrLevel,
        ipaPronunciation: item.ipaPronunciation,
        exampleSentence: item.exampleSentence,
        notes: item.notes,
        tags: item.tags || [],
        vietnameseTranslation: item.vietnameseTranslation,
        synonyms: item.synonyms,
        groupId: selectedGroupId,
      }));

    if (wordsToLearn.length === 0) {
      toast.error('Select at least one word to learn');
      return;
    }
    onLearn(wordsToLearn, selectedGroupId);
  };

  const knownCount = vocabulary.filter((v) => v.isKnown).length;
  const learnedCount = vocabulary.filter((v) => v.isLearned && !v.isKnown).length;
  const newCount = vocabulary.length - knownCount - learnedCount;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Video info bar */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          title="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">
            {videoInfo?.title || 'YouTube Video'}
          </h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
            {videoInfo?.channel && <span>{videoInfo.channel}</span>}
            <span className="px-2 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium">
              {userCefrLevel}
            </span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            <Sparkles className="w-4 h-4 inline mr-1 text-primary-500" />
            {newCount} new
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            <BookOpen className="w-4 h-4 inline mr-1" />
            {learnedCount} learned
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            <ThumbsUp className="w-4 h-4 inline mr-1" />
            {knownCount} known
          </span>
        </div>
        <button
          onClick={toggleAll}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          {selectedIndices.size === vocabulary.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Vocabulary list */}
      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {vocabulary.map((item, idx) => {
          const isSelected = selectedIndices.has(idx);
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer ${
                isSelected
                  ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/10'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-60'
              }`}
              onClick={() => toggleWord(idx)}
            >
              {/* Checkbox */}
              <button
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                  isSelected
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWord(idx);
                }}
              >
                {isSelected && <Check className="w-3 h-3" />}
              </button>

              {/* Word content */}
              <div className="flex-1 min-w-0">
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
                  {item.wordType && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                      {item.wordType}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {item.definition}
                </p>
                {item.vietnameseTranslation && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    🇻🇳 {item.vietnameseTranslation}
                  </p>
                )}
              </div>

              {/* Know/Learned toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markKnown(idx);
                }}
                className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium transition ${
                  item.isKnown
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : item.isLearned
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-green-100 dark:hover:bg-green-900/30'
                }`}
                title={
                  item.isKnown
                    ? 'Mark as unknown'
                    : item.isLearned
                    ? 'Already in your vocabulary'
                    : 'I already know this'
                }
              >
                {item.isKnown ? 'Known' : item.isLearned ? 'Learned' : 'New'}
              </button>
            </div>
          );
        })}

        {vocabulary.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No vocabulary found for your level. Try a different video.
          </div>
        )}
      </div>

      {/* Group selector */}
      {selectedIndices.size > 0 && (
        <div className="mt-4">
          <GroupSelector
            value={selectedGroupId}
            onChange={setSelectedGroupId}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleLearn}
          disabled={saving || selectedIndices.size === 0}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <BookOpen className="w-5 h-5" />
              Learn {selectedIndices.size} {selectedIndices.size === 1 ? 'Word' : 'Words'}
            </>
          )}
        </button>

        <button
          onClick={onSkip}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg transition"
        >
          Continue to Study
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Content Comprehension Quiz ───────────────────
function StepQuiz({ questions, onSubmit, onRetry, videoInfo }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResult, setShowResult] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const question = questions[currentQ];
  const isLast = currentQ === questions.length - 1;

  const selectAnswer = (optionIdx) => {
    if (showResult) return;
    setAnswers((prev) => ({ ...prev, [currentQ]: optionIdx }));
  };

  const nextQuestion = () => {
    if (showResult) {
      // Review mode: go to next
      if (currentQ < questions.length - 1) {
        setCurrentQ(currentQ + 1);
        setShowResult(false);
      }
    } else {
      setShowResult(true);
    }
  };

  const prevQuestion = () => {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
      setShowResult(false);
    }
  };

  const handleSubmit = () => {
    const correct = questions.filter((q, idx) => answers[idx] === q.correctIndex).length;
    setSubmitted(true);
    onSubmit(correct, questions.length);
  };

  // Score calculation
  const answeredCount = Object.keys(answers).length;
  const isAllAnswered = answeredCount === questions.length;

  if (submitted) {
    const correctCount = questions.filter((q, idx) => answers[idx] === q.correctIndex).length;
    const percentage = Math.round((correctCount / questions.length) * 100);

    return (
      <div className="max-w-2xl mx-auto">
        {/* Score card */}
        <div className="text-center mb-8">
          <div
            className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
              percentage >= 80
                ? 'bg-green-100 dark:bg-green-900/30'
                : percentage >= 60
                ? 'bg-yellow-100 dark:bg-yellow-900/30'
                : 'bg-red-100 dark:bg-red-900/30'
            }`}
          >
            <span
              className={`text-3xl font-bold ${
                percentage >= 80
                  ? 'text-green-600 dark:text-green-400'
                  : percentage >= 60
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {percentage}%
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {percentage >= 80 ? 'Great job!' : percentage >= 60 ? 'Good effort!' : 'Keep practicing!'}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            You got {correctCount} out of {questions.length} questions correct
          </p>
        </div>

        {/* Question review */}
        <div className="space-y-3 mb-6">
          {questions.map((q, idx) => {
            const userAnswer = answers[idx];
            const isCorrect = userAnswer === q.correctIndex;
            return (
              <details key={idx} className="group">
                <summary className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                  {isCorrect ? (
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <X className="w-5 h-5 text-red-500 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">
                    Q{idx + 1}: {q.question}
                  </span>
                  {q.timestamp && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {q.timestamp}
                    </span>
                  )}
                </summary>
                <div className="mt-1 p-3 space-y-1.5 text-sm">
                  {q.options.map((opt, oi) => (
                    <div
                      key={oi}
                      className={`px-3 py-1.5 rounded ${
                        oi === q.correctIndex
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-medium'
                          : oi === userAnswer && oi !== q.correctIndex
                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {String.fromCharCode(65 + oi)}. {opt}
                      {oi === q.correctIndex && ' ✓'}
                      {oi === userAnswer && oi !== q.correctIndex && ' ✗'}
                    </div>
                  ))}
                  {q.explanation && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
                      💡 {q.explanation}
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onRetry}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg transition"
          >
            <RotateCcw className="w-4 h-4" />
            Try Another Video
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Question {currentQ + 1} of {questions.length}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {answeredCount}/{questions.length} answered
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentQ + (showResult ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-4">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0 flex-1">
            {question.type && (
              <span
                className={`inline-block mb-2 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                  question.type === 'vocab'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                    : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                }`}
              >
                {question.type === 'vocab' ? 'Vocabulary' : 'Comprehension'}
              </span>
            )}
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              {question.question}
            </h3>
          </div>
          {question.timestamp && (
            <a
              href={`#`}
              className="flex-shrink-0 ml-3 flex items-center gap-1 text-xs text-gray-400 hover:text-primary-500 transition"
              title="Video timestamp"
            >
              <Clock className="w-3 h-3" />
              {question.timestamp}
            </a>
          )}
        </div>

        {/* Options */}
        <div className="space-y-2">
          {question.options.map((option, idx) => {
            const isSelected = answers[currentQ] === idx;
            const isCorrectAnswer = showResult && idx === question.correctIndex;
            const isWrongAnswer = showResult && isSelected && idx !== question.correctIndex;

            let optionClass = 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50';
            if (showResult) {
              if (isCorrectAnswer) {
                optionClass = 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600';
              } else if (isWrongAnswer) {
                optionClass = 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600';
              }
            } else if (isSelected) {
              optionClass = 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-600';
            }

            return (
              <button
                key={idx}
                onClick={() => selectAnswer(idx)}
                disabled={showResult}
                className={`w-full text-left px-4 py-3 rounded-lg border transition font-medium ${
                  isSelected && !showResult ? 'ring-2 ring-primary-500 ring-offset-1' : ''
                } ${optionClass}`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-semibold text-gray-600 dark:text-gray-300">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200">{option}</span>
                  {showResult && isCorrectAnswer && (
                    <Check className="w-5 h-5 text-green-500 ml-auto" />
                  )}
                  {showResult && isWrongAnswer && (
                    <X className="w-5 h-5 text-red-500 ml-auto" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Explanation (after answering) */}
        {showResult && question.explanation && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-300 text-sm">
            💡 {question.explanation}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={prevQuestion}
          disabled={currentQ === 0}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex gap-2">
          {/* Question dots */}
          {questions.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCurrentQ(idx);
                setShowResult(false);
              }}
              className={`flex-1 h-1.5 rounded-full transition ${
                idx === currentQ
                  ? 'bg-primary-500'
                  : answers[idx] !== undefined
                  ? 'bg-green-400'
                  : 'bg-gray-200 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        {showResult ? (
          isLast ? (
            <button
              onClick={handleSubmit}
              disabled={!isAllAnswered}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              See Results
            </button>
          ) : (
            <button
              onClick={nextQuestion}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )
        ) : (
          isSelected && (
            <button
              onClick={nextQuestion}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition flex items-center gap-2"
            >
              {isLast ? 'Review' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main Learn Page ───────────────────────────────────────
export default function Learn() {
  const [step, setStep] = useState(STEPS.URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Analysis results
  const [videoInfo, setVideoInfo] = useState(null);
  const [vocabulary, setVocabulary] = useState([]);
  const [userCefrLevel, setUserCefrLevel] = useState('B2');
  const [lessonId, setLessonId] = useState(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [cues, setCues] = useState([]);
  const [summary, setSummary] = useState('');
  const [chapters, setChapters] = useState([]);
  const [studyWords, setStudyWords] = useState([]);

  // Quiz results
  const [questions, setQuestions] = useState([]);

  // Session history (cross-device)
  const [history, setHistory] = useState([]);
  const [continueLesson, setContinueLesson] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [resumeBusyId, setResumeBusyId] = useState(null);

  const persistProgress = useCallback(async (id, data) => {
    if (!id) return;
    try {
      await youtubeAPI.saveProgress(id, data);
    } catch (err) {
      console.warn('Could not save lesson progress:', err.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await youtubeAPI.getHistory(20);
      setHistory(response.data.lessons || []);
      setContinueLesson(response.data.continueLesson || null);
    } catch (err) {
      console.warn('Could not load lesson history:', err.message);
      setHistory([]);
      setContinueLesson(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ── Step 1: Analyze ──────────────────────────────────
  const handleAnalyze = async (videoUrl) => {
    setLoading(true);
    setError(null);
    setCurrentVideoUrl(videoUrl);

    try {
      const response = await youtubeAPI.analyze(videoUrl);
      const data = response.data;

      setVideoInfo(data.videoInfo);
      setVocabulary(data.vocabulary);
      setUserCefrLevel(data.userCefrLevel);
      setLessonId(data.lessonId);
      setCues(Array.isArray(data.cues) ? data.cues : []);
      setSummary(data.summary || '');
      setChapters(Array.isArray(data.chapters) ? data.chapters : []);
      setStudyWords([]);
      setQuestions([]);
      setStep(STEPS.VOCAB);

      if (data.totalFound === 0) {
        toast('No new vocabulary found for your level. Try another video.', { icon: 'ℹ️' });
      } else {
        toast.success(`Found ${data.totalFound} vocabulary items`);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to analyze video';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Resume a previous session (desktop ↔ phone) ──────
  const handleResume = async (lessonSummary) => {
    if (!lessonSummary?.id) return;
    setResumeBusyId(lessonSummary.id);
    setError(null);
    try {
      const response = await youtubeAPI.getLesson(lessonSummary.id);
      const lesson = response.data.lesson;
      if (!lesson) throw new Error('Lesson not found');

      setLessonId(lesson.id);
      setCurrentVideoUrl(lesson.videoUrl || '');
      setVideoInfo(lesson.videoInfo);
      setVocabulary(lesson.vocabulary || []);
      setUserCefrLevel(lesson.userCefrLevel || 'B2');
      setCues(lesson.cues || []);
      setSummary(lesson.summary || '');
      setChapters(lesson.chapters || []);
      setStudyWords(lesson.studyWords || []);
      setQuestions(lesson.questions || []);

      let targetStep = STEP_FROM_KEY[lesson.currentStep] || STEPS.VOCAB;

      const needsQuizRegen =
        targetStep === STEPS.QUIZ && !(lesson.questions?.length);

      if (lesson.currentStep === 'completed') {
        targetStep = (lesson.studyWords?.length || lesson.cues?.length)
          ? STEPS.STUDY
          : STEPS.VOCAB;
      } else if (targetStep === STEPS.STUDY && !(lesson.studyWords?.length || lesson.cues?.length)) {
        targetStep = STEPS.VOCAB;
      } else if (targetStep === STEPS.VOCAB && !(lesson.vocabulary?.length)) {
        toast('Re-analyzing this video to restore vocabulary…');
        await handleAnalyze(lesson.videoUrl);
        return;
      }

      setStep(targetStep);
      toast.success(
        lesson.currentStep === 'completed'
          ? 'Opened previous session'
          : `Continued at ${lesson.currentStep === 'quiz' ? 'Quiz' : lesson.currentStep === 'study' ? 'Study' : 'Vocabulary'}`
      );

      if (needsQuizRegen) {
        setLoading(true);
        try {
          const vocabularyWords = (lesson.studyWords || []).map((w) => w.word).filter(Boolean);
          const quizRes = await youtubeAPI.generateQuiz(lesson.videoUrl, {
            lessonId: lesson.id,
            vocabularyWords,
          });
          const nextQuestions = quizRes.data.questions || [];
          setQuestions(nextQuestions);
          if (!nextQuestions.length) {
            toast.error('Could not restore quiz — opened Study instead');
            setStep(STEPS.STUDY);
          }
        } catch (quizErr) {
          toast.error('Could not restore quiz — opened Study instead');
          setStep(STEPS.STUDY);
        } finally {
          setLoading(false);
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to continue session';
      toast.error(msg);
    } finally {
      setResumeBusyId(null);
    }
  };

  // ── Step 2: Mark known ───────────────────────────────
  const handleToggleKnown = async (word, known) => {
    // If the word is already in vocabulary (isLearned), clicking marks it as known too
    // This prevents it from appearing in future analyses
    const item = vocabulary.find(
      (v) => v.word.toLowerCase() === word.toLowerCase()
    );
    const currentlyKnown = item?.isKnown;
    const currentlyLearned = item?.isLearned;

    // Cycle: New → Known → New,  Learned → Known
    const newKnown = currentlyLearned ? true : !currentlyKnown;

    // Optimistic update
    setVocabulary((prev) =>
      prev.map((item) =>
        item.word.toLowerCase() === word.toLowerCase()
          ? { ...item, isKnown: newKnown }
          : item
      )
    );

    try {
      await youtubeAPI.markKnown(word, newKnown);
    } catch (err) {
      console.error('Failed to mark known:', err);
      // Revert
      setVocabulary((prev) =>
        prev.map((item) =>
          item.word.toLowerCase() === word.toLowerCase()
            ? { ...item, isKnown: currentlyKnown }
            : item
        )
      );
    }
  };

  // ── Step 2: Learn selected words → Study ─────────────
  const handleLearn = async (wordsToLearn, groupId) => {
    setSaving(true);
    try {
      const response = await wordsAPI.bulkOperation({
        operation: 'import',
        words: wordsToLearn,
      });

      if (response.data.words) {
        toast.success(`Added ${response.data.words.length} words to your vocabulary`);

        for (const w of wordsToLearn) {
          try { await youtubeAPI.markKnown(w.word, true); } catch (_) {}
        }
      }

      setStudyWords(wordsToLearn);
      setStep(STEPS.STUDY);
      await persistProgress(lessonId, {
        currentStep: 'study',
        studyWords: wordsToLearn,
        vocabulary,
        wordsSaved: wordsToLearn.length,
      });
    } catch (err) {
      toast.error('Failed to save words: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2→Study without saving ──────────────────────
  const handleSkipToStudy = async () => {
    const words = vocabulary.filter((v) => !v.isKnown);
    setStudyWords(words);
    setStep(STEPS.STUDY);
    await persistProgress(lessonId, {
      currentStep: 'study',
      studyWords: words,
      vocabulary,
    });
  };

  // ── Study → Quiz ─────────────────────────────────────
  const handleContinueToQuiz = async () => {
    setStep(STEPS.QUIZ);
    await persistProgress(lessonId, { currentStep: 'quiz', studyWords });
    await handleGenerateQuiz();
  };

  // ── Generate mixed quiz ──────────────────────────────
  const handleGenerateQuiz = async () => {
    setLoading(true);
    try {
      const vocabularyWords = studyWords.map((w) => w.word).filter(Boolean);
      const response = await youtubeAPI.generateQuiz(currentVideoUrl, {
        lessonId,
        vocabularyWords,
      });
      const nextQuestions = response.data.questions || [];
      setQuestions(nextQuestions);
      if (!nextQuestions.length) {
        toast.error('Could not generate quiz questions. Try a different video.');
      } else {
        await persistProgress(lessonId, {
          currentStep: 'quiz',
          quizQuestions: nextQuestions,
        });
      }
    } catch (err) {
      toast.error('Failed to generate quiz: ' + (err.response?.data?.message || err.message));
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Submit quiz ──────────────────────────────
  const handleQuizSubmit = async (score, total) => {
    try {
      await youtubeAPI.complete({
        lessonId,
        videoUrl: currentVideoUrl,
        quizScore: score,
        quizTotal: total,
      });
      await loadHistory();
    } catch (err) {
      console.error('Failed to save quiz result:', err);
    }
  };

  // ── Reset ────────────────────────────────────────────
  const handleRetry = () => {
    setStep(STEPS.URL);
    setVideoInfo(null);
    setVocabulary([]);
    setQuestions([]);
    setError(null);
    setCurrentVideoUrl('');
    setLessonId(null);
    setCues([]);
    setSummary('');
    setChapters([]);
    setStudyWords([]);
    loadHistory();
  };

  // ── Step indicator ───────────────────────────────────
  const steps = [
    { num: 1, label: 'Video', active: step >= STEPS.URL, current: step === STEPS.URL },
    { num: 2, label: 'Vocabulary', active: step >= STEPS.VOCAB, current: step === STEPS.VOCAB },
    { num: 3, label: 'Study', active: step >= STEPS.STUDY, current: step === STEPS.STUDY },
    { num: 4, label: 'Quiz', active: step >= STEPS.QUIZ, current: step === STEPS.QUIZ },
  ];

  return (
    <>
      <Helmet>
        <title>Learn from YouTube — Magic English</title>
      </Helmet>

      <div className="py-6 px-4 sm:px-6 lg:px-8">
        {/* Step indicator */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-center gap-2">
            {steps.map((s, idx) => (
              <React.Fragment key={s.num}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition ${
                      s.current
                        ? 'bg-primary-600 text-white'
                        : s.active
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                    }`}
                  >
                    {s.num}
                  </div>
                  <span
                    className={`hidden sm:inline text-sm font-medium ${
                      s.current ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`w-8 h-0.5 ${
                      steps[idx + 1].active ? 'bg-primary-400' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content */}
        {step === STEPS.URL && (
          <StepUrl
            onSubmit={handleAnalyze}
            loading={loading}
            error={error}
            history={history}
            historyLoading={historyLoading}
            continueLesson={continueLesson}
            resumeBusyId={resumeBusyId}
            onResume={handleResume}
          />
        )}

        {step === STEPS.VOCAB && (
          <StepVocab
            videoInfo={videoInfo}
            vocabulary={vocabulary}
            userCefrLevel={userCefrLevel}
            onLearn={handleLearn}
            onSkip={handleSkipToStudy}
            onToggleKnown={handleToggleKnown}
            onBack={handleRetry}
            saving={saving}
          />
        )}

        {step === STEPS.STUDY && (
          <StepStudy
            videoInfo={videoInfo}
            cues={cues}
            chapters={chapters}
            summary={summary}
            studyWords={studyWords}
            onBack={() => setStep(STEPS.VOCAB)}
            onContinueQuiz={handleContinueToQuiz}
            quizLoading={loading}
          />
        )}

        {step === STEPS.QUIZ && (
          <>
            {loading ? (
              <div className="max-w-2xl mx-auto text-center py-12">
                <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Generating Quiz Questions
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  AI is creating listening comprehension questions based on the video content...
                </p>
              </div>
            ) : questions.length > 0 ? (
              <StepQuiz
                questions={questions}
                onSubmit={handleQuizSubmit}
                onRetry={handleRetry}
                videoInfo={videoInfo}
              />
            ) : (
              <div className="max-w-2xl mx-auto text-center py-12">
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  No quiz questions available for this video.
                </p>
                <button
                  onClick={handleRetry}
                  className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition"
                >
                  Try Another Video
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
