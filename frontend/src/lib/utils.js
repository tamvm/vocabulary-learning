import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(new Date(date))
}

export function formatRelativeTime(date) {
  const now = new Date()
  const targetDate = new Date(date)
  const diffInMs = now - targetDate
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

  if (diffInDays === 0) {
    return 'Today'
  } else if (diffInDays === 1) {
    return 'Yesterday'
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7)
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`
  } else {
    const months = Math.floor(diffInDays / 30)
    return `${months} month${months > 1 ? 's' : ''} ago`
  }
}

export function capitalizeFirst(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function truncateText(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + '...'
}

export function debounce(func, wait, immediate) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      timeout = null
      if (!immediate) func(...args)
    }
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) func(...args)
  }
}

export function throttle(func, limit) {
  let inThrottle
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

export function downloadJSON(data, filename = 'data.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result)
        resolve(json)
      } catch (error) {
        reject(new Error('Invalid JSON file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    return new Promise((resolve, reject) => {
      try {
        document.execCommand('copy') ? resolve() : reject()
      } catch (error) {
        reject(error)
      } finally {
        document.body.removeChild(textArea)
      }
    })
  }
}

export function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export function parseCSV(csvText) {
  const lines = csvText.split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  const data = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
    const row = {}

    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })

    data.push(row)
  }

  return data
}

export function getCefrColor(level) {
  const colors = {
    A1: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    A2: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    B1: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    B2: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    C1: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    C2: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  }
  return colors[level] || 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
}

export function getWordTypeColor(type) {
  const colors = {
    noun: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    verb: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    adjective: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    adverb: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    preposition: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
    conjunction: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  }
  return colors[type.toLowerCase()] || 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
}

export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

export function validatePassword(password) {
  return password.length >= 6
}

export function calculateProgress(current, target) {
  if (target === 0) return 0
  return Math.min(Math.round((current / target) * 100), 100)
}

export function getStreakEmoji(streak) {
  if (streak === 0) return '💫'
  if (streak < 3) return '🔥'
  if (streak < 7) return '⭐'
  if (streak < 30) return '🚀'
  if (streak < 100) return '👑'
  return '🏆'
}

export function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

export const WORD_TYPES = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'conjunction',
  'interjection',
  'pronoun',
  'article',
]

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function normalizeQuizAnswer(answer) {
  if (!answer || typeof answer !== 'string') return ''
  return answer.trim().toLowerCase()
}

export function compareQuizAnswers(userAnswer, correctAnswer) {
  const normalizedUser = normalizeQuizAnswer(userAnswer)
  const normalizedCorrect = normalizeQuizAnswer(correctAnswer)
  return normalizedUser === normalizedCorrect
}

/** Speak a word aloud via the browser Speech Synthesis API. */
export function speakWord(word) {
  if (!word || typeof word !== 'string' || !('speechSynthesis' in window)) {
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  utterance.rate = 0.8
  window.speechSynthesis.speak(utterance)
}