import React, { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const SIDEBAR_STORAGE_KEY = 'me-sidebar-collapsed'

const Layout = () => {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed])

  const toggleSidebar = () => {
    // Below md: use overlay drawer. At md+: collapse/expand desktop sidebar.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      setSidebarCollapsed((prev) => !prev)
      setShowMobileSidebar(false)
      return
    }
    setShowMobileSidebar((prev) => !prev)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Mobile sidebar overlay */}
      {showMobileSidebar && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setShowMobileSidebar(false)}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-gray-600 opacity-75"></div>
        </div>
      )}

      <Sidebar
        showMobile={showMobileSidebar}
        setShowMobile={setShowMobileSidebar}
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="w-full max-w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout
