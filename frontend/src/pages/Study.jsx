import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Clock,
  Flame,
  BarChart3,
  X,
  Check,
  HelpCircle,
  SkipForward,
} from 'lucide-react';

import { useFlashcards } from '../hooks/useFlashcards';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { flashcardAPI } from '../lib/api';
import { compareQuizAnswers, speakWord } from '../lib/utils';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import FlashCard from '../components/Flashcards/FlashCard';
import QuizQuestion from '../components/Flashcards/QuizQuestion';

const Study = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const groupsParam = searchParams.get('groups');

  const {
    dueCards,
    currentCard,
    currentCardIndex,
    sessionStats,
    reviewCard,
    skipCard,
    startSession,
    endSession,
    fetchDueCards,
    loading,
    error,
    cardsRemaining
  } = useFlashcards();

  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [cardStartTime, setCardStartTime] = useState(null);
  const [showSessionEnd, setShowSessionEnd] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isRatingInProgress, setIsRatingInProgress] = useState(false);
  const [flashedRating, setFlashedRating] = useState(null);
  const [reviewedCards, setReviewedCards] = useState([]);
  const [showReview, setShowReview] = useState(false);
  const RATING_FLASH_MS = 280;
  const shortcutHandlersRef = useRef({});

  // Quiz mode state
  const [studyMode, setStudyMode] = useState('flashcard'); // 'flashcard' or 'quiz'
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [showQuizAnswer, setShowQuizAnswer] = useState(false);
  const [allQuizQuestions, setAllQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [loadingQuizQuestions, setLoadingQuizQuestions] = useState(false);
  const [preloadingNextBatch, setPreloadingNextBatch] = useState(false);

  // Study session state
  const [studyStats, setStudyStats] = useState({
    cardsStudied: 0,
    newCards: 0,
    reviewCards: 0,
    correctAnswers: 0,
    totalAnswers: 0,
  });

  // Initialize session
  useEffect(() => {
    // Reset all session states on mount
    setShowSessionEnd(false);
    setShowReview(false);
    setReviewedCards([]);
    setStudyStats({
      cardsStudied: 0,
      newCards: 0,
      reviewCards: 0,
      correctAnswers: 0,
      totalAnswers: 0,
    });

    startSession(groupsParam);
    setSessionStartTime(Date.now());
    // Remove cleanup - let user explicitly end session
  }, [groupsParam]);

  // Set card start time when new card appears or question changes
  useEffect(() => {
    if (currentCard && studyMode === 'flashcard') {
      setCardStartTime(Date.now());
      setIsFlipped(false);
      setIsRatingInProgress(false);
      setFlashedRating(null);
    }
  }, [currentCard, studyMode]);

  // Set timer for quiz questions
  useEffect(() => {
    if (studyMode === 'quiz' && currentQuestion) {
      setCardStartTime(Date.now());
      setShowQuizAnswer(false);
      setQuizAnswer('');
      setIsRatingInProgress(false);
    }
  }, [currentQuestion, studyMode]);

  // Preload next batch of questions when running low
  const preloadNextQuestionBatch = async () => {
    if (preloadingNextBatch) return; // Avoid multiple simultaneous preloads

    try {
      setPreloadingNextBatch(true);
      console.log('Preloading next batch of quiz questions...');

      // Include groups filter if present
      const params = { limit: 50, includeNew: true };
      if (groupsParam) {
        params.groups = groupsParam;
      }

      const response = await flashcardAPI.getAllQuizQuestions(params);

      if (response.data.questions && response.data.questions.length > 0) {
        // Append new questions to existing ones (avoiding duplicates)
        const existingIds = new Set(allQuizQuestions.map(q => q.id));
        const newQuestions = response.data.questions.filter(q => !existingIds.has(q.id));

        if (newQuestions.length > 0) {
          setAllQuizQuestions(prev => [...prev, ...newQuestions]);
          console.log(`Preloaded ${newQuestions.length} new questions`);
        }
      }
    } catch (error) {
      console.error('Failed to preload next question batch:', error);
    } finally {
      setPreloadingNextBatch(false);
    }
  };

  // Fetch all quiz questions for quiz mode with spaced repetition
  const fetchAllQuizQuestions = async () => {
    try {
      setLoadingQuizQuestions(true);
      console.log('Fetching quiz questions...', groupsParam ? `for groups: ${groupsParam}` : 'all groups');

      // Include groups filter if present
      const params = { limit: 100, includeNew: true };
      if (groupsParam) {
        params.groups = groupsParam;
      }

      const response = await flashcardAPI.getAllQuizQuestions(params);
      console.log('Quiz questions response:', response.data);

      if (response.data.questions && response.data.questions.length > 0) {
        // Questions are already sorted by priority (wrong answers first, then by due date)
        console.log('Found', response.data.questions.length, 'quiz questions');
        setAllQuizQuestions(response.data.questions);
        setCurrentQuestion(response.data.questions[0]);
        setCurrentQuestionIndex(0);
        return true;
      } else {
        console.log('No quiz questions found');
        setAllQuizQuestions([]);
        setCurrentQuestion(null);
        return false;
      }
    } catch (error) {
      console.error('Failed to fetch quiz questions:', error);
      setAllQuizQuestions([]);
      setCurrentQuestion(null);
      return false;
    } finally {
      setLoadingQuizQuestions(false);
    }
  };

  // Switch study mode and refetch cards
  const switchStudyMode = async (mode) => {
    if (mode === studyMode) return;

    setStudyMode(mode);

    // Reset quiz states
    setCurrentQuestion(null);
    setQuizAnswer('');
    setShowQuizAnswer(false);

    if (mode === 'quiz') {
      // For quiz mode, fetch all available quiz questions
      // Don't depend on due cards - show quiz from any vocabulary
      await fetchAllQuizQuestions();
    } else {
      // For flashcard mode, fetch due cards
      await fetchDueCards(20, false);
    }
  };

  // Handle quiz answer submission
  const handleQuizAnswer = (answer) => {
    setQuizAnswer(answer);
    setShowQuizAnswer(true);
  };

  // Submit quiz answer in background without blocking UI
  const submitQuizAnswerInBackground = async (questionData, answerData, isCorrect) => {
    try {
      console.log('Submitting quiz answer in background:', {
        questionId: questionData.id,
        userAnswer: answerData.userAnswer,
        responseTime: answerData.responseTime,
        isCorrect: isCorrect
      });

      const result = await flashcardAPI.submitQuizAnswer(questionData.id, answerData);
      console.log('Quiz answer submitted successfully:', result);
    } catch (error) {
      console.error('Failed to submit quiz answer in background:', error);

      // Only show critical errors to user (avoid disrupting flow)
      if (error.message.includes('Network Error')) {
        console.warn('Network error submitting answer - this may affect spaced repetition scheduling');
      }
    }
  };

  // Handle quiz next (after seeing answer) - optimized for speed
  const handleQuizNext = () => {
    if (!showQuizAnswer || isRatingInProgress || !currentQuestion) return;

    setIsRatingInProgress(true);

    const isCorrect = compareQuizAnswers(quizAnswer, currentQuestion?.correct_answer);
    const responseTime = cardStartTime ? Date.now() - cardStartTime : 1000;

    // Prepare data for background submission
    const questionData = { ...currentQuestion };
    const answerData = {
      userAnswer: quizAnswer,
      responseTime: responseTime,
      cardId: null // No specific flashcard associated
    };

    // Update study stats immediately (optimistic update)
    setStudyStats(prev => ({
      ...prev,
      totalAnswers: prev.totalAnswers + 1,
      correctAnswers: prev.correctAnswers + (isCorrect ? 1 : 0),
      cardsStudied: prev.cardsStudied + 1
    }));

    // Move to next quiz question immediately
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < allQuizQuestions.length) {
      // Show next question immediately
      setCurrentQuestionIndex(nextIndex);
      setCurrentQuestion(allQuizQuestions[nextIndex]);
      setQuizAnswer('');
      setShowQuizAnswer(false);
      setCardStartTime(Date.now()); // Reset timer for next question
      setIsRatingInProgress(false);

      // Submit previous answer in background (non-blocking)
      submitQuizAnswerInBackground(questionData, answerData, isCorrect);

      // Preload more questions when we're getting close to the end (5 questions remaining)
      const questionsRemaining = allQuizQuestions.length - nextIndex;
      if (questionsRemaining <= 5 && !preloadingNextBatch) {
        preloadNextQuestionBatch();
      }
    } else {
      // Need to fetch more questions - this requires waiting
      const fetchAndContinue = async () => {
        try {
          // Submit current answer first
          await submitQuizAnswerInBackground(questionData, answerData, isCorrect);

          // Then fetch more questions
          await fetchAllQuizQuestions();
        } catch (error) {
          console.error('Error in fetch and continue:', error);
          // Try to fetch questions even if submission failed
          await fetchAllQuizQuestions();
        } finally {
          setIsRatingInProgress(false);
        }
      };

      fetchAndContinue();
    }
  };

  const handleCardRating = useCallback(async (rating) => {
    if (!currentCard || isRatingInProgress) {
      return;
    }

    setIsRatingInProgress(true);
    setFlashedRating(rating);

    // Set cardStartTime if it doesn't exist (for immediate rating)
    const startTime = cardStartTime || Date.now();
    const responseTime = Date.now() - startTime;

    // Store current card data before it changes (due to instant switching)
    const cardToReview = { ...currentCard };

    try {
      // Brief flash so shortcut/click choice is visible before advancing
      await new Promise((resolve) => setTimeout(resolve, RATING_FLASH_MS));
      setFlashedRating(null);

      await reviewCard(cardToReview.id, rating, responseTime);

      // Track this card for review if it was hard (rating <= 2) or if user wants to review
      const reviewedCard = {
        ...cardToReview,
        userRating: rating,
        wasHard: rating <= 2,
        reviewedAt: new Date().toISOString(),
        responseTime: responseTime
      };

      setReviewedCards(prev => [...prev, reviewedCard]);

      // Update stats
      let newCardsStudied = 0;
      setStudyStats(prev => {
        newCardsStudied = prev.cardsStudied + 1;
        return {
          ...prev,
          cardsStudied: newCardsStudied,
          totalAnswers: prev.totalAnswers + 1,
          correctAnswers: prev.correctAnswers + (rating >= 3 ? 1 : 0),
          newCards: prev.newCards + (cardToReview.state === 'new' ? 1 : 0),
          reviewCards: prev.reviewCards + (cardToReview.state !== 'new' ? 1 : 0),
        };
      });

      // Show review page after 10 cards
      if (newCardsStudied % 10 === 0) {
        setShowReview(true);
        return; // Don't continue to next card, show review first
      }

      // Reset for next card (this happens instantly now)
      setIsFlipped(false);
      setCardStartTime(null);

    } catch (error) {
      console.error('Failed to review card:', error);
    } finally {
      setFlashedRating(null);
      setIsRatingInProgress(false);
    }
  }, [currentCard, isRatingInProgress, cardStartTime, reviewCard]);

  // Keyboard shortcuts
  const handleKeyPress = useCallback((event) => {
    if (showSessionEnd || isRatingInProgress) {
      return;
    }

    const { key, code } = event;
    const isDigit1 = key === '1' || code === 'Digit1' || code === 'Numpad1';
    const isDigit2 = key === '2' || code === 'Digit2' || code === 'Numpad2';
    const isDigit3 = key === '3' || code === 'Digit3' || code === 'Numpad3';
    const isDigit4 = key === '4' || code === 'Digit4' || code === 'Numpad4';

    // Prevent default for all our shortcuts
    const shortcuts = ['Space', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Enter', 'KeyS', 'KeyE', 'KeyP', 'Escape'];
    if (
      shortcuts.includes(code) ||
      key === '1' || key === '2' || key === '3' || key === '4' ||
      key === ' ' || key === 's' || key === 'S' || key === 'e' || key === 'E' ||
      key === 'p' || key === 'P' || key === 'Escape'
    ) {
      event.preventDefault();
    }

    const handlers = shortcutHandlersRef.current;

    // Global shortcuts - E key for shortcuts
    if (code === 'KeyE' || key === 'e' || key === 'E') {
      setShowShortcutsHelp((prev) => !prev);
      return;
    }

    if (code === 'Space' || key === ' ') {
      if (studyMode === 'flashcard') {
        setIsFlipped((prev) => !prev);
      } else if (studyMode === 'quiz' && showQuizAnswer) {
        handlers.handleQuizNext();
      }
      return;
    }

    if (isDigit1) {
      if (studyMode === 'flashcard') {
        handlers.handleCardRating(2); // Hard
      } else if (studyMode === 'quiz' && currentQuestion && !showQuizAnswer) {
        if (currentQuestion.options?.length > 0) {
          handlers.handleQuizAnswer(currentQuestion.options[0]);
        }
      }
      return;
    }

    if (isDigit2) {
      if (studyMode === 'flashcard') {
        handlers.handleCardRating(3); // Good
      } else if (studyMode === 'quiz' && currentQuestion && !showQuizAnswer) {
        if (currentQuestion.options?.length > 1) {
          handlers.handleQuizAnswer(currentQuestion.options[1]);
        }
      }
      return;
    }

    if (isDigit3) {
      if (studyMode === 'flashcard') {
        handlers.handleCardRating(4); // Easy
      } else if (studyMode === 'quiz' && currentQuestion && !showQuizAnswer) {
        if (currentQuestion.options?.length > 2) {
          handlers.handleQuizAnswer(currentQuestion.options[2]);
        }
      }
      return;
    }

    if (isDigit4) {
      if (studyMode === 'quiz' && currentQuestion && !showQuizAnswer) {
        if (currentQuestion.options?.length > 3) {
          handlers.handleQuizAnswer(currentQuestion.options[3]);
        }
      }
      return;
    }

    if (code === 'Enter' || key === 'Enter') {
      if (studyMode === 'quiz' && showQuizAnswer) {
        handlers.handleQuizNext();
      }
      return;
    }

    if (code === 'KeyP' || key === 'p' || key === 'P') {
      if (studyMode === 'flashcard' && currentCard?.words?.word) {
        speakWord(currentCard.words.word);
      }
      return;
    }

    if (code === 'KeyS' || key === 's' || key === 'S') {
      handlers.handleSkipCard();
      return;
    }

    if (code === 'Escape' || key === 'Escape') {
      if (showShortcutsHelp) {
        setShowShortcutsHelp(false);
      } else {
        handlers.handleEndSession();
      }
    }
  }, [showSessionEnd, showShortcutsHelp, isRatingInProgress, studyMode, showQuizAnswer, currentQuestion, currentCard]);

  useKeyboardShortcuts(handleKeyPress);

  const handleSkipCard = () => {
    console.log('Skipping card');

    // Reset state for next card without rating
    setIsFlipped(false);
    setCardStartTime(null);

    // Update stats to show card was studied but not answered
    setStudyStats(prev => ({
      ...prev,
      cardsStudied: prev.cardsStudied + 1,
    }));

    // Actually skip to the next card
    skipCard();
  };


  const handleEndSession = async () => {
    if (!sessionStartTime) return;

    // Only end session if user actually studied cards
    if (studyStats.cardsStudied === 0) {
      // Just navigate back to dashboard if no cards were studied
      navigate('/dashboard');
      return;
    }

    const totalTime = Math.round((Date.now() - sessionStartTime) / 1000);

    try {
      await endSession({
        cardsStudied: studyStats.cardsStudied,
        newCards: studyStats.newCards,
        reviewCards: studyStats.reviewCards,
        totalTime,
        correctAnswers: studyStats.correctAnswers,
        totalAnswers: studyStats.totalAnswers,
      });

      // At session end, go directly to session complete (no review)
      setShowSessionEnd(true);
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  };

  // Keep shortcut handlers fresh without stale useCallback closures
  shortcutHandlersRef.current = {
    handleCardRating,
    handleSkipCard,
    handleEndSession,
    handleQuizAnswer,
    handleQuizNext,
  };

  // Show review screen
  if (showReview) {
    const hardCards = reviewedCards.filter(card => card.wasHard);

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                📚 Review Session
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Time to review the cards you found difficult
              </p>
            </div>

            {/* Hard Cards Section */}
            {hardCards.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                  <span className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 px-3 py-1 rounded-full text-sm font-medium mr-3">
                    Difficult Cards ({hardCards.length})
                  </span>
                </h3>

                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="table-header">Word</th>
                        <th className="table-header">Definition</th>
                        <th className="table-header">Example</th>
                        <th className="table-header">Vietnamese</th>
                        <th className="table-header">Rating</th>
                        <th className="table-header">Response Time</th>
                      </tr>
                    </thead>
                    <tbody className="table-body">
                      {hardCards.map((card, index) => (
                        <tr key={`hard-${index}`}>
                          <td className="table-cell">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {card.words.word}
                              </span>
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                {card.words.ipa_pronunciation}
                              </span>
                            </div>
                          </td>
                          <td className="table-cell max-w-xs">
                            <p className="text-gray-700 dark:text-gray-300 text-sm break-words whitespace-pre-wrap">
                              {card.words.definition}
                            </p>
                          </td>
                          <td className="table-cell max-w-xs">
                            <p className="text-gray-600 dark:text-gray-400 text-sm break-words whitespace-pre-wrap">
                              "{card.words.example_sentence}"
                            </p>
                          </td>
                          <td className="table-cell max-w-xs">
                            <p className="text-gray-600 dark:text-gray-400 text-sm break-words whitespace-pre-wrap">
                              {card.words.vietnamese_translation}
                            </p>
                          </td>
                          <td className="table-cell">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              card.userRating === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                              card.userRating === 1 ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                              'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            }`}>
                              {card.userRating === 2 ? 'Hard' : card.userRating === 1 ? 'Again' : 'Good'}
                            </span>
                          </td>
                          <td className="table-cell">
                            <span className="text-gray-500 dark:text-gray-400 text-sm">
                              {Math.round(card.responseTime / 1000)}s
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* No Hard Cards Message */}
            {hardCards.length === 0 && (
              <div className="text-center mb-8 p-8 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                  🎉 Great Job!
                </h3>
                <p className="text-green-700 dark:text-green-300">
                  You didn't find any cards difficult in this session. Keep up the excellent work!
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => {
                  setShowReview(false);
                  // Keep reviewed cards for final session review
                  // Reset card flipping state and continue
                  setIsFlipped(false);
                  setCardStartTime(null);
                  setIsRatingInProgress(false);
                }}
                className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition-colors"
              >
                Continue Studying
              </button>
              <button
                onClick={() => {
                  setShowReview(false);
                  setShowSessionEnd(true);
                }}
                className="bg-green-600 text-white py-2 px-6 rounded-md hover:bg-green-700 transition-colors"
              >
                Finish Session
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-gray-600 text-white py-2 px-6 rounded-md hover:bg-gray-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show session end screen (only after actual studying)
  if (showSessionEnd && studyStats.cardsStudied > 0) {
    const totalTime = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
    const accuracy = studyStats.totalAnswers > 0 ?
      Math.round((studyStats.correctAnswers / studyStats.totalAnswers) * 100) : 0;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="text-center">
            <Check className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Study Session Complete!
            </h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-300">Cards Studied:</span>
                <span className="font-semibold">{studyStats.cardsStudied}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-300">Accuracy:</span>
                <span className="font-semibold text-green-600">{accuracy}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-300">Time:</span>
                <span className="font-semibold">{Math.floor(totalTime / 60)}m {totalTime % 60}s</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No cards available (only show this if not in quiz mode or quiz has no questions)
  if (!loading && !loadingQuizQuestions &&
      ((studyMode === 'flashcard' && (!dueCards || dueCards.length === 0)) ||
       (studyMode === 'quiz' && (!allQuizQuestions || allQuizQuestions.length === 0)))) {
    return (
      <>
        <Helmet>
          <title>Study Session - Magic English</title>
        </Helmet>

        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Header with Mode Toggle */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Study
                </h1>

                {/* Mode Toggle */}
                <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => switchStudyMode('flashcard')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      studyMode === 'flashcard'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    Flashcards
                  </button>
                  <button
                    onClick={() => switchStudyMode('quiz')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      studyMode === 'quiz'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    Quiz
                  </button>
                </div>
              </div>

              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 text-gray-600 hover:text-red-600 dark:text-gray-300 dark:hover:text-red-400"
                title="Back to Dashboard"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* No Cards Message */}
            <div className="flex items-center justify-center">
              <div className="text-center">
                <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {studyMode === 'quiz' ? 'No Quiz Questions Available' : 'No Cards Due'}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {studyMode === 'quiz'
                    ? 'No quiz questions found. Try adding more words to your vocabulary or generate quiz questions for your existing words.'
                    : 'Great job! You\'ve completed all your reviews for today.'
                  }
                </p>
                <div className="flex gap-4 justify-center">
                  {studyMode === 'quiz' && (
                    <button
                      onClick={() => switchStudyMode('flashcard')}
                      className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Switch to Flashcards
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Show loading spinner
  if (loading || loadingQuizQuestions ||
      (studyMode === 'flashcard' && !currentCard) ||
      (studyMode === 'quiz' && !currentQuestion)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Study Session - Magic English</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Study Session
              </h1>

              {/* Mode Toggle */}
              <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => switchStudyMode('flashcard')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    studyMode === 'flashcard'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  Flashcards
                </button>
                <button
                  onClick={() => switchStudyMode('quiz')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    studyMode === 'quiz'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  Quiz
                </button>
              </div>

              <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-300">
                <div className="flex items-center space-x-1">
                  <BookOpen className="h-4 w-4" />
                  <span>{studyStats.cardsStudied}</span>
                </div>
                <div className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 font-semibold">
                  <Flame className="h-4 w-4" />
                  <span>
                    {studyMode === 'flashcard'
                      ? `${cardsRemaining} remaining`
                      : `${allQuizQuestions.length - currentQuestionIndex - 1} remaining`}
                  </span>
                </div>
                <div className="flex items-center space-x-1 text-purple-600 dark:text-purple-400">
                  <span className="text-xs">Review in: {10 - (studyStats.cardsStudied % 10)} cards</span>
                </div>
                {preloadingNextBatch && (
                  <div className="flex items-center space-x-1 text-blue-500 dark:text-blue-400">
                    <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full"></div>
                    <span className="text-xs">Loading more...</span>
                  </div>
                )}
                <div className="flex items-center space-x-1">
                  <BarChart3 className="h-4 w-4" />
                  <span>
                    {studyStats.totalAnswers > 0 ?
                      Math.round((studyStats.correctAnswers / studyStats.totalAnswers) * 100) : 0}%
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {sessionStartTime ?
                      Math.floor((Date.now() - sessionStartTime) / 60000) : 0}m
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowShortcutsHelp(true)}
                className="p-2 text-gray-600 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
                title="Show Keyboard Shortcuts (E)"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
              <button
                onClick={handleSkipCard}
                className="p-2 text-gray-600 hover:text-yellow-600 dark:text-gray-300 dark:hover:text-yellow-400"
                title="Skip Card (S)"
              >
                <SkipForward className="h-5 w-5" />
              </button>
              <button
                onClick={handleEndSession}
                className="p-2 text-gray-600 hover:text-red-600 dark:text-gray-300 dark:hover:text-red-400"
                title="End Session (ESC)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="space-y-6">
            {studyMode === 'flashcard' ? (
              <FlashCard
                card={currentCard}
                isFlipped={isFlipped}
                onFlip={() => setIsFlipped(!isFlipped)}
                onRate={handleCardRating}
                showRating={true}
                isRatingInProgress={isRatingInProgress}
                flashedRating={flashedRating}
              />
            ) : (
              // Quiz Mode
              currentQuestion ? (
                <QuizQuestion
                  question={currentQuestion}
                  onAnswer={handleQuizAnswer}
                  showAnswer={showQuizAnswer}
                  onNext={handleQuizNext}
                />
              ) : (
                <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
                  <div className="text-yellow-600 dark:text-yellow-400 mb-4">
                    <HelpCircle className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    No Quiz Questions Available
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    No quiz questions found for your vocabulary. You can still study with flashcards.
                  </p>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => switchStudyMode('flashcard')}
                      className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Switch to Flashcards
                    </button>
                  </div>
                </div>
              )
            )}

            {/* Help hint */}
            <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
              Press <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">E</kbd> or{' '}
              <button
                onClick={() => setShowShortcutsHelp(true)}
                className="underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                click here
              </button> for keyboard shortcuts
              {studyMode === 'quiz' && (
                <span className="ml-4">
                  • <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">1-4</kbd> to select options
                  • <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Space/Enter</kbd> to continue
                </span>
              )}
              {studyMode === 'flashcard' && (
                <span className="ml-4">
                  • <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">1-3</kbd> for rating
                  • <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">P</kbd> to pronounce
                  • <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Space</kbd> to flip
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsHelp && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowShortcutsHelp(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowShortcutsHelp(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 pb-1">
                  Flashcard Mode
                </h4>
                <div className="flex justify-between">
                  <span>Flip card:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Space</kbd>
                </div>
                {studyMode === 'quiz' && (
                  <div className="flex justify-between">
                    <span>Continue (after answer):</span>
                    <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Space/Enter</kbd>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Hard:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">1</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Good:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">2</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Easy:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">3</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Pronounce:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">P</kbd>
                </div>

                <h4 className="font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 pb-1 mt-4">
                  Quiz Mode
                </h4>
                <div className="flex justify-between">
                  <span>Select option 1:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">1</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Select option 2:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">2</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Select option 3:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">3</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Select option 4:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">4</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Continue (after answer):</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Space/Enter</kbd>
                </div>

                <h4 className="font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 pb-1 mt-4">
                  Actions
                </h4>
                <div className="flex justify-between">
                  <span>Skip card:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">S</kbd>
                </div>

                <h4 className="font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 pb-1 mt-4">
                  General
                </h4>
                <div className="flex justify-between">
                  <span>End session:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Esc</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Show shortcuts:</span>
                  <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">E</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Study;