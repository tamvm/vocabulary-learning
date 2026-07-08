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
  HelpCircle
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

const Sidebar = ({ showMobile, setShowMobile }) => {
  return (
    <>
      {/* Mobile sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 md:hidden ${showMobile ? 'block' : 'hidden'}`}>
        <div className="flex flex-col w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className="flex items-center flex-shrink-0 px-6 py-4">
            <div className="flex items-center">
              <Sparkles className="h-8 w-8 text-primary-600" />
              <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">
                Magic English
              </span>
            </div>
            <button
              onClick={() => setShowMobile(false)}
              className="ml-auto p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-grow flex flex-col overflow-y-auto">
            <nav className="flex-1 px-4 space-y-2 py-6">
              {navigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  onClick={() => setShowMobile(false)}
                  className={({ isActive }) =>
                    isActive
                      ? 'nav-link-active'
                      : 'nav-link-inactive'
                  }
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </NavLink>
              ))}
            </nav>

            <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Magic English v1.0.0
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow pt-5 overflow-y-auto bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="flex items-center flex-shrink-0 px-6">
          <div className="flex items-center">
            <Sparkles className="h-8 w-8 text-primary-600" />
            <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">
              Magic English
            </span>
          </div>
        </div>

        <div className="mt-8 flex-grow flex flex-col">
          <nav className="flex-1 px-4 space-y-2">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  isActive
                    ? 'nav-link-active'
                    : 'nav-link-inactive'
                }
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Magic English v1.0.0
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

export default Sidebar