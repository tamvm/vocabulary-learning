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
  isStuckAfterTranscript,
  resumeLessonPrepareIfNeeded,
  vocabSnapshotNeedsPolish,
  formatStepEta,
  PREPARE_STALE_MS,
  TRANSCRIPT_HANDOFF_STALE_MS,
  PREPARE_STATUS,
  PREPARE_STEPS,
  runLessonPreparePipeline,
  buildPrepareJobView,
  patchLessonPrepare,
  vocabPersistErrorMessage,
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
  prepare_progress: `0/1@${Math.floor((Date.now() - 20000) / 1000)}`,
  transcript_text: 'A'.repeat(80),
  updated_at: new Date().toISOString(),
});
assert(runningJob.steps[0].state === 'done', 'transcript done when text exists');
assert(runningJob.steps[1].state === 'running', 'vocab running');
assert(runningJob.steps[1].progress === '0/1', 'vocab progress hides start stamp');
assert(runningJob.steps[1].percent >= 40, 'vocab percent moves with wall time on 0/1');
assert(runningJob.steps[1].etaSeconds < 40, 'vocab ETA counts down below full budget');
assert(runningJob.steps[1].etaSeconds >= 5, 'vocab ETA has a floor');
assert(runningJob.steps[2].state === 'queued', 'highlights queued');
assert(runningJob.steps[3].id === 'quiz', 'quiz listed');

const laterJob = buildPrepareJobView(
  {
    prepare_status: 'pending',
    prepare_step: 'highlights',
    prepare_progress: `0/1@${Math.floor((Date.now() - 30000) / 1000)}`,
    transcript_text: 'A'.repeat(80),
    vocabulary_snapshot: [{ word: 'orbit' }],
    updated_at: new Date(Date.now() - 30000).toISOString(),
  },
  Date.now()
);
assert(laterJob.steps[2].state === 'running', 'highlights running');
assert(laterJob.steps[2].percent > 20, 'highlights percent rises with elapsed');
assert(
  laterJob.steps[2].etaSeconds < Math.ceil(75000 / 1000),
  'highlights ETA is not a stuck full-budget constant'
);

const leftoverQuiz = buildPrepareJobView({
  prepare_status: 'pending',
  prepare_step: 'transcript',
  transcript_text: 'A'.repeat(80),
  quiz_questions: [{ question: 'Q', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
  updated_at: new Date().toISOString(),
});
assert(leftoverQuiz.steps[1].state === 'running', 'vocab runs next once transcript exists');
assert(leftoverQuiz.steps[3].state === 'queued', 'quiz leftover hidden until vocab exists');

const handoffJob = buildPrepareJobView({
  prepare_status: 'pending',
  prepare_step: 'transcript',
  transcript_text: 'A'.repeat(80),
  updated_at: new Date().toISOString(),
});
assert(handoffJob.steps[0].state === 'done', 'transcript done from saved captions');
assert(handoffJob.steps[1].state === 'running', 'vocab is running after transcript, not queued');
assert(handoffJob.step === PREPARE_STEPS.vocab, 'job step advances to vocab after transcript');
assert(handoffJob.steps[2].state === 'queued', 'highlights wait for vocab');

const emptyVocabJob = buildPrepareJobView({
  prepare_status: 'ready',
  prepare_step: 'done',
  transcript_text: 'A'.repeat(80),
  vocabulary_snapshot: [],
  updated_at: new Date().toISOString(),
});
assert(emptyVocabJob.steps[1].state === 'queued', 'empty vocab array is not vocab-done');

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
assert(
  patches.some((p) => p.transcript_text && p.prepare_step === PREPARE_STEPS.vocab),
  'saving transcript immediately starts the vocab step'
);
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
    // Function-word-only transcript → no local candidates, forces AI recall path.
    content: 'The a an of to and or but if so as at by for from in on.',
    title: 'Talk',
    cues: [{ start: 0, end: 1, text: 'the a an of to' }],
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

resetPrepareJobsForTests();
assert(
  resumeLessonPrepareIfNeeded({
    lesson: {
      id: 'empty-vocab-ready',
      prepare_status: 'ready',
      transcript_text: 'A'.repeat(200),
      vocabulary_snapshot: [],
      updated_at: new Date(Date.now() - 120000).toISOString(),
    },
    run: () => {},
  }) === true,
  'repairs ready lessons that have an empty vocabulary snapshot'
);

resetPrepareJobsForTests();
assert(
  resumeLessonPrepareIfNeeded({
    lesson: {
      id: 'junk-vocab-ready',
      prepare_status: 'ready',
      transcript_text:
        "there's a bubble and the pricking of the bubble when wealth must be sold. " +
        'A'.repeat(80),
      vocabulary_snapshot: [
        { word: 'ther', definition: 'not a real word' },
        { word: 'bubbl', definition: 'broken stem' },
        { word: 'prick', definition: 'wrong stem' },
      ],
      updated_at: new Date(Date.now() - 120000).toISOString(),
    },
    run: () => {},
  }) === true,
  'repairs ready lessons whose vocab words are not in the transcript'
);

const stuckLesson = {
  id: 'stuck-after-transcript',
  prepare_status: 'pending',
  prepare_step: 'transcript',
  transcript_text: 'A'.repeat(80),
  updated_at: new Date(Date.now() - TRANSCRIPT_HANDOFF_STALE_MS - 50).toISOString(),
};
assert(isStuckAfterTranscript(stuckLesson) === true, 'detects pending job stuck after transcript');
assert(
  isStuckAfterTranscript({
    ...stuckLesson,
    updated_at: new Date().toISOString(),
  }) === false,
  'fresh transcript handoff is not stuck'
);

resetPrepareJobsForTests();
let forcedStarts = 0;
assert(
  enqueueLessonPrepare({
    lesson: { id: stuckLesson.id },
    run: () => new Promise(() => {}),
  }) === true,
  'hangs first worker'
);
assert(isPrepareJobInFlight(stuckLesson.id) === true, 'hung worker stays in-flight');
assert(
  resumeLessonPrepareIfNeeded({
    lesson: stuckLesson,
    run: () => {
      forcedStarts += 1;
    },
  }) === true,
  'force-resumes hung job stuck after transcript'
);
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
assert(forcedStarts === 1, 'forced resume actually starts vocab worker');

const progressPatches = [];
let updateCalls = 0;
const missingProgressSupabase = {
  from() {
    return {
      update(patch) {
        updateCalls += 1;
        const hasProgress = Object.prototype.hasOwnProperty.call(patch, 'prepare_progress');
        if (hasProgress && updateCalls === 1) {
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({
                    error: { message: "Could not find the 'prepare_progress' column" },
                  });
                },
              };
            },
          };
        }
        progressPatches.push({ ...patch });
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
await patchLessonPrepare(missingProgressSupabase, 'user-1', 'lesson-col', {
  prepare_step: PREPARE_STEPS.vocab,
  prepare_progress: '0/1@1',
});
assert(updateCalls === 2, 'retries patch without the missing column only');
assert(
  progressPatches.some((p) => p.prepare_step === PREPARE_STEPS.vocab && !('prepare_progress' in p)),
  'still writes prepare_step when prepare_progress column is missing'
);

assert(
  /15_video_lessons_checkpoint\.sql/i.test(
    vocabPersistErrorMessage({
      message:
        "Could not find the 'vocabulary_snapshot' column of 'video_lessons' in the schema cache",
    })
  ),
  'schema-cache persist error names the checkpoint SQL'
);

const schemaPatches = [];
const schemaFailSupabase = {
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
        schemaPatches.push({ ...patch });
        return {
          eq() {
            return {
              eq() {
                if (Object.prototype.hasOwnProperty.call(patch, 'vocabulary_snapshot')) {
                  return Promise.resolve({
                    error: {
                      message:
                        "Could not find the 'vocabulary_snapshot' column of 'video_lessons' in the schema cache",
                    },
                  });
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };
  },
};
const schemaFailResult = await runLessonPreparePipeline({
  supabase: schemaFailSupabase,
  userId: 'user-1',
  lesson: {
    id: 'lesson-schema',
    video_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    user_cefr_level: 'B2',
    transcript_text: 'The payload to orbit needs a heat shield ablation for Mars. '.repeat(4),
    transcript_cues: [{ start: 0, end: 1, text: 'payload to orbit' }],
  },
  fetchTranscript: async () => ({ success: false, error: 'should not fetch' }),
  analyzeVocab: async () => ({ vocabulary: [{ word: 'payload', definition: 'cargo' }] }),
  summarize: async () => {
    throw new Error('highlights must not run after vocab persist failure');
  },
  generateQuiz: async () => {
    throw new Error('quiz must not run after vocab persist failure');
  },
});
assert(schemaFailResult.ok === false, 'schema-cache vocab persist fails the job');
assert(schemaFailResult.step === PREPARE_STEPS.vocab, 'stays on vocab when snapshot cannot save');
assert(
  schemaPatches.some(
    (p) => p.prepare_status === PREPARE_STATUS.failed && p.prepare_step === PREPARE_STEPS.vocab
  ),
  'marks prepare failed instead of ready when snapshot cannot save'
);
assert(
  !schemaPatches.some((p) => p.prepare_status === PREPARE_STATUS.ready),
  'does not mark ready after vocabulary_snapshot patch failure'
);

console.log('test_lesson_prepare_job: OK');
