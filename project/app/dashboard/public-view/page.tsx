'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Skill,
  UserProfile,
} from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type PublicProfile = Pick<UserProfile, 'full_name' | 'bio'>;

export default function PublicViewPage() {
  const { user, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load public view';
        setError(msg);
        console.error('Public view error:', err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user]);

  const teach = useMemo(() => skills.filter((s) => s.skill_type === 'teach'), [skills]);
  const learn = useMemo(() => skills.filter((s) => s.skill_type === 'learn'), [skills]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" />
          <p className="text-skillswap-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200">
        <p className="text-red-700">{error}</p>
      </Card>
    );
  }

  const name = profile?.full_name || (user?.user_metadata?.full_name as string | undefined) || 'SkillSwap member';

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-skillswap-dark">Public profile view</h1>
        <p className="text-skillswap-600">How your profile would appear to others.</p>
      </div>

      <Card className="p-6 bg-white border-2 border-skillswap-200">
        <h2 className="text-xl font-semibold text-skillswap-dark">{name}</h2>
        <p className="text-sm text-skillswap-600 mt-1">{user?.email}</p>
        {profile?.bio && <p className="text-skillswap-600 mt-4">{profile.bio}</p>}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-white border-2 border-skillswap-200">
          <h3 className="font-semibold text-skillswap-dark mb-4">Teaching</h3>
          {teach.length === 0 ? (
            <p className="text-sm text-skillswap-600">No teaching skills yet.</p>
          ) : (
            <div className="space-y-3">
              {teach.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-skillswap-dark">{s.name}</p>
                    {(s.category || s.description) && (
                      <p className="text-sm text-skillswap-600">{s.category || s.description}</p>
                    )}
                  </div>
                  <Badge variant="outline">{s.proficiency_level}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 bg-white border-2 border-skillswap-200">
          <h3 className="font-semibold text-skillswap-dark mb-4">Learning</h3>
          {learn.length === 0 ? (
            <p className="text-sm text-skillswap-600">No learning goals yet.</p>
          ) : (
            <div className="space-y-3">
              {learn.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-skillswap-dark">{s.name}</p>
                    {(s.category || s.description) && (
                      <p className="text-sm text-skillswap-600">{s.category || s.description}</p>
                    )}
                  </div>
                  <Badge variant="outline">{s.proficiency_level}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
