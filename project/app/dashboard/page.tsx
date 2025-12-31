'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { supabase, UserProfile, Skill, SkillSwapSession } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Plus,
  Edit2,
  BookOpen,
  Zap,
  Clock,
  TrendingUp,
  LogOut,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sessions, setSessions] = useState<SkillSwapSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
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
        setSkills(skillsData || []);

        const { data: sessionsData, error: sessionsError } = await supabase
          .from('skill_swap_sessions')
          .select('*')
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .in('status', ['scheduled', 'ongoing'])
          .order('scheduled_at', { ascending: true });

        if (sessionsError) throw sessionsError;
        setSessions(sessionsData || []);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load dashboard data';
        setError(message);
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, router]);

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 to-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin"></div>
          <p className="text-skillswap-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 to-white px-4">
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

  const upcomingSessions = sessions.filter((s) => s.status === 'scheduled');
  const ongoingSessions = sessions.filter((s) => s.status === 'ongoing');
  const teachSkills = skills.filter((s) => s.skill_type === 'teach');
  const learnSkills = skills.filter((s) => s.skill_type === 'learn');

  return (
    <div className="min-h-screen bg-gradient-to-br from-skillswap-100 via-white to-skillswap-50">
      <header className="bg-white shadow-sm border-b border-skillswap-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-skillswap-dark">
                Welcome back, {userProfile?.full_name || 'learner'}!
              </h1>
              <p className="text-skillswap-600 mt-2">
                Continue exchanging skills and growing with our community
              </p>
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <Card className="p-8 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-skillswap-dark">
                Swap Points
              </h2>
              <div className="p-3 bg-skillswap-100 rounded-full">
                <TrendingUp className="w-6 h-6 text-skillswap-600" />
              </div>
            </div>
            <div className="text-5xl font-bold text-skillswap-500 mb-3">
              {userProfile?.swap_points || 0}
            </div>
            <p className="text-skillswap-600 mb-4">
              Points earned from skill exchanges. Use them to access premium
              sessions.
            </p>
            <Button
              className="text-skillswap-500 hover:text-skillswap-600 p-0 h-auto"
              variant="ghost"
            >
              View history →
            </Button>
          </Card>

          <Card className="p-8 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-skillswap-dark">
                Skills Count
              </h2>
              <div className="p-3 bg-skillswap-100 rounded-full">
                <BookOpen className="w-6 h-6 text-skillswap-600" />
              </div>
            </div>
            <div className="text-5xl font-bold text-skillswap-500 mb-3">
              {skills.length}
            </div>
            <p className="text-skillswap-600 mb-4">
              {teachSkills.length} teaching • {learnSkills.length} learning
            </p>
            <Button
              onClick={() => router.push('/dashboard/skills')}
              className="text-skillswap-500 hover:text-skillswap-600 p-0 h-auto"
              variant="ghost"
            >
              Manage skills →
            </Button>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          <Card className="lg:col-span-2 p-8 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-skillswap-dark">
                Skills Management
              </h2>
              <div className="p-3 bg-skillswap-100 rounded-full">
                <BookOpen className="w-6 h-6 text-skillswap-600" />
              </div>
            </div>
            <p className="text-skillswap-600 mb-6">
              Add new skills you want to teach or learn, or update your
              existing ones.
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => router.push('/dashboard/skills/new')}
                className="w-full bg-skillswap-500 text-white hover:bg-skillswap-600 gap-2 py-6"
              >
                <Plus className="w-5 h-5" />
                Add New Skill
              </Button>
              {skills.length > 0 && (
                <Button
                  onClick={() => router.push('/dashboard/skills')}
                  variant="outline"
                  className="w-full border-2 border-skillswap-200 text-skillswap-600 hover:bg-skillswap-50 gap-2 py-6"
                >
                  <Edit2 className="w-5 h-5" />
                  Edit Existing Skills
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-8 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-skillswap-dark">
                Recommendations
              </h2>
              <div className="p-3 bg-skillswap-100 rounded-full">
                <Zap className="w-6 h-6 text-skillswap-600" />
              </div>
            </div>
            <p className="text-skillswap-600 mb-6">
              Discover peers with matching skills and interests for great
              exchanges.
            </p>
            <Button
              onClick={() => router.push('/dashboard/explore')}
              className="w-full bg-skillswap-500 text-white hover:bg-skillswap-600 py-6"
            >
              Explore More
            </Button>
          </Card>
        </div>

        {sessions.length > 0 && (
          <Card className="p-8 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-skillswap-dark">
                Active Sessions
              </h2>
              <div className="p-3 bg-skillswap-100 rounded-full">
                <Clock className="w-6 h-6 text-skillswap-600" />
              </div>
            </div>

            {ongoingSessions.length > 0 && (
              <div className="mb-8">
                <h3 className="font-semibold text-skillswap-dark mb-4">
                  Ongoing
                </h3>
                <div className="space-y-3">
                  {ongoingSessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-4 bg-skillswap-50 rounded-lg border border-skillswap-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-skillswap-dark">
                          Skill Exchange Session
                        </p>
                        <p className="text-sm text-skillswap-600">
                          {session.duration_minutes} minutes
                        </p>
                      </div>
                      <Zap className="w-5 h-5 text-skillswap-500" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {upcomingSessions.length > 0 && (
              <div>
                <h3 className="font-semibold text-skillswap-dark mb-4">
                  Upcoming
                </h3>
                <div className="space-y-3">
                  {upcomingSessions.slice(0, 3).map((session) => (
                    <div
                      key={session.id}
                      className="p-4 bg-skillswap-50 rounded-lg border border-skillswap-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-skillswap-dark">
                          Scheduled Session
                        </p>
                        <p className="text-sm text-skillswap-600">
                          {session.scheduled_at
                            ? new Date(session.scheduled_at).toLocaleDateString()
                            : 'TBD'}
                        </p>
                      </div>
                      <Clock className="w-5 h-5 text-skillswap-400" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="w-full mt-6 text-skillswap-500 hover:text-skillswap-600 p-0 h-auto"
              variant="ghost"
            >
              View all sessions →
            </Button>
          </Card>
        )}

        {skills.length === 0 && (
          <Card className="p-12 bg-white border-2 border-dashed border-skillswap-200 text-center">
            <BookOpen className="w-16 h-16 text-skillswap-200 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-skillswap-dark mb-2">
              Get Started
            </h3>
            <p className="text-skillswap-600 mb-6">
              Add your first skill to begin exchanging with the community.
            </p>
            <Button
              onClick={() => router.push('/dashboard/skills/new')}
              className="bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              Add Your First Skill
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}
