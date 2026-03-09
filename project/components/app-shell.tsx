'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/context/notification-context';

export type ShellNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Props = {
  children: React.ReactNode;
  headerLeft: React.ReactNode;
  headerRight?: React.ReactNode;
  nav: ShellNavItem[];
  bottomNav?: ShellNavItem[];
  bottomActions?: React.ReactNode;
  showSidebar?: boolean;
  /**
   * optional content that should appear inside the mobile drawer below
   * the primary navigation links (e.g. filters or extra panels).
   */
  mobileMenu?: React.ReactNode;
};

export default function AppShell({
  children,
  headerLeft,
  headerRight,
  nav,
  bottomNav = [],
  bottomActions,
  showSidebar = true,
  mobileMenu,
}: Props) {
  const pathname = usePathname();
  const { unread } = useNotifications();
  const showMobileBottomNav = !showSidebar && bottomNav.length > 0;
  const [menuOpen, setMenuOpen] = useState(false);

  // close menu when path changes
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const renderNavItems = (className = '') => (
    <nav className={cn('flex flex-col gap-2 w-full', className)}>
      {nav.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'relative flex items-center justify-center h-11 rounded-xl text-skillswap-600 hover:bg-skillswap-50 transition-colors',
              isActive && 'bg-skillswap-100 text-skillswap-500'
            )}
            aria-label={item.label}
            title={item.label}
          >
            {isActive && (
              <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-skillswap-500" />
            )}
            <div className="relative">
              <Icon className="h-5 w-5" />
              {item.href === '/messages' && unread.messages > 0 ? (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              ) : null}
              {item.href === '/notifications' && unread.notifications > 0 ? (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              ) : null}
              {item.href === '/network' && unread.requests > 0 ? (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              ) : null}
            </div>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* desktop sidebar */}
      {showSidebar && (
        <aside className="fixed inset-y-0 left-0 w-[76px] bg-white border-r border-skillswap-200 flex flex-col items-center py-4 hidden lg:flex">
          {renderNavItems()}
          <div className="mt-auto pt-4 w-full px-2 flex flex-col gap-2">
            {bottomNav.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center justify-center h-11 rounded-xl text-skillswap-600 hover:bg-skillswap-50 transition-colors',
                    isActive && 'bg-skillswap-100 text-skillswap-500'
                  )}
                  aria-label={item.label}
                  title={item.label}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-skillswap-500" />
                  )}
                  <div className="relative">
                    <Icon className="h-5 w-5" />
                    {item.href === '/messages' && unread.messages > 0 ? (
                      <span className="absolute -top-2 -right-3 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    ) : null}
                    {item.href === '/notifications' && unread.notifications > 0 ? (
                      <span className="absolute -top-2 -right-3 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    ) : null}
                    {item.href === '/network' && unread.requests > 0 ? (
                      <span className="absolute -top-2 -right-3 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    ) : null}
                  </div>
                </Link>
              );
            })}

            {bottomActions}
          </div>
        </aside>
      )}

      {/* mobile drawer (always rendered for animation) */}
      <div
        className={cn(
          'fixed inset-0 z-50 flex lg:hidden pointer-events-none',
          menuOpen ? 'pointer-events-auto' : ''
        )}
      >
        <div
          className={cn(
            'absolute inset-0 bg-black/50 transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMenuOpen(false)}
        />
        <aside
          className={cn(
            'relative w-64 bg-white p-4 overflow-y-auto transform transition-transform duration-200 ease-in-out',
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-skillswap-600 mb-4"
            onClick={() => setMenuOpen(false)}
          >
            <Menu className="h-5 w-5 rotate-45" />
          </Button>
          {renderNavItems()}
          {mobileMenu && <div className="mt-4">{mobileMenu}</div>}
          <div className="mt-6 border-t border-skillswap-200 pt-4">
            {bottomNav.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center justify-center h-11 rounded-xl text-skillswap-600 hover:bg-skillswap-50 transition-colors mb-2',
                    isActive && 'bg-skillswap-100 text-skillswap-500'
                  )}
                  aria-label={item.label}
                  title={item.label}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-skillswap-500" />
                  )}
                  <div className="relative">
                    <Icon className="h-5 w-5" />
                  </div>
                </Link>
              );
            })}
            {bottomActions}
          </div>
        </aside>
      </div>

      <div className={cn('min-h-screen flex flex-col min-w-0', showSidebar && 'lg:pl-[76px]')}>
        <header className="h-16 bg-white border-b border-skillswap-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            {/* hamburger for mobile, shown if we have any navigation links */}
            {nav.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-skillswap-600 lg:hidden"
                aria-label="Menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="min-w-0">{headerLeft}</div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">{headerRight}</div>
        </header>

        <main className={cn('flex-1 p-4 sm:p-6')}>{children}</main>
      </div>
      {/* bottom nav removed from AppShell; use global BottomNav instead */}
    </div>
  );
}
