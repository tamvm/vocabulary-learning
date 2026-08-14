import React, { useCallback, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  BookOpen,
  PanelLeft,
  Subtitles,
  EyeOff,
  Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { aiAPI, wordsAPI } from '@/lib/api';
import VideoPlayer, { seekPlayer } from './VideoPlayer';
import TranscriptPanel from './TranscriptPanel';
import VocabPanel from './VocabPanel';
import ChapterBar from './ChapterBar';
import LessonSummary from './LessonSummary';
import WordDetailModal, {
  normalizeWordDetail,
  isUnavailableAnalysis,
} from './WordDetailModal';

function PanelShell({ title, children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-3 flex flex-col overflow-hidden min-h-0 ${className}`}
    >
      <h3 className="flex-shrink-0 text-sm font-semibold text-gray-900 dark:text-white mb-2 px-1">
        {title}
      </h3>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function findStudyWord(studyWords, rawWord) {
  const needle = String(rawWord || '')
    .toLowerCase()
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, '');
  if (!needle) return null;
  const exact = studyWords.find((w) => w.word?.toLowerCase() === needle);
  if (exact) return exact;
  return (
    studyWords.find((w) => {
      const ww = (w.word?.toLowerCase() || '').trim();
      if (!ww) return false;
      if (ww.includes(' ')) {
        return ww.split(/\s+/).includes(needle);
      }
      return (
        ww === `${needle}s` ||
        needle === `${ww}s` ||
        ww === `${needle}es` ||
        needle === `${ww}es`
      );
    }) || null
  );
}

export default function StepStudy({
  videoInfo,
  cues = [],
  chapters = [],
  summary = '',
  studyWords = [],
  vocabulary = [],
  onBack,
  onContinueQuiz,
  onAddStudyWord,
  quizLoading,
}) {
  const playerRef = useRef(null);
  const lookupCacheRef = useRef(new Map());
  const [selectedWord, setSelectedWord] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showVocab, setShowVocab] = useState(true);
  const [showTranscript, setShowTranscript] = useState(true);
  const [showSummary, setShowSummary] = useState(true);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailWord, setDetailWord] = useState(null);
  const [adding, setAdding] = useState(false);

  const handlePlayerReady = useCallback((player) => {
    playerRef.current = player;
  }, []);

  const handleTimeUpdate = useCallback((t) => {
    setCurrentTime(t);
  }, []);

  const handleSeek = useCallback((seconds) => {
    const t = Number(seconds) || 0;
    setCurrentTime(t);
    seekPlayer(playerRef.current, t);
  }, []);

  const openDetail = useCallback(
    async (raw, knownItem = null) => {
      const cleaned = String(raw || '')
        .trim()
        .replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '');
      if (!cleaned) return;

      setSelectedWord(cleaned);
      setDetailOpen(true);
      setDetailError(null);

      const fromLocal =
        knownItem ||
        findStudyWord(studyWords, cleaned) ||
        findStudyWord(vocabulary, cleaned);

      if (fromLocal?.definition && !isUnavailableAnalysis(fromLocal)) {
        const normalized = normalizeWordDetail(fromLocal, cleaned);
        setDetailWord(normalized);
        setDetailLoading(false);
        lookupCacheRef.current.set(cleaned.toLowerCase(), normalized);
        return;
      }

      const cached = lookupCacheRef.current.get(cleaned.toLowerCase());
      if (cached && !isUnavailableAnalysis(cached)) {
        setDetailWord(cached);
        setDetailLoading(false);
        return;
      }

      setDetailWord({ word: cleaned });
      setDetailLoading(true);
      try {
        // Prefer an existing saved vocabulary row before calling AI
        try {
          const existing = await wordsAPI.getAll({
            search: cleaned,
            limit: 5,
            offset: 0,
          });
          const rows = Array.isArray(existing?.words) ? existing.words : [];
          const match = rows.find(
            (w) =>
              String(w.word || '').toLowerCase() === cleaned.toLowerCase() &&
              w.definition &&
              !isUnavailableAnalysis(w)
          );
          if (match) {
            const normalized = normalizeWordDetail(match, cleaned);
            lookupCacheRef.current.set(cleaned.toLowerCase(), normalized);
            setDetailWord(normalized);
            return;
          }
        } catch (_) {
          /* non-fatal — continue to AI */
        }

        const response = await aiAPI.analyzeWord(cleaned, { autoSave: false });
        const analysis = response.data?.analysis;
        if (!analysis || isUnavailableAnalysis(analysis)) {
          throw new Error(
            response.data?.message ||
              'Could not look up this word. AI is unavailable — try again shortly.'
          );
        }
        const normalized = normalizeWordDetail(analysis, cleaned);
        lookupCacheRef.current.set(cleaned.toLowerCase(), normalized);
        setDetailWord(normalized);
      } catch (err) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          'Failed to look up word';
        setDetailError(msg);
        toast.error(msg);
      } finally {
        setDetailLoading(false);
      }
    },
    [studyWords, vocabulary]
  );

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailError(null);
  }, []);

  const alreadyAdded = Boolean(
    detailWord?.word && findStudyWord(studyWords, detailWord.word)
  );

  const handleAdd = useCallback(async () => {
    if (!detailWord?.word || !onAddStudyWord) return;
    setAdding(true);
    try {
      await onAddStudyWord(detailWord);
      toast.success(`Added “${detailWord.word}” to new words`);
    } catch (err) {
      toast.error(
        err.response?.data?.message || err.message || 'Failed to add word'
      );
    } finally {
      setAdding(false);
    }
  }, [detailWord, onAddStudyWord]);

  // Hide words → video + transcript sit side by side
  const sideBySide = !showVocab && showTranscript;

  const transcriptPanel = showTranscript ? (
    <PanelShell
      title={`Transcript (${cues.length} lines)`}
      className={sideBySide ? 'h-full min-h-0 flex-1' : 'h-[50vh]'}
    >
      <TranscriptPanel
        cues={cues}
        onSeek={handleSeek}
        onWordClick={(w) => openDetail(w)}
        highlightWord={selectedWord}
        currentTime={currentTime}
      />
    </PanelShell>
  ) : null;

  const vocabPanel = showVocab ? (
    <PanelShell
      title={`New words (${studyWords.length})`}
      className="h-[50vh]"
    >
      <VocabPanel
        words={studyWords}
        selectedWord={selectedWord}
        onSelectWord={(w) => setSelectedWord(w)}
        onOpenWord={(item) => openDetail(item.word, item)}
      />
    </PanelShell>
  ) : null;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          title="Back to vocabulary"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">
            {videoInfo?.title || 'Study the video'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Click a word for definition · click a timestamp to jump
          </p>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setShowVocab((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              showVocab
                ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
            }`}
            title={showVocab ? 'Hide new words' : 'Show new words'}
            aria-pressed={showVocab}
          >
            <PanelLeft className="w-3.5 h-3.5" />
            Words
            {showVocab ? (
              <Eye className="w-3 h-3 opacity-70" />
            ) : (
              <EyeOff className="w-3 h-3 opacity-70" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              showTranscript
                ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
            }`}
            title={showTranscript ? 'Hide transcript' : 'Show transcript'}
            aria-pressed={showTranscript}
          >
            <Subtitles className="w-3.5 h-3.5" />
            Transcript
            {showTranscript ? (
              <Eye className="w-3 h-3 opacity-70" />
            ) : (
              <EyeOff className="w-3 h-3 opacity-70" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowSummary((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              showSummary
                ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
            }`}
            title={showSummary ? 'Hide summary' : 'Show summary'}
            aria-pressed={showSummary}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Summary
            {showSummary ? (
              <Eye className="w-3 h-3 opacity-70" />
            ) : (
              <EyeOff className="w-3 h-3 opacity-70" />
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={onContinueQuiz}
          disabled={quizLoading}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition"
        >
          {quizLoading ? 'Preparing…' : 'Ready for quiz'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {showSummary ? (
        <LessonSummary summary={summary} cues={cues} defaultOpen className="mb-4" />
      ) : null}

      {/* Stable first child keeps VideoPlayer mounted across layout toggles */}
      <div
        className={
          sideBySide
            ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch'
            : 'flex flex-col gap-4'
        }
      >
        <div className="min-w-0">
          {videoInfo?.videoId ? (
            <VideoPlayer
              videoId={videoInfo.videoId}
              onReady={handlePlayerReady}
              onTimeUpdate={handleTimeUpdate}
            />
          ) : null}
          <ChapterBar chapters={chapters} onSeek={handleSeek} currentTime={currentTime} />
        </div>

        {sideBySide ? (
          <div className="min-h-0 h-[50vh] lg:h-auto lg:min-h-full flex flex-col">
            {transcriptPanel}
          </div>
        ) : showVocab || showTranscript ? (
          <div
            className={`grid gap-4 min-h-[320px] ${
              showVocab && showTranscript ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {vocabPanel}
            {transcriptPanel}
          </div>
        ) : null}
      </div>

      <WordDetailModal
        open={detailOpen}
        wordData={detailWord}
        loading={detailLoading}
        error={detailError}
        alreadyAdded={alreadyAdded}
        adding={adding}
        onClose={handleCloseDetail}
        onAdd={handleAdd}
      />
    </div>
  );
}
