"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, MessageSquare, Eye, Calendar, Star, MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Skill,
  UserProfile,
  ConnectionRequest,
} from '@/lib/supabase';

type PublicProfile = Pick<UserProfile, 'id' | 'full_name' | 'bio'>;

type ConnectionItem = {
  otherId: string;
  profile?: PublicProfile | null;
  skills: Skill[];
  status: 'pending' | 'active' | 'completed' | 'rejected';
  lastActivity?: string | null;
  request?: ConnectionRequest | null;
  conversationId?: string | null;
};

export default function ConnectionsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, PublicProfile>>({});
  const [skillsByUser, setSkillsByUser] = useState<Record<string, Skill[]>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'All' | 'Learning' | 'Teaching' | 'Mutual'>('All');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    if (!isSupabaseConfigured) {
      setError(supabaseConfigError ?? 'Supabase is not configured');
      setLoading(false);
      return;
    }

    const run = async () => {
      setLoading(true);
      try {
        // Fetch connection requests involving user
        const { data: reqData } = await supabase
          .from('connection_requests')
          .select('*')
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

        const requests = (reqData || []) as ConnectionRequest[];

        // Fetch conversations involving user
        const { data: convData } = await supabase
          .from('conversations')
          .select('*')
          .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`);

        const conversations = (convData || []) as any[];

        // Fetch completed sessions with user
        const { data: sessionsData } = await supabase
          .from('skill_swap_sessions')
          .select('*')
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .eq('status', 'completed');

        const sessions = (sessionsData || []) as any[];

        const otherIds = new Set<string>();
        requests.forEach((r) => {
          const other = r.requester_id === user.id ? r.recipient_id : r.requester_id;
          otherIds.add(other);
        });
        conversations.forEach((c) => {
          const other = c.participant_a === user.id ? c.participant_b : c.participant_a;
          otherIds.add(other);
        });
        sessions.forEach((s) => {
          const other = s.user_a_id === user.id ? s.user_b_id : s.user_a_id;
          otherIds.add(other);
        });

        const ids = Array.from(otherIds).slice(0, 200);

        let profiles: any[] = [];
        if (ids.length > 0) {
          const { data: profilesData } = await supabase.from('user_profiles').select('id, full_name, bio').in('id', ids);
          profiles = (profilesData || []) as any[];
        }

        const skillsMap: Record<string, Skill[]> = {};
        if (ids.length > 0) {
          const { data: skillsData } = await supabase.from('skills').select('*').in('user_id', ids).order('created_at', { ascending: false }).limit(200);
          (skillsData || []).forEach((s: Skill) => {
            skillsMap[s.user_id] = skillsMap[s.user_id] || [];
            skillsMap[s.user_id].push(s);
          });
        }

        const profileMap: Record<string, PublicProfile> = {};
        profiles.forEach((p) => (profileMap[p.id] = p));

        // Build connections list
        const map: Record<string, ConnectionItem> = {};

        requests.forEach((r) => {
          const other = r.requester_id === user.id ? r.recipient_id : r.requester_id;
          map[other] = map[other] || {
            otherId: other,
            profile: profileMap[other] || null,
            skills: skillsMap[other] || [],
            status: r.status as any,
            lastActivity: r.created_at || null,
            request: r,
            conversationId: null,
          };
          // prefer pending status if present
          if (r.status === 'pending') map[other].status = 'pending';
          if (r.status === 'accepted') map[other].status = 'active';
        });

        conversations.forEach((c) => {
          const other = c.participant_a === user.id ? c.participant_b : c.participant_a;
          map[other] = map[other] || {
            otherId: other,
            profile: profileMap[other] || null,
            skills: skillsMap[other] || [],
            status: 'active',
            lastActivity: c.created_at || null,
            request: null,
            conversationId: c.id,
          };
          map[other].status = 'active';
          map[other].conversationId = c.id;
        });

        sessions.forEach((s) => {
          const other = s.user_a_id === user.id ? s.user_b_id : s.user_a_id;
          map[other] = map[other] || {
            otherId: other,
            profile: profileMap[other] || null,
            skills: skillsMap[other] || [],
            status: 'completed',
            lastActivity: s.scheduled_at || s.created_at || null,
            request: null,
            conversationId: null,
          };
          // if previously active, keep active unless completed is stronger
          if (map[other].status !== 'completed') map[other].status = 'completed';
        });

        const list = Object.values(map);
        setProfilesById(profileMap);
        setSkillsByUser(skillsMap);
        setConnections(list);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load connections';
        setError(msg);
        console.error('Connections error:', err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return connections
      .filter((c) => {
        if (statusFilter.size > 0 && !statusFilter.has(c.status)) return false;
        if (tab !== 'All') {
          // best-effort: check skills for teach/learn
          const hasTeach = c.skills.some((s) => s.skill_type === 'teach');
          const hasLearn = c.skills.some((s) => s.skill_type === 'learn');
          if (tab === 'Learning' && !hasLearn) return false;
          if (tab === 'Teaching' && !hasTeach) return false;
          if (tab === 'Mutual' && !(hasLearn && hasTeach)) return false;
        }
        if (!q) return true;
        const name = c.profile?.full_name || '';
        if (name.toLowerCase().includes(q)) return true;
        return c.skills.some((s) => s.name.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const dateA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const dateB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return dateB - dateA;
      });
  }, [connections, search, tab, statusFilter]);

  const toggleStatusFilter = (s: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const createOrOpenConversation = async (otherId: string) => {
    if (!user) return;
    try {
      // check existing conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .or(`and(participant_a.eq.${user.id},participant_b.eq.${otherId}),and(participant_a.eq.${otherId},participant_b.eq.${user.id})`)
        .maybeSingle();
      if (existing) {
        router.push('/dashboard/messages');
        return;
      }
      const { error } = await supabase.from('conversations').insert({ participant_a: user.id, participant_b: otherId });
      if (error) throw error;
      router.push('/dashboard/messages');
    } catch (err) {
      console.error('Failed to open conversation', err);
    }
  };

  const acceptRequest = async (req: ConnectionRequest) => {
    try {
      const { error: updErr } = await supabase.from('connection_requests').update({ status: 'accepted' }).eq('id', req.id);
      if (updErr) throw updErr;
      await supabase.from('conversations').insert({ participant_a: req.requester_id, participant_b: req.recipient_id });
      // refresh
      void router.refresh();
    } catch (err) {
      console.error('Failed to accept request', err);
    }
  };

  const rejectRequest = async (req: ConnectionRequest) => {
    try {
      const { error } = await supabase.from('connection_requests').update({ status: 'rejected' }).eq('id', req.id);
      if (error) throw error;
      void router.refresh();
    } catch (err) {
      console.error('Failed to reject request', err);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 to-skillswap-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" />
          <p className="text-skillswap-600">Loading connections...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 to-skillswap-50 px-4">
        <Card className="p-8 max-w-md border-destructive/20 bg-destructive/10">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => router.refresh()} className="bg-skillswap-500 text-white hover:bg-skillswap-600 w-full">
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-skillswap-100 via-skillswap-50 to-skillswap-50">
      <header className="bg-skillswap-300 border-b border-skillswap-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-skillswap-600" />
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-skillswap-dark">Connections</h1>
                  <p className="text-skillswap-600 mt-1">Manage your learning and teaching connections</p>
                </div>
              </div>
            </div>

            <div className="w-80">
              <Input placeholder="Search by name or skill" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-2">
              {(['All', 'Learning', 'Teaching', 'Mutual'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-full text-sm ${tab === t ? 'bg-skillswap-500 text-white' : 'bg-white text-skillswap-600 border border-skillswap-200'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="ml-auto flex gap-2">
              {(['Pending', 'Active', 'Completed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatusFilter(s.toLowerCase())}
                  className={`px-2 py-1 rounded-full text-sm ${statusFilter.has(s.toLowerCase()) ? 'bg-skillswap-500 text-white' : 'bg-white text-skillswap-600 border border-skillswap-200'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
          {filtered.length === 0 ? (
            <Card className="p-10 bg-white border-2 border-dashed border-skillswap-200 text-center">
              <h2 className="text-xl font-bold text-skillswap-dark mb-2">You don’t have any connections yet.</h2>
              <p className="text-skillswap-600 mb-6">Start exploring skills to connect with others.</p>
              <div className="flex justify-center gap-3">
                <Button onClick={() => router.push('/explore')} className="bg-skillswap-500 text-white">Explore Skills</Button>
                <Button onClick={() => router.push('/dashboard#skills')} variant="outline">Add a Skill</Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => (
                <Card key={c.otherId} className="p-4 bg-white rounded-lg shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src="" alt={c.profile?.full_name || 'Member'} />
                      <AvatarFallback>{(c.profile?.full_name || 'M').slice(0,2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-skillswap-dark">{c.profile?.full_name || 'SkillSwap member'}</h3>
                        <Badge variant="outline">{c.status}</Badge>
                      </div>
                      <p className="text-sm text-skillswap-600">{c.skills.slice(0,3).map((s) => s.name).join(' • ') || 'No listed skills'}</p>
                      <p className="text-xs text-skillswap-500 mt-1">{c.lastActivity ? `Last activity ${new Date(c.lastActivity).toLocaleString()}` : 'No recent activity'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => createOrOpenConversation(c.otherId)} title="Message">
                      <MessageSquare />
                    </Button>
                    <Button variant="ghost" onClick={() => setSelected(c.otherId)} title="View profile">
                      <Eye />
                    </Button>
                    <Button variant="ghost" onClick={() => router.push('/dashboard#sessions')} title="Session details">
                      <Calendar />
                    </Button>
                    <div className="ml-2">
                      {c.status === 'pending' && c.request && c.request.recipient_id === user?.id && (
                        <div className="flex gap-2">
                          <Button onClick={() => acceptRequest(c.request!)} className="bg-skillswap-500 text-white">Accept</Button>
                          <Button onClick={() => rejectRequest(c.request!)} variant="outline">Reject</Button>
                        </div>
                      )}
                      {c.status === 'completed' && (
                        <Button variant="ghost" title="Leave review"><Star /></Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <aside className="lg:col-span-1">
          {selected ? (
            <Card className="p-4 bg-white sticky top-6">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12"><AvatarImage src="" alt={profilesById[selected]?.full_name || ''} /><AvatarFallback>{(profilesById[selected]?.full_name || 'M').slice(0,2)}</AvatarFallback></Avatar>
                <div>
                  <h3 className="font-semibold">{profilesById[selected]?.full_name || 'Member'}</h3>
                  <p className="text-sm text-skillswap-600">{profilesById[selected]?.bio || ''}</p>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-medium">Skills</h4>
                <div className="mt-2 space-y-2">
                  {(skillsByUser[selected] || []).slice(0,6).map((s) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        <p className="text-xs text-skillswap-600">{s.category || s.description || ''}</p>
                      </div>
                      <Badge variant="outline">{s.proficiency_level}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button onClick={() => createOrOpenConversation(selected)} className="bg-skillswap-500 text-white w-full">Message</Button>
                <Button variant="outline" onClick={() => router.push('/dashboard/public-view')}>Full profile</Button>
              </div>
            </Card>
          ) : (
            <Card className="p-6 bg-white">Select a connection to view details.</Card>
          )}
        </aside>
      </main>
    </div>
  );
}
