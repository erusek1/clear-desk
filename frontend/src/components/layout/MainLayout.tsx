// frontend/src/components/layout/MainLayout.tsx

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { 
  Home, 
  Clipboard, 
  FileText, 
  Package, 
  BarChart, 
  Settings, 
  User, 
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Link, useLocation } from 'react-router-dom';

// Navigation items
const navItems = [
  { label: 'Dashboard', icon: Home, href: '/dashboard' },
  { label: 'Projects', icon: Clipboard, href: '/projects' },
  { label: 'Estimates', icon: FileText, href: '/estimates' },
  { label: 'Inventory', icon: Package, href: '/inventory' },
  { label: 'Reports', icon: BarChart, href: '/reports' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];

const MainLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black bg-opacity-50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-primary text-primary-foreground transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-4 py-5">
            <Link to="/" className="text-xl font-bold">Clear-Desk.com</Link>
            <button 
              className="rounded p-1 text-primary-foreground hover:bg-primary-foreground/10 lg:hidden"
              onClick={toggleSidebar}
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User menu */}
          <div className="border-t border-primary-foreground/10 p-4">
            <div className="flex items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/20 text-primary-foreground">
                <User size={18} />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-primary-foreground">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-primary-foreground/70">
                  {user?.email}
                </p>
              </div>
            </div>
            <button
              className="mt-4 flex w-full items-center rounded-md px-2 py-2 text-sm font-medium text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={logout}
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow">
          <div className="flex h-16 items-center justify-between px-4">
            <button
              className="rounded p-1 text-gray-500 hover:bg-gray-100 lg:hidden"
              onClick={toggleSidebar}
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center">
              {/* Add header content here (notifications, search, etc.) */}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;