import React, { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout/Layout'
import LoadingSpinner from './components/UI/LoadingSpinner'

// Lazy load pages for better performance
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const Vocabulary = React.lazy(() => import('./pages/Vocabulary'))
const Groups = React.lazy(() => import('./pages/Groups'))
const QuizQuestions = React.lazy(() => import('./pages/QuizQuestions'))
const Learn = React.lazy(() => import('./pages/Learn'))
const Study = React.lazy(() => import('./pages/Study'))
const Scoring = React.lazy(() => import('./pages/Scoring'))
const Profile = React.lazy(() => import('./pages/Profile'))
const Settings = React.lazy(() => import('./pages/Settings'))
const Auth = React.lazy(() => import('./pages/Auth'))
const NotFound = React.lazy(() => import('./pages/NotFound'))

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <>
      <Helmet>
        <title>Magic English - AI-Powered Vocabulary Learning</title>
        <meta
          name="description"
          content="Learn English vocabulary with AI-powered analysis, sentence scoring, and personalized progress tracking."
        />
      </Helmet>

      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <LoadingSpinner size="lg" />
          </div>
        }
      >
        <Routes>
          {!user ? (
            // Unauthenticated routes
            <>
              <Route path="/auth/*" element={<Auth />} />
              <Route path="*" element={<Navigate to="/auth/signin" replace />} />
            </>
          ) : (
            // Authenticated routes
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/vocabulary" element={<Vocabulary />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/quiz-questions" element={<QuizQuestions />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/study" element={<Study />} />
              <Route path="/scoring" element={<Scoring />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/auth/*" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          )}
        </Routes>
      </Suspense>
    </>
  )
}

export default App