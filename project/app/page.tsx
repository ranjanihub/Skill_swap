"use client";

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

// simplified home feed layout to match mobile screenshot
import { Home as HomeIcon, Users, Calendar, Bell, Briefcase, MessageSquare, Search, Compass, UserCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AppShell, { type ShellNavItem } from '@/components/app-shell';
import AvailabilityPicker from '@/components/calendar/AvailabilityPicker';
// Matched swaps render inline in the sidebar; no popover needed
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import PostDetail from '@/components/post/PostDetail';
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

type PublicProfile = Pick<UserProfile, 'id' | 'full_name' | 'bio' | 'skills_count' | 'swap_points'>;

type FeedOwner = {
  id: string;
  profile?: PublicProfile | null;
  settings?: Pick<UserSettings, 'avatar_url' | 'headline' | 'current_title' | 'current_company'> | null;
  skills: Skill[];
};

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
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostFallback, setSelectedPostFallback] = useState<any | null>(null);

  useEffect(() => {
    const fetchMatchedSwaps = async () => {
      try {
        const response = await fetch('/api/matched-swaps');
        const data = await response.json();
        setMatchedSwaps(data);
      } catch (error) {
        console.error('Failed to fetch matched swaps:', error);
      }
    };

    fetchMatchedSwaps();
  }, []);

  const matchedCounts = useMemo(() => {
    const map: Record<string, number> = {};
    (matchedSwaps || []).forEach((m: any) => {
      if (!m || !m.skill) return;
      map[m.skill] = (map[m.skill] || 0) + 1;
    });
    return map;
  }, [matchedSwaps]);

  useEffect(() => {
    const loadDetails = async () => {
      if (!matchedSwaps || matchedSwaps.length === 0) {
        setMatchedDetails([]);
        return;
      }
      // Validate UUIDs to avoid passing dev/sample ids to Supabase which expects UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const allTeacherIds = Array.from(new Set(
        matchedSwaps
          .filter((m: any) => !m.teacher || !m.teacher.full_name)
          .map((m: any) => m.teacher_id)
      )).filter(Boolean);
      const allTeachSkillIds = Array.from(new Set(matchedSwaps.map((m: any) => m.teach_skill_id))).filter(Boolean);

      const teacherIds = allTeacherIds.filter((id) => uuidRegex.test(id)).slice(0, 200);
      const teachSkillIds = allTeachSkillIds.filter((id) => uuidRegex.test(id)).slice(0, 200);

      // If there are no valid UUIDs to query, construct details locally from matchedSwaps
      if (teacherIds.length === 0 && teachSkillIds.length === 0) {
        const details = (matchedSwaps || []).map((m: any) => ({
          ...m,
          teacher: m.teacher_id ? { full_name: m.teacher_id, bio: '' } : null,
          teachSkill: null,
        }));
        setMatchedDetails(details);
        return;
      }

      try {
        const results = await Promise.all([
          supabase.from('user_profiles').select('id, full_name').in('id', teacherIds),
          supabase.from('skills').select('id, name, proficiency_level, user_id').in('id', teachSkillIds),
        ]);

        const profilesData = results[0].data || [];
        const teachSkillsData = results[1].data || [];

        const profilesMap: Record<string, any> = {};
        (profilesData || []).forEach((p: any) => (profilesMap[p.id] = p));

        const skillsMap: Record<string, any> = {};
        (teachSkillsData || []).forEach((s: any) => (skillsMap[s.id] = s));

        const details = (matchedSwaps || []).map((m: any) => ({
          ...m,
          teacher: m.teacher || profilesMap[m.teacher_id] || null,
          teachSkill: skillsMap[m.teach_skill_id] || null,
        }));

        setMatchedDetails(details);
      } catch (err) {
        console.error('Failed to load matched details', err);
        // Fallback: don't crash, show basic matched items
        const details = (matchedSwaps || []).map((m: any) => ({
          ...m,
          teacher: m.teacher_id ? { full_name: m.teacher_id, bio: '' } : null,
          teachSkill: null,
        }));
        setMatchedDetails(details);
      }
    };

    loadDetails();
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

  const sendSwapRequest = async (ownerId: string, skillId?: string, avail?: string[]) => {
    if (!user) return;
    const key = skillId || ownerId;

    // prevent duplicates
    const existing = (requestsBySkillId[skillId || ''] || []).some((r) =>
      r.requester_id === user.id && r.recipient_id === ownerId && r.status === 'pending'
    );
    if (skillId && existing) return;

    try {
      setSending((prev) => ({ ...prev, [key]: true }));
      const { data, error: insertError } = await supabase
        .from('connection_requests')
        .insert({ requester_id: user.id, recipient_id: ownerId, skill_id: skillId || null, status: 'pending' })
        .select('*')
        .maybeSingle();
      if (insertError) throw insertError;
      if (data?.skill_id) {
        setRequestsBySkillId((prev) => ({
          ...prev,
          [data.skill_id as string]: [...(prev[data.skill_id as string] || []), data as any],
        }));
      }
      // create a notification including availabilities if provided
      try {
        const requesterName = (user.user_metadata?.full_name as string) || (user.email || '').split('@')[0] || 'Someone';
        await supabase.from('notifications').insert({
          user_id: ownerId,
          type: 'connection_request',
          payload: {
            requester_id: user.id,
            requester_name: requesterName,
            skill_id: skillId || null,
            skill_name: skillId ? (feed.find((f) => f.id === ownerId)?.skills.find((s) => s.id === skillId)?.name ?? null) : null,
            availabilities: avail || [],
          },
        });
      } catch (e) {
        console.warn('notifications insert warning', e);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      setError(msg);
    } finally {
      setSending((prev) => ({ ...prev, [key]: false }));
    }
  };

  const openAvailabilityModal = (ownerId: string, skill?: Skill) => {
    setAvailModal({ ownerId, skill });
    setAvailabilities([]);
    setNewAvailability('');
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
    await sendSwapRequest(availModal.ownerId, availModal.skill?.id, availabilities);
    setAvailModal(null);
  };

  return (
    <>
    <AppShell
      showSidebar={false}
      nav={publicNav}
      bottomNav={[
        { href: '/', label: 'Home', icon: HomeIcon },
        { href: '/network', label: 'My Network', icon: Users },
        { href: '/calendar', label: 'Calender', icon: Calendar },
        { href: '/notifications', label: 'Notification', icon: Bell },
        { href: '/dashboard/settings', label: 'Profile', icon: UserCircle },
      ]}
      headerLeft={
        <div className="w-full flex items-center justify-center">
          <div className="w-full max-w-2xl flex items-center justify-between gap-4 px-4">
            <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
              <Image src="/SkillSwap_Logo.jpg" alt="SkillSwap" width={36} height={36} className="object-cover" />
            </div>
            <div className="flex-1 mx-4">
              <div className="relative">
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
            <div className="flex-shrink-0 flex items-center gap-3">
              <button
                aria-label="Messages"
                title="Messages"
                onClick={() => router.push('/messages')}
                className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm"
              >
                <MessageSquare className="h-5 w-5 text-skillswap-600" />
              </button>
              {!user && (
                <button
                  onClick={() => router.push('/login')}
                  className="ml-2 px-3 py-2 rounded-md bg-skillswap-500 text-white hover:bg-skillswap-600 text-sm"
                >
                  Login
                </button>
              )}
            </div>
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
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={meSettings?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined) || ''} alt={meProfile?.full_name || 'Member'} />
                    <AvatarFallback>{(meProfile?.full_name || user?.user_metadata?.full_name || 'S').slice(0, 1)}</AvatarFallback>
                  </Avatar>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-skillswap-800">{meProfile?.full_name || (user?.user_metadata?.full_name as string) || 'SkillSwap member'}</h2>
                  <p className="text-sm text-skillswap-600">
                    {meSettings?.headline || meSettings?.current_title || (user?.user_metadata?.role as string) || 'Complete your profile to get better matches'}
                  </p>
                </div>
              </div>
            
            <div className="mt-4">
              <div className="flex justify-between text-sm text-skillswap-600">
                  <div>Number of swaps</div>
                  <div className="font-semibold text-skillswap-800">{meProfile?.skills_count ?? 0}</div>
                </div>
                <div className="flex justify-between mt-2 text-sm text-skillswap-600">
                  <div>Swaps posted</div>
                  <div className="font-semibold text-skillswap-800">{meProfile?.swap_points ?? 0}</div>
                </div>
            </div>
            <div className="mt-4 border-t border-skillswap-200 pt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-skillswap-300 rounded-sm" />
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Matched Swaps</span>
                    {matchedDetails.length > 0 && (
                      <span className="text-xs bg-skillswap-100 text-skillswap-700 rounded-full px-2 py-0.5">{matchedDetails.length}</span>
                    )}
                  </div>
                </div>
              </div>

              {matchedDetails.length === 0 ? (
                <div className="ml-1 text-xs text-skillswap-500">No matches yet</div>
              ) : (
                <div className="mt-2 space-y-3">
                  {matchedDetails.slice(0, 6).map((m) => (
                    <div key={`${m.teacher_id}-${m.teach_skill_id}`} className="bg-white border border-skillswap-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-full overflow-hidden">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback>{((m.teacher?.full_name || m.teacher_id || 'M').slice(0, 1))}</AvatarFallback>
                            </Avatar>
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-skillswap-800">{m.teacher?.full_name || m.teacher_id || 'SkillSwap member'}</div>
                            <p className="text-xs text-skillswap-600 mt-1">{m.teacher?.bio || m.teacher_id || 'SkillSwap member'}</p>
                          </div>
                        </div>
                        <div className="text-xs text-skillswap-500">{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</div>
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
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={(g.owner.settings?.avatar_url as string | undefined) || ''} alt={g.owner.profile?.full_name || g.owner.id} />
                          <AvatarFallback>{(g.owner.profile?.full_name || g.owner.id).slice(0, 1)}</AvatarFallback>
                        </Avatar>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-skillswap-800">{g.owner.profile?.full_name || g.owner.id || 'SkillSwap member'}</h3>
                          <div className="text-xs text-skillswap-500">
                            {g.ts ? new Date(g.ts).toLocaleString() : ''}
                          </div>
                        </div>
                        <p className="text-sm text-skillswap-600">{g.owner.settings?.headline || g.owner.profile?.bio || g.owner.id || 'SkillSwap member'}</p>

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

        {/* Right column - news (desktop only) */}
        <aside className="hidden lg:block">
          <div className="feed-card">
            <h3 className="text-lg font-semibold text-skillswap-800">Notifications</h3>
            <p className="text-sm text-skillswap-600 mt-2">Recent</p>
            {notifications.length === 0 ? (
              <p className="mt-3 text-sm text-skillswap-500">No notifications yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {notifications.map((n) => (
                  <li key={n.id} className="text-sm">
                    <div className="font-medium text-skillswap-800">{n.type}</div>
                    <div className="text-xs text-skillswap-500 mt-1">
                      {n.read ? 'Read' : 'Unread'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
