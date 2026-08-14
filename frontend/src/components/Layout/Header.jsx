import React, { useState } from 'react'
import { Menu, PanelLeft, Bell, Sun, Moon, Monitor, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

const Header = ({ sidebarCollapsed, onToggleSidebar }) => {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    setShowProfileMenu(false)
  }

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-full mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16 gap-2">
          {/* Sidebar toggle — mobile drawer + desktop collapse */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            ) : (
              <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
            )}
          </button>

          <div className="flex-1 min-w-0" />

          {/* Right section */}
          <div className="flex items-center space-x-1 sm:space-x-3">
            {/* Notifications */}
            <button
              type="button"
              className="p-2 text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>

            {/* Theme toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-2 text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label="Theme"
              >
                {theme === 'light' && <Sun className="h-5 w-5" />}
                {theme === 'dark' && <Moon className="h-5 w-5" />}
                {theme === 'system' && <Monitor className="h-5 w-5" />}
              </button>

              {showThemeMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-gray-700 z-50">
                  <div className="py-1">
                    {themeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setTheme(option.value)
                          setShowThemeMenu(false)
                        }}
                        className={cn(
                          'w-full flex items-center px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700',
                          theme === option.value
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <option.icon className="h-4 w-4 mr-3" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center space-x-2 sm:space-x-3 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-white">
                    {user?.user_metadata?.full_name?.[0] || user?.email?.[0] || 'U'}
                  </span>
                </div>
                <span className="hidden lg:block text-gray-700 dark:text-gray-300 font-medium truncate max-w-[10rem]">
                  {user?.user_metadata?.full_name || user?.email}
                </span>
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-gray-800 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-gray-700 z-50">
                  <div className="py-1">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {user?.user_metadata?.full_name || 'User'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {user?.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close menus */}
      {(showProfileMenu || showThemeMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowProfileMenu(false)
            setShowThemeMenu(false)
          }}
        />
      )}
    </header>
  )
}

export default Header
