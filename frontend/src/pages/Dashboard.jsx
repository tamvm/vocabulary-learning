import React, { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  BookOpen,
  PenTool,
  TrendingUp,
  Calendar,
  Target,
  Award,
  BrainCircuit
} from 'lucide-react'
import { profileAPI } from '@/lib/api'
import LoadingSpinner from '@/components/UI/LoadingSpinner'
import { formatNumber, getStreakEmoji } from '@/lib/utils'
import StudyCard from '@/components/Dashboard/StudyCard'

const Dashboard = () => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      setLoading(true)
      const response = await profileAPI.getProfile()
      setProfile(response.data.profile)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400">Error: {error}</p>
        <button
          onClick={loadProfile}
          className="mt-4 btn-primary"
        >
          Try Again
        </button>
      </div>
    )
  }

  const stats = profile?.stats || {}
  const currentStreak = profile?.current_streak || 0
  const longestStreak = profile?.longest_streak || 0
  const dailyGoal = profile?.daily_goal || 5
  const weeklyGoal = profile?.weekly_goal || 30

  const dailyProgress = Math.min(stats.wordsToday || 0, dailyGoal)
  const weeklyProgress = Math.min(stats.wordsThisWeek || 0, weeklyGoal)

  const statCards = [
    {
      title: 'Total Words',
      value: formatNumber(stats.totalWords || 0),
      icon: BookOpen,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300',
    },
    {
      title: 'Current Streak',
      value: `${currentStreak} ${getStreakEmoji(currentStreak)}`,
      icon: Calendar,
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900 dark:text-orange-300',
    },
    {
      title: 'Words Today',
      value: stats.wordsToday || 0,
      icon: Target,
      color: 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300',
    },
    {
      title: 'Best Streak',
      value: `${longestStreak} days`,
      icon: Award,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900 dark:text-purple-300',
    },
  ]

  const recentAchievements = profile?.achievements?.slice(-3) || []

  return (
    <>
      <Helmet>
        <title>Dashboard - Magic English</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Welcome back! Here's your learning progress overview.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {statCards.map((stat) => (
            <div key={stat.title} className="card">
              <div className="card-body">
                <div className="flex items-center min-w-0">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${stat.color}`}>
                    <stat.icon className="h-6 w-6" />
                  </div>
                  <div className="ml-4 min-w-0">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {stat.title}
                    </p>
                    <p className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate">
                      {stat.value}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Study Section */}
        <StudyCard />

        {/* Progress Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Progress */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Daily Goal Progress
              </h3>
            </div>
            <div className="card-body">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Words Added Today
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {dailyProgress} / {dailyGoal}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min((dailyProgress / dailyGoal) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {dailyProgress >= dailyGoal
                  ? '🎉 Daily goal achieved!'
                  : `${dailyGoal - dailyProgress} words to go!`}
              </p>
            </div>
          </div>

          {/* Weekly Progress */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Weekly Goal Progress
              </h3>
            </div>
            <div className="card-body">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Words This Week
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {weeklyProgress} / {weeklyGoal}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min((weeklyProgress / weeklyGoal) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {weeklyProgress >= weeklyGoal
                  ? '🚀 Weekly goal achieved!'
                  : `${weeklyGoal - weeklyProgress} words to go!`}
              </p>
            </div>
          </div>
        </div>

        {/* Recent Achievements */}
        {recentAchievements.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Recent Achievements
              </h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {recentAchievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="flex items-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                  >
                    <span className="text-2xl mr-3">{achievement.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        {achievement.name}
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        {achievement.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Quick Actions
            </h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <a
                href="/vocabulary"
                className="flex items-center p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors min-w-0"
              >
                <BookOpen className="h-7 w-7 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400 mr-3 sm:mr-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Add New Words
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-300">
                    Expand your vocabulary
                  </p>
                </div>
              </a>

              <a
                href="/scoring"
                className="flex items-center p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors min-w-0"
              >
                <PenTool className="h-7 w-7 sm:h-8 sm:w-8 text-green-600 dark:text-green-400 mr-3 sm:mr-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-green-900 dark:text-green-100">
                    Score Sentences
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-300">
                    Practice writing
                  </p>
                </div>
              </a>

              <a
                href="/study"
                className="flex items-center p-3 sm:p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors min-w-0"
              >
                <BrainCircuit className="h-7 w-7 sm:h-8 sm:w-8 text-indigo-600 dark:text-indigo-400 mr-3 sm:mr-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-indigo-900 dark:text-indigo-100">
                    Study Flashcards
                  </p>
                  <p className="text-sm text-indigo-600 dark:text-indigo-300">
                    Review and learn
                  </p>
                </div>
              </a>

              <a
                href="/profile"
                className="flex items-center p-3 sm:p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors min-w-0"
              >
                <TrendingUp className="h-7 w-7 sm:h-8 sm:w-8 text-purple-600 dark:text-purple-400 mr-3 sm:mr-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-purple-900 dark:text-purple-100">
                    View Progress
                  </p>
                  <p className="text-sm text-purple-600 dark:text-purple-300">
                    Track your growth
                  </p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default Dashboard