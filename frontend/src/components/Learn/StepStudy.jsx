import React, { useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, BookOpen } from 'lucide-react';
import VideoPlayer, { seekPlayer } from './VideoPlayer';
import TranscriptPanel from './TranscriptPanel';
import VocabPanel from './VocabPanel';
import ChapterBar from './ChapterBar';

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
  const [activeStart, setActiveStart] = useState(null);

  const handleSeek = (seconds) => {
    setActiveStart(seconds);
    seekPlayer(playerRef.current, seconds);
  };

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
            Click a transcript line to jump in the video · review words on the left
          </p>
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

      {videoInfo?.videoId && (
        <VideoPlayer
          videoId={videoInfo.videoId}
          onReady={(player) => {
            playerRef.current = player;
          }}
        />
      )}

      <ChapterBar chapters={chapters} onSeek={handleSeek} activeStart={activeStart} />

      {summary ? (
        <div className="mt-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-900 dark:text-white">
            <BookOpen className="w-4 h-4 text-primary-500" />
            Summary
          </div>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">
            {summary}
          </pre>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[320px]">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-3 flex flex-col max-h-[50vh] lg:max-h-[55vh]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 px-1">
            New words ({studyWords.length})
          </h3>
          <div className="flex-1 min-h-0">
            <VocabPanel
              words={studyWords}
              selectedWord={selectedWord}
              onSelectWord={(w) =>
                setSelectedWord((prev) => (prev === w ? null : w))
              }
            />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-3 flex flex-col max-h-[50vh] lg:max-h-[55vh]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 px-1">
            Transcript ({cues.length} lines)
          </h3>
          <div className="flex-1 min-h-0">
            <TranscriptPanel
              cues={cues}
              onSeek={handleSeek}
              highlightWord={selectedWord}
              activeStart={activeStart}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
