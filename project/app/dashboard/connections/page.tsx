"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, MessageSquare, Eye, Star, MoreHorizontal, Search } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Skill,
  UserProfile,
  UserSettings,
  ConnectionRequest,
} from '@/lib/supabase';
import { cn, formatExactDateTime, formatExactDateTimeWithSeconds } from '@/lib/utils';
import AppShell, { type ShellNavItem } from '@/components/app-shell';
import AvailabilityPicker from '@/components/calendar/AvailabilityPicker';
import { useUserIdentity } from '@/hooks/use-user-identity';

type PublicProfile = Pick<UserProfile, 'id' | 'full_name' | 'bio'>;
type PublicSettings = Pick<UserSettings, 'avatar_url' | 'display_name'>;

/** Avatar with 3-tier fallback for connection cards */
function ConnAvatar({ userId, explicitName, explicitAvatar, size = 'h-12 w-12' }: {
  userId: string;
  explicitName?: string | null;
  explicitAvatar?: string | null;
  size?: string;
}) {
  const { name, avatarUrl } = useUserIdentity(userId, explicitName, explicitAvatar);
  return (
    <Avatar className={size}>
      <AvatarImage src={avatarUrl ?? ''} alt={name || 'User'} />
      <AvatarFallback>{(name || 'U').slice(0, 2)}</AvatarFallback>
    </Avatar>
  );
}

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
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const acceptRequestId = searchParams.get('acceptRequestId');

  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, PublicProfile>>({});
  const [settingsById, setSettingsById] = useState<Record<string, PublicSettings>>({});
  const [skillsByUser, setSkillsByUser] = useState<Record<string, Skill[]>>({});
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [meProfile, setMeProfile] = useState<PublicProfile | null>(null);
  const [requestsBySkillId, setRequestsBySkillId] = useState<Record<string, ConnectionRequest[]>>({});
  const [completedSessionsBySkillId, setCompletedSessionsBySkillId] = useState<Record<string, any[]>>({});
  const [sendingRequests, setSendingRequests] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'All' | 'Learning' | 'Teaching' | 'Mutual'>('All');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  // Availability modal state
  const [availModalSkill, setAvailModalSkill] = useState<Skill | null>(null);
  const [availabilities, setAvailabilities] = useState<string[]>([]);
  const [newAvailability, setNewAvailability] = useState('');
  const [sessionNote, setSessionNote] = useState('');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(60);

  // Slots + accept flow
  const [slotsByRequestId, setSlotsByRequestId] = useState<Record<string, Array<{ id: string; request_id: string; start_at: string }>>>({});
  const [acceptReq, setAcceptReq] = useState<ConnectionRequest | null>(null);
  const [acceptSlotId, setAcceptSlotId] = useState<string>('');
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');

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
        // ensure we have the current user's profile for display names
        try {
          const { data: myProf } = await supabase
            .from('user_profiles')
            .select('id, full_name, bio')
            .eq('id', user.id)
            .maybeSingle();
          setMeProfile((myProf as any) || null);
        } catch (e) {
          console.warn('failed to load current user profile', e);
        }
        // Fetch connection requests involving user
        const { data: reqData } = await supabase
          .from('connection_requests')
          .select('*')
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

        const requests = (reqData || []) as ConnectionRequest[];

        // Fetch proposed slots for requests (best-effort)
        try {
          const reqIds = (requests || []).map((r) => r.id).filter(Boolean).slice(0, 400);
          if (reqIds.length > 0) {
            const { data: slotsData } = await supabase
              .from('connection_request_slots')
              .select('id, request_id, start_at')
              .in('request_id', reqIds);

            const mapSlots: Record<string, Array<{ id: string; request_id: string; start_at: string }>> = {};
            (slotsData || []).forEach((s: any) => {
              mapSlots[s.request_id] = mapSlots[s.request_id] || [];
              mapSlots[s.request_id].push(s);
            });
            Object.keys(mapSlots).forEach((k) => {
              mapSlots[k].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
            });
            setSlotsByRequestId(mapSlots);
          } else {
            setSlotsByRequestId({});
          }
        } catch (e) {
          console.warn('Failed to load connection_request_slots', e);
          setSlotsByRequestId({});
        }

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

        // Map connection requests by skill id
        const reqsBySkill: Record<string, ConnectionRequest[]> = {};
        (requests || []).forEach((r) => {
          if (r.skill_id) {
            reqsBySkill[r.skill_id] = reqsBySkill[r.skill_id] || [];
            reqsBySkill[r.skill_id].push(r);
          }
        });

        // Map completed sessions by skill id (sessions fetched above are completed)
        const sessionsBySkill: Record<string, any[]> = {};
        (sessions || []).forEach((s) => {
          if (s.skill_a_id) {
            sessionsBySkill[s.skill_a_id] = sessionsBySkill[s.skill_a_id] || [];
            sessionsBySkill[s.skill_a_id].push(s);
          }
          if (s.skill_b_id) {
            sessionsBySkill[s.skill_b_id] = sessionsBySkill[s.skill_b_id] || [];
            sessionsBySkill[s.skill_b_id].push(s);
          }
        });

        // Also fetch recent public skills to show before any search is entered
        try {
          const { data: recentSkills } = await supabase.from('skills').select('*').order('created_at', { ascending: false }).limit(200);
          setAllSkills((recentSkills || []) as Skill[]);
        } catch (e) {
          console.warn('Failed to fetch all skills preview', e);
          setAllSkills([]);
        }

        const profileMap: Record<string, PublicProfile> = {};
        profiles.forEach((p) => (profileMap[p.id] = p));

        // Fetch avatar/display_name from user_settings
        let settingsMap: Record<string, PublicSettings> = {};
        if (ids.length > 0) {
          const { data: settingsData } = await supabase
            .from('user_settings')
            .select('id, avatar_url, display_name')
            .in('id', ids);
          (settingsData || []).forEach((s: any) => {
            settingsMap[s.id] = { avatar_url: s.avatar_url, display_name: s.display_name };
          });
        }
        setSettingsById(settingsMap);

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
          if (map[other].status !== 'completed') map[other].status = 'completed';
        });

        const list = Object.values(map);
        setProfilesById(profileMap);
        setSkillsByUser(skillsMap);
        setRequestsBySkillId(reqsBySkill);
        setCompletedSessionsBySkillId(sessionsBySkill);
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

  useEffect(() => {
    if (!acceptRequestId) return;
    if (acceptReq) return;
    const req = connections.find((c) => c.request?.id === acceptRequestId)?.request;
    if (!req) return;
    openAcceptModal(req);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptRequestId, connections, slotsByRequestId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return connections
      .filter((c) => {
        if (statusFilter.size > 0 && !statusFilter.has(c.status)) return false;
        if (tab !== 'All') {
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

  const getSkillStatus = (skill: Skill) => {
    if (completedSessionsBySkillId[skill.id] && completedSessionsBySkillId[skill.id].length > 0) return 'completed';
    const reqs = requestsBySkillId[skill.id] || [];
    if (reqs.length === 0) return 'none';
    if (reqs.some((r) => r.status === 'pending')) return 'pending';
    if (reqs.some((r) => r.status === 'accepted')) return 'active';
    if (reqs.some((r) => r.status === 'rejected')) return 'rejected';
    return 'none';
  };

  const displayedAllSkills = useMemo(() => {
    let list = allSkills.slice();
    if (tab === 'Learning') {
      list = list.filter((s) => s.skill_type === 'learn');
    } else if (tab === 'Teaching') {
      list = list.filter((s) => s.skill_type === 'teach');
    } else if (tab === 'Mutual') {
      const byName = allSkills.reduce<Record<string, Skill[]>>((acc, sk) => {
        const k = (sk.name || '').toLowerCase();
        (acc[k] = acc[k] || []).push(sk);
        return acc;
      }, {});
      list = list.filter((s) => {
        const k = (s.name || '').toLowerCase();
        const group = byName[k] || [];
        return group.some((other) => other.user_id !== s.user_id && other.skill_type !== s.skill_type);
      });
    }
    if (statusFilter.size === 0) return list;
    return list.filter((s) => {
      const st = getSkillStatus(s);
      return statusFilter.has(st);
    });
  }, [allSkills, statusFilter, requestsBySkillId, completedSessionsBySkillId]);

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
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .or(`and(participant_a.eq.${user.id},participant_b.eq.${otherId}),and(participant_a.eq.${otherId},participant_b.eq.${user.id})`)
        .maybeSingle();
      if (existing) {
        router.push('/messages');
        return;
      }
      const { error } = await supabase.from('conversations').insert({ participant_a: user.id, participant_b: otherId });
      if (error) throw error;
      router.push('/messages');
    } catch (err) {
      console.error('Failed to open conversation', err);
    }
  };

  const sendSwapRequest = async (skill: Skill, opts: { note: string; durationMinutes: number; slots: string[] }) => {
    if (!user) return toast({ title: 'Not signed in', description: 'Please sign in to send requests.' });

    setSendingRequests((s) => ({ ...s, [skill.id]: true }));
    try {
      const baseInsert = {
        requester_id: user.id,
        recipient_id: skill.user_id,
        skill_id: skill.id,
        status: 'pending',
      };

      // New schema insert (preferred)
      let reqData: any[] | null = null;
      const { data: reqDataNew, error: reqErrNew } = await supabase
        .from('connection_requests')
        .insert({
          ...baseInsert,
          session_note: opts.note,
          duration_minutes: opts.durationMinutes || 60,
        } as any)
        .select();

      if (reqErrNew) {
        const msg = `${reqErrNew.message || ''} ${reqErrNew.details || ''}`.toLowerCase();
        const looksLikeMissingColumn = msg.includes('column') || msg.includes('session_note') || msg.includes('duration_minutes');

        if (looksLikeMissingColumn) {
          const { data: reqDataOld, error: reqErrOld } = await supabase
            .from('connection_requests')
            .insert(baseInsert as any)
            .select();
          if (reqErrOld) throw reqErrOld;
          reqData = (reqDataOld || []) as any[];
        } else {
          console.error('connection_requests insert error', reqErrNew);
          throw reqErrNew;
        }
      } else {
        reqData = (reqDataNew || []) as any[];
      }

      // Persist proposed slots (best-effort)
      try {
        const inserted = reqData && reqData[0] ? (reqData[0] as ConnectionRequest) : null;
        const slots = (opts.slots || []).filter(Boolean).slice(0, 6);
        if (inserted?.id && slots.length > 0) {
          await supabase.from('connection_request_slots').insert(slots.map((start_at) => ({ request_id: inserted.id, start_at })));
        }
      } catch (e) {
        console.warn('connection_request_slots insert warning', e);
      }

      const requesterName =
        meProfile?.full_name ||
        (user.user_metadata?.full_name as string) ||
        (user.email || '').split('@')[0] ||
        'Someone';

      let offeredSkillName: string | null = null;
      try {
        const { data: offered } = await supabase
          .from('skills')
          .select('name')
          .eq('user_id', user.id)
          .eq('skill_type', 'teach')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (offered?.name) offeredSkillName = offered.name as any;
      } catch {
        // ignore
      }

      const { data: notifData, error: notifErr } = await supabase.from('notifications').insert({
        user_id: skill.user_id,
        type: 'connection_request',
        payload: {
          requester_id: user.id,
          requester_name: requesterName,
          request_id: reqData && reqData[0] ? (reqData[0] as any).id : null,
          requested_skill_id: skill.id,
          requested_skill_name: skill.name,
          offered_skill_name: offeredSkillName,
          session_note: opts.note,
          duration_minutes: opts.durationMinutes || 60,
          slots: (opts.slots || []).slice(0, 6),
          // legacy key (older clients)
          availabilities: (opts.slots || []).slice(0, 6),
          slots_count: (opts.slots || []).length,
        },
      }).select();

      if (notifErr) {
        console.warn('notifications insert warning', notifErr);
      }

      toast({ title: 'Request sent', description: `Sent swap request to ${profilesById[skill.user_id]?.full_name || 'member'}` });
      setAllSkills((prev) => prev.map((p) => (p.id === skill.id ? { ...p } : p)));
      // update local requests map to show pending immediately
      if (reqData && reqData[0]) {
        const inserted = reqData[0] as ConnectionRequest;
        setRequestsBySkillId((prev) => ({
          ...prev,
          [skill.id]: [...(prev[skill.id] || []), inserted],
        }));
      }
      return { request: reqData?.[0] ?? null, notification: notifData?.[0] ?? null };
    } catch (e: any) {
      const parts = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean);
      const msg = parts.length ? parts.join(' — ') : (e?.message || JSON.stringify(e || 'Unknown error'));
      console.error('Failed to send swap request', e);
      toast({ title: 'Failed to send request', description: msg });
      return { error: e };
    } finally {
      setSendingRequests((s) => {
        const next = { ...s };
        delete next[skill.id];
        return next;
      });
    }
  };

  const openAvailabilityModal = (skill: Skill) => {
    setAvailModalSkill(skill);
    setAvailabilities([]);
    setNewAvailability('');
    setSessionNote('');
    setSessionDurationMinutes(60);
  };

  const addAvailability = () => {
    const v = newAvailability.trim();
    if (!v) return;
    setAvailabilities((prev) => [...prev, v].slice(0, 6));
    setNewAvailability('');
  };

  const removeAvailability = (idx: number) => {
    setAvailabilities((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitAvailabilityRequest = async () => {
    if (!availModalSkill) return;
    // ensure at least one availability
    if (availabilities.length === 0) return toast({ title: 'Add availability', description: 'Please add at least one available time.' });

    const note = sessionNote.trim();
    if (!note) return toast({ title: 'Add session note', description: 'Please add a session note for the recipient.' });
    const duration = Number(sessionDurationMinutes || 0);
    if (!duration || duration < 15) return toast({ title: 'Invalid duration', description: 'Please set a valid session duration (min 15 minutes).' });

    await sendSwapRequest(availModalSkill, { note, durationMinutes: duration, slots: availabilities });
    setAvailModalSkill(null);
  };

  const openAcceptModal = (req: ConnectionRequest) => {
    setAcceptError('');
    setAcceptReq(req);
    const slots = slotsByRequestId[req.id] || [];
    setAcceptSlotId(slots[0]?.id || '');
  };

  const startGoogleCalendarConnect = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/google/oauth/start', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Failed to start Google OAuth');
      window.location.href = json.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start Google OAuth';
      toast({ title: 'Google connect failed', description: msg });
    }
  };

  const acceptRequest = async () => {
    if (!acceptReq) return;
    if (!acceptSlotId) {
      setAcceptError('Please select a time slot.');
      return;
    }
    setAccepting(true);
    setAcceptError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/sessions/schedule', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId: acceptReq.id, slotId: acceptSlotId }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.code === 'GOOGLE_NOT_CONNECTED' || json?.code === 'GOOGLE_TOKEN_MISSING' || json?.code === 'GOOGLE_UNAUTHORIZED') {
          setAcceptError('Connect Google Calendar to schedule this session.');
          return;
        }
        throw new Error(json?.error || 'Failed to accept and schedule');
      }

      toast({ title: 'Session scheduled', description: 'Calendar event created with Google Meet link.' });
      setAcceptReq(null);
      setAcceptSlotId('');
      void router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to accept and schedule';
      setAcceptError(msg);
    } finally {
      setAccepting(false);
    }
  };

  const rejectRequest = async (req: ConnectionRequest) => {
    try {
      const { error } = await supabase.from('connection_requests').update({ status: 'rejected' }).eq('id', req.id);
      if (error) throw error;

      // Best-effort: notify requester
      try {
        const partnerName = profilesById[req.recipient_id]?.full_name || 'Your partner';
        await supabase.from('notifications').insert({
          user_id: req.requester_id,
          type: 'swap_request_rejected',
          payload: {
            request_id: req.id,
            partner_id: req.recipient_id,
            partner_name: partnerName,
            skill_id: req.skill_id,
          },
        });
      } catch {
        // ignore
      }
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
          <Button onClick={() => router.refresh()} className="bg-skillswap-500 text-white hover:bg-skillswap-600 w-full">Try Again</Button>
        </Card>
      </div>
    );
  }

  const publicNav: ShellNavItem[] = [
    { href: '/', label: 'Home', icon: Users },
    { href: '/', label: 'Explore Skills', icon: MessageSquare },
  ];

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
                <Button
                  key={t}
                  onClick={() => setTab(t)}
                  size="sm"
                  className={`px-3 py-1 rounded-full text-sm ${tab === t ? 'bg-skillswap-500 text-white' : 'bg-white text-skillswap-600 border border-skillswap-200'}`}
                >
                  {t}
                </Button>
              ))}
            </div>

            <div className="ml-auto flex gap-2">
              {(['Pending', 'Active', 'Completed'] as const).map((s) => (
                <Button
                  key={s}
                  onClick={() => toggleStatusFilter(s.toLowerCase())}
                  size="sm"
                  className={`px-2 py-1 rounded-full text-sm ${statusFilter.has(s.toLowerCase()) ? 'bg-skillswap-500 text-white' : 'bg-white text-skillswap-600 border border-skillswap-200'}`}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
          {search.trim() === '' ? (
            allSkills.length === 0 ? (
              <Card className="p-10 bg-white border-2 border-dashed border-skillswap-200 text-center">
                <h2 className="text-xl font-bold text-skillswap-dark mb-2">No skills posted yet.</h2>
                <p className="text-skillswap-600 mb-6">Be the first to add a skill or explore others.</p>
                <div className="flex justify-center gap-3">
                  <Button onClick={() => router.push('/')} className="bg-skillswap-500 text-white">Explore Skills</Button>
                  <Button onClick={() => router.push('/dashboard/settings')} variant="outline">Add a Skill</Button>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {displayedAllSkills.map((s) => (
                  <Card key={s.id} className="p-4 bg-white rounded-lg shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <ConnAvatar
                        userId={s.user_id}
                        explicitName={settingsById[s.user_id]?.display_name || profilesById[s.user_id]?.full_name}
                        explicitAvatar={settingsById[s.user_id]?.avatar_url}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-skillswap-dark">{s.name}</h3>
                          <Badge variant="outline">{s.proficiency_level}</Badge>
                          {(() => {
                            const st = getSkillStatus(s);
                            if (st === 'pending') return <Badge className="ml-2">Pending</Badge>;
                            if (st === 'active') return <Badge className="ml-2">Active</Badge>;
                            if (st === 'completed') return <Badge className="ml-2">Completed</Badge>;
                            if (st === 'rejected') return <Badge className="ml-2">Rejected</Badge>;
                            return null;
                          })()}
                        </div>
                        <p className="text-sm text-skillswap-600">{profilesById[s.user_id]?.full_name || 'SkillSwap member'}</p>
                        <p className="text-xs text-skillswap-500 mt-1">{s.category || s.description || ''}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" onClick={() => createOrOpenConversation(s.user_id)} title="Message">
                        <MessageSquare />
                      </Button>
                      <Button variant="ghost" onClick={() => setSelected(s.user_id)} title="View profile">
                        <Eye />
                      </Button>
                      {(() => {
                        const isPending = Boolean((requestsBySkillId[s.id] || []).some((r) => r.requester_id === user?.id && r.status === 'pending'));
                        return (
                          <Button onClick={() => openAvailabilityModal(s)} disabled={Boolean(sendingRequests[s.id]) || isPending} className="bg-skillswap-500 text-white">
                            {isPending ? 'Pending' : sendingRequests[s.id] ? 'Sending...' : 'Request Swap'}
                          </Button>
                        );
                      })()}
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : (
            filtered.length === 0 ? (
              <Card className="p-10 bg-white border-2 border-dashed border-skillswap-200 text-center">
                <h2 className="text-xl font-bold text-skillswap-dark mb-2">You don’t have any connections yet.</h2>
                <p className="text-skillswap-600 mb-6">Start exploring skills to connect with others.</p>
                <div className="flex justify-center gap-3">
                  <Button onClick={() => router.push('/')} className="bg-skillswap-500 text-white">Explore Skills</Button>
                  <Button onClick={() => router.push('/dashboard/settings')} variant="outline">Add a Skill</Button>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((c) => (
                  <Card key={c.otherId} className="p-4 bg-white rounded-lg shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <ConnAvatar
                        userId={c.otherId}
                        explicitName={settingsById[c.otherId]?.display_name || c.profile?.full_name}
                        explicitAvatar={settingsById[c.otherId]?.avatar_url}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-skillswap-dark">{settingsById[c.otherId]?.display_name || c.profile?.full_name || 'User'}</h3>
                          <Badge variant="outline">{c.status}</Badge>
                        </div>
                        <p className="text-sm text-skillswap-600">{c.skills.slice(0,3).map((s) => s.name).join(' • ') || 'No listed skills'}</p>
                        <time
                          className="text-xs text-skillswap-500 mt-1 block"
                          dateTime={c.lastActivity || undefined}
                          title={c.lastActivity ? formatExactDateTimeWithSeconds(c.lastActivity) : undefined}
                        >
                          {c.lastActivity ? `Last activity ${formatExactDateTime(c.lastActivity)}` : 'No recent activity'}
                        </time>
                        {c.status === 'pending' && c.request?.created_at ? (
                          <time
                            className="text-xs text-skillswap-500 mt-1 block"
                            dateTime={c.request.created_at}
                            title={formatExactDateTimeWithSeconds(c.request.created_at)}
                          >
                            Request created {formatExactDateTime(c.request.created_at)}
                          </time>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" onClick={() => createOrOpenConversation(c.otherId)} title="Message">
                        <MessageSquare />
                      </Button>
                      <Button variant="ghost" onClick={() => setSelected(c.otherId)} title="View profile">
                        <Eye />
                      </Button>
                      <div className="ml-2">
                        {c.status === 'pending' && c.request && c.request.recipient_id === user?.id && (
                          <div className="flex gap-2">
                            <Button onClick={() => openAcceptModal(c.request!)} className="bg-skillswap-500 text-white">Accept</Button>
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
            )
          )}
        </section>

        <aside className="lg:col-span-1">
          {selected ? (
            <Card className="p-4 bg-white sticky top-6">
              <div className="flex items-center gap-3">
                <ConnAvatar
                  userId={selected}
                  explicitName={settingsById[selected]?.display_name || profilesById[selected]?.full_name}
                  explicitAvatar={settingsById[selected]?.avatar_url}
                />
                <div>
                  <h3 className="font-semibold">{settingsById[selected]?.display_name || profilesById[selected]?.full_name || 'User'}</h3>
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
                <Button variant="outline" onClick={() => router.push('/dashboard/settings')}>Full profile</Button>
              </div>
            </Card>
          ) : (
            <Card className="p-6 bg-white">Select a connection to view details.</Card>
          )}
        </aside>
      </main>

      {/* Availability modal (simple inline) */}
      {availModalSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Request swap — {availModalSkill.name}</h3>
              <button onClick={() => setAvailModalSkill(null)} className="text-sm text-skillswap-600">Close</button>
            </div>
            <p className="text-xs text-skillswap-500 mt-2">Add your available times (add multiple). The recipient will see these and can request a reschedule.</p>

            <div className="mt-3">
              {/* Calendar-based availability picker */}
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-ignore */}
              <AvailabilityPicker
                availabilities={availabilities}
                note={sessionNote}
                onNoteChange={setSessionNote}
                durationMinutes={sessionDurationMinutes}
                onDurationMinutesChange={setSessionDurationMinutes}
                onAdd={(s: string) => setAvailabilities((prev) => [...prev, s].slice(0, 6))}
                onRemove={(i: number) => setAvailabilities((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAvailModalSkill(null)}>Cancel</Button>
              <Button onClick={submitAvailabilityRequest} className="bg-skillswap-500 text-white">Send request</Button>
            </div>
          </div>
        </div>
      )}

      {/* Accept modal: pick slot + schedule */}
      {acceptReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Accept request</h3>
              <button onClick={() => setAcceptReq(null)} className="text-sm text-skillswap-600" disabled={accepting}>Close</button>
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-sm">
                <div className="text-xs text-skillswap-600">Session note</div>
                <div className="text-sm text-skillswap-800">{(acceptReq as any).session_note || '—'}</div>
              </div>
              <div className="text-sm">
                <div className="text-xs text-skillswap-600">Duration</div>
                <div className="text-sm text-skillswap-800">{(acceptReq as any).duration_minutes ?? 60} minutes</div>
              </div>

              <div className="mt-2">
                <div className="text-xs text-skillswap-600 mb-2">Select a time slot</div>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {(slotsByRequestId[acceptReq.id] || []).map((s) => {
                    const label = Number.isNaN(new Date(s.start_at).getTime()) ? s.start_at : new Date(s.start_at).toLocaleString();
                    return (
                      <label key={s.id} className="flex items-center gap-2 p-2 rounded border border-skillswap-100 bg-white">
                        <input
                          type="radio"
                          name="acceptSlot"
                          checked={acceptSlotId === s.id}
                          onChange={() => setAcceptSlotId(s.id)}
                        />
                        <span className="text-sm text-skillswap-800">{label}</span>
                      </label>
                    );
                  })}
                  {(slotsByRequestId[acceptReq.id] || []).length === 0 ? (
                    <div className="text-sm text-skillswap-600">No proposed slots found.</div>
                  ) : null}
                </div>
              </div>

              {acceptError ? (
                <div className="text-sm text-destructive">{acceptError}</div>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAcceptReq(null)} disabled={accepting}>Cancel</Button>
              {acceptError.includes('Connect Google Calendar') ? (
                <Button variant="outline" onClick={startGoogleCalendarConnect} disabled={accepting}>Connect Google Calendar</Button>
              ) : null}
              <Button
                onClick={acceptRequest}
                className="bg-skillswap-500 text-white"
                disabled={accepting || !(slotsByRequestId[acceptReq.id] || []).length || !acceptSlotId}
              >
                {accepting ? 'Scheduling…' : 'Accept & Schedule'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
