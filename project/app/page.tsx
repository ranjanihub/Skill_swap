"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

// simplified home feed layout to match mobile screenshot
import { Home as HomeIcon, Users, Calendar, Bell, Briefcase, MessageSquare, Search, Compass, UserCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AppShell, { type ShellNavItem } from '@/components/app-shell';
// Matched swaps render inline in the sidebar; no popover needed
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Skill,
  UserProfile,
  UserSettings,
  ConnectionRequest,
  Notification,
} from '@/lib/supabase';
import { formatExactDateTime, formatExactDateTimeWithSeconds } from '@/lib/utils';
import { useUserIdentity } from '@/hooks/use-user-identity';

const AvailabilityPicker = dynamic(() => import('@/components/calendar/AvailabilityPicker'), {
  ssr: false,
});

const PostDetail = dynamic(() => import('@/components/post/PostDetail'), {
  ssr: false,
});

const runAfterFirstPaint = (cb: () => void) => {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(() => cb(), { timeout: 1500 });
    return;
  }
  window.setTimeout(cb, 0);
};

type PublicProfile = Pick<UserProfile, 'id' | 'full_name' | 'bio' | 'skills_count' | 'swap_points'>;

type FeedOwner = {
  id: string;
  profile?: PublicProfile | null;
  settings?: Pick<UserSettings, 'avatar_url' | 'headline' | 'current_title' | 'current_company'> | null;
  skills: Skill[];
};

/** Avatar+name for any user with 3-tier fallback (custom → OAuth → placeholder) */
function UserAvatar({ userId, explicitName, explicitAvatar, size = 'h-12 w-12' }: {
  userId: string;
  explicitName?: string | null;
  explicitAvatar?: string | null;
  size?: string;
}) {
  const { name, avatarUrl } = useUserIdentity(userId, explicitName, explicitAvatar);
  return (
    <Avatar className={size}>
      <AvatarImage src={avatarUrl ?? ''} alt={name || 'User'} />
      <AvatarFallback>{(name || 'U').slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}

function UserName({ userId, explicitName, explicitAvatar, fallback = 'User' }: {
  userId: string;
  explicitName?: string | null;
  explicitAvatar?: string | null;
  fallback?: string;
}) {
  const { name } = useUserIdentity(userId, explicitName, explicitAvatar);
  return <>{name || fallback}</>;
}

export default function Home() {
  const { user, loading: authLoading, configError } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [meProfile, setMeProfile] = useState<PublicProfile | null>(null);
  const [meSettings, setMeSettings] = useState<Pick<UserSettings, 'avatar_url' | 'headline' | 'current_title' | 'current_company'> | null>(null);

  const [feed, setFeed] = useState<FeedOwner[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [requestsBySkillId, setRequestsBySkillId] = useState<Record<string, ConnectionRequest[]>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [availModal, setAvailModal] = useState<{ ownerId: string; skill?: Skill } | null>(null);
  const [availabilities, setAvailabilities] = useState<string[]>([]);
  const [newAvailability, setNewAvailability] = useState('');
  const [sessionNote, setSessionNote] = useState('');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(60);

  const [query, setQuery] = useState('');
  const [showPostModal, setShowPostModal] = useState(false);
  const [postText, setPostText] = useState('');
  const [postSkillName, setPostSkillName] = useState('');
  const [postSkillType, setPostSkillType] = useState<'teach' | 'learn'>('teach');
  const [postProficiency, setPostProficiency] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [quizVisible, setQuizVisible] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [posting, setPosting] = useState(false);

  const [matchedSwaps, setMatchedSwaps] = useState([]);
  const [matchedDetails, setMatchedDetails] = useState<Array<any>>([]);
  const [ratingsByUser, setRatingsByUser] = useState<Record<string, { avg: number; count: number }>>({});
  const [sidebarCounts, setSidebarCounts] = useState<{ swaps: number; posted: number; connections: number; swapRequests: number }>({ swaps: 0, posted: 0, connections: 0, swapRequests: 0 });
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostFallback, setSelectedPostFallback] = useState<any | null>(null);
  const [showMatchedSwapsCenter, setShowMatchedSwapsCenter] = useState(false);
  const [copiedShareKey, setCopiedShareKey] = useState<string | null>(null);

  const sharePost = async (postId: string | undefined, label: string, shareKey: string) => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = postId ? `${origin}/post/${postId}` : `${origin}/`;
      const title = 'SkillSwap post';
      const text = label ? `Check out ${label} on SkillSwap` : 'Check out this SkillSwap post';

      // Prefer native share on mobile.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (typeof navigator !== 'undefined' && navigator.share) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await navigator.share({ title, text, url });
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopiedShareKey(shareKey);
        window.setTimeout(() => setCopiedShareKey((k) => (k === shareKey ? null : k)), 1500);
        return;
      }

      // Last-resort fallback.
      window.prompt('Copy this link:', url);
    } catch (e) {
      console.warn('Share failed', e);
    }
  };

  const fetchMatchedSwaps = async () => {
    try {
      const response = await fetch('/api/matched-swaps', { cache: 'no-store' });
      const data = await response.json();
      setMatchedSwaps(data);
    } catch (error) {
      console.error('Failed to fetch matched swaps:', error);
    }
  };

  const loadSidebarCounts = async () => {
    if (!user) return;
    if (!isSupabaseConfigured) return;
    try {
      const [{ count: swapsCount }, { count: postedCount }, { count: connectionsCount }, { count: swapRequestsCount }] = await Promise.all([
        supabase
          .from('skill_swap_sessions')
          .select('id', { count: 'exact', head: true })
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`),
        supabase
          .from('skills')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('connection_requests')
          .select('id', { count: 'exact', head: true })
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .eq('status', 'accepted'),
        supabase
          .from('connection_requests')
          .select('id', { count: 'exact', head: true })
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .eq('status', 'pending'),
      ]);

      setSidebarCounts({
        swaps: typeof swapsCount === 'number' ? swapsCount : 0,
        posted: typeof postedCount === 'number' ? postedCount : 0,
        connections: typeof connectionsCount === 'number' ? connectionsCount : 0,
        swapRequests: typeof swapRequestsCount === 'number' ? swapRequestsCount : 0,
      });
    } catch (e) {
      console.warn('Failed to load sidebar counts', e);
    }
  };

  const scheduleSidebarSync = (ms = 400) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void loadSidebarCounts();
      void fetchMatchedSwaps();
    }, ms);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    runAfterFirstPaint(() => {
      void loadSidebarCounts();
      void fetchMatchedSwaps();
    });
  }, [authLoading, user?.id]);

  // Real-time sidebar synchronization (counts + matches)
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isSupabaseConfigured) return;

    let cancelled = false;
    let ch: any;

    runAfterFirstPaint(() => {
      if (cancelled) return;
      ch = supabase
        .channel(`home-sidebar-sync-${user.id}`)
        // Swaps posted / skill updates can affect matched swaps as well
        .on('postgres_changes', { event: '*', schema: 'public', table: 'skills' }, () => scheduleSidebarSync())
        // Swaps (sessions) count changes
        .on('postgres_changes', { event: '*', schema: 'public', table: 'skill_swap_sessions', filter: `user_a_id=eq.${user.id}` }, () => scheduleSidebarSync())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'skill_swap_sessions', filter: `user_b_id=eq.${user.id}` }, () => scheduleSidebarSync());

      ch.subscribe();
    });

    return () => {
      cancelled = true;
      try {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
        if (ch) supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [authLoading, user?.id]);

  const matchedCounts = useMemo(() => {
    const map: Record<string, number> = {};
    (matchedSwaps || []).forEach((m: any) => {
      if (!m || !m.skill) return;
      map[m.skill] = (map[m.skill] || 0) + 1;
    });
    return map;
  }, [matchedSwaps]);

  const notificationSavedSkills = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; created_at: string; type: string }> = [];

    for (const n of (notifications || []) as any[]) {
      const payload = (n?.payload || {}) as Record<string, any>;
      const skillName = payload.skill_name || payload.requested_skill_name || payload.skill;
      if (!skillName) continue;
      const name = String(skillName).trim();
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        id: String(n.id || name),
        name,
        created_at: String(n.created_at || ''),
        type: String(n.type || ''),
      });

      if (out.length >= 6) break;
    }

    return out;
  }, [notifications]);

  useEffect(() => {
    const loadDetails = async () => {
      if (!matchedSwaps || matchedSwaps.length === 0) {
        setMatchedDetails([]);
        return;
      }
      // Validate UUIDs to avoid passing dev/sample ids to Supabase which expects UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const allTeacherIds = Array.from(
        new Set(
          matchedSwaps
            .filter(
              (m: any) =>
                !m.teacher ||
                !m.teacher.full_name ||
                (m.teacher_id && m.teacher.full_name === m.teacher_id)
            )
            .map((m: any) => m.teacher_id)
        )
      ).filter(Boolean);
      const allTeachSkillIds = Array.from(new Set(matchedSwaps.map((m: any) => m.teach_skill_id))).filter(Boolean);

      const teacherIds = allTeacherIds.filter((id) => uuidRegex.test(id)).slice(0, 200);
      const teachSkillIds = allTeachSkillIds.filter((id) => uuidRegex.test(id)).slice(0, 200);

      // If there are no valid UUIDs to query, construct details locally from matchedSwaps
      if (teacherIds.length === 0 && teachSkillIds.length === 0) {
        const details = (matchedSwaps || []).map((m: any) => ({
          ...m,
          // Preserve any author/profile data already attached by the API.
          // Never override it with an internal id (e.g. dev/sample ids).
          teacher: m.teacher || null,
          teachSkill: null,
        }));
        setMatchedDetails(details);
        return;
      }

      try {
        const results = await Promise.all([
          supabase.from('user_profiles').select('id, full_name, bio').in('id', teacherIds),
          supabase.from('user_settings').select('id, headline, current_title, current_company, display_name, username').in('id', teacherIds),
          supabase.from('skills').select('id, name, proficiency_level, user_id').in('id', teachSkillIds),
        ]);

        const profilesData = results[0].data || [];
        const settingsData = results[1].data || [];
        const teachSkillsData = results[2].data || [];

        const profilesMap: Record<string, any> = {};
        (profilesData || []).forEach((p: any) => (profilesMap[p.id] = p));

        const settingsMap: Record<string, any> = {};
        (settingsData || []).forEach((s: any) => (settingsMap[s.id] = s));

        const skillsMap: Record<string, any> = {};
        (teachSkillsData || []).forEach((s: any) => (skillsMap[s.id] = s));

        const details = (matchedSwaps || []).map((m: any) => ({
          ...m,
          teacher: profilesMap[m.teacher_id] || m.teacher || null,
          teacherSettings: settingsMap[m.teacher_id] || m.teacher_settings || null,
          teachSkill: skillsMap[m.teach_skill_id] || null,
        }));

        setMatchedDetails(details);
      } catch (err) {
        console.error('Failed to load matched details', err);
        // Fallback: don't crash, show basic matched items
        const details = (matchedSwaps || []).map((m: any) => ({
          ...m,
          teacher: m.teacher || null,
          teachSkill: null,
        }));
        setMatchedDetails(details);
      }
    };

    runAfterFirstPaint(() => {
      void loadDetails();
    });
  }, [matchedSwaps]);

  const publicNav: ShellNavItem[] = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/explore', label: 'Explore Skills', icon: Compass },
  ];

  // If user is not logged in, we don't redirect; show login button in header instead.

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

        const [{ data: myProfile }, { data: mySettings }] = await Promise.all([
          supabase.from('user_profiles').select('id, full_name, bio, skills_count, swap_points').eq('id', user.id).maybeSingle(),
          supabase
            .from('user_settings')
            .select('id, avatar_url, headline, current_title, current_company, location')
            .eq('id', user.id)
            .maybeSingle(),
        ]);

        setMeProfile((myProfile || null) as any);
        setMeSettings((mySettings || null) as any);

        const { data: skillsData, error: skillsError } = await supabase
          .from('skills')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(120);
        if (skillsError) throw skillsError;

        const safeSkills = (skillsData || []) as Skill[];
        const ownerIds = Array.from(new Set(safeSkills.map((s) => s.user_id))).slice(0, 200);

        const [{ data: profilesData }, { data: settingsData }, { data: reqData }, { data: notifData }] = await Promise.all([
          ownerIds.length
            ? supabase.from('user_profiles').select('id, full_name, bio, skills_count, swap_points').in('id', ownerIds)
            : Promise.resolve({ data: [] as any[] } as any),
          ownerIds.length
            ? supabase.from('user_settings').select('id, avatar_url, headline, current_title, current_company').in('id', ownerIds)
            : Promise.resolve({ data: [] as any[] } as any),
          supabase.from('connection_requests').select('*').or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
          supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
        ]);

        setNotifications(((notifData || []) as Notification[]) ?? []);

        const profilesById: Record<string, PublicProfile> = {};
        (profilesData || []).forEach((p: any) => {
          profilesById[p.id] = p as PublicProfile;
        });

        const settingsById: Record<string, any> = {};
        (settingsData || []).forEach((s: any) => {
          settingsById[s.id] = s;
        });

        const reqs = (reqData || []) as ConnectionRequest[];
        const reqsBySkill: Record<string, ConnectionRequest[]> = {};
        reqs.forEach((r) => {
          if (!r.skill_id) return;
          reqsBySkill[r.skill_id] = reqsBySkill[r.skill_id] || [];
          reqsBySkill[r.skill_id].push(r);
        });
        setRequestsBySkillId(reqsBySkill);

        const skillsByOwner: Record<string, Skill[]> = {};
        safeSkills.forEach((s) => {
          skillsByOwner[s.user_id] = skillsByOwner[s.user_id] || [];
          skillsByOwner[s.user_id].push(s);
        });

        const owners: FeedOwner[] = ownerIds.map((id) => ({
          id,
          profile: profilesById[id] || null,
          settings: settingsById[id] || null,
          skills: (skillsByOwner[id] || []).slice(0, 3),
        }));

        // load ratings for these owners (avg + count)
        try {
          if (ownerIds.length > 0) {
            const { data: ratingsData } = await supabase.from('swap_ratings').select('rated_id, rating').in('rated_id', ownerIds);
            const map: Record<string, { avg: number; count: number }> = {};
            (ratingsData || []).forEach((r: any) => {
              const id = r.rated_id as string;
              map[id] = map[id] || { avg: 0, count: 0 };
              map[id].avg = (map[id].avg * map[id].count + r.rating) / (map[id].count + 1);
              map[id].count += 1;
            });
            setRatingsByUser(map);
          }
        } catch (e) {
          console.warn('Failed to load ratings', e);
        }

        setFeed(owners);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load home feed';
        setError(msg);
        console.error('Home feed error:', err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user, configError]);

  // Keep notifications updated automatically
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isSupabaseConfigured) return;

    let cancelled = false;
    let ch: any;

    runAfterFirstPaint(() => {
      if (cancelled) return;
      ch = supabase
        .channel(`notifications-live-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            try {
              if (payload.eventType === 'INSERT') {
                const next = payload.new as Notification;
                setNotifications((prev) => [next, ...prev].slice(0, 8));
                return;
              }
              if (payload.eventType === 'UPDATE') {
                const next = payload.new as Notification;
                setNotifications((prev) => prev.map((n) => (n.id === next.id ? next : n)).slice(0, 8));
                return;
              }
              if (payload.eventType === 'DELETE') {
                const oldRow = payload.old as { id?: string };
                if (!oldRow?.id) return;
                setNotifications((prev) => prev.filter((n) => n.id !== oldRow.id));
              }
            } catch {
              // ignore
            }
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      try {
        if (ch) supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [authLoading, user?.id]);

  // Keep ratings updated automatically
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isSupabaseConfigured) return;

    let cancelled = false;
    let ch: any;

    runAfterFirstPaint(() => {
      if (cancelled) return;
      ch = supabase
        .channel(`ratings-live-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'swap_ratings' }, (payload) => {
          try {
            const r: any = payload.new;
            const ratedId = r?.rated_id as string | undefined;
            const rating = Number(r?.rating);
            if (!ratedId || !Number.isFinite(rating)) return;
            setRatingsByUser((prev) => {
              const cur = prev[ratedId] || { avg: 0, count: 0 };
              const nextCount = cur.count + 1;
              const nextAvg = (cur.avg * cur.count + rating) / nextCount;
              return { ...prev, [ratedId]: { avg: nextAvg, count: nextCount } };
            });
          } catch {
            // ignore
          }
        })
        .subscribe();
    });

    return () => {
      cancelled = true;
      try {
        if (ch) supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [authLoading, user?.id]);

  // Listen for child PostDetail requests to open the availability modal
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const d = e.detail;
        if (!d) return;
        openAvailabilityModal(d.ownerId, d.skill);
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener('open-availability', handler as EventListener);
    return () => window.removeEventListener('open-availability', handler as EventListener);
  }, []);

  // allow refresh of feed after posting
  const refreshFeed = async () => {
    if (authLoading) return;
    if (!user) return;
    setLoading(true);
    try {
      const { data: skillsData } = await supabase
        .from('skills')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(120);

      const safeSkills = (skillsData || []) as Skill[];
      const ownerIds = Array.from(new Set(safeSkills.map((s) => s.user_id))).slice(0, 200);

      const [{ data: profilesData }, { data: settingsData }, { data: reqData }, { data: notifData }] = await Promise.all([
        ownerIds.length
          ? supabase.from('user_profiles').select('id, full_name, bio, skills_count, swap_points').in('id', ownerIds)
          : Promise.resolve({ data: [] as any[] } as any),
        ownerIds.length
          ? supabase.from('user_settings').select('id, avatar_url, headline, current_title, current_company').in('id', ownerIds)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from('connection_requests').select('*').or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
        supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
      ]);

      setNotifications(((notifData || []) as Notification[]) ?? []);

      const profilesById: Record<string, PublicProfile> = {};
      (profilesData || []).forEach((p: any) => {
        profilesById[p.id] = p as PublicProfile;
      });

      const settingsById: Record<string, any> = {};
      (settingsData || []).forEach((s: any) => {
        settingsById[s.id] = s;
      });

      const reqs = (reqData || []) as ConnectionRequest[];
      const reqsBySkill: Record<string, ConnectionRequest[]> = {};
      reqs.forEach((r) => {
        if (!r.skill_id) return;
        reqsBySkill[r.skill_id] = reqsBySkill[r.skill_id] || [];
        reqsBySkill[r.skill_id].push(r);
      });
      setRequestsBySkillId(reqsBySkill);

      const skillsByOwner: Record<string, Skill[]> = {};
      safeSkills.forEach((s) => {
        skillsByOwner[s.user_id] = skillsByOwner[s.user_id] || [];
        skillsByOwner[s.user_id].push(s);
      });

      const owners: FeedOwner[] = ownerIds.map((id) => ({
        id,
        profile: profilesById[id] || null,
        settings: settingsById[id] || null,
        skills: (skillsByOwner[id] || []).slice(0, 3),
      }));

      try {
        if (ownerIds.length > 0) {
          const { data: ratingsData } = await supabase.from('swap_ratings').select('rated_id, rating').in('rated_id', ownerIds);
          const map: Record<string, { avg: number; count: number }> = {};
          (ratingsData || []).forEach((r: any) => {
            const id = r.rated_id as string;
            map[id] = map[id] || { avg: 0, count: 0 };
            map[id].avg = (map[id].avg * map[id].count + r.rating) / (map[id].count + 1);
            map[id].count += 1;
          });
          setRatingsByUser(map);
        }
      } catch (e) {
        console.warn('Failed to load ratings', e);
      }

      setFeed(owners);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh feed';
      setError(msg);
      console.error('refreshFeed error:', err);
    } finally {
      setLoading(false);
    }
  };

  const quizQuestions = useMemo(() => {
    const skill = postSkillName.trim() || 'this skill';
    const sampleDistractors = ['Data analysis', 'Public speaking', 'Web design', 'Marketing basics'];
    const distractors = sampleDistractors.filter((d) => d.toLowerCase() !== skill.toLowerCase()).slice(0, 2);

    const q1Choices = [skill, ...distractors];
    const q2Choices = ['Offering', 'Looking', 'Both'];
    const q3Choices = ['Beginner', 'Intermediate', 'Advanced'];

    return [
      {
        q: `Which skill is this post about?`,
        choices: q1Choices,
        a: skill,
      },
      {
        q: `Is this post for offering a skill or looking to learn one?`,
        choices: q2Choices,
        a: postSkillType === 'teach' ? 'Offering' : 'Looking',
      },
      {
        q: `What proficiency level did you select for this post?`,
        choices: q3Choices,
        a: postProficiency === 'beginner' ? 'Beginner' : postProficiency === 'intermediate' ? 'Intermediate' : 'Advanced',
      },
    ];
  }, [postSkillName, postSkillType, postProficiency]);

  const evaluateQuiz = () => {
    let correct = 0;
    quizQuestions.forEach((qq, idx) => {
      if (quizAnswers[idx] === qq.a) correct += 1;
    });
    return (correct / quizQuestions.length) * 100;
  };

  const submitPost = async () => {
    if (!user) return;
    if (!postSkillName.trim() || !postText.trim()) {
      setError('Skill name and post text are required');
      return;
    }

    setPosting(true);
    try {
      const { error: insertError } = await supabase.from('skills').insert({
        user_id: user.id,
        name: postSkillName.trim(),
        description: postText.trim(),
        category: null,
        skill_type: postSkillType,
        proficiency_level: postProficiency,
      });
      if (insertError) throw insertError;
      // refresh feed to show the new public post
      await refreshFeed();
      setShowPostModal(false);
      setQuizVisible(false);
      setPostText('');
      setPostSkillName('');
      setQuizAnswers({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post swap';
      setError(msg);
      console.error('submitPost error:', err);
    } finally {
      setPosting(false);
    }
  };

  const filteredFeed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return feed;
    return feed.filter((o) => {
      const name = (o.profile?.full_name || '').toLowerCase();
      const headline = (o.settings?.headline || '').toLowerCase();
      if (name.includes(q) || headline.includes(q)) return true;
      return o.skills.some((s) => s.name.toLowerCase().includes(q));
    });
  }, [feed, query]);

  const sendSwapRequest = async (ownerId: string, skillId: string | undefined, opts: { note: string; durationMinutes: number; slots: string[] }) => {
    if (!user) return;
    const key = skillId || ownerId;

    // prevent duplicates
    const existing = (requestsBySkillId[skillId || ''] || []).some((r) =>
      r.requester_id === user.id && r.recipient_id === ownerId && r.status === 'pending'
    );
    if (skillId && existing) return;

    try {
      setSending((prev) => ({ ...prev, [key]: true }));
      const baseInsert = {
        requester_id: user.id,
        recipient_id: ownerId,
        skill_id: skillId || null,
        status: 'pending',
      };

      // New schema insert (preferred)
      let data: any = null;
      const { data: dataNew, error: insertErrorNew } = await supabase
        .from('connection_requests')
        .insert({
          ...baseInsert,
          session_note: opts.note,
          duration_minutes: opts.durationMinutes || 60,
        } as any)
        .select('*')
        .maybeSingle();

      if (insertErrorNew) {
        const msg = `${insertErrorNew.message || ''} ${insertErrorNew.details || ''}`.toLowerCase();
        const looksLikeMissingColumn = msg.includes('column') || msg.includes('session_note') || msg.includes('duration_minutes');

        // Backward compatible fallback: old DB schema (no new columns)
        if (looksLikeMissingColumn) {
          const { data: dataOld, error: insertErrorOld } = await supabase
            .from('connection_requests')
            .insert(baseInsert as any)
            .select('*')
            .maybeSingle();
          if (insertErrorOld) throw insertErrorOld;
          data = dataOld;
        } else {
          throw insertErrorNew;
        }
      } else {
        data = dataNew;
      }

      // Persist proposed slots (best-effort)
      try {
        const slots = (opts.slots || []).filter(Boolean).slice(0, 6);
        if (data?.id && slots.length > 0) {
          await supabase.from('connection_request_slots').insert(
            slots.map((start_at) => ({ request_id: data.id, start_at }))
          );
        }
      } catch (e) {
        console.warn('connection_request_slots insert warning', e);
      }

      if (data?.skill_id) {
        setRequestsBySkillId((prev) => ({
          ...prev,
          [data.skill_id as string]: [...(prev[data.skill_id as string] || []), data as any],
        }));
      }
      // create a notification including availabilities if provided
      try {
        const requesterName =
          meProfile?.full_name ||
          (user.user_metadata?.full_name as string) ||
          (user.email || '').split('@')[0] ||
          'User';

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

        const requestedSkillName = skillId
          ? (feed.find((f) => f.id === ownerId)?.skills.find((s) => s.id === skillId)?.name ?? null)
          : null;

        await supabase.from('notifications').insert({
          user_id: ownerId,
          type: 'connection_request',
          payload: {
            requester_id: user.id,
            requester_name: requesterName,
            request_id: data?.id ?? null,
            requested_skill_id: skillId || null,
            requested_skill_name: requestedSkillName,
            offered_skill_name: offeredSkillName,
            session_note: opts.note,
            duration_minutes: opts.durationMinutes || 60,
            slots: (opts.slots || []).slice(0, 6),
            // legacy key (older clients)
            availabilities: (opts.slots || []).slice(0, 6),
            slots_count: (opts.slots || []).length,
          },
        });
      } catch (e) {
        console.warn('notifications insert warning', e);
      }
    } catch (err) {
      const anyErr = err as any;
      const parts = [anyErr?.message, anyErr?.details, anyErr?.hint, anyErr?.code].filter(Boolean);
      const msg = parts.length ? parts.join(' — ') : (err instanceof Error ? err.message : 'Failed to send request');
      setError(msg);
    } finally {
      setSending((prev) => ({ ...prev, [key]: false }));
    }
  };

  const openAvailabilityModal = (ownerId: string, skill?: Skill) => {
    setAvailModal({ ownerId, skill });
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

  const removeAvailability = (idx: number) => setAvailabilities((prev) => prev.filter((_, i) => i !== idx));

  const submitAvailabilityRequest = async () => {
    if (!availModal) return;
    if (availabilities.length === 0) {
      setError('Please add at least one availability');
      return;
    }
    const note = sessionNote.trim();
    if (!note) {
      setError('Please add a session note');
      return;
    }
    const duration = Number(sessionDurationMinutes || 0);
    if (!duration || duration < 15) {
      setError('Please set a valid session duration (min 15 minutes)');
      return;
    }

    await sendSwapRequest(availModal.ownerId, availModal.skill?.id, {
      note,
      durationMinutes: duration,
      slots: availabilities,
    });
    setAvailModal(null);
  };

  const mobileMenu = (
    <>
      {/* profile card */}
      <div className="mb-4">
        <div className="feed-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full overflow-hidden">
              <UserAvatar userId={user?.id || ''} explicitName={meProfile?.full_name} explicitAvatar={meSettings?.avatar_url as string | null} size="h-16 w-16" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-skillswap-800"><UserName userId={user?.id || ''} explicitName={meProfile?.full_name} /></h2>
              <p className="text-sm text-skillswap-600">{meSettings?.headline || meSettings?.current_title || 'Complete your profile to get better matches'}</p>
            </div>
          </div>
        </div>
      </div>
      {/* notifications panel */}
      <div>
        <div className="feed-card p-4">
          <h3 className="text-lg font-semibold text-skillswap-800">Notifications</h3>
          <p className="text-sm text-skillswap-600 mt-2">Recent</p>
          {notifications.length === 0 ? (
            <p className="mt-3 text-sm text-skillswap-500">No notifications yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {notifications.map((n) => (
                <li key={n.id} className="text-sm">
                  <div className="font-medium text-skillswap-800">{n.type}</div>
                  <time
                    className="text-xs text-skillswap-500 mt-1 block"
                    dateTime={n.created_at}
                    title={formatExactDateTimeWithSeconds(n.created_at)}
                  >
                    {formatExactDateTime(n.created_at)}
                  </time>
                  <div className="text-xs text-skillswap-500 mt-1">
                    {n.read ? 'Read' : 'Unread'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
    <AppShell
      showSidebar={false}
      mobileMenu={mobileMenu}
      nav={publicNav}
      bottomNav={[
        { href: '/', label: 'Home', icon: HomeIcon },
        { href: '/network', label: 'My Network', icon: Users },
        { href: '/calendar', label: 'Calender', icon: Calendar },
        { href: '/notifications', label: 'Notification', icon: Bell },
        { href: '/dashboard/settings', label: 'Profile', icon: UserCircle },
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
            {!user && (
              <button
                onClick={() => router.push('/login')}
                className="px-3 h-10 rounded-full bg-skillswap-500 text-white hover:bg-skillswap-600 text-sm"
              >
                Login
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="w-full max-w-[1200px] mx-auto lg:grid lg:grid-cols-[280px_1fr_320px] lg:gap-6">
        {/* Left column - profile (desktop only) */}
        <aside className="hidden lg:block">
          <div className="feed-card">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full overflow-hidden">
                  <UserAvatar userId={user?.id || ''} explicitName={meProfile?.full_name} explicitAvatar={meSettings?.avatar_url as string | null} size="h-16 w-16" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-skillswap-800"><UserName userId={user?.id || ''} explicitName={meProfile?.full_name} /></h2>
                  <p className="text-sm text-skillswap-600">
                    {meSettings?.headline || meSettings?.current_title || 'Complete your profile to get better matches'}
                  </p>
                </div>
              </div>
            
            <div className="mt-4">
              <div className="flex justify-between text-sm text-skillswap-600">
                  <div>Number of swaps</div>
                  <div className="font-semibold text-skillswap-800">{sidebarCounts.swaps}</div>
                </div>
                <div className="flex justify-between mt-2 text-sm text-skillswap-600">
                  <div>Swaps posted</div>
                  <div className="font-semibold text-skillswap-800">{sidebarCounts.posted}</div>
                </div>
            </div>
            <div className="mt-4 border-t border-skillswap-200 pt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-skillswap-300 rounded-sm" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowMatchedSwapsCenter((v) => !v);
                      // keep behavior consistent with other sidebar actions
                      const feedEl = document.querySelector('section.space-y-6');
                      if (feedEl) feedEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    aria-expanded={showMatchedSwapsCenter}
                    className="flex items-center gap-2"
                  >
                    <span className="font-medium">Matched Swaps</span>
                    {matchedDetails.length > 0 && (
                      <span className="text-xs bg-skillswap-100 text-skillswap-700 rounded-full px-2 py-0.5">{matchedDetails.length}</span>
                    )}
                  </button>
                </div>
              </div>

              {matchedDetails.length === 0 ? (
                notificationSavedSkills.length === 0 ? (
                  <div className="ml-1 text-xs text-skillswap-500">No matches yet</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {notificationSavedSkills.map((s) => (
                      <div key={s.id} className="bg-white border border-skillswap-200 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-skillswap-800 truncate">{s.name}</div>
                            {s.type ? <div className="text-[11px] text-skillswap-500 truncate">{s.type}</div> : null}
                          </div>
                          {s.created_at ? (
                            <time className="text-[11px] text-skillswap-500 flex-shrink-0" dateTime={s.created_at}>
                              {formatExactDateTime(s.created_at)}
                            </time>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="mt-2 space-y-3">
                  {matchedDetails.slice(0, 6).map((m) => (
                    <div key={`${m.teacher_id}-${m.teach_skill_id}`} className="bg-white border border-skillswap-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-full overflow-hidden">
                            <UserAvatar userId={m.teacher_id} explicitName={m.teacher?.full_name} explicitAvatar={m.teacherSettings?.avatar_url as string | null} />
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-skillswap-800"><UserName userId={m.teacher_id} explicitName={m.teacher?.full_name} /></div>
                            {m.teacher_id && ratingsByUser[m.teacher_id] ? (
                              <div className="text-xs text-skillswap-500 mt-0.5">★ {ratingsByUser[m.teacher_id].avg.toFixed(1)} ({ratingsByUser[m.teacher_id].count})</div>
                            ) : null}
                            <p className="text-xs text-skillswap-600 mt-1">
                              {m.teacherSettings?.headline || m.teacherSettings?.current_title || m.teacherSettings?.current_company || m.teacher?.bio || ''}
                            </p>
                          </div>
                        </div>
                        <time
                          className="text-xs text-skillswap-500"
                          dateTime={m.created_at || undefined}
                          title={m.created_at ? formatExactDateTimeWithSeconds(m.created_at) : undefined}
                        >
                          {m.created_at ? formatExactDateTime(m.created_at) : ''}
                        </time>
                      </div>

                      <div className="mt-3 text-sm text-skillswap-700">
                        <p className="font-medium text-skillswap-800">Skills</p>
                        <ul className="mt-1 space-y-1">
                          <li className="flex items-center justify-between">
                            <span className="truncate">{m.teachSkill?.name || m.skill}</span>
                            <span className="text-xs text-skillswap-500">{m.teachSkill?.proficiency_level || ''}</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mt-3 flex gap-3">
                        <button
                          onClick={() => {
                            // set selected post to show inline
                            setSelectedPostId(m.teach_skill_id);
                            setSelectedPostFallback(m);
                            setShowMatchedSwapsCenter(false);
                            // scroll to center feed area
                            const feedEl = document.querySelector('section.space-y-6');
                            if (feedEl) feedEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          className="btn-outline-rounded"
                        >
                          View Swap Post
                        </button>
                        <button
                          onClick={() => {
                            // open availability modal like other request buttons
                            // prefer to pass the teachSkill object if available
                            const skillObj = m.teachSkill ? { id: m.teachSkill.id, name: m.teachSkill.name, skill_type: 'teach', proficiency_level: m.teachSkill.proficiency_level } : undefined;
                            openAvailabilityModal(m.teacher_id, skillObj as any);
                          }}
                          className="btn-primary-rounded"
                        >
                          Send Request
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Center feed */}
        <section className="space-y-6">

          {/* Matched swaps (mini post cards) */}
          {!selectedPostId && showMatchedSwapsCenter && matchedDetails.length > 0 && (
            <div className="feed-card">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-skillswap-800">Matched Swaps</h3>
                <span className="text-xs bg-skillswap-100 text-skillswap-700 rounded-full px-2 py-0.5">{matchedDetails.length}</span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                {matchedDetails.slice(0, 6).map((m) => {
                  const name =
                    m.teacherSettings?.display_name ||
                    m.teacherSettings?.username ||
                    m.teacher?.full_name ||
                    'User';
                  const subtitle = m.teacherSettings?.headline || m.teacherSettings?.current_title || m.teacherSettings?.current_company || m.teacher?.bio || '';
                  const skillName = m.teachSkill?.name || m.skill || 'Skill';
                  const prof = m.teachSkill?.proficiency_level || '';
                  const rating = m.teacher_id ? ratingsByUser[m.teacher_id] : null;
                  return (
                    <article key={`matched-mini-${m.teacher_id}-${m.teach_skill_id}`} className="bg-white border border-skillswap-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                            <UserAvatar userId={m.teacher_id} explicitName={m.teacherSettings?.display_name || m.teacherSettings?.username || m.teacher?.full_name} explicitAvatar={m.teacherSettings?.avatar_url as string | null} size="h-10 w-10" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-sm text-skillswap-800 truncate">{name}</div>
                              <span className="text-[11px] bg-skillswap-100 text-skillswap-700 rounded-full px-2 py-0.5">Matched</span>
                            </div>
                            {rating ? (
                              <div className="text-xs text-skillswap-500 mt-0.5">★ {rating.avg.toFixed(1)} ({rating.count})</div>
                            ) : null}
                            {subtitle ? <p className="text-xs text-skillswap-600 mt-0.5 truncate">{subtitle}</p> : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-skillswap-700">
                        <p className="text-xs font-medium text-skillswap-800">Skills</p>
                        <ul className="mt-1 space-y-1">
                          <li className="flex items-center justify-between gap-3">
                            <span className="truncate">{skillName}</span>
                            <span className="text-xs text-skillswap-500 flex-shrink-0">{prof}</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mt-3 flex gap-3 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedPostId(m.teach_skill_id);
                            setSelectedPostFallback(m);
                            setShowMatchedSwapsCenter(false);
                            const feedEl = document.querySelector('section.space-y-6');
                            if (feedEl) feedEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          className="btn-outline-rounded"
                        >
                          View Swap Post
                        </button>
                        <button
                          onClick={() => {
                            const skillObj = m.teachSkill
                              ? { id: m.teachSkill.id, name: m.teachSkill.name, skill_type: 'teach', proficiency_level: m.teachSkill.proficiency_level }
                              : undefined;
                            openAvailabilityModal(m.teacher_id, skillObj as any);
                          }}
                          className="btn-primary-rounded"
                        >
                          Send Request
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
          

          

          {error && (
            <div className="feed-card border-destructive/30 bg-destructive/10">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="feed-card">
              <div className="w-10 h-10 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" />
            </div>
          ) : selectedPostId ? (
            <PostDetail
              skillId={selectedPostId}
              fallbackSkill={selectedPostFallback?.teachSkill ?? (selectedPostFallback ? { id: selectedPostFallback.teach_skill_id, name: selectedPostFallback.skill, description: selectedPostFallback.description ?? null, proficiency_level: selectedPostFallback.proficiency_level ?? null, user_id: selectedPostFallback.teacher_id } : undefined)}
              fallbackOwner={selectedPostFallback?.teacher ?? null}
            />
          ) : (
            (() => {
              const postedSwaps = filteredFeed.flatMap((owner) =>
                owner.skills.map((skill) => ({ owner, skill }))
              ).sort((a, b) => {
                const aTs = a.skill.created_at ? new Date(a.skill.created_at).getTime() : 0;
                const bTs = b.skill.created_at ? new Date(b.skill.created_at).getTime() : 0;
                return bTs - aTs;
              });

              // Group skills by owner + created_at so pairs inserted together show as one post
              const groups: Array<{ owner: FeedOwner; skills: Skill[]; ts?: string | null }> = [];
              const map = new Map<string, { owner: FeedOwner; skills: Skill[]; ts?: string | null }>();
              for (const { owner, skill } of postedSwaps) {
                const key = `${owner.id}|${skill.created_at ?? ''}`;
                if (!map.has(key)) {
                  const g = { owner, skills: [], ts: skill.created_at };
                  map.set(key, g);
                  groups.push(g);
                }
                map.get(key)!.skills.push(skill);
              }

              return groups.map((g, gi) => {
                return (
                  <article key={`${g.owner.id}-${gi}-${g.ts || ''}`} className="feed-card">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden">
                        <UserAvatar userId={g.owner.id} explicitName={g.owner.profile?.full_name} explicitAvatar={g.owner.settings?.avatar_url as string | null} />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-skillswap-800">
                              <UserName userId={g.owner.id} explicitName={g.owner.profile?.full_name} />
                            </h3>
                            {ratingsByUser[g.owner.id] ? (
                              <div className="text-xs text-skillswap-500 mt-0.5">★ {ratingsByUser[g.owner.id].avg.toFixed(1)} ({ratingsByUser[g.owner.id].count})</div>
                            ) : null}
                          </div>
                          <time
                            className="text-xs text-skillswap-500"
                            dateTime={g.ts || undefined}
                            title={g.ts ? formatExactDateTimeWithSeconds(g.ts) : undefined}
                          >
                            {g.ts ? formatExactDateTime(g.ts) : ''}
                          </time>
                        </div>

                        <div className="mt-3 text-sm text-skillswap-700">
                          <p className="font-medium text-skillswap-800">Skills</p>
                          <ul className="mt-1 space-y-1">
                            {g.skills.map((skill) => (
                              <li key={skill.id} className="flex items-center justify-between gap-3">
                                <span className="truncate">{skill.skill_type === 'teach' ? 'Teaches' : 'Learns'}: {skill.name}</span>
                                <span className="text-xs text-skillswap-500 flex-shrink-0">{skill.proficiency_level}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button className="btn-outline-rounded" onClick={() => router.push(`/profile/${g.owner.id}`)}>View Profile</button>
                          <button
                            className="btn-outline-rounded"
                            onClick={() => {
                              const postId = g.skills?.[0]?.id;
                              const shareKey = `${g.owner.id}|${g.ts || ''}|${postId || ''}`;
                              const label = g.owner.profile?.full_name || 'this member';
                              void sharePost(postId, label, shareKey);
                            }}
                          >
                            {(() => {
                              const postId = g.skills?.[0]?.id;
                              const shareKey = `${g.owner.id}|${g.ts || ''}|${postId || ''}`;
                              return copiedShareKey === shareKey ? 'Link copied' : 'Share';
                            })()}
                          </button>
                          {g.skills.map((skill) => {
                            const pending = skill.id ? (requestsBySkillId[skill.id] || []).some((r) => r.requester_id === user?.id && r.recipient_id === g.owner.id && r.status === 'pending') : false;
                            const isSending = Boolean(sending[skill.id || g.owner.id]);
                            return (
                              <button
                                key={skill.id}
                                className="btn-primary-rounded"
                                disabled={!skill?.id || pending || isSending}
                                onClick={() => skill?.id && openAvailabilityModal(g.owner.id, skill)}
                              >
                                {pending ? 'Request Sent' : isSending ? 'Sending...' : `Request: ${skill.name}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              });
            })()
          )}
        </section>

        {/* Right column - stats & recommendations (desktop only) */}
        <aside className="hidden lg:block">
          <div className="feed-card">
            {/* Stats row */}
            <div className="flex gap-6">
              <div>
                <div className="text-2xl font-bold text-skillswap-700">{sidebarCounts.swapRequests}</div>
                <div className="text-sm text-skillswap-600">Swap Request</div>
              </div>
            </div>

            {/* Recommended swaps */}
            <div className="mt-5 border-t border-skillswap-200 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-skillswap-600">
                  {matchedDetails.length} Swap profile recommended for you
                </p>
                {matchedDetails.length > 0 && (
                  <button
                    onClick={() => setShowMatchedSwapsCenter(true)}
                    className="text-xs font-medium text-skillswap-600 border border-skillswap-300 rounded-full px-3 py-1 hover:bg-skillswap-50 transition-colors"
                  >
                    View all
                  </button>
                )}
              </div>

              <ul className="mt-4 space-y-4">
                {matchedDetails.slice(0, 4).map((m) => (
                  <li key={`${m.teacher_id}-${m.teach_skill_id}`} className="flex items-center gap-3">
                    <UserAvatar userId={m.teacher_id} explicitName={m.teacher?.full_name} explicitAvatar={m.teacherSettings?.avatar_url as string | null} size="h-10 w-10 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-skillswap-800 truncate">
                        {m.teacherSettings?.current_title || m.teachSkill?.name || m.skill || 'Skill Swap'}
                      </div>
                      <div className="text-xs text-skillswap-500 truncate">
                        {m.teacherSettings?.current_company || m.teacher?.full_name || ''}
                        {m.teachSkill?.proficiency_level ? ` · ${m.teachSkill.proficiency_level}` : ''}
                      </div>
                    </div>
                    <time
                      className="text-xs text-skillswap-400 flex-shrink-0"
                      dateTime={m.created_at || undefined}
                    >
                      {m.created_at ? (() => { const diff = Date.now() - new Date(m.created_at).getTime(); const mins = Math.floor(diff / 60000); if (mins < 60) return `${mins}min`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h`; return `${Math.floor(hrs / 24)}d`; })() : ''}
                    </time>
                  </li>
                ))}
              </ul>

              {matchedDetails.length === 0 && (
                <p className="mt-3 text-sm text-skillswap-500">No recommendations yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
      {/* Availability modal */}
      {availModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Request swap — {availModal.skill?.name ?? 'Skill'}</h3>
              <button onClick={() => setAvailModal(null)} className="text-sm text-skillswap-600">Close</button>
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
              <button onClick={() => setAvailModal(null)} className="btn-ghost">Cancel</button>
              <button onClick={submitAvailabilityRequest} className="btn-primary">Send request</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
