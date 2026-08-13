import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  BookOpen,
  PanelLeft,
  Subtitles,
  EyeOff,
  Eye,
} from 'lucide-react';
import VideoPlayer, { seekPlayer } from './VideoPlayer';
import TranscriptPanel from './TranscriptPanel';
import VocabPanel from './VocabPanel';
import ChapterBar from './ChapterBar';

function PanelShell({ title, children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-3 flex flex-col ${className}`}
    >
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 px-1">
        {title}
      </h3>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

export default function StepStudy({
  videoInfo,
  cues = [],
  chapters = [],
  summary = '',
  studyWords = [],
  onBack,
  onContinueQuiz,
  quizLoading,
}) {
  const playerRef = useRef(null);
  const [selectedWord, setSelectedWord] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showVocab, setShowVocab] = useState(true);
  const [showTranscript, setShowTranscript] = useState(true);
  const [showSummary, setShowSummary] = useState(Boolean(summary));

  useEffect(() => {
    if (summary) setShowSummary(true);
  }, [summary]);

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

  // Hide words → video + transcript sit side by side
  const sideBySide = !showVocab && showTranscript;

  const transcriptPanel = showTranscript ? (
    <PanelShell
      title={`Transcript (${cues.length} lines)`}
      className={sideBySide ? 'max-h-[70vh] min-h-[280px]' : 'max-h-[50vh] lg:max-h-[55vh]'}
    >
      <TranscriptPanel
        cues={cues}
        onSeek={handleSeek}
        highlightWord={selectedWord}
        currentTime={currentTime}
      />
    </PanelShell>
  ) : null;

  const vocabPanel = showVocab ? (
    <PanelShell
      title={`New words (${studyWords.length})`}
      className="max-h-[50vh] lg:max-h-[55vh]"
    >
      <VocabPanel
        words={studyWords}
        selectedWord={selectedWord}
        onSelectWord={(w) => setSelectedWord((prev) => (prev === w ? null : w))}
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
            Click a transcript line to jump · hide panels to focus on video
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
          {summary ? (
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
          ) : null}
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

      {summary && showSummary ? (
        <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-900 dark:text-white">
            <BookOpen className="w-4 h-4 text-primary-500" />
            Summary
          </div>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">
            {summary}
          </pre>
        </div>
      ) : null}

      {/* Stable first child keeps VideoPlayer mounted across layout toggles */}
      <div
        className={
          sideBySide
            ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start'
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
          transcriptPanel
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
    </div>
  );
}
