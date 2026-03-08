'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Home,
  LogOut,
  MessageSquare,
  Settings,
  Users,
  UserRound,
  Bell,
  Compass,
  UserCircle,
} from 'lucide-react';

import { ProtectedRoute } from '@/components/protected-route';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import AppShell from '@/components/app-shell';

const nav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/explore', label: 'Explore Skills', icon: Compass },
];

const bottomNav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/network', label: 'My Network', icon: Users },
  { href: '/calendar', label: 'Calender', icon: CalendarDays },
  { href: '/notifications', label: 'Notification', icon: Bell },
  { href: '/dashboard/settings', label: 'Profile', icon: UserCircle },
];

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
  const [meProfile, setMeProfile] = useState<
    Pick<import('@/lib/supabase').UserProfile,
      'id' | 'full_name' | 'bio' | 'skills_count' | 'swap_points'
    > | null
  >(null);
  const [meSettings, setMeSettings] = useState<
    Pick<import('@/lib/supabase').UserSettings,
      'avatar_url' | 'headline' | 'current_title' | 'current_company' | 'display_name' | 'username'
    > | null
  >(null);

  // identity prioritization: custom values first, google metadata second
  const displayName =
    meProfile?.full_name ||
    meSettings?.display_name ||
    meSettings?.username ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'there';

  const avatarUrl =
    meSettings?.avatar_url ||
    (user?.user_metadata?.avatar_url as string | undefined) ||
    '';

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    // load profile/settings so we can show the preferred identity values.
    const fetchMe = async () => {
      try {
        const [{ data: p }, { data: s }] = await Promise.all([
          supabase
            .from('user_profiles')
            .select('id, full_name, bio, skills_count, swap_points')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('user_settings')
            .select('avatar_url, headline, current_title, current_company, display_name, username')
            .eq('id', user.id)
            .maybeSingle(),
        ]);
        setMeProfile((p || null) as any);
        setMeSettings((s || null) as any);
      } catch (e) {
        console.warn('failed to load current user profile/settings', e);
      }
    };
    void fetchMe();

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
        showSidebar={false}
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
        headerLeft={null}
        headerRight={
          <>
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-skillswap-600 hover:bg-skillswap-50"
              aria-label="Messages"
              onClick={() => router.push('/messages')}
            >
              <MessageSquare className="h-5 w-5" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="text-skillswap-600 hover:bg-skillswap-50"
              aria-label="Sign out from SkillSwap"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
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
