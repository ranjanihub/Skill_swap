'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Skill,
  UserProfile,
} from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ArrowLeft } from 'lucide-react';

type PublicProfile = Pick<UserProfile, 'id' | 'full_name' | 'bio'>;

export default function ExplorePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skillQuery = (searchParams?.get('skill') || '').trim();
  const { user, loading: authLoading } = useAuth();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, PublicProfile>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      try {
        setLoading(true);
        setError('');

        // If a skill query is provided, filter server-side for better performance
        const query = supabase.from('skills').select('*').neq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
        const { data: skillsData, error: skillsError } = skillQuery
          ? await query.ilike('name', `%${skillQuery}%`)
          : await query;

        if (skillsError) throw skillsError;

        const safeSkills = (skillsData || []) as Skill[];
        setSkills(safeSkills);

        const userIds = Array.from(new Set(safeSkills.map((s) => s.user_id))).slice(
          0,
          200
        );

        if (userIds.length === 0) {
          setProfilesById({});
          return;
        }

        const { data: profilesData, error: profilesError } = await supabase
          .from('user_profiles')
          .select('id, full_name, bio')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        const map: Record<string, PublicProfile> = {};
        (profilesData || []).forEach((p) => {
          map[p.id] = p as PublicProfile;
        });
        setProfilesById(map);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load explore data';
        setError(msg);
        console.error('Explore error:', err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user, router, skillQuery]);

  const hasResults = skills.length > 0;

  const headerCopy = useMemo(() => {
    return {
      title: skillQuery ? `Explore: ${skillQuery}` : 'Explore Skills & People',
      subtitle: skillQuery
        ? `Showing results matching "${skillQuery}".`
        : 'Browse what others want to teach and learn — then update your skills to get better matches.',
    };
  }, [skillQuery]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 to-skillswap-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" />
          <p className="text-skillswap-600">Loading explore...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-skillswap-100 to-skillswap-50 px-4">
        <Card className="p-8 max-w-md border-destructive/20 bg-destructive/10">
          <p className="text-destructive mb-4">{error}</p>
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
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-skillswap-600" />
                <h1 className="text-3xl sm:text-4xl font-bold text-skillswap-dark">
                  {headerCopy.title}
                </h1>
              </div>
              <p className="text-skillswap-600 mt-2">{headerCopy.subtitle}</p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => router.push('/dashboard#skills')}
                className="bg-skillswap-500 text-white hover:bg-skillswap-600"
              >
                Update my skills
              </Button>
              <Button
                onClick={() => router.push('/dashboard')}
                variant="outline"
                className="border-skillswap-200 text-skillswap-600 hover:bg-skillswap-50 gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {!hasResults ? (
          <Card className="p-10 bg-white border-2 border-dashed border-skillswap-200 text-center">
            <h2 className="text-xl font-bold text-skillswap-dark mb-2">
              No skills found yet
            </h2>
            <p className="text-skillswap-600 mb-6">
              Be the first to add what you can teach and what you want to learn.
            </p>
            <Button
              onClick={() => router.push('/dashboard#skills')}
              className="bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              Add my skills
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {skills.map((skill) => {
              const owner = profilesById[skill.user_id];
              return (
                <Card
                  key={skill.id}
                  className="p-6 bg-white border-2 border-skillswap-200 hover:border-skillswap-400 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-skillswap-dark">
                        {skill.name}
                      </h3>
                      <p className="text-sm text-skillswap-600 mt-1">
                        by {owner?.full_name || 'SkillSwap member'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary">
                        {skill.skill_type === 'teach' ? 'Teaching' : 'Learning'}
                      </Badge>
                      <Badge variant="outline">{skill.proficiency_level}</Badge>
                    </div>
                  </div>

                  {(skill.category || skill.description) && (
                    <div className="mt-4 space-y-2">
                      {skill.category && (
                        <p className="text-sm text-skillswap-600">
                          Category:{' '}
                          <span className="text-skillswap-dark">{skill.category}</span>
                        </p>
                      )}
                      {skill.description && (
                        <p className="text-sm text-skillswap-600">{skill.description}</p>
                      )}
                      {owner?.bio && (
                        <p className="text-sm text-skillswap-600">
                          <span className="text-skillswap-dark">About:</span> {owner.bio}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex gap-2">
                    <Button
                      onClick={() => router.push('/dashboard#sessions')}
                      className="bg-skillswap-500 text-white hover:bg-skillswap-600 w-full"
                    >
                      Start a session
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
