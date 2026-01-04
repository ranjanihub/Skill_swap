'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  CalendarDays,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Users,
  UserRound,
  Bell,
} from 'lucide-react';

import { ProtectedRoute } from '@/components/protected-route';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';

const nav = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/public-view', label: 'User public view', icon: UserRound },
  { href: '/dashboard/connections', label: 'Connections', icon: Users },
  { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
];

const bottomNav = [{ href: '/dashboard/settings', label: 'Profile settings', icon: Settings }];

function initials(name?: string | null) {
  const safe = (name || '').trim();
  if (!safe) return 'U';
  const parts = safe.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'U';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (first + last).toUpperCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'there';

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="text-skillswap-600 hover:bg-skillswap-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </aside>

        <div className="min-h-screen pl-[76px] flex flex-col min-w-0">
          <header className="h-16 bg-white border-b border-skillswap-200 flex items-center justify-between px-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-semibold text-skillswap-dark truncate">
                Good morning, {displayName}
              </p>
              <p className="text-xs text-skillswap-600 truncate">Welcome back to SkillSwap</p>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <ThemeToggle />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-skillswap-600 hover:bg-skillswap-50"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </Button>

              <Avatar className="h-9 w-9">
                <AvatarImage
                  src={(user?.user_metadata?.avatar_url as string | undefined) || ''}
                  alt={displayName}
                />
                <AvatarFallback>{initials(displayName)}</AvatarFallback>
              </Avatar>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
