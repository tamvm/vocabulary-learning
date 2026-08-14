import React, { useState, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { Plus, FolderOpen, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGroups } from '@/hooks/useGroups'
import GroupCard from '@/components/GroupCard'
import GroupForm from '@/components/GroupForm'
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog'
import LoadingSpinner from '@/components/UI/LoadingSpinner'
import toast from 'react-hot-toast'

const Groups = () => {
  const navigate = useNavigate()
  const { groups, loading, error, createGroup, updateGroup, deleteGroup, refetch } = useGroups()

  const [showGroupForm, setShowGroupForm] = useState(false)
  const [formMode, setFormMode] = useState('create')
  const [selectedGroup, setSelectedGroup] = useState(null)

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')

  const handleCreateClick = () => {
    setFormMode('create')
    setSelectedGroup(null)
    setShowGroupForm(true)
  }

  const handleEditClick = (group) => {
    setFormMode('edit')
    setSelectedGroup(group)
    setShowGroupForm(true)
  }

  const handleDeleteClick = (group) => {
    setGroupToDelete(group)
    setShowDeleteDialog(true)
  }

  const handleFormSubmit = async (groupData) => {
    try {
      let result
      if (formMode === 'create') {
        result = await createGroup(groupData)
        if (result.success) {
          toast.success('Group created successfully')
          setShowGroupForm(false)
        } else {
          toast.error(result.error || 'Failed to create group')
        }
      } else {
        result = await updateGroup(selectedGroup.id, groupData)
        if (result.success) {
          toast.success('Group updated successfully')
          setShowGroupForm(false)
        } else {
          toast.error(result.error || 'Failed to update group')
        }
      }
    } catch (err) {
      toast.error('An unexpected error occurred')
      console.error('Form submit error:', err)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!groupToDelete) return

    try {
      setDeleting(true)
      const result = await deleteGroup(groupToDelete.id)

      if (result.success) {
        const orphanedCount = result.data?.orphanedWords || 0
        if (orphanedCount > 0) {
          toast.success(
            `Group deleted. ${orphanedCount} ${orphanedCount === 1 ? 'word' : 'words'} orphaned.`
          )
        } else {
          toast.success('Group deleted successfully')
        }
        setShowDeleteDialog(false)
        setGroupToDelete(null)
      } else {
        toast.error(result.error || 'Failed to delete group')
      }
    } catch (err) {
      toast.error('An unexpected error occurred')
      console.error('Delete error:', err)
    } finally {
      setDeleting(false)
    }
  }

  const handleGroupClick = (group) => {
    // Navigate to vocabulary page with group filter
    navigate(`/vocabulary?groups=${group.id}`)
  }

  const handleStudyClick = (group) => {
    // Navigate to study page with group filter
    navigate(`/study?groups=${group.id}`)
  }

  const handleRetry = () => {
    refetch()
  }

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const query = searchQuery.toLowerCase()
    return groups.filter(group =>
      group.name.toLowerCase().includes(query) ||
      (group.description && group.description.toLowerCase().includes(query))
    )
  }, [groups, searchQuery])

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
        <title>Groups - Magic English</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Groups
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Organize your vocabulary into themed groups
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              onClick={handleCreateClick}
              className="btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </button>
          </div>
        </div>

        {/* Search/Filter */}
        {!error && groups.length > 0 && (
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search groups by name or description..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="card">
            <div className="card-body">
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
                  <svg
                    className="w-6 h-6 text-red-600 dark:text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Failed to Load Groups
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {error}
                </p>
                <button
                  onClick={handleRetry}
                  className="btn-primary"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!error && groups.length === 0 && (
          <div className="card">
            <div className="card-body">
              <div className="text-center py-12">
                <FolderOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No groups yet
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Get started by creating your first vocabulary group
                </p>
                <button
                  onClick={handleCreateClick}
                  className="btn-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Group
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No search results */}
        {!error && groups.length > 0 && filteredGroups.length === 0 && (
          <div className="card">
            <div className="card-body">
              <div className="text-center py-8">
                <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No groups found
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  No groups match "{searchQuery}"
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Clear search
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Groups grid */}
        {!error && filteredGroups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                onStudy={handleStudyClick}
                onClick={() => handleGroupClick(group)}
              />
            ))}
          </div>
        )}

        {/* Group Form Modal */}
        <GroupForm
          isOpen={showGroupForm}
          onClose={() => {
            setShowGroupForm(false)
            setSelectedGroup(null)
          }}
          mode={formMode}
          initialData={selectedGroup}
          onSubmit={handleFormSubmit}
        />

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          isOpen={showDeleteDialog}
          onClose={() => {
            setShowDeleteDialog(false)
            setGroupToDelete(null)
          }}
          groupName={groupToDelete?.name || ''}
          vocabularyCount={groupToDelete?.vocabularyCount || 0}
          onConfirm={handleDeleteConfirm}
          loading={deleting}
        />
      </div>
    </>
  )
}

export default Groups
