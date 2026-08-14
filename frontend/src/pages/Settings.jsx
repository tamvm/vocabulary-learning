import React, { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Settings as SettingsIcon, Check, User, Target } from 'lucide-react'
import { profileAPI } from '@/lib/api'
import LoadingSpinner from '@/components/UI/LoadingSpinner'
import toast from 'react-hot-toast'

const CEFR_LEVELS = [
  { value: 'A1', label: 'A1 (~ IELTS 3.0-4.0)', description: 'Beginner' },
  { value: 'A2', label: 'A2 (~ IELTS 4.0-5.0)', description: 'Elementary' },
  { value: 'B1', label: 'B1 (~ IELTS 5.0-6.0)', description: 'Intermediate' },
  { value: 'B2', label: 'B2 (~ IELTS 6.5-7.0)', description: 'Upper Intermediate' },
  { value: 'C1', label: 'C1 (~ IELTS 7.5-8.5)', description: 'Advanced' },
  { value: 'C2', label: 'C2 (~ IELTS 9.0)', description: 'Proficient' },
]

const Settings = () => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      setLoading(true)
      const response = await profileAPI.getProfile()
      setProfile(response.data.profile)
    } catch (error) {
      toast.error('Failed to load profile')
      console.error('Load profile error:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateCefrLevel = async (cefrLevel) => {
    try {
      setUpdating(true)
      await profileAPI.updateCefrLevel(cefrLevel)
      setProfile(prev => ({ ...prev, cefr_level: cefrLevel }))
      toast.success('English level updated successfully!')
    } catch (error) {
      toast.error('Failed to update English level')
      console.error('Update CEFR level error:', error)
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <>
      <Helmet>
        <title>Settings - Magic English</title>
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Configure your account and application preferences
          </p>
        </div>

        {/* English Level Settings */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center">
              <User className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-3" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                English Level
              </h3>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Select your current English proficiency level to get personalized vocabulary recommendations
            </p>
          </div>
          <div className="card-body">
            <div className="grid gap-3">
              {CEFR_LEVELS.map((level) => (
                <button
                  key={level.value}
                  onClick={() => updateCefrLevel(level.value)}
                  disabled={updating}
                  className={`relative flex items-center p-4 rounded-lg border-2 transition-all ${
                    profile?.cefr_level === level.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  } ${updating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex-1 text-left">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {level.label}
                      </div>
                      {profile?.cefr_level === level.value && (
                        <Check className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {level.description}
                    </div>
                  </div>
                  {updating && profile?.cefr_level === level.value && (
                    <LoadingSpinner size="sm" className="ml-2" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Learning Goals */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center">
              <Target className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-3" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Learning Goals
              </h3>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Your current learning targets
            </p>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Daily Goal
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile?.daily_goal || 5} words
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Weekly Goal
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile?.weekly_goal || 30} words
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
              Goal customization coming soon!
            </p>
          </div>
        </div>

        {/* Additional Settings Placeholder */}
        <div className="card">
          <div className="card-body text-center py-12">
            <SettingsIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              More settings coming soon! This will include AI provider configuration, notification preferences, and more.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default Settings