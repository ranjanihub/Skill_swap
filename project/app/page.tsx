"use client";

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

// simplified home feed layout to match mobile screenshot
import { Home as HomeIcon, Users, Calendar, Bell, Briefcase, MessageSquare, Search, Compass, UserCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AppShell, { type ShellNavItem } from '@/components/app-shell';
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
  const [meSettings, setMeSettings] = useState<Pick<UserSettings, 'avatar_url' | 'headline' | 'current_title' | 'current_company' | 'location'> | null>(null);

  const [feed, setFeed] = useState<FeedOwner[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [requestsBySkillId, setRequestsBySkillId] = useState<Record<string, ConnectionRequest[]>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});

  const [query, setQuery] = useState('');
  const [showPostModal, setShowPostModal] = useState(false);
  const [postText, setPostText] = useState('');
  const [postSkillName, setPostSkillName] = useState('');
  const [postSkillType, setPostSkillType] = useState<'teach' | 'learn'>('teach');
  const [postProficiency, setPostProficiency] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [quizVisible, setQuizVisible] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [posting, setPosting] = useState(false);

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

  const sendSwapRequest = async (ownerId: string, skillId?: string) => {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      setError(msg);
    } finally {
      setSending((prev) => ({ ...prev, [key]: false }));
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
                  {meSettings?.location && <p className="mt-2 text-xs text-skillswap-500">{meSettings.location}</p>}
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
              <div className="flex items-center gap-2"><span className="w-3 h-3 bg-skillswap-300 rounded-sm" />Saved items</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 bg-skillswap-300 rounded-sm" />Groups</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 bg-skillswap-300 rounded-sm" />Newsletters</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 bg-skillswap-300 rounded-sm" />Events</div>
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
                          <h3 className="font-semibold text-skillswap-800">{g.owner.profile?.full_name || 'SkillSwap member'}</h3>
                          <div className="text-xs text-skillswap-500">
                            {g.ts ? new Date(g.ts).toLocaleString() : ''}
                          </div>
                        </div>
                        <p className="text-sm text-skillswap-600">{g.owner.settings?.headline || g.owner.profile?.bio || 'SkillSwap member'}</p>

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
                                onClick={() => skill?.id && sendSwapRequest(g.owner.id, skill.id)}
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
  );
}
