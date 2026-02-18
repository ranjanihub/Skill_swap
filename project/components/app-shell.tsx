'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
};

export default function AppShell({
  children,
  headerLeft,
  headerRight,
  nav,
  bottomNav = [],
  bottomActions,
  showSidebar = true,
}: Props) {
  const pathname = usePathname();
  const showMobileBottomNav = !showSidebar && bottomNav.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {showSidebar && (
        <aside className="fixed inset-y-0 left-0 w-[76px] bg-white border-r border-skillswap-200 flex flex-col items-center py-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-skillswap-600 hover:bg-skillswap-50"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <nav className="mt-6 flex flex-col gap-2 w-full px-2">
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
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>

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
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}

          {bottomActions}
        </div>
        </aside>
      )}

      <div className={cn('min-h-screen flex flex-col min-w-0', showSidebar && 'pl-[76px]')}>
        <header className="h-16 bg-white border-b border-skillswap-200 flex items-center justify-between px-4 sm:px-6">
          <div className="min-w-0">{headerLeft}</div>
          <div className="flex items-center gap-1 sm:gap-2">{headerRight}</div>
        </header>

        <main className={cn('flex-1 p-4 sm:p-6')}>{children}</main>
      </div>
      {/* bottom nav removed from AppShell; use global BottomNav instead */}
    </div>
  );
}
