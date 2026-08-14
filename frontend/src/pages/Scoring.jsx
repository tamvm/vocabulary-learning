import React, { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { PenTool, Check, X, Info } from 'lucide-react'
import { aiAPI } from '@/lib/api'
import LoadingSpinner from '@/components/UI/LoadingSpinner'
import toast from 'react-hot-toast'

const Scoring = () => {
  const [sentence, setSentence] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)

  const analyzeSentence = async () => {
    if (!sentence.trim()) {
      toast.error('Please enter a sentence to analyze')
      return
    }

    try {
      setLoading(true)
      const response = await aiAPI.analyzeSentence(sentence.trim())
      setAnalysis(response.data.analysis)
      toast.success('Sentence analyzed successfully!')
    } catch (error) {
      toast.error('Failed to analyze sentence')
      console.error('Analyze sentence error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400'
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getScoreBackground = (score) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/20'
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/20'
    return 'bg-red-100 dark:bg-red-900/20'
  }

  return (
    <>
      <Helmet>
        <title>Sentence Scoring - Magic English</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Sentence Scoring
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Get AI-powered analysis and scoring for your English sentences
          </p>
        </div>

        {/* Input Form */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center">
              <PenTool className="h-5 w-5 text-primary-600 mr-2" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Enter Your Sentence
              </h3>
            </div>
          </div>
          <div className="card-body">
            <div className="space-y-4">
              <div>
                <textarea
                  className="form-textarea min-h-[120px]"
                  placeholder="Type your English sentence here to get detailed analysis and scoring..."
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      analyzeSentence()
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                  <span>{sentence.length} characters</span>
                  <span className="flex items-center">
                    <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded border">
                      Ctrl
                    </kbd>
                    <span className="mx-1">+</span>
                    <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded border">
                      Enter
                    </kbd>
                    <span className="ml-1">to analyze</span>
                  </span>
                </div>
              </div>

              <button
                onClick={analyzeSentence}
                disabled={loading || !sentence.trim()}
                className="w-full btn-primary"
              >
                {loading ? (
                  <LoadingSpinner size="sm" className="mr-2" />
                ) : (
                  <PenTool className="h-4 w-4 mr-2" />
                )}
                Analyze Sentence
              </button>
            </div>
          </div>
        </div>

        {/* Analysis Results */}
        {analysis && (
          <div className="space-y-6">
            {/* Overall Score */}
            <div className="card">
              <div className="card-body">
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold ${getScoreBackground(analysis.overallScore)} ${getScoreColor(analysis.overallScore)}`}>
                    {analysis.overallScore}
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                    Overall Score
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {analysis.feedback}
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Scores */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Grammar */}
              <div className="card">
                <div className="card-header">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Grammar
                  </h4>
                </div>
                <div className="card-body">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {analysis.grammar?.score || 0}
                    </span>
                    <span className={`text-sm font-medium ${getScoreColor(analysis.grammar?.score || 0)}`}>
                      {analysis.grammar?.score >= 80 ? 'Excellent' : analysis.grammar?.score >= 60 ? 'Good' : 'Needs Work'}
                    </span>
                  </div>

                  {analysis.grammar?.issues?.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Issues Found:
                      </h5>
                      <ul className="space-y-1">
                        {analysis.grammar.issues.map((issue, index) => (
                          <li key={index} className="flex items-start text-sm text-red-600 dark:text-red-400">
                            <X className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.grammar?.suggestions?.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Suggestions:
                      </h5>
                      <ul className="space-y-1">
                        {analysis.grammar.suggestions.map((suggestion, index) => (
                          <li key={index} className="flex items-start text-sm text-blue-600 dark:text-blue-400">
                            <Info className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Vocabulary */}
              <div className="card">
                <div className="card-header">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Vocabulary
                  </h4>
                </div>
                <div className="card-body">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {analysis.vocabulary?.score || 0}
                    </span>
                    <span className={`text-sm font-medium ${getScoreColor(analysis.vocabulary?.score || 0)}`}>
                      {analysis.vocabulary?.level || 'Unknown'}
                    </span>
                  </div>

                  {analysis.vocabulary?.complexWords?.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Complex Words:
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {analysis.vocabulary.complexWords.map((word, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          >
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.vocabulary?.suggestions?.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Suggestions:
                      </h5>
                      <ul className="space-y-1">
                        {analysis.vocabulary.suggestions.map((suggestion, index) => (
                          <li key={index} className="flex items-start text-sm text-blue-600 dark:text-blue-400">
                            <Info className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Style */}
              <div className="card">
                <div className="card-header">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Style
                  </h4>
                </div>
                <div className="card-body">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {analysis.style?.score || 0}
                    </span>
                    <span className={`text-sm font-medium ${getScoreColor(analysis.style?.score || 0)}`}>
                      {analysis.style?.formality || 'Unknown'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Clarity:
                      </span>
                      <span className="ml-2 text-sm text-gray-900 dark:text-white">
                        {analysis.style?.clarity || 'Unknown'}
                      </span>
                    </div>

                    {analysis.style?.suggestions?.length > 0 && (
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Suggestions:
                        </h5>
                        <ul className="space-y-1">
                          {analysis.style.suggestions.map((suggestion, index) => (
                            <li key={index} className="flex items-start text-sm text-blue-600 dark:text-blue-400">
                              <Info className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                              {suggestion}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Corrections */}
            {analysis.corrections && analysis.corrections.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                    Suggested Corrections
                  </h4>
                </div>
                <div className="card-body">
                  <div className="space-y-4">
                    {analysis.corrections.map((correction, index) => (
                      <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h5 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                              Original:
                            </h5>
                            <p className="text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                              {correction.original}
                            </p>
                          </div>
                          <div>
                            <h5 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">
                              Corrected:
                            </h5>
                            <p className="text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800">
                              {correction.corrected}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Reason:
                          </h5>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {correction.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Results State */}
        {!analysis && !loading && (
          <div className="card">
            <div className="card-body text-center py-12">
              <PenTool className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                Enter a sentence above to get detailed AI analysis and scoring.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default Scoring