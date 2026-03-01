'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Home as HomeIcon, Users, Calendar, Bell, Briefcase, MessageSquare, Search, Compass, UserCircle } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { isSupabaseConfigured, Notification, supabase, supabaseConfigError } from '@/lib/supabase';
import { formatExactDateTime, formatExactDateTimeWithSeconds } from '@/lib/utils';

import AppShell, { type ShellNavItem } from '@/components/app-shell';

import { Card } from '@/components/ui/card';

function notifTitle(n: Notification) {
  const type = (n.type || '').toLowerCase();
  if (type === 'skill_match') return 'Skill match found';
  if (type === 'connection_request') return 'Connection request';
  if (type === 'message') return 'New message';
  return 'Notification';
}

function notifBody(n: Notification) {
  const payload = n.payload || {};
  const type = (n.type || '').toLowerCase();

  if (type === 'skill_match') {
    const actor = payload.actor_name || 'Someone';
    const skillName = payload.skill_name || 'a skill';
    const skillType = payload.skill_type;
    const verb = skillType === 'teach' ? 'can teach' : 'wants to learn';
    return `${actor} ${verb} ${skillName}.`;
  }

  if (payload?.message) return String(payload.message);

  const requester = payload.requester_name;
  if (requester) return `${requester} sent you an update.`;

  return 'You have a new update.';
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading, configError } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [query, setQuery] = useState('');

  const publicNav: ShellNavItem[] = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/explore', label: 'Explore Skills', icon: Compass },
  ];

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel(`notifications-page:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          try {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as Notification;
              setNotifications((prev) => [next, ...prev].slice(0, 50));
              return;
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as Notification;
              setNotifications((prev) => prev.map((n) => (n.id === next.id ? next : n)));
              return;
            }
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as { id?: string };
              if (!oldRow?.id) return;
              setNotifications((prev) => prev.filter((n) => n.id !== oldRow.id));
            }
          } catch (e) {
            console.warn('notifications realtime handler failed', e);
          }
        }
      )
      .subscribe();

    return () => {
      try {
        void supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    if (!isSupabaseConfigured) {
      setError(configError || supabaseConfigError || 'Supabase is not configured');
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setError('');

        const { data, error: notifErr } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (notifErr) throw notifErr;

        setNotifications(((data || []) as Notification[]) ?? []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load notifications';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user, configError]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) => {
      const t = notifTitle(n).toLowerCase();
      const b = notifBody(n).toLowerCase();
      return t.includes(q) || b.includes(q);
    });
  }, [notifications, query]);

  return (
    <AppShell
      showSidebar={false}
      nav={publicNav}
      bottomNav={[
        { href: '/', label: 'Home', icon: HomeIcon },
        { href: '/network', label: 'My Network', icon: Users },
        { href: '/calendar', label: 'Calender', icon: Calendar },
        { href: '/notifications', label: 'Notification', icon: Bell },
        { href: '/dashboard/settings', label: 'Settings', icon: UserCircle },
      ]}
      headerLeft={
        <div className="w-full flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            <Image src="/SkillSwap_Logo.jpg" alt="SkillSwap" width={40} height={40} className="object-cover" />
          </div>
          <div className="flex-1 min-w-0 flex justify-center">
            <div className="w-full max-w-2xl relative">
              <input
                aria-label="Search swaps"
                placeholder="Search Swaps"
                className="mobile-header-search pl-10 w-full"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-skillswap-400" />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              aria-label="Notifications"
              title="Notifications"
              onClick={() => router.push('/notifications')}
              className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm"
            >
              <Bell className="h-5 w-5 text-skillswap-600" />
            </button>
          </div>
        </div>
      }
    >
      <div className="w-full max-w-[1200px] mx-auto">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-skillswap-200">
            <h1 className="text-lg font-semibold text-skillswap-800">Notifications</h1>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="py-10 text-center text-sm text-skillswap-600">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-skillswap-600">No notifications.</div>
            ) : (
              <div className="divide-y divide-skillswap-200">
                {filtered.map((n) => (
                  <div key={n.id} className="py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-9 w-9 rounded-full bg-skillswap-100 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-skillswap-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-skillswap-800">{notifTitle(n)}</p>
                        <p className="mt-1 text-sm text-skillswap-600">{notifBody(n)}</p>
                        <time
                          className="mt-2 block text-xs text-skillswap-500"
                          dateTime={n.created_at}
                          title={formatExactDateTimeWithSeconds(n.created_at)}
                        >
                          {formatExactDateTime(n.created_at)}
                        </time>
                      </div>
                      {!n.read && (
                        <span
                          className="mt-2 h-2 w-2 rounded-full bg-skillswap-500"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
