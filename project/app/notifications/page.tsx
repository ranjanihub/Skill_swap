'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Home as HomeIcon,
  Users,
  Calendar,
  Bell,
  MessageSquare,
  Search,
  Compass,
  UserCircle,
  Clock,
  CheckCircle2,
  Video,
  Star,
  ExternalLink,
} from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { useNotifications } from '@/context/notification-context';
import { isSupabaseConfigured, Notification, supabase, supabaseConfigError } from '@/lib/supabase';
import { formatExactDateTime, formatExactDateTimeWithSeconds } from '@/lib/utils';

import AppShell, { type ShellNavItem } from '@/components/app-shell';

import { Card } from '@/components/ui/card';

type NotifView = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  details?: string[];
  href?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
};

function safeFormatDateTime(iso?: string | null) {
  if (!iso) return null;
  try {
    return formatExactDateTime(String(iso));
  } catch {
    const d = new Date(String(iso));
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString();
  }
}

function plural(n: number, s: string) {
  return `${n} ${s}${n === 1 ? '' : 's'}`;
}

function getSlotsCount(payload: any): number | null {
  if (!payload) return null;
  if (typeof payload.slots_count === 'number') return payload.slots_count;
  if (Array.isArray(payload.slots)) return payload.slots.length;
  if (Array.isArray(payload.availabilities)) return payload.availabilities.length;
  return null;
}

function buildNotifView(n: Notification, opts: { routerPush: (href: string) => void }): NotifView {
  const payload = n.payload || {};
  const type = String(n.type || '').toLowerCase();

  const requesterName = payload.requester_name as string | undefined;
  const actorName = (payload.actor_name as string | undefined) || requesterName;
  const partnerName = (payload.partner_name as string | undefined) || actorName;

  const skillName =
    (payload.skill_name as string | undefined) ||
    (payload.requested_skill_name as string | undefined) ||
    (payload.skill as string | undefined);
  const offeredSkillName = payload.offered_skill_name as string | undefined;

  const requestId = (payload.request_id as string | undefined) || (payload.connection_request_id as string | undefined);
  const scheduledAt = safeFormatDateTime(payload.scheduled_at as string | undefined);
  const durationMinutes = payload.duration_minutes as number | undefined;
  const meetLink = payload.meet_link as string | undefined;
  const meetAvailable = payload.meet_link_available === false ? false : Boolean(meetLink);
  const slotsCount = getSlotsCount(payload);

  const push = (href: string) => opts.routerPush(href);

  if (type === 'skill_match') {
    const skillType = payload.skill_type;
    const verb = skillType === 'teach' ? 'can teach' : 'wants to learn';
    return {
      icon: Compass,
      title: 'Skill match found',
      body: `${actorName || 'Someone'} ${verb} ${skillName || 'a skill'}.`,
      href: '/',
      primaryAction: { label: 'Explore', onClick: () => push('/') },
    };
  }

  if (type === 'connection_request') {
    const details: string[] = [];
    if (skillName) details.push(`Requested: ${skillName}`);
    if (offeredSkillName) details.push(`Offered: ${offeredSkillName}`);
    if (typeof slotsCount === 'number') details.push(`Proposed: ${plural(slotsCount, 'time slot')}`);
    if (durationMinutes) details.push(`Duration: ${durationMinutes} min`);

    const acceptHref = requestId ? `/dashboard/connections?acceptRequestId=${encodeURIComponent(requestId)}` : '/dashboard/connections';
    const viewHref = requestId ? `/network?requestId=${encodeURIComponent(requestId)}` : '/network';

    return {
      icon: Users,
      title: 'Swap request received',
      body: requesterName ? `${requesterName} sent you a swap request.` : 'You received a new swap request.',
      details,
      href: acceptHref,
      primaryAction: { label: 'Accept', onClick: () => push(acceptHref) },
      secondaryAction: { label: 'View', onClick: () => push(viewHref) },
    };
  }

  if (type === 'swap_request_accepted') {
    const details: string[] = [];
    if (skillName) details.push(`Skill: ${skillName}`);
    if (scheduledAt) details.push(`Scheduled: ${scheduledAt}`);
    if (durationMinutes) details.push(`Duration: ${durationMinutes} min`);

    return {
      icon: CheckCircle2,
      title: 'Swap request accepted',
      body: partnerName ? `${partnerName} accepted your request.` : 'Your request was accepted.',
      details,
      href: '/calendar',
      primaryAction: { label: 'Open chat', onClick: () => push('/messages') },
      secondaryAction: { label: 'View session', onClick: () => push('/calendar') },
    };
  }

  if (type === 'session_scheduled') {
    const details: string[] = [];
    if (skillName) details.push(`Skill: ${skillName}`);
    if (scheduledAt) details.push(`When: ${scheduledAt}`);
    if (durationMinutes) details.push(`Duration: ${durationMinutes} min`);
    details.push(meetAvailable ? 'Meet link: ready' : 'Meet link: not available yet');

    return {
      icon: Calendar,
      title: 'Session scheduled',
      body: partnerName ? `Your session with ${partnerName} is scheduled.` : 'Your session is scheduled.',
      details,
      href: '/calendar',
      primaryAction: meetAvailable
        ? {
            label: 'Join session',
            onClick: () => {
              if (meetLink) window.open(meetLink, '_blank', 'noopener,noreferrer');
            },
          }
        : { label: 'View session', onClick: () => push('/calendar') },
      secondaryAction: { label: 'View calendar', onClick: () => push('/calendar') },
    };
  }

  if (type === 'session_request') {
    const details: string[] = [];
    if (skillName) details.push(`Skill: ${skillName}`);
    if (scheduledAt) details.push(`When: ${scheduledAt}`);
    if (durationMinutes) details.push(`Duration: ${durationMinutes} min`);

    const convId = payload.conversation_id as string | undefined;

    return {
      icon: Clock,
      title: 'Session request received',
      body: partnerName
        ? `${partnerName} requested a skill swap session.`
        : 'You received a session request.',
      details,
      href: '/messages',
      primaryAction: { label: 'View in chat', onClick: () => push(convId ? '/messages' : '/messages') },
      secondaryAction: { label: 'View calendar', onClick: () => push('/calendar') },
    };
  }

  if (type === 'session_confirmed') {
    const details: string[] = [];
    if (skillName) details.push(`Skill: ${skillName}`);
    if (scheduledAt) details.push(`When: ${scheduledAt}`);
    if (durationMinutes) details.push(`Duration: ${durationMinutes} min`);
    details.push(meetAvailable ? 'Meet link: ready' : 'Meet link: not available yet');

    return {
      icon: CheckCircle2,
      title: 'Session confirmed',
      body: partnerName ? `Your session with ${partnerName} has been confirmed!` : 'Your session has been confirmed!',
      details,
      href: '/calendar',
      primaryAction: meetAvailable
        ? {
            label: 'Join session',
            onClick: () => {
              if (meetLink) window.open(meetLink, '_blank', 'noopener,noreferrer');
            },
          }
        : { label: 'View session', onClick: () => push('/calendar') },
      secondaryAction: { label: 'Open chat', onClick: () => push('/messages') },
    };
  }

  if (type === 'session_declined') {
    const details: string[] = [];
    if (scheduledAt) details.push(`Was scheduled for: ${scheduledAt}`);

    return {
      icon: Clock,
      title: 'Session declined',
      body: partnerName ? `${partnerName} declined your session request.` : 'Your session request was declined.',
      details,
      href: '/calendar',
      primaryAction: { label: 'View calendar', onClick: () => push('/calendar') },
      secondaryAction: { label: 'Open chat', onClick: () => push('/messages') },
    };
  }

  if (type === 'session_reminder') {
    const details: string[] = [];
    if (skillName) details.push(`Skill: ${skillName}`);
    if (scheduledAt) details.push(`Starts: ${scheduledAt}`);
    if (durationMinutes) details.push(`Duration: ${durationMinutes} min`);
    if (meetAvailable) details.push('Meet link: ready');

    return {
      icon: Clock,
      title: 'Session starting soon',
      body: partnerName ? `Your session with ${partnerName} is about to start.` : 'Your session is about to start.',
      details,
      href: '/calendar',
      primaryAction: meetAvailable
        ? {
            label: 'Join now',
            onClick: () => {
              if (meetLink) window.open(meetLink, '_blank', 'noopener,noreferrer');
            },
          }
        : { label: 'View session', onClick: () => push('/calendar') },
    };
  }

  if (type === 'session_completed') {
    const details: string[] = [];
    if (skillName) details.push(`Skill: ${skillName}`);
    if (scheduledAt) details.push(`When: ${scheduledAt}`);

    return {
      icon: Star,
      title: 'Session completed',
      body: partnerName ? `Rate ${partnerName} and schedule another swap.` : 'Rate your partner and schedule another swap.',
      details,
      href: '/dashboard/connections',
      primaryAction: { label: 'Rate partner', onClick: () => push('/dashboard/connections') },
      secondaryAction: { label: 'Schedule another', onClick: () => push('/') },
    };
  }

  if (type === 'message') {
    return {
      icon: MessageSquare,
      title: 'New message',
      body: payload?.message ? String(payload.message) : 'You received a new message.',
      href: '/messages',
      primaryAction: { label: 'Open messages', onClick: () => push('/messages') },
    };
  }

  // Fallback
  return {
    icon: Bell,
    title: payload.title ? String(payload.title) : 'Notification',
    body: payload?.message ? String(payload.message) : 'You have a new update.',
  };
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading, configError } = useAuth();
  const { unread } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [query, setQuery] = useState('');

  const publicNav: ShellNavItem[] = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/', label: 'Explore Skills', icon: Compass },
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
      const view = buildNotifView(n, { routerPush: () => {} });
      const t = view.title.toLowerCase();
      const b = (view.body || '').toLowerCase();
      const d = (view.details || []).join(' ').toLowerCase();
      return t.includes(q) || b.includes(q) || d.includes(q);
    });
  }, [notifications, query]);

  const markRead = async (id: string, read: boolean) => {
    try {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read } : n)));
      const { error: updErr } = await supabase.from('notifications').update({ read }).eq('id', id);
      if (updErr) throw updErr;
    } catch {
      // best-effort; reload state later via realtime
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
    } catch {
      // ignore
    }
  };

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
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white p-1 flex items-center justify-center">
            <Image src="/SkillSwap_Logo.jpg" alt="SkillSwap" width={32} height={32} className="object-contain" />
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
            <button
              aria-label="Messages"
              title="Messages"
              onClick={() => router.push('/messages')}
              className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm"
            >
              <div className="relative">
                <MessageSquare className="h-5 w-5 text-skillswap-600" />
                {unread.messages > 0 ? (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                ) : null}
              </div>
            </button>
          </div>
        </div>
      }>
      <Card className="overflow-hidden">
          <div className="p-4 border-b border-skillswap-200">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-skillswap-800">Notifications</h1>
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-sm font-medium text-skillswap-700 hover:text-skillswap-800"
              >
                Mark all as read
              </button>
            </div>
          </div>

          <div className="p-4">
            {error ? <div className="mb-4 text-sm text-red-600">{error}</div> : null}
            {loading ? (
              <div className="py-10 text-center text-sm text-skillswap-600">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-skillswap-600">No notifications.</div>
            ) : (
              <div className="divide-y divide-skillswap-200">
                {filtered.map((n) => {
                  const view = buildNotifView(n, { routerPush: (href) => router.push(href) });
                  const Icon = view.icon;
                  const clickHref = view.href;
                  return (
                    <div
                      key={n.id}
                      className="py-4"
                      role={clickHref ? 'button' : undefined}
                      tabIndex={clickHref ? 0 : -1}
                      onClick={async () => {
                        if (!clickHref) return;
                        if (!n.read) await markRead(n.id, true);
                        router.push(clickHref);
                      }}
                      onKeyDown={async (e) => {
                        if (!clickHref) return;
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        if (!n.read) await markRead(n.id, true);
                        router.push(clickHref);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1 h-9 w-9 rounded-full bg-skillswap-100 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-4 w-4 text-skillswap-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-skillswap-800">{view.title}</p>
                              {view.body ? <p className="mt-1 text-sm text-skillswap-600">{view.body}</p> : null}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {!n.read ? (
                                <span className="mt-1 h-2 w-2 rounded-full bg-skillswap-500" aria-label="Unread" />
                              ) : null}
                              <button
                                type="button"
                                className="text-xs text-skillswap-600 hover:text-skillswap-800"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void markRead(n.id, !n.read);
                                }}
                              >
                                {n.read ? 'Mark unread' : 'Mark read'}
                              </button>
                            </div>
                          </div>

                          {view.details && view.details.length > 0 ? (
                            <ul className="mt-2 text-sm text-skillswap-600 list-disc pl-5 space-y-1">
                              {view.details.slice(0, 4).map((d, idx) => (
                                <li key={idx}>{d}</li>
                              ))}
                            </ul>
                          ) : null}

                          {view.primaryAction || view.secondaryAction ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {view.primaryAction ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full bg-skillswap-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-skillswap-700"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!n.read) await markRead(n.id, true);
                                    view.primaryAction?.onClick();
                                  }}
                                >
                                  {String(n.type || '').toLowerCase() === 'session_scheduled' ||
                                  String(n.type || '').toLowerCase() === 'session_reminder' ? (
                                    <Video className="h-4 w-4" />
                                  ) : String(n.type || '').toLowerCase() === 'swap_request_accepted' ? (
                                    <MessageSquare className="h-4 w-4" />
                                  ) : String(n.type || '').toLowerCase() === 'session_completed' ? (
                                    <Star className="h-4 w-4" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                  )}
                                  {view.primaryAction.label}
                                </button>
                              ) : null}

                              {view.secondaryAction ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full bg-white border border-skillswap-200 text-skillswap-700 px-3 py-1.5 text-sm font-medium hover:bg-skillswap-50"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!n.read) await markRead(n.id, true);
                                    view.secondaryAction?.onClick();
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  {view.secondaryAction.label}
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          <time
                            className="mt-2 block text-xs text-skillswap-500"
                            dateTime={n.created_at}
                            title={formatExactDateTimeWithSeconds(n.created_at)}
                          >
                            {formatExactDateTime(n.created_at)}
                          </time>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </Card>
    </AppShell>
  );
}
