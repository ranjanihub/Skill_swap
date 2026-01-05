'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  CalendarDays,
  Home,
  LogOut,
  MessageSquare,
  Settings,
  Users,
  UserRound,
  Bell,
} from 'lucide-react';

import { ProtectedRoute } from '@/components/protected-route';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import AppShell from '@/components/app-shell';

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

  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          try {
            const newNotif = payload.new as any;
            const type = (newNotif?.type as string | undefined) || '';

            if (type === 'skill_match') {
              const actor = newNotif.payload?.actor_name || 'Someone';
              const skillName = newNotif.payload?.skill_name || 'a skill';
              const skillType = newNotif.payload?.skill_type;
              const verb = skillType === 'teach' ? 'can teach' : 'wants to learn';
              toast({
                title: 'Skill match found',
                description: `${actor} ${verb} ${skillName}.`,
              });
              return;
            }

            // default / legacy behavior
            const requester = newNotif.payload?.requester_name || 'Someone';
            toast({
              title: 'New notification',
              description: `${requester} sent you an update.`,
            });
          } catch (e) {
            console.error('Notification handler error', e);
          }
        }
      )
      .subscribe();

    return () => {
      try {
        void supabase.removeChannel(channel);
      } catch (e) {
        // ignore
      }
    };
  }, [user, toast]);

  return (
    <ProtectedRoute>
      <AppShell
        nav={nav}
        bottomNav={bottomNav}
        bottomActions={
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
        }
        headerLeft={
          <>
            <p className="text-sm sm:text-base font-semibold text-skillswap-dark truncate">
              Good morning, {displayName}
            </p>
            <p className="text-xs text-skillswap-600 truncate">Welcome back to SkillSwap</p>
          </>
        }
        headerRight={
          <>
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
          </>
        }
      >
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
