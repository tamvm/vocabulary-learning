import axios from 'axios'

// Create axios instance with default config
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    || (import.meta.env.PROD ? '/api' : 'http://localhost:3012/api'),
  timeout: 120000, // Increased to 2 minutes for content analysis
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    // Get token from Supabase auth
    if (typeof window !== 'undefined') {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      )

      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    let message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Something went wrong'

    // Gateway / client timeouts — keep messages endpoint-agnostic (this interceptor is global)
    if (status === 502 || status === 504) {
      message =
        error.response?.data?.message ||
        'The server took too long to respond (gateway timeout). Please try again.'
    } else if (error.code === 'ECONNABORTED') {
      message = 'Request timed out. Please try again or use a shorter input.'
    }

    // Handle 401 errors (unauthorized)
    if (status === 401) {
      // Redirect to login page or refresh token
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }

    return Promise.reject(new Error(message))
  }
)

// API endpoints
export const authAPI = {
  signUp: (email, password, fullName) =>
    api.post('/users/signup', { email, password, fullName }),

  signIn: (email, password) =>
    api.post('/users/signin', { email, password }),

  signOut: () =>
    api.post('/users/signout'),

  getProfile: () =>
    api.get('/users/me'),

  updateProfile: (data) =>
    api.put('/users/me', data),

  refreshToken: (refreshToken) =>
    api.post('/users/refresh', { refresh_token: refreshToken }),
}

export const wordsAPI = {
  getWords: (params) =>
    api.get('/words', { params }),

  getAll: async ({ search, limit, offset, groups, sortBy, sortOrder, collection } = {}) => {
    const params = new URLSearchParams()
    if (search) params.append('q', search)
    if (limit) params.append('limit', limit)
    if (offset) params.append('offset', offset)
    if (sortBy) params.append('sortBy', sortBy)
    if (sortOrder) params.append('sortOrder', sortOrder)
    if (collection) params.append('collection', collection)

    // Add groups parameter for filtering
    if (groups && groups.length > 0) {
      params.append('groups', groups.join(','))
    }

    const response = await api.get(`/words?${params.toString()}`)
    return response.data
  },

  getWord: (id) =>
    api.get(`/words/${id}`),

  createWord: (data) =>
    api.post('/words', data),

  updateWord: (id, data) =>
    api.put(`/words/${id}`, data),

  deleteWord: (id) =>
    api.delete(`/words/${id}`),

  bulkOperation: (data) =>
    api.post('/words/bulk', data),

  generateQuizQuestions: (data) =>
    api.post('/words/generate-quiz-questions', data),
}

export const aiAPI = {
  analyzeWord: (word, options = {}) =>
    api.post('/ai/analyze-word', { word, ...options }),

  analyzeSentence: (sentence) =>
    api.post('/ai/analyze-sentence', { sentence }),

  analyzeContent: (data) => {
    // Check if we have a file upload (FormData)
    if (data.file && data.file instanceof FormData) {
      // For file uploads, we need to use FormData and adjust headers
      return api.post('/ai/analyze-content', data.file, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        // Increase timeout for file processing
        timeout: 180000, // 3 minutes for file uploads
      })
    } else {
      // Regular URL or text analysis
      return api.post('/ai/analyze-content', data)
    }
  },

  chat: (message, conversationId) =>
    api.post('/ai/chat', { message, conversationId }),

  getConfig: () =>
    api.get('/ai/config'),

  testConnection: () =>
    api.post('/ai/test-connection'),
}

export const profileAPI = {
  getProfile: () =>
    api.get('/profile'),

  recordActivity: (data) =>
    api.post('/profile/activity', data),

  updateGoals: (data) =>
    api.put('/profile/goals', data),

  getActivityHistory: (days = 30) =>
    api.get('/profile/activity-history', { params: { days } }),

  useStreakFreeze: () =>
    api.post('/profile/use-freeze'),

  updateCefrLevel: (cefrLevel) =>
    api.put('/profile/cefr-level', { cefrLevel }),
}

export const flashcardAPI = {
  getDueCards: (params = {}) =>
    api.get('/flashcards/due', { params }),

  getStats: () =>
    api.get('/flashcards/stats'),

  getProgress: (days = 30) =>
    api.get('/flashcards/progress', { params: { days } }),

  startSession: () =>
    api.post('/flashcards/session/start'),

  endSession: (sessionId, sessionData) =>
    api.put(`/flashcards/session/${sessionId}/end`, sessionData),

  reviewCard: (cardId, data) =>
    api.post(`/flashcards/${cardId}/review`, data),

  getQuizQuestions: (cardId, params = {}) =>
    api.get(`/flashcards/${cardId}/quiz`, { params }),

  getAllQuizQuestions: (params = {}) =>
    api.get('/flashcards/quiz-questions', { params }),

  submitQuizAnswer: (questionId, data) =>
    api.post(`/flashcards/quiz/${questionId}/answer`, data),

  deleteQuizQuestion: (questionId) =>
    api.delete(`/flashcards/quiz-questions/${questionId}`),
}

export const groupsAPI = {
  getAll: async () => {
    const response = await api.get('/groups')
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/groups/${id}`)
    return response.data
  },

  create: async (groupData) => {
    const response = await api.post('/groups', groupData)
    return response.data
  },

  update: async (id, groupData) => {
    const response = await api.put(`/groups/${id}`, groupData)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/groups/${id}`)
    return response.data
  },
}

export const youtubeAPI = {
  analyze: (videoUrl, options = {}) =>
    api.post(
      '/youtube/analyze',
      { videoUrl, lessonId: options.lessonId },
      { timeout: 180000 }
    ),

  generateQuiz: (videoUrl, options = {}) =>
    api.post(
      '/youtube/quiz',
      {
        videoUrl,
        lessonId: options.lessonId,
        vocabularyWordIds: options.vocabularyWordIds,
        vocabularyWords: options.vocabularyWords,
        questionCount: options.questionCount,
      },
      { timeout: 180000 }
    ),

  complete: (data) =>
    api.post('/youtube/complete', data),

  markKnown: (word, known) =>
    api.post('/youtube/mark-known', { word, known }),

  getHistory: () =>
    api.get('/youtube/history'),

  getLesson: (id) =>
    api.get(`/youtube/lessons/${id}`),

  generateHighlights: (id) =>
    api.post(`/youtube/lessons/${id}/highlights`, {}, { timeout: 180000 }),

  saveProgress: (id, data) =>
    api.patch(`/youtube/lessons/${id}/progress`, data),

  deleteLesson: (id) =>
    api.delete(`/youtube/lessons/${id}`),

  clearHistory: () =>
    api.delete('/youtube/history'),
}

export default api