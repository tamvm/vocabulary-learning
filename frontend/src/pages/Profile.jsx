import React from 'react'
import { Helmet } from 'react-helmet-async'
import { User } from 'lucide-react'

const Profile = () => {
  return (
    <>
      <Helmet>
        <title>Profile - Magic English</title>
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Profile & Statistics
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Track your learning progress and achievements
          </p>
        </div>

        <div className="card">
          <div className="card-body text-center py-12">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              Profile page coming soon! This will include detailed statistics, achievements, and progress tracking.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default Profile