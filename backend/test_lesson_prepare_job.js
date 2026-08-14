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
  PREPARE_STALE_MS,
  PREPARE_STATUS,
  PREPARE_STEPS,
  runLessonPreparePipeline,
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
  }) === PREPARE_STATUS.failed,
  'stale pending'
);
assert(
  resolveSummaryStatus({
    summary: '- a takeaway',
    transcript_text: 'hello world',
  }) === 'ready',
  'summary ready from text'
);

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
assert(steps.join('>') === 'transcript>vocab>highlights>quiz', 'step order');
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

console.log('test_lesson_prepare_job: OK');
