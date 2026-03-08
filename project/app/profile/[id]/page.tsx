"use client";

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Skill,
  UserProfile,
  UserSettings,
} from '@/lib/supabase';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

type PublicProfile = Pick<UserProfile, 'id' | 'full_name' | 'bio' | 'skills_count' | 'swap_points'>;

type PublicSettings = Pick<UserSettings, 'avatar_url' | 'headline' | 'current_title' | 'current_company'>;

export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, session, loading: authLoading, configError } = useAuth();

  const profileId = useMemo(() => (typeof params?.id === 'string' ? params.id : ''), [params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);

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
    if (!profileId) return;

    if (!isSupabaseConfigured) {
      setError(configError || supabaseConfigError || 'Supabase is not configured');
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setError('');

        const [{ data: p, error: pe }, { data: s, error: se }, { data: k, error: ke }] = await Promise.all([
          supabase.from('user_profiles').select('id, full_name, bio, skills_count, swap_points').eq('id', profileId).maybeSingle(),
          supabase.from('user_settings').select('avatar_url, headline, current_title, current_company, location').eq('id', profileId).maybeSingle(),
          supabase.from('skills').select('*').eq('user_id', profileId).order('created_at', { ascending: false }).limit(50),
        ]);

        if (pe) throw pe;
        if (se) throw se;
        if (ke) throw ke;

        setProfile((p || null) as any);
        setSettings((s || null) as any);
        setSkills(((k || []) as Skill[]) ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load profile';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user, profileId, configError]);

  // if the server-side tables don't yet have a name/avatar for the profile
  // we're viewing, reach back to the auth metadata service to grab the
  // Google defaults.  this allows users who sign up but never visit
  // Settings to still see a reasonable picture when others view them.
  useEffect(() => {
    if (!profileId) return;
    const needsName = !profile?.full_name;
    const needsAvatar = !settings?.avatar_url;
    if (!needsName && !needsAvatar) return;

    const fetchMetadata = async () => {
      try {
        const res = await fetch(`/api/user-metadata/${profileId}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        });
        if (!res.ok) return;
        const meta = await res.json();
        if (needsName && meta.full_name) {
          setProfile((p) => (p ? { ...p, full_name: meta.full_name } : p));
        }
        if (needsAvatar && meta.avatar_url) {
          setSettings((s) => (s ? { ...s, avatar_url: meta.avatar_url } : s));
        }
      } catch (e) {
        console.warn('failed to load user metadata', e);
      }
    };

    void fetchMetadata();
  }, [profileId, profile?.full_name, settings?.avatar_url, user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="feed-card max-w-xl w-full border-destructive/30 bg-destructive/10">
          <p className="text-sm text-destructive">{error}</p>
          <button className="btn-outline-rounded mt-4" onClick={() => router.back()}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-skillswap-dark">Profile</h1>
        <p className="text-skillswap-600">View profile details and skills.</p>
      </div>

      <Card className="p-6 bg-white border-2 border-skillswap-200 space-y-5">
        <div className="flex items-center gap-4">
          {/* avatar with fallback to Google picture when you're looking at your own profile */}
          <Avatar className="h-16 w-16 flex-shrink-0">
            <AvatarImage
              src={
                settings?.avatar_url ||
                (user?.id === profileId
                  ? (user?.user_metadata?.avatar_url as string | undefined)
                  : undefined) ||
                ''
              }
              alt={
                profile?.full_name ||
                (user?.id === profileId && (user?.user_metadata?.full_name as string)) ||
                'Member'
              }
            />
            <AvatarFallback>
              {(profile?.full_name || (user?.id === profileId && (user?.user_metadata?.full_name as string)) || 'M').slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold text-skillswap-dark">
              {profile?.full_name ||
                (user?.id === profileId && (user?.user_metadata?.full_name as string)) ||
                'SkillSwap Member'}
            </h2>
            <p className="text-skillswap-600">
              {settings?.headline ||
                (settings?.current_title
                  ? `${settings.current_title}${settings.current_company ? ` at ${settings.current_company}` : ''}`
                  : '')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-skillswap-200">
          <div>
            <Label className="text-skillswap-dark">Skills Count</Label>
            <p className="text-lg font-medium">{profile?.skills_count || 0}</p>
          </div>
          <div>
            <Label className="text-skillswap-dark">Swap Points</Label>
            <p className="text-lg font-medium">{profile?.swap_points || 0}</p>
          </div>
        </div>
      </Card>

      {profile?.bio && (
        <Card className="p-6 bg-white border-2 border-skillswap-200 space-y-3">
          <Label className="text-skillswap-dark">About</Label>
          <p className="text-skillswap-700 leading-relaxed">{profile.bio}</p>
        </Card>
      )}

      <Card className="p-6 bg-white border-2 border-skillswap-200 space-y-4">
        <Label className="text-skillswap-dark">Skills</Label>
        {skills.length === 0 ? (
          <p className="text-skillswap-500">No skills added yet.</p>
        ) : (
          <div className="space-y-3">
            {skills.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-skillswap-50 rounded-lg">
                <div>
                  <span className="font-medium text-skillswap-800">{s.name}</span>
                  <span className="ml-2 text-xs text-skillswap-600 uppercase">{s.skill_type}</span>
                </div>
                <span className="text-sm text-skillswap-700">{s.proficiency_level}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
