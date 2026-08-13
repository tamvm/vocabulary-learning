import React, { useCallback, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, Eye, EyeOff, FileText, List } from 'lucide-react';
import VideoPlayer, { seekPlayer } from './VideoPlayer';
import TranscriptPanel from './TranscriptPanel';
import VocabPanel from './VocabPanel';
import ChapterBar from './ChapterBar';
import LessonSummary from './LessonSummary';
import { shouldUpdatePlaybackTime } from '@/lib/transcriptSync';

function PanelToggle({ pressed, onClick, icon: Icon, showLabel, hideLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
        pressed
          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800'
          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
      }`}
    >
      {pressed ? <Icon className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      {pressed ? hideLabel : showLabel}
    </button>
  );
}

function StudySidePanel({ title, count, onHide, children, fillHeight }) {
  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-3 flex flex-col ${
        fillHeight
          ? 'h-[50vh] lg:h-auto lg:min-h-[320px] lg:max-h-[min(70vh,100%)]'
          : 'max-h-[50vh] lg:max-h-[55vh]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
          {count != null ? ` (${count})` : ''}
        </h3>
        <button
          type="button"
          onClick={onHide}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          Hide
        </button>
      </div>
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
  const pendingSeekRef = useRef(null);
  const [selectedWord, setSelectedWord] = useState(null);
  const [currentTime, setCurrentTime] = useState(null);
  const [showWords, setShowWords] = useState(true);
  const [showTranscript, setShowTranscript] = useState(true);

  const handleReady = useCallback((player) => {
    playerRef.current = player;
    if (pendingSeekRef.current != null) {
      seekPlayer(player, pendingSeekRef.current);
      pendingSeekRef.current = null;
    }
  }, []);

  const handleTime = useCallback(
    (time) => {
      setCurrentTime((prev) =>
        shouldUpdatePlaybackTime(prev, time, cues, chapters) ? time : prev
      );
    },
    [cues, chapters]
  );

  const handleSeek = (seconds) => {
    const t = Number(seconds);
    if (!Number.isFinite(t)) return;
    setCurrentTime(t);
    if (!seekPlayer(playerRef.current, t)) {
      pendingSeekRef.current = t;
    }
  };

  const sideBySide =
    (showWords && !showTranscript) || (!showWords && showTranscript);
  const bothPanels = showWords && showTranscript;

  const wordsPanel = (
    <StudySidePanel
      title="New words"
      count={studyWords.length}
      onHide={() => setShowWords(false)}
      fillHeight={sideBySide}
    >
      <VocabPanel
        words={studyWords}
        selectedWord={selectedWord}
        onSelectWord={(w) => setSelectedWord((prev) => (prev === w ? null : w))}
      />
    </StudySidePanel>
  );

  const transcriptPanel = (
    <StudySidePanel
      title="Transcript"
      count={cues.length}
      onHide={() => setShowTranscript(false)}
      fillHeight={sideBySide}
    >
      <TranscriptPanel
        cues={cues}
        onSeek={handleSeek}
        highlightWord={selectedWord}
        currentTime={currentTime}
      />
    </StudySidePanel>
  );

  const playerBlock = (
    <div>
      {videoInfo?.videoId && (
        <VideoPlayer
          videoId={videoInfo.videoId}
          onReady={handleReady}
          onTime={handleTime}
        />
      )}
      <ChapterBar chapters={chapters} onSeek={handleSeek} currentTime={currentTime} />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
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
            Active line follows the video · click a cue to jump
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <PanelToggle
            pressed={showWords}
            onClick={() => setShowWords((v) => !v)}
            icon={List}
            hideLabel="Words"
            showLabel="Words"
          />
          <PanelToggle
            pressed={showTranscript}
            onClick={() => setShowTranscript((v) => !v)}
            icon={FileText}
            hideLabel="Transcript"
            showLabel="Transcript"
          />
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

      <div className="flex sm:hidden items-center gap-2 mb-3">
        <PanelToggle
          pressed={showWords}
          onClick={() => setShowWords((v) => !v)}
          icon={List}
          hideLabel="Words"
          showLabel="Words"
        />
        <PanelToggle
          pressed={showTranscript}
          onClick={() => setShowTranscript((v) => !v)}
          icon={FileText}
          hideLabel="Transcript"
          showLabel="Transcript"
        />
      </div>

      <LessonSummary summary={summary} defaultOpen className="mb-4" />

      {bothPanels && (
        <>
          {playerBlock}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[320px]">
            {wordsPanel}
            {transcriptPanel}
          </div>
        </>
      )}

      {sideBySide && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {playerBlock}
          {showWords ? wordsPanel : transcriptPanel}
        </div>
      )}

      {!showWords && !showTranscript && playerBlock}

      {(!showWords || !showTranscript) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
          {!showWords && (
            <button
              type="button"
              onClick={() => setShowWords(true)}
              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
            >
              <Eye className="w-3.5 h-3.5" />
              Show New words
            </button>
          )}
          {!showTranscript && (
            <button
              type="button"
              onClick={() => setShowTranscript(true)}
              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
            >
              <Eye className="w-3.5 h-3.5" />
              Show Transcript
            </button>
          )}
        </div>
      )}
    </div>
  );
}
