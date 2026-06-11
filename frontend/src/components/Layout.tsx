import { NavLink, Outlet } from 'react-router-dom'
import { PenTool, FileText, Settings, Zap } from 'lucide-react'

const navItems = [
  { to: '/', icon: Zap, label: 'AI 创作' },
  { to: '/articles', icon: FileText, label: '文章管理' },
  { to: '/settings', icon: Settings, label: '配置' },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <PenTool className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">WriteFlow</span>
        </div>
        <nav className="space-y-1 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium">WriteFlow v0.1.0</p>
            <p className="mt-1">AI 自动写作与发布平台</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 min-h-screen">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
