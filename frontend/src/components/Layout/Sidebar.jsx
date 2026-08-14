import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  FolderOpen,
  BrainCircuit,
  PenTool,
  Play,
  User,
  Settings,
  Sparkles,
  HelpCircle,
  PanelLeftClose,
} from 'lucide-react'

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Vocabulary',
    href: '/vocabulary',
    icon: BookOpen,
  },
  {
    name: 'Groups',
    href: '/groups',
    icon: FolderOpen,
  },
  {
    name: 'Quiz Questions',
    href: '/quiz-questions',
    icon: HelpCircle,
  },
  {
    name: 'Study',
    href: '/study',
    icon: BrainCircuit,
  },
  {
    name: 'Learn',
    href: '/learn',
    icon: Play,
  },
  {
    name: 'Sentence Scoring',
    href: '/scoring',
    icon: PenTool,
  },
  {
    name: 'Profile & Stats',
    href: '/profile',
    icon: User,
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

const NavItems = ({ onNavigate }) => (
  <nav className="flex-1 px-3 sm:px-4 space-y-1 py-4 sm:py-6">
    {navigation.map((item) => (
      <NavLink
        key={item.name}
        to={item.href}
        onClick={onNavigate}
        className={({ isActive }) =>
          isActive ? 'nav-link-active' : 'nav-link-inactive'
        }
      >
        <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
        <span className="truncate">{item.name}</span>
      </NavLink>
    ))}
  </nav>
)

const SidebarPanel = ({ onClose, onCollapse, showCollapse }) => (
  <div className="flex flex-col w-64 max-w-[85vw] h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
    <div className="flex items-center flex-shrink-0 px-4 sm:px-6 py-4 gap-2">
      <div className="flex items-center min-w-0">
        <Sparkles className="h-8 w-8 text-primary-600 flex-shrink-0" />
        <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white truncate">
          Magic English
        </span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-auto p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Close sidebar"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {showCollapse && onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          className="ml-auto p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >
          <PanelLeftClose className="h-5 w-5" />
        </button>
      )}
    </div>

    <div className="flex-grow flex flex-col overflow-y-auto min-h-0">
      <NavItems onNavigate={onClose} />

      <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Magic English v1.0.0
        </div>
      </div>
    </div>
  </div>
)

const Sidebar = ({ showMobile, setShowMobile, collapsed, onCollapse }) => {
  return (
    <>
      {/* Mobile sidebar (overlay drawer) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:hidden transform transition-transform duration-200 ease-out ${
          showMobile ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-hidden={!showMobile}
      >
        <SidebarPanel onClose={() => setShowMobile(false)} />
      </div>

      {/* Desktop sidebar */}
      <div
        className={`hidden md:flex md:flex-col flex-shrink-0 transition-[width] duration-200 ease-out overflow-hidden ${
          collapsed ? 'md:w-0' : 'md:w-64'
        }`}
      >
        {!collapsed && (
          <SidebarPanel showCollapse onCollapse={onCollapse} />
        )}
      </div>
    </>
  )
}

export default Sidebar
