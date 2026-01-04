/*
 * Legacy dashboard implementation (CRUD-heavy).
 * Kept temporarily; replaced below with Figma-style dashboard home.
 *
 * This entire block is intentionally commented out.
 * The active dashboard implementation starts after the closing marker.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  UserProfile,
  Skill,
  SkillSwapSession,
} from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen,
  Compass,
  Clock,
  TrendingUp,
  LogOut,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';

type SkillDraft = {
  name: string;
  category: string;
  description: string;
  proficiency_level: Skill['proficiency_level'];
};

const defaultDraft: SkillDraft = {
  name: '',
  category: '',
  description: '',
  proficiency_level: 'beginner',
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sessions, setSessions] = useState<SkillSwapSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [teachDraft, setTeachDraft] = useState<SkillDraft>(defaultDraft);
  const [learnDraft, setLearnDraft] = useState<SkillDraft>(defaultDraft);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SkillDraft>(defaultDraft);

  const teachSkills = useMemo(
    () => skills.filter((s) => s.skill_type === 'teach'),
    [skills]
  );
  const learnSkills = useMemo(
    () => skills.filter((s) => s.skill_type === 'learn'),
    [skills]
  );

  const upcomingSessions = useMemo(
    () => sessions.filter((s) => s.status === 'scheduled'),
    [sessions]
  );
  const ongoingSessions = useMemo(
    () => sessions.filter((s) => s.status === 'ongoing'),
    [sessions]
  );

  const dashboardMode = useMemo(() => {
    if (skills.length === 0) return 'new';
    if (sessions.length === 0) return 'inactive';
    if (teachSkills.length > learnSkills.length) return 'teaching';
    if (learnSkills.length > teachSkills.length) return 'learning';
    return 'balanced';
  }, [skills.length, sessions.length, teachSkills.length, learnSkills.length]);

  const modeCopy = useMemo(() => {
    switch (dashboardMode) {
      case 'new':
        return {
          headline: 'Start by adding your skills',
          sub:
            'Tell SkillSwap what you can teach and what you want to learn — this personalizes matches and sessions.',
        };
      case 'teaching':
        return {
          headline: 'You’re teaching-focused right now',
          sub:
            'Add what you want to learn too — balanced profiles get better swaps.',
        };
      case 'learning':
        return {
          headline: 'You’re learning-focused right now',
          sub:
            'Add a few teaching skills to unlock more swap opportunities.',
        };
      case 'inactive':
        return {
          headline: 'Ready for your next swap?',
          sub:
            'Update your skills and explore matches to start a new session.',
        };
      default:
        return {
          headline: 'Teach what you know. Learn what you love.',
          sub:
            'SkillSwap helps people grow by teaching what they know and learning what they love — all in one shared community.',
        };
    }
  }, [dashboardMode]);

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

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile) {
          await supabase.from('user_profiles').insert({
            id: user.id,
            full_name: user.user_metadata?.full_name || '',
            swap_points: 0,
            skills_count: 0,
          });

          const { data: newProfile, error: newProfileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (newProfileError) throw newProfileError;
          setUserProfile(newProfile);
        } else {
          setUserProfile(profile);
        }

        const { data: skillsData, error: skillsError } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (skillsError) throw skillsError;
        setSkills((skillsData || []) as Skill[]);

        const { data: sessionsData, error: sessionsError } = await supabase
          .from('skill_swap_sessions')
          .select('*')
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .in('status', ['scheduled', 'ongoing'])
          .order('scheduled_at', { ascending: true });

        if (sessionsError) throw sessionsError;
        setSessions((sessionsData || []) as SkillSwapSession[]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load dashboard data';
        setError(message);
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [user, authLoading, router]);

  const refreshSkills = async () => {
    if (!user) return;
    const { data, error: refreshError } = await supabase
      .from('skills')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (refreshError) throw refreshError;
    setSkills((data || []) as Skill[]);
  };

  const updateSkillsCount = async (count: number) => {
    if (!user) return;
    await supabase
      .from('user_profiles')
      .update({ skills_count: count })
      .eq('id', user.id);
  };

  const addSkill = async (skill_type: Skill['skill_type'], draft: SkillDraft) => {
    if (!user) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Skill name is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const { error: insertError } = await supabase.from('skills').insert({
        user_id: user.id,
        name,
        description: draft.description.trim() || null,
        category: draft.category.trim() || null,
        skill_type,
        proficiency_level: draft.proficiency_level,
      });

      if (insertError) throw insertError;

      await refreshSkills();
      await updateSkillsCount(skills.length + 1);

      if (skill_type === 'teach') setTeachDraft(defaultDraft);
      if (skill_type === 'learn') setLearnDraft(defaultDraft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add skill';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (skill: Skill) => {
    setEditingId(skill.id);
    setEditDraft({
      name: skill.name || '',
      category: skill.category || '',
      description: skill.description || '',
      proficiency_level: skill.proficiency_level,
    });
  };

  const saveEdit = async () => {
    if (!user || !editingId) return;
    const name = editDraft.name.trim();
    if (!name) {
      setError('Skill name is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const { error: updateError } = await supabase
        .from('skills')
        .update({
          name,
          category: editDraft.category.trim() || null,
          description: editDraft.description.trim() || null,
          proficiency_level: editDraft.proficiency_level,
        })
        .eq('id', editingId)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      await refreshSkills();
      setEditingId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update skill';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (skillId: string) => {
    if (!user) return;
    if (!confirm('Delete this skill?')) return;

    try {
      setSaving(true);
      setError('');

      const { error: deleteError } = await supabase
        .from('skills')
        .delete()
        .eq('id', skillId)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      await refreshSkills();
      await updateSkillsCount(Math.max(0, skills.length - 1));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete skill';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 to-skillswap-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" />
          <p className="text-skillswap-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 to-skillswap-50 px-4">
        <Card className="p-8 max-w-md border-red-200">
          <p className="text-red-700 mb-4">{error}</p>
          <Button
            onClick={() => router.refresh()}
            className="bg-skillswap-500 text-white hover:bg-skillswap-600 w-full"
          >
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
          <div className="flex items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-skillswap-dark">
                Welcome back, {userProfile?.full_name || 'learner'}!
              </h1>
              <p className="text-skillswap-600 mt-2">{modeCopy.sub}</p>
            </div>

            <Button
              onClick={handleLogout}
              className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 gap-2"
              aria-label="Sign out from SkillSwap"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>

          <div className="mt-6">
            <p className="text-skillswap-dark font-semibold">{modeCopy.headline}</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          <Card className="p-6 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-skillswap-dark">1) Add / Update Skills</h2>
              <div className="p-2 bg-skillswap-100 rounded-full">
                <BookOpen className="w-5 h-5 text-skillswap-600" />
              </div>
            </div>
            <p className="text-skillswap-600 mb-4">
              “What can you teach?” and “What do you want to learn?” — this powers matches.
            </p>
            <Button
              onClick={() => scrollTo('skills')}
              className="w-full bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              Update skills
            </Button>
          </Card>

          <Card className="p-6 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-skillswap-dark">2) Find Matches</h2>
              <div className="p-2 bg-skillswap-100 rounded-full">
                <Compass className="w-5 h-5 text-skillswap-600" />
              </div>
            </div>
            <p className="text-skillswap-600 mb-4">
              Browse skills and people that align with your teach/learn goals.
            </p>
            <Button
              onClick={() => router.push('/explore')}
              className="w-full bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              Explore skills
            </Button>
          </Card>

          <Card className="p-6 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-skillswap-dark">3) Start / Continue</h2>
              <div className="p-2 bg-skillswap-100 rounded-full">
                <Clock className="w-5 h-5 text-skillswap-600" />
              </div>
            </div>
            <p className="text-skillswap-600 mb-4">
              Join ongoing sessions or review what’s scheduled next.
            </p>
            <Button
              onClick={() => scrollTo('sessions')}
              className="w-full bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              View sessions
            </Button>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <Card className="p-6 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-skillswap-dark">Swap Points</h2>
              <div className="p-2 bg-skillswap-100 rounded-full">
                <TrendingUp className="w-5 h-5 text-skillswap-600" />
              </div>
            </div>
            <div className="text-4xl font-bold text-skillswap-500 mb-2">
              {userProfile?.swap_points || 0}
            </div>
            <p className="text-skillswap-600">
              Earn points from exchanges and use them to access more sessions.
            </p>
          </Card>

          <Card className="p-6 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-skillswap-dark">Your Skills</h2>
              <div className="p-2 bg-skillswap-100 rounded-full">
                <BookOpen className="w-5 h-5 text-skillswap-600" />
              </div>
            </div>
            <div className="text-4xl font-bold text-skillswap-500 mb-2">{skills.length}</div>
            <p className="text-skillswap-600">
              {teachSkills.length} teaching • {learnSkills.length} learning
            </p>
          </Card>
        </div>

        <div id="skills" className="scroll-mt-24">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-skillswap-dark">Skills Setup</h2>
            <p className="text-skillswap-600">
              Add what you can teach and what you want to learn — no strict roles.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card className="p-6 bg-white border-2 border-skillswap-200">
              <h3 className="text-xl font-bold text-skillswap-dark mb-1">What can you teach?</h3>
              <p className="text-sm text-skillswap-600 mb-4">
                Share skills you’re confident helping others with.
              </p>

              <div className="space-y-4">
                <div>
                  <Label className="text-skillswap-dark">Skill name</Label>
                  <Input
                    value={teachDraft.name}
                    onChange={(e) => setTeachDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g., React, Public Speaking, Excel"
                    disabled={saving}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-skillswap-dark">Level</Label>
                    <Select
                      value={teachDraft.proficiency_level}
                      onValueChange={(v) =>
                        setTeachDraft((d) => ({
                          ...d,
                          proficiency_level: v as Skill['proficiency_level'],
                        }))
                      }
                      disabled={saving}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-skillswap-dark">Category (optional)</Label>
                    <Input
                      value={teachDraft.category}
                      onChange={(e) =>
                        setTeachDraft((d) => ({ ...d, category: e.target.value }))
                      }
                      placeholder="e.g., Tech, Business, Creative"
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-skillswap-dark">Description (optional)</Label>
                  <Textarea
                    value={teachDraft.description}
                    onChange={(e) =>
                      setTeachDraft((d) => ({ ...d, description: e.target.value }))
                    }
                    placeholder="What can you help with? What format do you prefer?"
                    disabled={saving}
                  />
                </div>

                <Button
                  onClick={() => addSkill('teach', teachDraft)}
                  disabled={saving}
                  className="w-full bg-skillswap-500 text-white hover:bg-skillswap-600 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add teaching skill
                </Button>
              </div>
            </Card>

            <Card className="p-6 bg-white border-2 border-skillswap-200">
              <h3 className="text-xl font-bold text-skillswap-dark mb-1">What do you want to learn?</h3>
              <p className="text-sm text-skillswap-600 mb-4">
                Add skills you want to grow into — this boosts match quality.
              </p>

              <div className="space-y-4">
                <div>
                  <Label className="text-skillswap-dark">Skill name</Label>
                  <Input
                    value={learnDraft.name}
                    onChange={(e) => setLearnDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g., UI Design, Python, Interview Prep"
                    disabled={saving}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-skillswap-dark">Current level</Label>
                    <Select
                      value={learnDraft.proficiency_level}
                      onValueChange={(v) =>
                        setLearnDraft((d) => ({
                          ...d,
                          proficiency_level: v as Skill['proficiency_level'],
                        }))
                      }
                      disabled={saving}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-skillswap-dark">Category (optional)</Label>
                    <Input
                      value={learnDraft.category}
                      onChange={(e) =>
                        setLearnDraft((d) => ({ ...d, category: e.target.value }))
                      }
                      placeholder="e.g., Tech, Business, Creative"
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-skillswap-dark">Notes (optional)</Label>
                  <Textarea
                    value={learnDraft.description}
                    onChange={(e) =>
                      setLearnDraft((d) => ({ ...d, description: e.target.value }))
                    }
                    placeholder="What’s your goal? Any timelines?"
                    disabled={saving}
                  />
                </div>

                <Button
                  onClick={() => addSkill('learn', learnDraft)}
                  disabled={saving}
                  className="w-full bg-skillswap-500 text-white hover:bg-skillswap-600 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add learning skill
                </Button>
              </div>
            </Card>
          </div>

          <Card className="p-6 bg-white border-2 border-skillswap-200 mb-10">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h3 className="text-xl font-bold text-skillswap-dark">Your Skills</h3>
              <Button
                onClick={() => router.push('/explore')}
                variant="outline"
                className="border-skillswap-200 text-skillswap-600 hover:bg-skillswap-50"
              >
                Explore matches
              </Button>
            </div>

            {skills.length === 0 ? (
              <p className="text-skillswap-600">
                You haven’t added any skills yet — start above.
              </p>
            ) : (
              <div className="space-y-3">
                {skills.map((skill) => {
                  const isEditing = editingId === skill.id;

                  return (
                    <div
                      key={skill.id}
                      className="p-4 rounded-lg border border-skillswap-200 bg-skillswap-50"
                    >
                      {!isEditing ? (
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-skillswap-dark">{skill.name}</p>
                              <Badge variant="secondary">
                                {skill.skill_type === 'teach' ? 'Teaching' : 'Learning'}
                              </Badge>
                              <Badge variant="outline">{skill.proficiency_level}</Badge>
                            </div>
                            {(skill.category || skill.description) && (
                              <div className="mt-2 space-y-1">
                                {skill.category && (
                                  <p className="text-sm text-skillswap-600">
                                    Category:{' '}
                                    <span className="text-skillswap-dark">{skill.category}</span>
                                  </p>
                                )}
                                {skill.description && (
                                  <p className="text-sm text-skillswap-600">{skill.description}</p>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={() => startEdit(skill)}
                              variant="outline"
                              className="border-skillswap-200 text-skillswap-600 hover:bg-white gap-2"
                              disabled={saving}
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </Button>
                            <Button
                              onClick={() => deleteSkill(skill.id)}
                              variant="outline"
                              className="border-red-200 text-red-600 hover:bg-red-50 gap-2"
                              disabled={saving}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-skillswap-dark">Skill name</Label>
                              <Input
                                value={editDraft.name}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, name: e.target.value }))
                                }
                                disabled={saving}
                              />
                            </div>
                            <div>
                              <Label className="text-skillswap-dark">Category</Label>
                              <Input
                                value={editDraft.category}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, category: e.target.value }))
                                }
                                disabled={saving}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-skillswap-dark">Level</Label>
                              <Select
                                value={editDraft.proficiency_level}
                                onValueChange={(v) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    proficiency_level: v as Skill['proficiency_level'],
                                  }))
                                }
                                disabled={saving}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select level" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="beginner">Beginner</SelectItem>
                                  <SelectItem value="intermediate">Intermediate</SelectItem>
                                  <SelectItem value="advanced">Advanced</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end gap-2">
                              <Button
                                onClick={saveEdit}
                                disabled={saving}
                                className="bg-skillswap-500 text-white hover:bg-skillswap-600 gap-2 w-full"
                              >
                                <Pencil className="w-4 h-4" />
                                Save
                              </Button>
                              <Button
                                onClick={() => setEditingId(null)}
                                variant="outline"
                                className="border-skillswap-200 text-skillswap-600 hover:bg-white w-full"
                                disabled={saving}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>

                          <div>
                            <Label className="text-skillswap-dark">Description</Label>
                            <Textarea
                              value={editDraft.description}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  description: e.target.value,
                                }))
                              }
                              disabled={saving}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div id="sessions" className="scroll-mt-24">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-skillswap-dark">Sessions</h2>
            <p className="text-skillswap-600">
              Join ongoing sessions, track what’s scheduled, and keep learning momentum.
            </p>
          </div>

          {sessions.length === 0 ? (
            <Card className="p-8 bg-white border-2 border-dashed border-skillswap-200">
              <h3 className="text-xl font-bold text-skillswap-dark mb-2">No active sessions yet</h3>
              <p className="text-skillswap-600 mb-5">
                Explore matches to start your first skill swap session.
              </p>
              <Button
                onClick={() => router.push('/explore')}
                className="bg-skillswap-500 text-white hover:bg-skillswap-600"
              >
                Explore skills
              </Button>
            </Card>
          ) : (
            <Card className="p-8 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-skillswap-dark">Active Sessions</h3>
                <div className="p-3 bg-skillswap-100 rounded-full">
                  <Clock className="w-6 h-6 text-skillswap-600" />
                </div>
              </div>

              {ongoingSessions.length > 0 && (
                <div className="mb-8">
                  <p className="font-semibold text-skillswap-dark mb-3">Ongoing</p>
                  <div className="space-y-3">
                    {ongoingSessions.map((session) => (
                      <div
                        key={session.id}
                        className="p-4 bg-skillswap-50 rounded-lg border border-skillswap-200 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-skillswap-dark">Skill Swap Session</p>
                          <p className="text-sm text-skillswap-600">
                            {session.duration_minutes} minutes
                          </p>
                        </div>
                        <Badge>ongoing</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {upcomingSessions.length > 0 && (
                <div>
                  <p className="font-semibold text-skillswap-dark mb-3">Upcoming</p>
                  <div className="space-y-3">
                    {upcomingSessions.slice(0, 3).map((session) => (
                      <div
                        key={session.id}
                        className="p-4 bg-skillswap-50 rounded-lg border border-skillswap-200 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-skillswap-dark">Scheduled Session</p>
                          <p className="text-sm text-skillswap-600">
                            {session.scheduled_at
                              ? new Date(session.scheduled_at).toLocaleString()
                              : 'TBD'}
                          </p>
                        </div>
                        <Badge variant="outline">scheduled</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

*/

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { BookOpen, Compass, CalendarDays, MessageSquare, Users } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Skill,
  SkillSwapSession,
  UserProfile,
} from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

type PublicProfile = Pick<UserProfile, 'full_name' | 'bio'>;

function initials(name?: string | null) {
  const safe = (name || '').trim();
  if (!safe) return 'U';
  const parts = safe.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'U';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (first + last).toUpperCase();
}

export default function DashboardHomePage() {
  const { user, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sessions, setSessions] = useState<SkillSwapSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    if (!isSupabaseConfigured) {
      setError(supabaseConfigError ?? 'Supabase is not configured');
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setError('');

        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('full_name, bio')
          .eq('id', user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        setProfile((profileData || null) as PublicProfile | null);

        const { data: skillsData, error: skillsError } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (skillsError) throw skillsError;
        setSkills((skillsData || []) as Skill[]);

        const { data: sessionsData, error: sessionsError } = await supabase
          .from('skill_swap_sessions')
          .select('*')
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .order('scheduled_at', { ascending: true });
        if (sessionsError) throw sessionsError;
        setSessions((sessionsData || []) as SkillSwapSession[]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load dashboard';
        setError(msg);
        console.error('Dashboard home error:', err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user]);

  const counts = useMemo(() => {
    const teach = skills.filter((s) => s.skill_type === 'teach').length;
    const learn = skills.filter((s) => s.skill_type === 'learn').length;
    const scheduled = sessions.filter((s) => s.status === 'scheduled').length;
    const ongoing = sessions.filter((s) => s.status === 'ongoing').length;
    return {
      skills: skills.length,
      teach,
      learn,
      sessions: sessions.length,
      scheduled,
      ongoing,
    };
  }, [skills, sessions]);

  const modules = useMemo(
    () => [
      { title: 'Home', subtitle: 'Your overview', icon: BookOpen, href: '/dashboard' },
      {
        title: 'Connections',
        subtitle: 'Find people',
        icon: Users,
        href: '/dashboard/connections',
      },
      {
        title: 'Calendar',
        subtitle: 'Schedule swaps',
        icon: CalendarDays,
        href: '/dashboard/calendar',
      },
      {
        title: 'Messages',
        subtitle: 'Chat updates',
        icon: MessageSquare,
        href: '/dashboard/messages',
      },
    ],
    []
  );

  const chartData = useMemo(
    () => [
      { month: 'Jan', average: 2.2, swaps: 1.4 },
      { month: 'Feb', average: 2.8, swaps: 2.0 },
      { month: 'Mar', average: 3.2, swaps: 2.5 },
      { month: 'Apr', average: 3.5, swaps: 2.9 },
      { month: 'May', average: 3.6, swaps: 2.2 },
      { month: 'Jun', average: 3.2, swaps: 2.0 },
      { month: 'Jul', average: 3.0, swaps: 2.4 },
      { month: 'Aug', average: 3.4, swaps: 3.0 },
      { month: 'Sep', average: 3.8, swaps: 3.4 },
      { month: 'Oct', average: 4.0, swaps: 3.1 },
      { month: 'Nov', average: 4.2, swaps: 3.6 },
      { month: 'Dec', average: 4.5, swaps: 4.0 },
    ],
    []
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" />
          <p className="text-skillswap-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200">
        <p className="text-red-700 mb-4">{error}</p>
        <Button className="bg-skillswap-500 text-white hover:bg-skillswap-600" asChild>
          <Link href="/dashboard">Retry</Link>
        </Button>
      </Card>
    );
  }

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'SkillSwap member';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <section className="xl:col-span-2 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-skillswap-dark">Knowledge base</h2>
          <Button
            variant="outline"
            className="border-skillswap-200 text-skillswap-600 hover:bg-skillswap-50"
            asChild
          >
            <Link href="/explore">
              <Compass className="h-4 w-4 mr-2" />
              Explore
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.title} href={m.href} className="block">
                <Card className="p-4 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-skillswap-100 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-skillswap-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-skillswap-dark truncate">{m.title}</p>
                      <p className="text-xs text-skillswap-600 truncate">{m.subtitle}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        <Card className="p-5 bg-white border-2 border-skillswap-200">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="font-semibold text-skillswap-dark">Statistic</p>
              <p className="text-sm text-skillswap-600">Progress score</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-skillswap-600">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-1))]" /> Average
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-3))]" /> Swaps
              </span>
            </div>
          </div>

          <ChartContainer
            className="h-[260px]"
            config={{
              average: { label: 'Average', color: 'hsl(var(--chart-1))' },
              swaps: { label: 'Swaps', color: 'hsl(var(--chart-3))' },
            }}
          >
            <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: -6 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis hide />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="average"
                stroke="var(--color-average)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="swaps"
                stroke="var(--color-swaps)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </Card>
      </section>

      <aside className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-skillswap-dark">User profile</h2>
          <Link
            href="/dashboard/public-view"
            className="text-sm text-skillswap-500 hover:text-skillswap-600"
          >
            View
          </Link>
        </div>

        <Card className="p-4 bg-white border-2 border-skillswap-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src={(user?.user_metadata?.avatar_url as string | undefined) || ''}
                  alt={displayName}
                />
                <AvatarFallback>{initials(displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold text-skillswap-dark truncate">{displayName}</p>
                <p className="text-xs text-skillswap-600 truncate">{user?.email}</p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-sm text-skillswap-600">
                <span className="font-semibold text-skillswap-dark">Skills:</span> {counts.skills}
              </div>
              <div className="text-sm text-skillswap-600">
                <span className="font-semibold text-skillswap-dark">Sessions:</span> {counts.sessions}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
          <Card className="p-4 bg-white border-2 border-skillswap-200">
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-xl bg-skillswap-100 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-skillswap-500" />
              </div>
              <Badge variant="outline">{counts.teach} teach</Badge>
            </div>
            <p className="mt-3 font-semibold text-skillswap-dark">Teaching</p>
            <p className="text-xs text-skillswap-600">Skills you can share</p>
          </Card>

          <Card className="p-4 bg-white border-2 border-skillswap-200">
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-xl bg-skillswap-100 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-skillswap-500" />
              </div>
              <Badge variant="outline">{counts.learn} learn</Badge>
            </div>
            <p className="mt-3 font-semibold text-skillswap-dark">Learning</p>
            <p className="text-xs text-skillswap-600">Skills you want to grow</p>
          </Card>

          <Card className="p-4 bg-white border-2 border-skillswap-200">
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-xl bg-skillswap-100 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-skillswap-500" />
              </div>
              <Badge variant="outline">{counts.scheduled}</Badge>
            </div>
            <p className="mt-3 font-semibold text-skillswap-dark">Scheduled</p>
            <p className="text-xs text-skillswap-600">Upcoming swaps</p>
          </Card>

          <Card className="p-4 bg-white border-2 border-skillswap-200">
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-xl bg-skillswap-100 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-skillswap-500" />
              </div>
              <Badge variant="outline">{counts.ongoing}</Badge>
            </div>
            <p className="mt-3 font-semibold text-skillswap-dark">Ongoing</p>
            <p className="text-xs text-skillswap-600">Active sessions</p>
          </Card>
        </div>
      </aside>
    </div>
  );
}
