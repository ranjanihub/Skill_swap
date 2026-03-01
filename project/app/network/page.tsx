'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Home as HomeIcon, Users, Calendar, Bell, Briefcase, MessageSquare, Search, Compass, UserCircle } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  ConnectionRequest,
  UserProfile,
  UserSettings,
} from '@/lib/supabase';
import { cn, formatExactDateTime, formatExactDateTimeWithSeconds } from '@/lib/utils';

import AppShell, { type ShellNavItem } from '@/components/app-shell';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type PublicProfile = Pick<UserProfile, 'id' | 'full_name' | 'bio'>;

type InvItem = {
  request: ConnectionRequest;
  requesterProfile?: PublicProfile | null;
  requesterSettings?: Pick<UserSettings, 'headline' | 'current_title' | 'current_company' | 'avatar_url'> | null;
};

export default function NetworkPage() {
  const router = useRouter();
  const { user, loading: authLoading, configError } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<'Grow' | 'Catch up'>('Grow');
  const [search, setSearch] = useState('');
  const [headerQuery, setHeaderQuery] = useState('');

  const [allMyRequests, setAllMyRequests] = useState<ConnectionRequest[]>([]);
  const [invitations, setInvitations] = useState<InvItem[]>([]);
  const [acting, setActing] = useState<Record<string, boolean>>({});

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

    if (!isSupabaseConfigured) {
      setError(configError || supabaseConfigError || 'Supabase is not configured');
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setError('');

        const { data: reqData, error: reqErr } = await supabase
          .from('connection_requests')
          .select('*')
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false });
        if (reqErr) throw reqErr;

        const reqs = (reqData || []) as ConnectionRequest[];
        setAllMyRequests(reqs);

        const pendingIncoming = reqs.filter((r) => r.recipient_id === user.id && r.status === 'pending');
        const requesterIds = Array.from(new Set(pendingIncoming.map((r) => r.requester_id))).slice(0, 200);

        const [{ data: profilesData }, { data: settingsData }] = await Promise.all([
          requesterIds.length
            ? supabase.from('user_profiles').select('id, full_name, bio').in('id', requesterIds)
            : Promise.resolve({ data: [] as any[] } as any),
          requesterIds.length
            ? supabase
                .from('user_settings')
                .select('id, headline, current_title, current_company, avatar_url')
                .in('id', requesterIds)
            : Promise.resolve({ data: [] as any[] } as any),
        ]);

        const profilesById: Record<string, PublicProfile> = {};
        (profilesData || []).forEach((p: any) => {
          profilesById[p.id] = p as PublicProfile;
        });

        const settingsById: Record<string, any> = {};
        (settingsData || []).forEach((s: any) => {
          settingsById[s.id] = s;
        });

        const inv: InvItem[] = pendingIncoming.map((r) => ({
          request: r,
          requesterProfile: profilesById[r.requester_id] || null,
          requesterSettings: settingsById[r.requester_id] || null,
        }));

        setInvitations(inv);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load network';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user, configError]);

  // Keep invitations/requests updated automatically
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isSupabaseConfigured) return;

    const upsertAllMyRequest = (req: ConnectionRequest) => {
      setAllMyRequests((prev) => {
        const next = [req, ...prev.filter((r) => r.id !== req.id)];
        next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return next;
      });
    };

    const removeAllMyRequest = (id: string) => {
      setAllMyRequests((prev) => prev.filter((r) => r.id !== id));
    };

    const ensureInvitation = async (req: ConnectionRequest) => {
      if (req.recipient_id !== user.id) return;
      if (req.status !== 'pending') return;
      setInvitations((prev) => {
        if (prev.some((x) => x.request.id === req.id)) return prev;
        return prev;
      });

      const requesterId = req.requester_id;
      const [{ data: profileData }, { data: settingsData }] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, bio').eq('id', requesterId).maybeSingle(),
        supabase
          .from('user_settings')
          .select('id, headline, current_title, current_company, avatar_url')
          .eq('id', requesterId)
          .maybeSingle(),
      ]);

      setInvitations((prev) => {
        if (prev.some((x) => x.request.id === req.id)) return prev;
        const next = [
          {
            request: req,
            requesterProfile: (profileData as any) || null,
            requesterSettings: (settingsData as any) || null,
          } as InvItem,
          ...prev,
        ];
        return next;
      });
    };

    const removeInvitation = (id: string) => {
      setInvitations((prev) => prev.filter((x) => x.request.id !== id));
    };

    const channel = supabase
      .channel(`connection-requests:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connection_requests', filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          try {
            if (payload.eventType === 'INSERT') {
              const req = payload.new as ConnectionRequest;
              upsertAllMyRequest(req);
              void ensureInvitation(req);
              return;
            }

            if (payload.eventType === 'UPDATE') {
              const req = payload.new as ConnectionRequest;
              upsertAllMyRequest(req);
              if (req.status === 'pending') {
                void ensureInvitation(req);
              } else {
                removeInvitation(req.id);
              }
              return;
            }

            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as { id?: string };
              if (!oldRow?.id) return;
              removeAllMyRequest(oldRow.id);
              removeInvitation(oldRow.id);
            }
          } catch (e) {
            console.warn('connection_requests realtime handler failed', e);
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
  }, [authLoading, user?.id]);

  const connectionsCount = useMemo(() => {
    if (!user) return 0;
    const accepted = allMyRequests.filter((r) => r.status === 'accepted');
    const otherIds = new Set<string>();
    accepted.forEach((r) => {
      otherIds.add(r.requester_id === user.id ? r.recipient_id : r.requester_id);
    });
    return otherIds.size;
  }, [allMyRequests, user]);

  const filteredInvitations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invitations;
    return invitations.filter((i) => {
      const name = (i.requesterProfile?.full_name || '').toLowerCase();
      const headline = (
        i.requesterSettings?.headline ||
        (i.requesterSettings?.current_title
          ? `${i.requesterSettings.current_title}${i.requesterSettings.current_company ? ` ${i.requesterSettings.current_company}` : ''}`
          : '')
      ).toLowerCase();
      return name.includes(q) || headline.includes(q);
    });
  }, [invitations, search]);

  const acceptInvitation = async (req: ConnectionRequest) => {
    if (!user) return;
    try {
      setActing((p) => ({ ...p, [req.id]: true }));
      const { error: updErr } = await supabase.from('connection_requests').update({ status: 'accepted' }).eq('id', req.id);
      if (updErr) throw updErr;

      await supabase.from('conversations').insert({ participant_a: req.requester_id, participant_b: req.recipient_id });

      setInvitations((prev) => prev.filter((x) => x.request.id !== req.id));
      setAllMyRequests((prev) => prev.map((x) => (x.id === req.id ? ({ ...x, status: 'accepted' } as any) : x)));
    } catch (e) {
      console.error('accept invitation failed', e);
      setError(e instanceof Error ? e.message : 'Failed to accept');
    } finally {
      setActing((p) => ({ ...p, [req.id]: false }));
    }
  };

  const ignoreInvitation = async (req: ConnectionRequest) => {
    try {
      setActing((p) => ({ ...p, [req.id]: true }));
      const { error: updErr } = await supabase.from('connection_requests').update({ status: 'rejected' }).eq('id', req.id);
      if (updErr) throw updErr;
      setInvitations((prev) => prev.filter((x) => x.request.id !== req.id));
      setAllMyRequests((prev) => prev.map((x) => (x.id === req.id ? ({ ...x, status: 'rejected' } as any) : x)));
    } catch (e) {
      console.error('ignore invitation failed', e);
      setError(e instanceof Error ? e.message : 'Failed to ignore');
    } finally {
      setActing((p) => ({ ...p, [req.id]: false }));
    }
  };

  const publicNav: ShellNavItem[] = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/explore', label: 'Explore Skills', icon: Compass },
  ];

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
                value={headerQuery}
                onChange={(e) => setHeaderQuery(e.target.value)}
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-skillswap-400" />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              aria-label="Messages"
              title="Messages"
              onClick={() => router.push('/messages')}
              className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm"
            >
              <MessageSquare className="h-5 w-5 text-skillswap-600" />
            </button>
          </div>
        </div>
      }
    >
      <div className="w-full max-w-[1128px] mx-auto">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* Left: Manage my network */}
          <aside>
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-skillswap-200">
                <h2 className="text-lg font-semibold text-skillswap-800">Manage my network</h2>
              </div>

              <div className="p-2">
                {[{ label: 'Connections', count: connectionsCount }, { label: 'Following & followers', count: 0 }, { label: 'Groups', count: 0 }, { label: 'Events', count: 0 }, { label: 'Pages', count: 0 }, { label: 'Newsletters', count: 0 }].map((row) => (
                  <button
                    key={row.label}
                    type="button"
                    className="w-full px-3 py-2 rounded-md hover:bg-skillswap-100 flex items-center justify-between text-sm text-skillswap-700"
                  >
                    <span className="flex items-center gap-3">
                      <span className="h-4 w-4 rounded bg-skillswap-200" />
                      {row.label}
                    </span>
                    <span className="text-skillswap-500">{row.count}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="mt-4 overflow-hidden">
              <div className="p-3 border-b border-skillswap-200 text-xs text-skillswap-500">Ad</div>
              <div className="p-4 text-sm text-skillswap-600">
                Ranjani, reactivate your Premium free trial today!
                <div className="mt-3 h-36 rounded-md bg-skillswap-200" />
              </div>
            </Card>
          </aside>

          {/* Center: invitations */}
          <main>
            <Card className="overflow-hidden">
              <div className="p-3 border-b border-skillswap-200">
                <div className="flex items-center gap-6">
                  <button
                    type="button"
                    onClick={() => setTab('Grow')}
                    className={cn(
                      'text-base font-semibold pb-2',
                      tab === 'Grow' ? 'text-skillswap-800 border-b-2 border-skillswap-800' : 'text-skillswap-600'
                    )}
                  >
                    Grow
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('Catch up')}
                    className={cn(
                      'text-base font-semibold pb-2',
                      tab === 'Catch up' ? 'text-skillswap-800 border-b-2 border-skillswap-800' : 'text-skillswap-600'
                    )}
                  >
                    Catch up
                  </button>
                </div>
              </div>

              <div className="p-4 border-b border-skillswap-200 flex items-center justify-between">
                <p className="text-base font-semibold text-skillswap-800">Invitations ({filteredInvitations.length})</p>
                <button type="button" className="text-sm font-medium text-skillswap-600 hover:underline">Show all</button>
              </div>

              <div className="p-4">
                <div className="mb-4">
                  <div className="relative max-w-sm">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search invitations"
                      className="pl-9 h-9 bg-skillswap-50 border-skillswap-200"
                    />
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-skillswap-600" />
                  </div>
                </div>

                {loading ? (
                  <div className="py-10 text-center text-sm text-skillswap-600">Loading…</div>
                ) : filteredInvitations.length === 0 ? (
                  <div className="py-10 text-center text-sm text-skillswap-600">No invitations.</div>
                ) : (
                  <div className="divide-y divide-skillswap-200">
                    {filteredInvitations.map((i) => {
                      const req = i.request;
                      const busy = Boolean(acting[req.id]);
                      const title =
                        i.requesterSettings?.headline ||
                        (i.requesterSettings?.current_title
                          ? `${i.requesterSettings.current_title}${i.requesterSettings.current_company ? ` — ${i.requesterSettings.current_company}` : ''}`
                          : i.requesterProfile?.bio || '');

                      return (
                        <div key={req.id} className="py-4 flex items-center gap-4">
                          <Avatar className="h-14 w-14">
                            <AvatarImage src={i.requesterSettings?.avatar_url || ''} alt={i.requesterProfile?.full_name || 'Member'} />
                            <AvatarFallback>{(i.requesterProfile?.full_name || 'M').slice(0, 1)}</AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <p className="text-base font-semibold text-skillswap-800 truncate">
                              {i.requesterProfile?.full_name || 'Member'}
                            </p>
                            {title && <p className="text-sm text-skillswap-600 truncate mt-1">{title}</p>}
                            <p className="text-xs text-skillswap-500 mt-1">Invited you to connect</p>
                            <time
                              className="text-xs text-skillswap-500 mt-1 block"
                              dateTime={req.created_at}
                              title={formatExactDateTimeWithSeconds(req.created_at)}
                            >
                              {formatExactDateTime(req.created_at)}
                            </time>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => ignoreInvitation(req)}
                              disabled={busy}
                              className="text-sm text-skillswap-600 hover:underline"
                            >
                              Ignore
                            </button>
                            <button
                              type="button"
                              onClick={() => acceptInvitation(req)}
                              disabled={busy}
                              className="h-9 px-5 rounded-full border border-skillswap-500 text-skillswap-500 font-semibold hover:bg-skillswap-50"
                            >
                              Accept
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </main>
        </div>
      </div>
    </AppShell>
  );
}
