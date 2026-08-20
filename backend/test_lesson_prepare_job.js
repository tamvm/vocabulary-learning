/**
 * Unit checks for Learn prepare pipeline (no network).
 * Run: node test_lesson_prepare_job.js
 */
import {
  enqueueLessonPrepare,
  isPrepareJobInFlight,
  resetPrepareJobsForTests,
  resolvePrepareStatus,
  resolveSummaryStatus,
  isPrepareStale,
  resumeLessonPrepareIfNeeded,
  vocabSnapshotNeedsPolish,
  formatStepEta,
  PREPARE_STALE_MS,
  PREPARE_STATUS,
  PREPARE_STEPS,
  runLessonPreparePipeline,
  buildPrepareJobView,
  VOCAB_SAMPLE_CHARS,
} from './src/services/lessonPrepareJob.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

resetPrepareJobsForTests();

assert(resolvePrepareStatus({ prepare_status: 'ready' }) === PREPARE_STATUS.ready, 'ready');
assert(
  resolvePrepareStatus({
    prepare_status: 'pending',
    updated_at: new Date().toISOString(),
  }) === PREPARE_STATUS.pending,
  'fresh pending'
);
assert(
  resolvePrepareStatus({
    prepare_status: 'pending',
    updated_at: new Date(Date.now() - PREPARE_STALE_MS - 50).toISOString(),
  }) === PREPARE_STATUS.pending,
  'stale pending stays pending so workers can resume'
);
assert(
  isPrepareStale({
    prepare_status: 'pending',
    updated_at: new Date(Date.now() - PREPARE_STALE_MS - 50).toISOString(),
  }) === true,
  'stale helper detects dead workers'
);
assert(formatStepEta(45) === '~45s', 'eta seconds');
assert(formatStepEta(90) === '~2 min', 'eta minutes');
assert(
  vocabSnapshotNeedsPolish([
    { word: 'orbit', notes: 'Auto-picked from the transcript; definition pending polish', tags: ['candidate'] },
  ]) === true,
  'stub vocab needs polish'
);
assert(
  resolveSummaryStatus({
    summary: '- a takeaway',
    transcript_text: 'hello world',
  }) === 'ready',
  'summary ready from text'
);

const runningJob = buildPrepareJobView({
  prepare_status: 'pending',
  prepare_step: 'vocab',
  prepare_progress: `2/3@${Math.floor((Date.now() - 40000) / 1000)}`,
  transcript_text: 'A'.repeat(80),
  updated_at: new Date().toISOString(),
});
assert(runningJob.steps[0].state === 'done', 'transcript done when text exists');
assert(runningJob.steps[1].state === 'running', 'vocab running');
assert(runningJob.steps[1].progress === '2/3', 'vocab progress hides start stamp');
assert(runningJob.steps[1].percent === 67, 'vocab percent from chunks');
assert(runningJob.steps[1].etaSeconds >= 5, 'vocab ETA uses step start stamp');
assert(runningJob.steps[2].state === 'queued', 'highlights queued');
assert(runningJob.steps[3].id === 'quiz', 'quiz listed');

const leftoverQuiz = buildPrepareJobView({
  prepare_status: 'pending',
  prepare_step: 'transcript',
  transcript_text: 'A'.repeat(80),
  quiz_questions: [{ question: 'Q', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
  updated_at: new Date().toISOString(),
});
assert(leftoverQuiz.steps[1].state === 'queued', 'vocab not done from leftover quiz');
assert(leftoverQuiz.steps[3].state === 'queued', 'quiz leftover hidden until vocab exists');

const steps = [];
const patches = [];
const supabase = {
  from() {
    return {
      select() {
        return {
          eq() {
            return {
              eq() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      },
      update(patch) {
        patches.push({ ...patch });
        return {
          eq() {
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };
  },
};

const result = await runLessonPreparePipeline({
  supabase,
  userId: 'user-1',
  lesson: {
    id: 'lesson-1',
    video_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    user_cefr_level: 'B1',
  },
  fetchTranscript: async () => {
    steps.push('transcript');
    return {
      success: true,
      content: 'A'.repeat(200),
      title: 'Talk',
      cues: [{ start: 0, end: 1, text: 'hi' }],
      chapters: [],
      videoInfo: { duration: 60, thumbnail: null },
      provider: 'transcript24',
    };
  },
  analyzeVocab: async () => {
    steps.push('vocab');
    return { vocabulary: [{ word: 'orbit', definition: 'path' }] };
  },
  summarize: async () => {
    steps.push('highlights');
    return { summary: '- rockets\n- mars', chapters: [] };
  },
  generateQuiz: async ({ vocabularyWords }) => {
    steps.push('quiz');
    assert(vocabularyWords.includes('orbit'), 'quiz uses vocab words');
    return [{ question: 'Q', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }];
  },
});

assert(result.ok === true, 'pipeline ok');
assert(steps.includes('transcript') && steps.includes('vocab'), 'transcript then vocab');
assert(steps.includes('highlights') && steps.includes('quiz'), 'highlights and quiz both ran');
assert(patches.some((p) => p.prepare_step === PREPARE_STEPS.done), 'marks done');
assert(patches.some((p) => p.prepare_status === PREPARE_STATUS.ready), 'marks ready');

resetPrepareJobsForTests();
let started = 0;
assert(
  enqueueLessonPrepare({
    lesson: { id: 'lesson-2' },
    run: () => {
      started += 1;
    },
  }) === true,
  'enqueue once'
);
assert(isPrepareJobInFlight('lesson-2') === true, 'in flight');
assert(
  enqueueLessonPrepare({
    lesson: { id: 'lesson-2' },
    run: () => {
      started += 1;
    },
  }) === false,
  'dedupe'
);
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
assert(started === 1, 'ran once');

assert(VOCAB_SAMPLE_CHARS >= 12000, 'vocab sample covers more than a short greeting');

const retryPatches = [];
const retrySupabase = {
  from() {
    return {
      select() {
        return {
          eq() {
            return {
              eq() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      },
      update(patch) {
        retryPatches.push({ ...patch });
        return {
          eq() {
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };
  },
};

let vocabCalls = 0;
const retryResult = await runLessonPreparePipeline({
  supabase: retrySupabase,
  userId: 'user-1',
  lesson: {
    id: 'lesson-retry',
    video_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    user_cefr_level: 'C1',
  },
  fetchTranscript: async () => ({
    success: true,
    content: 'A'.repeat(200),
    title: 'Talk',
    cues: [{ start: 0, end: 1, text: 'hi' }],
    chapters: [],
    videoInfo: { duration: 60, thumbnail: null },
    provider: 'transcript24',
  }),
  analyzeVocab: async (_text, _cefr, options = {}) => {
    vocabCalls += 1;
    if (!options.preferRecall) return { vocabulary: [] };
    return { vocabulary: [{ word: 'payload', definition: 'cargo' }] };
  },
  summarize: async () => ({ summary: '- one', chapters: [] }),
  generateQuiz: async () => [{ question: 'Q', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
});
assert(retryResult.ok === true, 'retry pipeline ok');
assert(vocabCalls === 2, 'retries empty vocab with preferRecall');
assert(
  retryPatches.some(
    (p) =>
      Array.isArray(p.vocabulary_snapshot) &&
      p.vocabulary_snapshot.some((item) => item.word === 'payload')
  ),
  'persists vocab from recall retry'
);

let fetchedCached = 0;
const cachedPatches = [];
const cachedSupabase = {
  from() {
    return {
      select() {
        return {
          eq() {
            return {
              eq() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      },
      update(patch) {
        cachedPatches.push({ ...patch });
        return {
          eq() {
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };
  },
};
const cachedResult = await runLessonPreparePipeline({
  supabase: cachedSupabase,
  userId: 'user-1',
  lesson: {
    id: 'cached-transcript',
    video_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    transcript_text: 'A'.repeat(200),
    user_cefr_level: 'B2',
  },
  fetchTranscript: async () => {
    fetchedCached += 1;
    throw new Error('should skip cached transcript');
  },
  analyzeVocab: async (_text, _cefr, options = {}) => {
    options.onProgress?.({
      totalChunks: 1,
      currentChunk: 0,
      stubs: [
        {
          word: 'bubble',
          tags: ['candidate'],
          notes: 'Auto-picked from the transcript; definition pending polish',
        },
      ],
    });
    return { vocabulary: [{ word: 'bubble', definition: 'market frenzy' }] };
  },
  summarize: async () => ({ summary: '- one', chapters: [] }),
  generateQuiz: async () => [{ question: 'Q', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
});
assert(cachedResult.ok === true, 'cached transcript pipeline ok');
assert(fetchedCached === 0, 'does not re-fetch a cached transcript');
assert(
  cachedPatches.some(
    (p) =>
      Array.isArray(p.vocabulary_snapshot) &&
      p.vocabulary_snapshot.some((item) => item.word === 'bubble')
  ),
  'persists vocab stubs then definitions'
);

resetPrepareJobsForTests();
assert(
  resumeLessonPrepareIfNeeded({
    lesson: { id: 'idle-lesson', prepare_status: 'idle' },
    run: () => {},
  }) === false,
  'does not resume idle lessons'
);
assert(
  resumeLessonPrepareIfNeeded({
    lesson: { id: 'orphan-lesson', prepare_status: 'pending' },
    run: () => {},
  }) === true,
  'resumes pending jobs that are not in-flight'
);

console.log('test_lesson_prepare_job: OK');
