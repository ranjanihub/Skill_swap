"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';

export default function PostDetail({ skillId, fallbackSkill, fallbackOwner }: { skillId: string | null; fallbackSkill?: any; fallbackOwner?: any }) {
  const router = useRouter();
  const [skill, setSkill] = useState<any | null>(null);
  const [owner, setOwner] = useState<any | null>(null);
  const [ownerSettings, setOwnerSettings] = useState<any | null>(null);
  const [ownerSkills, setOwnerSkills] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!skillId) return;
    const run = async () => {
      try {
        setLoading(true);
        // quick UUID check — Supabase/Postgres expects UUIDs; if this is a dev/sample id
        // use the provided fallback data instead of querying the DB to avoid "invalid input syntax for type uuid" errors
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(skillId) && fallbackSkill) {
          setSkill(fallbackSkill);
          setOwner(fallbackOwner || fallbackSkill.user_profile || null);
          return;
        }

        const { data: skillData, error: skillError } = await supabase.from('skills').select('*').eq('id', skillId).maybeSingle();
        if (skillError) throw skillError;
        if (!skillData) {
          setError('Post not found');
          setSkill(null);
          return;
        }
        setSkill(skillData);

        const [{ data: profileData, error: profileError }, { data: settingsData, error: settingsError }] = await Promise.all([
          supabase.from('user_profiles').select('id, full_name, bio').eq('id', skillData.user_id).maybeSingle(),
          supabase.from('user_settings').select('avatar_url, headline, current_title, current_company').eq('id', skillData.user_id).maybeSingle(),
        ]);
        if (profileError) throw profileError;
        if (settingsError) console.warn('user_settings load warning', settingsError);
        setOwner(profileData || null);
        setOwnerSettings(settingsData || null);

        // try to load other skills for this owner to show multiple skills in the post
        try {
          const { data: ownerSkillsData } = await supabase.from('skills').select('*').eq('user_id', skillData.user_id).order('created_at', { ascending: false }).limit(10);
          setOwnerSkills(ownerSkillsData || []);
        } catch (e) {
          setOwnerSkills([]);
        }
      } catch (err: any) {
        setError(err?.message ?? String(err));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [skillId]);

  if (!skillId) return null;
  if (loading) return <div className="feed-card">Loading post...</div>;
  if (error) return <div className="feed-card text-destructive">{error}</div>;
  if (!skill) return <div className="feed-card">No post</div>;
  // Render as a feed article matching the center feed layout
  const displayName = owner?.full_name || fallbackOwner?.full_name || 'SkillSwap member';
  const displayBio = owner?.bio || fallbackOwner?.bio || skill.description || 'SkillSwap member';
  const ts = skill.created_at || skill.created_at;

  const skillsToShow = ownerSkills && ownerSkills.length > 0 ? ownerSkills : fallbackSkill ? [fallbackSkill] : [skill];

  const onRequest = (s: any) => {
    // dispatch an event so parent can open the availability modal
    try {
      const ev = new CustomEvent('open-availability', { detail: { ownerId: owner?.id || fallbackSkill?.user_id, skill: { id: s.id, name: s.name, skill_type: s.skill_type || 'teach', proficiency_level: s.proficiency_level || '' } } });
      window.dispatchEvent(ev);
    } catch (e) {
      // fallback: navigate to owner's profile
      router.push(`/profile/${owner?.id || fallbackSkill?.user_id}`);
    }
  };

  return (
    <article className="feed-card">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full overflow-hidden">
          <Avatar className="h-12 w-12">
            <AvatarFallback>{(displayName || 'M').slice(0, 1)}</AvatarFallback>
          </Avatar>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-skillswap-800">{displayName}</h3>
            <div className="text-xs text-skillswap-500">{ts ? new Date(ts).toLocaleString() : ''}</div>
          </div>
          <p className="text-sm text-skillswap-600">{displayBio}</p>

          <div className="mt-3 text-sm text-skillswap-700">
            <p className="font-medium text-skillswap-800">Skills</p>
            <ul className="mt-1 space-y-1">
              {skillsToShow.map((s: any) => (
                <li key={s.id || s.name} className="flex items-center justify-between gap-3">
                  <span className="truncate">{(s.skill_type === 'teach' ? 'Teaches: ' : 'Learns: ') + (s.name || skill.name)}</span>
                  <span className="text-xs text-skillswap-500 flex-shrink-0">{s.proficiency_level || ''}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="btn-outline-rounded" onClick={() => router.push(`/profile/${owner?.id || fallbackSkill?.user_id}`)}>View Profile</button>
            {skillsToShow.map((s: any) => (
              <button key={`req-${s.id || s.name}`} className="btn-primary-rounded" onClick={() => onRequest(s)}>{`Request: ${s.name || skill.name}`}</button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
