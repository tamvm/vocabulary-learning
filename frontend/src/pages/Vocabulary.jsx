import React, { useState, useEffect, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import { Search, Plus, Download, Upload, Sparkles, Edit2, Trash2, BookOpen, Link, FileText, Globe, Type, Play } from 'lucide-react'
import { wordsAPI, aiAPI } from '@/lib/api'
import { debounce, getCefrColor, getWordTypeColor, formatDate } from '@/lib/utils'
import LoadingSpinner from '@/components/UI/LoadingSpinner'
import GroupFilter from '@/components/GroupFilter'
import FilterPills from '@/components/FilterPills'
import GroupSelector from '@/components/GroupSelector'
import { useGroups } from '@/hooks/useGroups'
import toast from 'react-hot-toast'

const Vocabulary = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { groups } = useGroups()

  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroups, setSelectedGroups] = useState([])
  const [dateFilter, setDateFilter] = useState('all') // 'all', 'today', 'week', 'month', '3months'
  const [selectedWordIds, setSelectedWordIds] = useState(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null)
  const [showBatchGroupSelector, setShowBatchGroupSelector] = useState(false)
  const [batchGroupId, setBatchGroupId] = useState(null)
  const [batchAssigning, setBatchAssigning] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showContentForm, setShowContentForm] = useState(false)
  const [contentAnalysisMode, setContentAnalysisMode] = useState('url') // 'url', 'text', or 'file'
  const [contentUrl, setContentUrl] = useState('')
  const [contentText, setContentText] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [analyzingContent, setAnalyzingContent] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState({ step: 0, message: '', percentage: 0 })
  const [vocabularyResults, setVocabularyResults] = useState([])
  const [vocabularyPages, setVocabularyPages] = useState([])
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedWords, setSelectedWords] = useState(new Set())
  const [selectedWordsPerPage, setSelectedWordsPerPage] = useState({})
  const [savingSelected, setSavingSelected] = useState(false)
  const [sourceInfo, setSourceInfo] = useState(null)
  const [originalContent, setOriginalContent] = useState('')
  const [showContentViewer, setShowContentViewer] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [editingWordId, setEditingWordId] = useState(null)
  const [editFormData, setEditFormData] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)

  // Initialize selectedGroups from URL on mount
  useEffect(() => {
    const groupsParam = searchParams.get('groups')
    if (groupsParam) {
      setSelectedGroups(groupsParam.split(','))
    }
    setIsInitialized(true)
  }, [])

  // Update URL when selectedGroups changes (skip on initial mount)
  useEffect(() => {
    if (!isInitialized) return

    const params = new URLSearchParams(searchParams)
    if (selectedGroups.length > 0) {
      params.set('groups', selectedGroups.join(','))
    } else {
      params.delete('groups')
    }
    setSearchParams(params, { replace: true })
  }, [selectedGroups, isInitialized])

  // Load words when selectedGroups changes (only after initialization)
  useEffect(() => {
    if (!isInitialized) return
    loadWords()
  }, [selectedGroups, isInitialized])

  const loadWords = async () => {
    try {
      setLoading(true)
      const response = await wordsAPI.getAll({
        groups: selectedGroups.length > 0 ? selectedGroups : undefined
      })
      setWords(response.words || [])
    } catch (error) {
      toast.error('Failed to load vocabulary')
      console.error('Load words error:', error)
    } finally {
      setLoading(false)
    }
  }

  const analyzeWord = async () => {
    if (!newWord.trim()) {
      toast.error('Please enter a word to analyze')
      return
    }

    // Check for duplicate word
    const wordToCheck = newWord.trim().toLowerCase()
    const existingWord = words.find(word => word.word.toLowerCase() === wordToCheck)
    if (existingWord) {
      toast.error(`"${newWord.trim()}" is already in your vocabulary`)
      return
    }

    try {
      setAnalyzing(true)
      const response = await aiAPI.analyzeWord(newWord.trim(), { autoSave: true })

      if (response.data.error === 'duplicate_word') {
        toast.error(response.data.message)
      } else if (response.data.savedWord) {
        setWords(prev => [response.data.savedWord, ...prev])
        setNewWord('')
        setShowAddForm(false)
        toast.success('Word analyzed and saved successfully! Quiz question is being generated in the background.')
      } else if (response.data.analysis) {
        // Word was analyzed but not saved (could be due to autoSave: false or other reasons)
        toast.success('Word analyzed successfully!')
      }
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        (error.response?.status === 503
          ? 'AI service is temporarily unavailable. Please try again shortly.'
          : 'Failed to analyze word')
      toast.error(msg)
      console.error('Analyze word error:', error)
    } finally {
      setAnalyzing(false)
    }
  }

  const analyzeContent = async () => {
    if (contentAnalysisMode === 'url' && !contentUrl.trim()) {
      toast.error('Please enter a URL to analyze')
      return
    }
    if (contentAnalysisMode === 'text' && !contentText.trim()) {
      toast.error('Please enter text content to analyze')
      return
    }
    if (contentAnalysisMode === 'file' && !selectedFile) {
      toast.error('Please select a file to analyze')
      return
    }

    try {
      setAnalyzingContent(true)
      setVocabularyResults([])
      setVocabularyPages([])
      setCurrentPage(0)
      setSelectedWords(new Set())
      setSelectedWordsPerPage({})
      setSourceInfo(null)
      setOriginalContent('')
      setShowContentViewer(false)
      setHasMore(false)
      setNextOffset(0)
      setTotalChunks(0)

      const totalSteps = contentAnalysisMode === 'url' ? 8 : contentAnalysisMode === 'file' ? 7 : 6;

      // Step 1: Initialize
      setAnalysisProgress({
        step: 1,
        message: `Preparing to analyze ${contentAnalysisMode === 'url' ? 'website' : contentAnalysisMode === 'file' ? 'file' : 'text'} content...`,
        percentage: Math.round((1/totalSteps) * 100)
      })
      await new Promise(resolve => setTimeout(resolve, 800))

      const analysisData = {}
      if (contentAnalysisMode === 'url') {
        // Step 2: Starting browser
        setAnalysisProgress({
          step: 2,
          message: 'Starting browser and navigation...',
          percentage: Math.round((2/totalSteps) * 100)
        })
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Step 3: Fetching website or YouTube transcript
        const hostname = new URL(contentUrl.trim()).hostname;
        const isYoutube = hostname.includes('youtube.com') || hostname.includes('youtu.be');
        setAnalysisProgress({
          step: 3,
          message: isYoutube ? `Extracting YouTube transcript...` : `Loading website: ${hostname}`,
          percentage: Math.round((3/totalSteps) * 100)
        })
        analysisData.url = contentUrl.trim()

        await new Promise(resolve => setTimeout(resolve, 1500))

        // Step 4: Extracting content
        setAnalysisProgress({
          step: 4,
          message: isYoutube ? 'Processing video subtitles...' : 'Extracting main article content...',
          percentage: Math.round((4/totalSteps) * 100)
        })
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Step 5: Processing content
        setAnalysisProgress({
          step: 5,
          message: isYoutube ? 'Converting transcript to text...' : 'Processing extracted text...',
          percentage: Math.round((5/totalSteps) * 100)
        })
        await new Promise(resolve => setTimeout(resolve, 800))
      } else if (contentAnalysisMode === 'file') {
        // Step 2: Upload file
        setAnalysisProgress({
          step: 2,
          message: 'Uploading file to server...',
          percentage: Math.round((2/totalSteps) * 100)
        })
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Step 3: Processing file
        setAnalysisProgress({
          step: 3,
          message: `Processing ${selectedFile.name}...`,
          percentage: Math.round((3/totalSteps) * 100)
        })
        await new Promise(resolve => setTimeout(resolve, 800))

        // Step 4: Extracting content
        setAnalysisProgress({
          step: 4,
          message: 'Extracting text from file...',
          percentage: Math.round((4/totalSteps) * 100)
        })

        // Create FormData for file upload
        const formData = new FormData()
        formData.append('file', selectedFile)
        analysisData.file = formData

        await new Promise(resolve => setTimeout(resolve, 1000))

        // Step 5: Preparing content
        setAnalysisProgress({
          step: 5,
          message: 'Preparing content for analysis...',
          percentage: Math.round((5/totalSteps) * 100)
        })
        await new Promise(resolve => setTimeout(resolve, 600))
      } else {
        // Step 2: Processing text content
        setAnalysisProgress({
          step: 2,
          message: 'Validating text content...',
          percentage: Math.round((2/totalSteps) * 100)
        })
        analysisData.text = contentText.trim()
        await new Promise(resolve => setTimeout(resolve, 800))

        // Step 3: Preparing content
        setAnalysisProgress({
          step: 3,
          message: 'Preparing content for analysis...',
          percentage: Math.round((3/totalSteps) * 100)
        })
        await new Promise(resolve => setTimeout(resolve, 600))
      }

      // AI Analysis Step
      const aiStepNumber = contentAnalysisMode === 'url' ? 6 : contentAnalysisMode === 'file' ? 6 : 4;

      // Estimate chunks for large files
      const isLargeFile = selectedFile && selectedFile.size > 25000; // ~25KB
      const estimatedChunks = isLargeFile ? Math.ceil(selectedFile.size / 5000) : null;

      setAnalysisProgress({
        step: aiStepNumber,
        message: estimatedChunks
          ? `AI analyzing vocabulary (${estimatedChunks} chunks, ~${Math.ceil(estimatedChunks * 7 / 60)} min)...`
          : 'AI analyzing vocabulary for your level...',
        percentage: Math.round((aiStepNumber/totalSteps) * 100),
        estimatedChunks
      })

      const response = await aiAPI.analyzeContent(analysisData)

      // Step: Processing AI results
      const resultStepNumber = contentAnalysisMode === 'url' ? 7 : contentAnalysisMode === 'file' ? 7 : 5;
      setAnalysisProgress({
        step: resultStepNumber,
        message: 'Processing AI analysis results...',
        percentage: Math.round((resultStepNumber/totalSteps) * 100)
      })
      await new Promise(resolve => setTimeout(resolve, 700))

      // Final step
      setAnalysisProgress({
        step: totalSteps,
        message: 'Analysis complete! 🎉',
        percentage: 100
      })

      if (response.data.vocabulary && response.data.vocabulary.length > 0) {
        setVocabularyResults(response.data.vocabulary)
        setVocabularyPages([response.data.vocabulary])
        setCurrentPage(0)
        setSourceInfo(response.data.sourceInfo || null)
        setOriginalContent(response.data.originalContent || '')
        setHasMore(response.data.hasMore || false)
        setNextOffset(response.data.nextOffset || 0)
        setTotalChunks(response.data.totalChunks || 0)
        toast.success(response.data.message || `Found ${response.data.vocabulary.length} vocabulary items`)
      } else {
        setVocabularyResults([])
        setVocabularyPages([])
        setCurrentPage(0)
        setSourceInfo(response.data.sourceInfo || null)
        setOriginalContent(response.data.originalContent || '')
        setHasMore(false)
        setNextOffset(0)
        setTotalChunks(0)
        toast.info(response.data.message || 'No new vocabulary found')
      }
    } catch (error) {
      setAnalysisProgress({ step: 0, message: 'Analysis failed', percentage: 0 })

      // Provide user-friendly error messages
      let errorMessage = 'Failed to analyze content'
      if (error.message.includes('timeout')) {
        errorMessage = 'Analysis timed out. The website might be taking too long to load. Please try again or use "From Text" mode instead.'
      } else if (error.message.includes('Network Error')) {
        errorMessage = 'Network connection issue. Please check your internet connection and try again.'
      } else if (error.message.includes('blocked')) {
        errorMessage = 'The website is blocking automated access. Try copying the text and using "From Text" mode instead.'
      } else if (error.message.includes('AI service unavailable')) {
        errorMessage = 'AI service is temporarily unavailable. Please try again in a few moments.'
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error occurred. Please try again or contact support if the issue persists.'
      }

      toast.error(errorMessage)
      console.error('Content analysis error:', error)
    } finally {
      setAnalyzingContent(false)
      // Reset progress after a short delay
      setTimeout(() => {
        setAnalysisProgress({ step: 0, message: '', percentage: 0 })
      }, 2000)
    }
  }

  const loadMoreVocabulary = async () => {
    if (!hasMore || loadingMore) return

    try {
      setLoadingMore(true)

      // Prepare data with offset for pagination
      const analysisData = {}
      if (contentAnalysisMode === 'url') {
        analysisData.url = contentUrl.trim()
        analysisData.offset = nextOffset
        analysisData.chunksToProcess = 3
      } else if (contentAnalysisMode === 'file') {
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('offset', nextOffset)
        formData.append('chunksToProcess', 3)
        analysisData.file = formData
      } else {
        analysisData.text = contentText.trim()
        analysisData.offset = nextOffset
        analysisData.chunksToProcess = 3
      }

      const response = await aiAPI.analyzeContent(analysisData)

      if (response.data.vocabulary && response.data.vocabulary.length > 0) {
        // Add new vocabulary as a new page
        setVocabularyPages(prev => [...prev, response.data.vocabulary])
        setCurrentPage(prev => prev + 1)

        // Update pagination state
        setHasMore(response.data.hasMore || false)
        setNextOffset(response.data.nextOffset || 0)

        toast.success(response.data.message || `Loaded ${response.data.vocabulary.length} more vocabulary items`)
      } else {
        setHasMore(false)
        toast.info('No more vocabulary found')
      }
    } catch (error) {
      toast.error('Failed to load more vocabulary')
      console.error('Load more vocabulary error:', error)
    } finally {
      setLoadingMore(false)
    }
  }

  const saveSelectedAndLoadMore = async () => {
    const currentPageSelections = selectedWordsPerPage[currentPage] || new Set()
    if (currentPageSelections.size === 0) {
      toast.error('Please select at least one word to save')
      return
    }

    try {
      // First save the selected words from current page
      setSavingSelected(true)

      const currentPageData = vocabularyPages[currentPage] || []
      const wordsToSave = Array.from(currentPageSelections).map(index => {
        const item = currentPageData[index]
        return {
          word: item.word,
          definition: item.definition,
          wordType: item.wordType,
          cefrLevel: item.cefrLevel,
          ipaPronunciation: item.ipaPronunciation,
          exampleSentence: item.exampleSentence,
          notes: item.notes,
          tags: item.tags || [],
          vietnameseTranslation: item.vietnameseTranslation,
          synonyms: item.synonyms,
          groupId: selectedGroupId
        }
      })

      const saveResponse = await wordsAPI.bulkOperation({
        operation: 'import',
        words: wordsToSave
      })

      if (saveResponse.data.words) {
        setWords(prev => [...saveResponse.data.words, ...prev])

        // Get group name for success message
        const groupName = selectedGroupId
          ? groups.find(g => g.id === selectedGroupId)?.name
          : null

        const successMessage = groupName
          ? `Added ${saveResponse.data.words.length} words to "${groupName}"!`
          : `${saveResponse.data.words.length} words saved successfully!`

        toast.success(successMessage)

        // Clear selections for current page
        setSelectedWordsPerPage(prev => ({
          ...prev,
          [currentPage]: new Set()
        }))

        // Now load more vocabulary
        setSavingSelected(false)
        await loadMoreVocabulary()
      }
    } catch (error) {
      toast.error('Failed to save selected words')
      console.error('Save selected words error:', error)
      setSavingSelected(false)
    }
  }

  // Helper functions for pagination
  const getCurrentPageData = () => {
    return vocabularyPages[currentPage] || []
  }

  const getCurrentPageSelections = () => {
    return selectedWordsPerPage[currentPage] || new Set()
  }

  const updateCurrentPageSelections = (newSelections) => {
    setSelectedWordsPerPage(prev => ({
      ...prev,
      [currentPage]: newSelections
    }))
  }

  const toggleWordSelection = (index) => {
    const currentSelections = getCurrentPageSelections()
    const newSelections = new Set(currentSelections)
    if (newSelections.has(index)) {
      newSelections.delete(index)
    } else {
      newSelections.add(index)
    }
    updateCurrentPageSelections(newSelections)
  }

  const selectAllWordsOnPage = () => {
    const currentPageData = getCurrentPageData()
    const currentSelections = getCurrentPageSelections()
    if (currentSelections.size === currentPageData.length) {
      updateCurrentPageSelections(new Set())
    } else {
      updateCurrentPageSelections(new Set(currentPageData.map((_, index) => index)))
    }
  }

  const saveSelectedWords = async () => {
    // Collect all selected words from all pages
    let allSelectedWords = []
    Object.entries(selectedWordsPerPage).forEach(([pageIndex, selections]) => {
      const pageData = vocabularyPages[parseInt(pageIndex)] || []
      Array.from(selections).forEach(wordIndex => {
        const item = pageData[wordIndex]
        if (item) {
          allSelectedWords.push({
            word: item.word,
            definition: item.definition,
            wordType: item.wordType,
            cefrLevel: item.cefrLevel,
            ipaPronunciation: item.ipaPronunciation,
            exampleSentence: item.exampleSentence,
            notes: item.notes,
            tags: item.tags || [],
            vietnameseTranslation: item.vietnameseTranslation,
            synonyms: item.synonyms,
            groupId: selectedGroupId
          })
        }
      })
    })

    if (allSelectedWords.length === 0) {
      toast.error('Please select at least one word to save')
      return
    }

    try {
      setSavingSelected(true)

      const response = await wordsAPI.bulkOperation({
        operation: 'import',
        words: allSelectedWords
      })

      if (response.data.words) {
        setWords(prev => [...response.data.words, ...prev])

        // Get group name for success message
        const groupName = selectedGroupId
          ? groups.find(g => g.id === selectedGroupId)?.name
          : null

        const successMessage = groupName
          ? `Added ${response.data.words.length} words to "${groupName}"! Quiz questions are being generated in the background.`
          : `${response.data.words.length} words saved successfully! Quiz questions are being generated in the background.`

        toast.success(successMessage)

        // Clear the content form and results
        setShowContentForm(false)
        setContentUrl('')
        setContentText('')
        setSelectedFile(null)
        setVocabularyResults([])
        setVocabularyPages([])
        setCurrentPage(0)
        setSelectedWords(new Set())
        setSelectedWordsPerPage({})
        setSourceInfo(null)
        setOriginalContent('')
        setShowContentViewer(false)
        setHasMore(false)
        setNextOffset(0)
        setTotalChunks(0)
        setSelectedGroupId(null)
      }
    } catch (error) {
      toast.error('Failed to save selected words')
      console.error('Save selected words error:', error)
    } finally {
      setSavingSelected(false)
    }
  }

  const deleteWord = async (id) => {
    if (!confirm('Are you sure you want to delete this word?')) {
      return
    }

    try {
      await wordsAPI.deleteWord(id)
      setWords(prev => prev.filter(word => word.id !== id))
      toast.success('Word deleted successfully')
    } catch (error) {
      toast.error('Failed to delete word')
      console.error('Delete word error:', error)
    }
  }

  const startEditWord = (word) => {
    setEditingWordId(word.id)
    setEditFormData({
      word: word.word,
      definition: word.definition,
      word_type: word.word_type || '',
      cefr_level: word.cefr_level || '',
      ipa_pronunciation: word.ipa_pronunciation || '',
      vietnamese_translation: word.vietnamese_translation || '',
      synonyms: word.synonyms || '',
      example_sentence: word.example_sentence || ''
    })
  }

  const cancelEditWord = () => {
    setEditingWordId(null)
    setEditFormData({})
  }

  // Handle Escape key to cancel edit
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && editingWordId !== null) {
        cancelEditWord()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [editingWordId])

  const saveEditWord = async () => {
    if (!editFormData.word?.trim() || !editFormData.definition?.trim()) {
      toast.error('Word and definition are required')
      return
    }

    try {
      setSavingEdit(true)
      const response = await wordsAPI.updateWord(editingWordId, {
        word: editFormData.word.trim(),
        definition: editFormData.definition.trim(),
        wordType: editFormData.word_type || null,
        cefrLevel: editFormData.cefr_level || null,
        ipaPronunciation: editFormData.ipa_pronunciation || null,
        vietnameseTranslation: editFormData.vietnamese_translation || null,
        synonyms: editFormData.synonyms || null,
        exampleSentence: editFormData.example_sentence || null
      })

      setWords(prev => prev.map(w => w.id === editingWordId ? response.data.word : w))
      setEditingWordId(null)
      setEditFormData({})
      toast.success('Word updated successfully')
    } catch (error) {
      toast.error('Failed to update word')
      console.error('Update word error:', error)
    } finally {
      setSavingEdit(false)
    }
  }

  const exportWords = async () => {
    try {
      const response = await wordsAPI.bulkOperation({
        operation: 'export'
      })

      const blob = new Blob([JSON.stringify(response.data.words, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'vocabulary.json'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('Vocabulary exported successfully')
    } catch (error) {
      toast.error('Failed to export vocabulary')
      console.error('Export error:', error)
    }
  }

  // Group filter handlers
  const handleGroupsChange = (newGroups) => {
    setSelectedGroups(newGroups)
  }

  const handleRemoveGroup = (groupId) => {
    setSelectedGroups(selectedGroups.filter(id => id !== groupId))
  }

  const handleClearAllFilters = () => {
    setSelectedGroups([])
    setDateFilter('all')
  }

  // Word selection handlers
  const handleToggleWord = (wordId, index, event) => {
    const newSelected = new Set(selectedWordIds)

    // Shift+click for range selection
    if (event?.shiftKey && lastSelectedIndex !== null && index !== lastSelectedIndex) {
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)

      // Select all words in range
      for (let i = start; i <= end; i++) {
        if (filteredWords[i]) {
          newSelected.add(filteredWords[i].id)
        }
      }
      setSelectedWordIds(newSelected)
      setLastSelectedIndex(index)
    } else {
      // Normal toggle
      if (newSelected.has(wordId)) {
        newSelected.delete(wordId)
      } else {
        newSelected.add(wordId)
      }
      setSelectedWordIds(newSelected)
      setLastSelectedIndex(index)
    }
  }

  const handleSelectAll = () => {
    setSelectedWordIds(new Set(filteredWords.map(w => w.id)))
    setLastSelectedIndex(null)
  }

  const handleDeselectAll = () => {
    setSelectedWordIds(new Set())
    setLastSelectedIndex(null)
  }

  const handleBatchGroupChange = (groupId) => {
    setBatchGroupId(groupId)
  }

  const handleBatchAssignGroup = async () => {
    if (selectedWordIds.size === 0) {
      toast.error('No words selected')
      return
    }

    if (!batchGroupId) {
      toast.error('Please select a group')
      return
    }

    try {
      setBatchAssigning(true)
      // Use bulk operation to update all selected words in a single request
      const response = await wordsAPI.bulkOperation({
        operation: 'update-group',
        ids: Array.from(selectedWordIds),
        groupId: batchGroupId
      })

      toast.success(response.data.message || `${selectedWordIds.size} ${selectedWordIds.size === 1 ? 'word' : 'words'} assigned to group`)
      setSelectedWordIds(new Set())
      setBatchGroupId(null)
      setShowBatchGroupSelector(false)
      await loadWords() // Reload words to show updated group assignments
    } catch (error) {
      toast.error('Failed to assign words to group')
      console.error('Batch assign error:', error)
    } finally {
      setBatchAssigning(false)
    }
  }

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce((query) => {
      // In a real app, this would trigger an API call
      setSearchQuery(query)
    }, 300),
    []
  )

  const filteredWords = useMemo(() => {
    let filtered = words

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date()
      const filterDate = new Date()

      switch (dateFilter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0)
          break
        case 'week':
          filterDate.setDate(now.getDate() - 7)
          break
        case 'month':
          filterDate.setMonth(now.getMonth() - 1)
          break
        case '3months':
          filterDate.setMonth(now.getMonth() - 3)
          break
      }

      filtered = filtered.filter(word => new Date(word.created_at) >= filterDate)
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(word =>
        word.word.toLowerCase().includes(query) ||
        word.definition.toLowerCase().includes(query) ||
        word.example_sentence?.toLowerCase().includes(query) ||
        word.vietnamese_translation?.toLowerCase().includes(query) ||
        word.synonyms?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [words, searchQuery, dateFilter])

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
        <title>Vocabulary - Magic English</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Vocabulary
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage your vocabulary collection
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-wrap gap-3">
            <button
              onClick={() => {
                setShowAddForm(!showAddForm)
                setShowContentForm(false)
              }}
              className="btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Word
            </button>
            <button
              onClick={() => {
                setShowContentForm(!showContentForm)
                setShowAddForm(false)
              }}
              className="btn-primary"
            >
              <Globe className="h-4 w-4 mr-2" />
              Add from Content
            </button>
            <button
              onClick={exportWords}
              className="btn-secondary"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
          </div>
        </div>

        {/* Add Word Form */}
        {showAddForm && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Add New Word with AI Analysis
              </h3>
            </div>
            <div className="card-body">
              <div className="flex space-x-4">
                <div className="flex-1">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter a word to analyze..."
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && analyzeWord()}
                  />
                </div>
                <button
                  onClick={analyzeWord}
                  disabled={analyzing || !newWord.trim()}
                  className="btn-primary"
                >
                  {analyzing ? (
                    <LoadingSpinner size="sm" className="mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Analyze
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Analysis Form */}
        {showContentForm && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Analyze Content for Vocabulary
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Extract vocabulary from websites or text based on your English level
              </p>
            </div>
            <div className="card-body space-y-4">
              {/* Mode Selection */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    setContentAnalysisMode('url')
                    setContentText('')
                    setSelectedFile(null)
                  }}
                  className={`flex items-center justify-center p-3 rounded-lg border-2 transition-all ${
                    contentAnalysisMode === 'url'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Link className="h-4 w-4 mr-2" />
                  From URL
                </button>
                <button
                  onClick={() => {
                    setContentAnalysisMode('text')
                    setContentUrl('')
                    setSelectedFile(null)
                  }}
                  className={`flex items-center justify-center p-3 rounded-lg border-2 transition-all ${
                    contentAnalysisMode === 'text'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Type className="h-4 w-4 mr-2" />
                  From Text
                </button>
                <button
                  onClick={() => {
                    setContentAnalysisMode('file')
                    setContentUrl('')
                    setContentText('')
                  }}
                  className={`flex items-center justify-center p-3 rounded-lg border-2 transition-all ${
                    contentAnalysisMode === 'file'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  From File
                </button>
              </div>

              {/* Input Fields */}
              <div className="space-y-4">
                {contentAnalysisMode === 'url' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Website URL
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        className="form-input pr-10"
                        placeholder="https://example.com/article or https://youtube.com/watch?v=..."
                        value={contentUrl}
                        onChange={(e) => setContentUrl(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && analyzeContent()}
                      />
                      {contentUrl && (contentUrl.includes('youtube.com') || contentUrl.includes('youtu.be')) && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <Play className="h-4 w-4 text-red-500" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span className="inline-flex items-center">
                        Enter a website URL or
                        <Play className="h-3 w-3 mx-1 text-red-500" />
                        YouTube video URL to extract and analyze vocabulary
                      </span>
                    </p>
                  </div>
                )}

                {contentAnalysisMode === 'text' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Text Content
                    </label>
                    <textarea
                      className="form-input min-h-[120px]"
                      placeholder="Paste your text content here..."
                      value={contentText}
                      onChange={(e) => setContentText(e.target.value)}
                      rows={6}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Paste any English text to extract vocabulary suitable for your level
                    </p>
                  </div>
                )}

                {contentAnalysisMode === 'file' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Upload File
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".txt,.pdf,.docx,.srt"
                        onChange={(e) => {
                          const file = e.target.files[0]
                          if (file) {
                            // Check file size (5MB limit)
                            const maxSize = 5 * 1024 * 1024 // 5MB in bytes
                            if (file.size > maxSize) {
                              toast.error('File size must be less than 5MB')
                              e.target.value = ''
                              return
                            }
                            setSelectedFile(file)
                          } else {
                            setSelectedFile(null)
                          }
                        }}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                          selectedFile
                            ? 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
                            : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          {selectedFile ? (
                            <>
                              <FileText className="w-8 h-8 mb-2 text-green-500" />
                              <p className="mb-1 text-sm text-green-700 dark:text-green-300 font-medium">
                                {selectedFile.name}
                              </p>
                              <p className="text-xs text-green-600 dark:text-green-400">
                                {(selectedFile.size / 1024).toFixed(1)} KB • Click to change
                              </p>
                            </>
                          ) : (
                            <>
                              <Upload className="w-8 h-8 mb-2 text-gray-400" />
                              <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
                                <span className="font-semibold">Click to upload</span> or drag and drop
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                TXT, PDF, DOCX, SRT (max 5MB)
                              </p>
                            </>
                          )}
                        </div>
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Upload a document or subtitle file to extract vocabulary suitable for your level
                    </p>
                  </div>
                )}

                {/* Group Selection */}
                {(selectedFile || contentUrl || contentText || analyzingContent) && (
                  <GroupSelector
                    value={selectedGroupId}
                    onChange={setSelectedGroupId}
                    className="pt-4 border-t border-gray-200 dark:border-gray-700"
                  />
                )}
              </div>

              {/* Progress Bar */}
              {analyzingContent && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                      Step {analysisProgress.step}/{contentAnalysisMode === 'url' ? '8' : contentAnalysisMode === 'file' ? '7' : '6'}: {analysisProgress.message}
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">
                      {analysisProgress.percentage}%
                    </span>
                  </div>
                  <div className="relative">
                    <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                        style={{ width: `${analysisProgress.percentage}%` }}
                      >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
                      </div>
                    </div>

                    {/* Step indicators */}
                    <div className="flex justify-between mt-2">
                      {Array.from({ length: contentAnalysisMode === 'url' ? 8 : contentAnalysisMode === 'file' ? 7 : 6 }, (_, i) => (
                        <div
                          key={i}
                          className={`h-2 w-2 rounded-full transition-all duration-300 ${
                            i + 1 <= analysisProgress.step
                              ? 'bg-blue-500 scale-110'
                              : i + 1 === analysisProgress.step + 1
                              ? 'bg-blue-300 animate-pulse'
                              : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-center space-x-3 text-sm">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-bounce"></div>
                      <div className="h-2 w-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                      <div className="h-2 w-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                    <span className="text-gray-600 dark:text-gray-300 font-medium">
                      Analyzing content with AI...
                    </span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-end">
                <button
                  onClick={analyzeContent}
                  disabled={
                    analyzingContent ||
                    (contentAnalysisMode === 'url' && !contentUrl.trim()) ||
                    (contentAnalysisMode === 'text' && !contentText.trim()) ||
                    (contentAnalysisMode === 'file' && !selectedFile)
                  }
                  className="btn-primary"
                >
                  {!analyzingContent && (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {analyzingContent ? 'Analyzing...' : 'Analyze Content'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vocabulary Results */}
        {vocabularyPages.length > 0 && getCurrentPageData().length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
              <div className="card-header bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-white bg-opacity-20 p-2 rounded-full">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">
                        🎉 Found {getCurrentPageData().length} New Vocabulary Items {vocabularyPages.length > 1 ? `(Page ${currentPage + 1}/${vocabularyPages.length})` : ''}!
                      </h3>
                      <p className="text-blue-100 text-sm">
                        Select the words you want to add to your vocabulary collection
                      </p>
                      {(sourceInfo && (sourceInfo.url || sourceInfo.filename)) || originalContent ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {sourceInfo.url ? (
                            <a
                              href={sourceInfo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-blue-100 hover:text-white text-sm bg-white bg-opacity-20 px-3 py-1 rounded-full transition-colors"
                            >
                              <Link className="h-4 w-4 mr-2" />
                              View Original {sourceInfo.url.includes('youtube.com') || sourceInfo.url.includes('youtu.be') ? 'Video' : 'Content'}
                            </a>
                          ) : sourceInfo.filename && (
                            <div className="inline-flex items-center text-blue-100 text-sm bg-white bg-opacity-20 px-3 py-1 rounded-full">
                              <FileText className="h-4 w-4 mr-2" />
                              From: {sourceInfo.filename}
                            </div>
                          )}
                          {originalContent && (
                            <button
                              onClick={() => setShowContentViewer(true)}
                              className="inline-flex items-center text-blue-100 hover:text-white text-sm bg-white bg-opacity-20 px-3 py-1 rounded-full transition-colors"
                            >
                              <BookOpen className="h-4 w-4 mr-2" />
                              View {sourceInfo?.url?.includes('youtube.com') || sourceInfo?.url?.includes('youtu.be') ? 'Transcript' : sourceInfo?.filename ? 'File Content' : 'Text Content'}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setVocabularyResults([])
                      setVocabularyPages([])
                      setCurrentPage(0)
                      setSelectedWords(new Set())
                      setSelectedWordsPerPage({})
                      setSourceInfo(null)
                      setOriginalContent('')
                      setShowContentViewer(false)
                      setHasMore(false)
                      setNextOffset(0)
                      setTotalChunks(0)
                      setSelectedGroupId(null)
                    }}
                    className="text-white hover:text-gray-200 p-2"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="bg-blue-100 dark:bg-blue-800 px-4 py-2 rounded-full">
                      <span className="text-blue-800 dark:text-blue-200 font-medium">
                        {getCurrentPageSelections().size} selected on this page
                      </span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 text-sm">
                      Choose vocabulary that matches your learning goals
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={selectAllWordsOnPage}
                      className="btn-secondary bg-white shadow-md"
                    >
                      {getCurrentPageSelections().size === getCurrentPageData().length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={saveSelectedWords}
                      disabled={Object.values(selectedWordsPerPage).every(set => set.size === 0) || savingSelected}
                      className="btn-primary shadow-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      {savingSelected ? (
                        <>
                          <LoadingSpinner size="sm" className="mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <BookOpen className="h-4 w-4 mr-2" />
                          Save Selected ({Object.values(selectedWordsPerPage).reduce((total, set) => total + set.size, 0)})
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Top Pagination Controls */}
                {vocabularyPages.length > 1 && (
                  <div className="flex items-center justify-between bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Page {currentPage + 1} of {vocabularyPages.length}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-500">
                        ({getCurrentPageData().length} items)
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                        disabled={currentPage === 0}
                        className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(vocabularyPages.length - 1, prev + 1))}
                        disabled={currentPage === vocabularyPages.length - 1}
                        className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                  <div className="overflow-x-auto">
                    <table className="table">
                  <thead className="table-header">
                    <tr>
                      <th className="table-header-cell w-12">
                        <input
                          type="checkbox"
                          checked={getCurrentPageSelections().size === getCurrentPageData().length && getCurrentPageData().length > 0}
                          onChange={selectAllWordsOnPage}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="table-header-cell">Word</th>
                      <th className="table-header-cell">Type</th>
                      <th className="table-header-cell">CEFR</th>
                      <th className="table-header-cell">Definition</th>
                      <th className="table-header-cell">Vietnamese</th>
                      <th className="table-header-cell">Example</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {getCurrentPageData().map((item, index) => (
                      <tr key={index} className={getCurrentPageSelections().has(index) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                        <td className="table-cell">
                          <input
                            type="checkbox"
                            checked={getCurrentPageSelections().has(index)}
                            onChange={() => toggleWordSelection(index)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="table-cell">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {item.word}
                            </div>
                            {item.ipaPronunciation && (
                              <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                                /{item.ipaPronunciation}/
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="table-cell">
                          {item.wordType && (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getWordTypeColor(item.wordType)}`}>
                              {item.wordType}
                            </span>
                          )}
                        </td>
                        <td className="table-cell">
                          {item.cefrLevel && (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCefrColor(item.cefrLevel)}`}>
                              {item.cefrLevel}
                            </span>
                          )}
                        </td>
                        <td className="table-cell max-w-xs">
                          <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                            {item.definition}
                          </p>
                        </td>
                        <td className="table-cell max-w-xs">
                          <p className="text-sm text-gray-900 dark:text-white break-words">
                            {item.vietnameseTranslation || '-'}
                          </p>
                        </td>
                        <td className="table-cell max-w-xs">
                          <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">
                            {item.exampleSentence || '-'}
                          </p>
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                  </div>

                  {/* Bottom Pagination Controls */}
                  {vocabularyPages.length > 1 && (
                    <div className="mt-6 flex items-center justify-between bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Page {currentPage + 1} of {vocabularyPages.length}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-500">
                          ({getCurrentPageData().length} items)
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                          disabled={currentPage === 0}
                          className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(vocabularyPages.length - 1, prev + 1))}
                          disabled={currentPage === vocabularyPages.length - 1}
                          className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Load More Button */}
                  {hasMore && (
                    <div className="mt-6 flex flex-col items-center justify-center space-y-3">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Loaded {nextOffset} of {totalChunks} chunks
                      </div>
                      <button
                        onClick={getCurrentPageSelections().size > 0 ? saveSelectedAndLoadMore : loadMoreVocabulary}
                        disabled={loadingMore || savingSelected}
                        className="btn-primary shadow-lg bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700"
                      >
                        {loadingMore || savingSelected ? (
                          <>
                            <LoadingSpinner size="sm" className="mr-2" />
                            {savingSelected ? 'Saving and Loading More...' : 'Loading More...'}
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            {getCurrentPageSelections().size > 0 ? 'Save Selected and Load More' : 'Load More Vocabulary'}
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Viewer Modal */}
        {showContentViewer && originalContent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
              <div className="card-header bg-gradient-to-r from-green-500 to-blue-600 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-white bg-opacity-20 p-2 rounded-full">
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">
                        {sourceInfo?.url?.includes('youtube.com') || sourceInfo?.url?.includes('youtu.be')
                          ? '📺 Video Transcript'
                          : sourceInfo?.filename
                            ? '📄 File Content'
                            : '📝 Original Text Content'}
                      </h3>
                      <p className="text-green-100 text-sm">
                        {sourceInfo?.title || 'Content used for vocabulary analysis'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowContentViewer(false)}
                    className="text-white hover:text-gray-200 p-2"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed">
                    {originalContent}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {originalContent.length.toLocaleString()} characters • {Math.ceil(originalContent.length / 1000)} words (approx.)
                  </div>
                  <button
                    onClick={() => setShowContentViewer(false)}
                    className="btn-secondary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="card">
          <div className="card-body">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search Input */}
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="form-input pl-10"
                  placeholder="Search words..."
                  onChange={(e) => debouncedSearch(e.target.value)}
                />
              </div>

              {/* Date Filter */}
              <div className="flex-shrink-0">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="form-input"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last Month</option>
                  <option value="3months">Last 3 Months</option>
                </select>
              </div>

              {/* Group Filter */}
              <div className="flex-shrink-0">
                <GroupFilter
                  selectedGroups={selectedGroups}
                  onGroupsChange={handleGroupsChange}
                />
              </div>
            </div>

            {/* Active Filters Pills */}
            {selectedGroups.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <FilterPills
                  selectedGroups={selectedGroups}
                  groups={groups}
                  onRemoveGroup={handleRemoveGroup}
                  onClearAll={handleClearAllFilters}
                />
              </div>
            )}
          </div>
        </div>

        {/* Words List */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Words ({filteredWords.length})
                {selectedWordIds.size > 0 && (
                  <span className="ml-2 text-sm font-normal text-blue-600 dark:text-blue-400">
                    ({selectedWordIds.size} selected)
                  </span>
                )}
              </h3>
              {selectedWordIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeselectAll}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    Deselect All
                  </button>
                  <button
                    onClick={() => setShowBatchGroupSelector(true)}
                    className="btn-primary btn-sm"
                  >
                    Assign to Group
                  </button>
                </div>
              )}
              {selectedWordIds.size === 0 && filteredWords.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Select All
                </button>
              )}
            </div>
          </div>
          <div className="card-body p-0">
            {filteredWords.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {words.length === 0
                    ? 'No words in your vocabulary yet. Start by adding some words!'
                    : 'No words match your search.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead className="table-header">
                    <tr>
                      <th className="table-header-cell w-12">
                        <input
                          type="checkbox"
                          checked={filteredWords.length > 0 && selectedWordIds.size === filteredWords.length}
                          onChange={(e) => e.target.checked ? handleSelectAll() : handleDeselectAll()}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="table-header-cell">Word</th>
                      <th className="table-header-cell">Type</th>
                      <th className="table-header-cell">CEFR</th>
                      <th className="table-header-cell">Definition</th>
                      <th className="table-header-cell">Vietnamese</th>
                      <th className="table-header-cell">Synonyms</th>
                      <th className="table-header-cell">Example</th>
                      <th className="table-header-cell">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {filteredWords.map((word, index) => {
                      const isEditing = editingWordId === word.id

                      if (isEditing) {
                        return (
                          <tr key={word.id} className="bg-yellow-50 dark:bg-yellow-900/20">
                            <td className="table-cell" colSpan="9">
                              <div className="space-y-4 p-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      Word *
                                    </label>
                                    <input
                                      type="text"
                                      value={editFormData.word}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, word: e.target.value }))}
                                      className="form-input w-full"
                                      placeholder="Enter word"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      IPA Pronunciation
                                    </label>
                                    <input
                                      type="text"
                                      value={editFormData.ipa_pronunciation}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, ipa_pronunciation: e.target.value }))}
                                      className="form-input w-full font-mono"
                                      placeholder="e.g., ˈhɛloʊ"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      Word Type
                                    </label>
                                    <select
                                      value={editFormData.word_type}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, word_type: e.target.value }))}
                                      className="form-input w-full"
                                    >
                                      <option value="">Select type</option>
                                      <option value="noun">Noun</option>
                                      <option value="verb">Verb</option>
                                      <option value="adjective">Adjective</option>
                                      <option value="adverb">Adverb</option>
                                      <option value="pronoun">Pronoun</option>
                                      <option value="preposition">Preposition</option>
                                      <option value="conjunction">Conjunction</option>
                                      <option value="interjection">Interjection</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      CEFR Level
                                    </label>
                                    <select
                                      value={editFormData.cefr_level}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, cefr_level: e.target.value }))}
                                      className="form-input w-full"
                                    >
                                      <option value="">Select level</option>
                                      <option value="A1">A1</option>
                                      <option value="A2">A2</option>
                                      <option value="B1">B1</option>
                                      <option value="B2">B2</option>
                                      <option value="C1">C1</option>
                                      <option value="C2">C2</option>
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Definition *
                                  </label>
                                  <textarea
                                    value={editFormData.definition}
                                    onChange={(e) => setEditFormData(prev => ({ ...prev, definition: e.target.value }))}
                                    className="form-input w-full"
                                    rows="2"
                                    placeholder="Enter definition"
                                  />
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Vietnamese Translation
                                  </label>
                                  <input
                                    type="text"
                                    value={editFormData.vietnamese_translation}
                                    onChange={(e) => setEditFormData(prev => ({ ...prev, vietnamese_translation: e.target.value }))}
                                    className="form-input w-full"
                                    placeholder="Vietnamese meaning"
                                  />
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Synonyms
                                  </label>
                                  <input
                                    type="text"
                                    value={editFormData.synonyms}
                                    onChange={(e) => setEditFormData(prev => ({ ...prev, synonyms: e.target.value }))}
                                    className="form-input w-full"
                                    placeholder="Similar words"
                                  />
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Example Sentence
                                  </label>
                                  <textarea
                                    value={editFormData.example_sentence}
                                    onChange={(e) => setEditFormData(prev => ({ ...prev, example_sentence: e.target.value }))}
                                    className="form-input w-full"
                                    rows="2"
                                    placeholder="Example usage"
                                  />
                                </div>

                                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                  <button
                                    onClick={cancelEditWord}
                                    disabled={savingEdit}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={saveEditWord}
                                    disabled={savingEdit || !editFormData.word?.trim() || !editFormData.definition?.trim()}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
                                  >
                                    {savingEdit ? (
                                      <span className="flex items-center justify-center">
                                        <LoadingSpinner size="sm" className="mr-2" />
                                        Saving...
                                      </span>
                                    ) : (
                                      'Save Changes'
                                    )}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={word.id} className={selectedWordIds.has(word.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                          <td className="table-cell">
                            <input
                              type="checkbox"
                              checked={selectedWordIds.has(word.id)}
                              onChange={(e) => handleToggleWord(word.id, index, e)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="table-cell">
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {word.word}
                              </div>
                              {word.ipa_pronunciation && (
                                <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                                  /{word.ipa_pronunciation}/
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="table-cell">
                            {word.word_type && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getWordTypeColor(word.word_type)}`}>
                                {word.word_type}
                              </span>
                            )}
                          </td>
                          <td className="table-cell">
                            {word.cefr_level && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCefrColor(word.cefr_level)}`}>
                                {word.cefr_level}
                              </span>
                            )}
                          </td>
                          <td className="table-cell max-w-xs">
                            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                              {word.definition}
                            </p>
                          </td>
                          <td className="table-cell max-w-xs">
                            <p className="text-sm text-gray-900 dark:text-white truncate">
                              {word.vietnamese_translation || '-'}
                            </p>
                          </td>
                          <td className="table-cell max-w-xs">
                            <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                              {word.synonyms || '-'}
                            </p>
                          </td>
                          <td className="table-cell max-w-xs">
                            <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">
                              {word.example_sentence}
                            </p>
                          </td>
                          <td className="table-cell">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => startEditWord(word)}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Edit word"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => deleteWord(word.id)}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                title="Delete word"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Batch Group Selector Modal */}
        {showBatchGroupSelector && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Assign {selectedWordIds.size} {selectedWordIds.size === 1 ? 'word' : 'words'} to group
                </h3>
                <button
                  onClick={() => setShowBatchGroupSelector(false)}
                  disabled={batchAssigning}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6">
                <GroupSelector
                  value={batchGroupId}
                  onChange={handleBatchGroupChange}
                  className="mb-4"
                />
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => {
                      setShowBatchGroupSelector(false)
                      setBatchGroupId(null)
                    }}
                    disabled={batchAssigning}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBatchAssignGroup}
                    disabled={batchAssigning || !batchGroupId}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
                  >
                    {batchAssigning ? (
                      <span className="flex items-center justify-center">
                        <LoadingSpinner size="sm" className="mr-2" />
                        Assigning...
                      </span>
                    ) : (
                      'Assign'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default Vocabulary