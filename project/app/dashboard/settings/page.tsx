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
import { UserSettings } from '@/lib/supabase';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type ProfileDraft = {
  full_name: string;
  bio: string;
};

type TeachDraft = {
  name: string;
  proficiency_level: Skill['proficiency_level'];
};

type LearnDraft = {
  name: string;
  proficiency_level: Skill['proficiency_level'];
  goal: string;
};

type SkillEditDraft = {
  name: string;
  proficiency_level: Skill['proficiency_level'];
  goal: string;
};

const defaultTeachDraft: TeachDraft = { name: '', proficiency_level: 'beginner' };
const defaultLearnDraft: LearnDraft = {
  name: '',
  proficiency_level: 'beginner',
  goal: '',
};

function getSupabaseErrorMessage(err: unknown, fallback: string) {
  if (!err) return fallback;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    const message = (err as any).message as string;
    const details = typeof (err as any).details === 'string' ? (err as any).details : '';
    const hint = typeof (err as any).hint === 'string' ? (err as any).hint : '';
    return [message, details, hint].filter(Boolean).join(' — ');
  }
  return fallback;
}

function isMissingTableSchemaCacheError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("could not find the table") &&
    m.includes('schema cache') &&
    (m.includes('public.user_profiles') || m.includes('public.skills'))
  );
}

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();

  const [draft, setDraft] = useState<ProfileDraft>({ full_name: '', bio: '' });
  const [skills, setSkills] = useState<Skill[]>([]);
  const [teachDraft, setTeachDraft] = useState<TeachDraft>(defaultTeachDraft);
  const [learnDraft, setLearnDraft] = useState<LearnDraft>(defaultLearnDraft);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SkillEditDraft>({
    name: '',
    proficiency_level: 'beginner',
    goal: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const AVATAR_BUCKET = 'avatars';
  const [dbSetupError, setDbSetupError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Partial<UserSettings>>({});

  const arrToCsv = (arr?: string[] | null) => (Array.isArray(arr) ? arr.join(', ') : arr ?? '');
  const csvToArr = (s?: string | null) => {
    if (!s) return null;
    return s
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  };

  const canSave = useMemo(() => true, []);

  const ensureUserProfileRow = async () => {
    if (!user) return;
    const fullNameFromMetadata =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.email?.split('@')[0] ?? '');
    try {
      const { error: upsertError } = await supabase.from('user_profiles').upsert(
        {
          id: user.id,
          full_name: fullNameFromMetadata.trim() || null,
          bio: null,
        },
        { onConflict: 'id' }
      );

      if (upsertError) throw upsertError;
    } catch (err) {
      const msg = getSupabaseErrorMessage(err, 'Failed to ensure profile row');
      // If RLS blocked us (common when the session token isn't applied yet), call server endpoint that uses service-role key
      if (typeof msg === 'string' && msg.toLowerCase().includes('row-level')) {
        try {
          const res = await fetch('/api/ensure-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, full_name: fullNameFromMetadata.trim() || null, bio: null }),
          });
          if (!res.ok) {
            const json = await res.json();
            throw new Error(json?.error || 'Server failed to create profile');
          }
          return;
        } catch (e) {
          throw e;
        }
      }
      throw err;
    }
  };

  const ensureUserSettingsRow = async () => {
    if (!user) return;
    // Create the row with defaults if missing; conflict target is primary key `id`
    const { error: settingsEnsureError } = await supabase
      .from('user_settings')
      .upsert({ id: user.id }, { onConflict: 'id' });
    if (settingsEnsureError) throw settingsEnsureError;
  };

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
        setDbSetupError(null);

        await ensureUserProfileRow();
        // Best-effort ensure settings row exists (ignore if table missing during initial setup)
        try {
          await ensureUserSettingsRow();
        } catch (e) {
          // If the table doesn't exist yet, we'll still render and allow profile editing
          console.warn('Ensure settings row failed (likely missing table/migration):', e);
        }

        const { data, error: profileError } = await supabase
          .from('user_profiles')
          .select('full_name, bio')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        setDraft({
          full_name:
            (data?.full_name as string | null) ||
            ((user.user_metadata?.full_name as string | undefined) ?? '') ||
            '',
          bio: (data?.bio as string | null) || '',
        });

        // fetch user settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('user_settings')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (settingsError) {
          // ignore missing table until migration applied
        } else if (settingsData) {
          setSettings(settingsData as UserSettings);
        }

        const { data: skillsData, error: skillsError } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (skillsError) throw skillsError;
        setSkills((skillsData || []) as Skill[]);
      } catch (err) {
        const msg = getSupabaseErrorMessage(err, 'Failed to load profile settings');
        if (isMissingTableSchemaCacheError(msg)) {
          setDbSetupError(
            "Your Supabase database tables aren't set up yet (missing `user_profiles` / `skills`). Run the migration in `supabase/migrations/20251115181004_create_users_and_skills_tables.sql` on your Supabase project, then refresh the schema cache in Supabase (API settings) and reload this page."
          );
        }
        setError(msg);
        console.error('Settings error:', err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user]);

  const save = async () => {
    if (!user) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await ensureUserProfileRow();

      const { error: upsertError } = await supabase.from('user_profiles').upsert({
        id: user.id,
        full_name: draft.full_name.trim() || null,
        bio: draft.bio.trim() || null,
      }, { onConflict: 'id' });

      if (upsertError) throw upsertError;

      // Ensure settings row exists before saving settings
      try {
        await ensureUserSettingsRow();
      } catch (e) {
        const msg = getSupabaseErrorMessage(e, 'Failed to prepare settings for save');
        setError(msg);
        throw e;
      }

      // save settings if table exists
      try {
        const payload: Partial<UserSettings> = {
          id: user.id,
          username: settings.username ?? null,
          display_name: settings.display_name ?? null,
          avatar_url: settings.avatar_url ?? null,
          location: settings.location ?? null,
          timezone: settings.timezone ?? null,
          teaching_level: settings.teaching_level ?? null,
          learning_level: settings.learning_level ?? null,
          categories: settings.categories ?? null,
          max_active_exchanges: settings.max_active_exchanges ?? null,
          session_duration_minutes: settings.session_duration_minutes ?? null,
          learning_modes: settings.learning_modes ?? null,
          buffer_minutes: settings.buffer_minutes ?? null,
          two_factor_enabled: settings.two_factor_enabled ?? false,
          notifications: settings.notifications ?? null,
          privacy: settings.privacy ?? null,
          /* Professional / extended profile fields */
          headline: settings.headline ?? null,
          industry: settings.industry ?? null,
          current_title: settings.current_title ?? null,
          current_company: settings.current_company ?? null,
          company_website: settings.company_website ?? null,
          websites: settings.websites ?? null,
          phone: settings.phone ?? null,
          birthday: settings.birthday ?? null,
          languages: settings.languages ?? null,
          experience: settings.experience ?? null,
          education: settings.education ?? null,
          certifications: settings.certifications ?? null,
          licenses: settings.licenses ?? null,
          projects: settings.projects ?? null,
          publications: settings.publications ?? null,
          skills: settings.skills ?? null,
        };
        const { data: upsertedSettingsData, error: settingsUpsertError } = await supabase
          .from('user_settings')
          .upsert(payload, { onConflict: 'id' });
        if (settingsUpsertError) {
          const msg = getSupabaseErrorMessage(settingsUpsertError, 'Failed to save settings');
          setError(msg);
          throw settingsUpsertError;
        }

        // Refresh settings from DB to confirm persistence and reflect any defaults/triggers
        try {
          const { data: refreshed, error: refreshError } = await supabase
            .from('user_settings')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          if (!refreshError && refreshed) {
            setSettings(refreshed as UserSettings);
          }
        } catch (e) {
          console.warn('Failed to refresh settings after save', e);
        }

        setSuccess('Profile and settings updated');
      } catch (e) {
        console.warn('Save settings error', e);
        // If saving settings fails, bail out (profile is already saved)
        return;
      }
    } catch (err) {
      const msg = getSupabaseErrorMessage(err, 'Failed to save profile');
      if (isMissingTableSchemaCacheError(msg)) {
        setDbSetupError(
          "Can't save because your Supabase project is missing the required tables. Apply `supabase/migrations/20251115181004_create_users_and_skills_tables.sql` to your Supabase DB, then refresh the schema cache and try again."
        );
      }
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const teach = useMemo(() => skills.filter((s) => s.skill_type === 'teach'), [skills]);
  const learn = useMemo(() => skills.filter((s) => s.skill_type === 'learn'), [skills]);

  const updateSetting = (patch: Partial<UserSettings>) => {
    setSettings((s) => ({ ...(s || {}), ...patch }));
  };

  const refreshSkills = async () => {
    if (!user) return;
    const { data, error: skillsError } = await supabase
      .from('skills')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (skillsError) throw skillsError;
    setSkills((data || []) as Skill[]);
  };

  const startEditSkill = (skill: Skill) => {
    setError('');
    setSuccess('');
    setEditingSkillId(skill.id);
    setEditDraft({
      name: skill.name || '',
      proficiency_level: skill.proficiency_level,
      goal: skill.description || '',
    });
  };

  const cancelEditSkill = () => {
    setEditingSkillId(null);
    setEditDraft({ name: '', proficiency_level: 'beginner', goal: '' });
  };

  const saveEditedSkill = async (skill: Skill) => {
    if (!user) return;
    const name = editDraft.name.trim();
    if (!name) {
      setError('Skill name is required');
      return;
    }
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await ensureUserProfileRow();

      const payload: Partial<Skill> = {
        name,
        proficiency_level: editDraft.proficiency_level,
      };

      if (skill.skill_type === 'learn') {
        payload.description = editDraft.goal.trim() || null;
      }

      const { error: updateError } = await supabase
        .from('skills')
        .update(payload)
        .eq('id', skill.id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
      await refreshSkills();
      cancelEditSkill();
      setSuccess('Skill updated');
    } catch (err) {
      setError(getSupabaseErrorMessage(err, 'Failed to update skill'));
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (skill: Skill) => {
    if (!user) return;
    const ok = window.confirm(`Delete "${skill.name}"?`);
    if (!ok) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await ensureUserProfileRow();

      const { error: deleteError } = await supabase
        .from('skills')
        .delete()
        .eq('id', skill.id)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;
      await refreshSkills();
      if (editingSkillId === skill.id) cancelEditSkill();
      setSuccess('Skill deleted');
    } catch (err) {
      setError(getSupabaseErrorMessage(err, 'Failed to delete skill'));
    } finally {
      setSaving(false);
    }
  };

  const addTeachSkill = async () => {
    if (!user) return;
    const name = teachDraft.name.trim();
    if (!name) {
      setError('Skill name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await ensureUserProfileRow();

      const { error: insertError } = await supabase.from('skills').insert({
        user_id: user.id,
        name,
        skill_type: 'teach',
        proficiency_level: teachDraft.proficiency_level,
        category: null,
        description: null,
      });

      if (insertError) throw insertError;
      await refreshSkills();
      setTeachDraft(defaultTeachDraft);
      setSuccess('Teaching skill added');
    } catch (err) {
      setError(getSupabaseErrorMessage(err, 'Failed to add teaching skill'));
    } finally {
      setSaving(false);
    }
  };

  const addLearnSkill = async () => {
    if (!user) return;
    const name = learnDraft.name.trim();
    if (!name) {
      setError('Skill name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await ensureUserProfileRow();

      const { error: insertError } = await supabase.from('skills').insert({
        user_id: user.id,
        name,
        skill_type: 'learn',
        proficiency_level: learnDraft.proficiency_level,
        category: null,
        description: learnDraft.goal.trim() || null,
      });

      if (insertError) throw insertError;
      await refreshSkills();
      setLearnDraft(defaultLearnDraft);
      setSuccess('Learning skill added');
    } catch (err) {
      setError(getSupabaseErrorMessage(err, 'Failed to add learning skill'));
    } finally {
      setSaving(false);
    }
  };

  const teachSkills = useMemo(
    () => skills.filter((s) => s.skill_type === 'teach'),
    [skills]
  );
  const learnSkills = useMemo(
    () => skills.filter((s) => s.skill_type === 'learn'),
    [skills]
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" />
          <p className="text-skillswap-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-skillswap-dark">Profile settings</h1>
        <p className="text-skillswap-600">Update your name, bio, and professional details.</p>
      </div>

      {(error || success || dbSetupError) && (
        <Card
          className={
            error || dbSetupError
              ? 'p-4 bg-destructive/10 border-destructive/20'
              : 'p-4 bg-secondary/40 border-secondary'
          }
        >
          <p className={error || dbSetupError ? 'text-destructive' : 'text-foreground'}>
            {error || dbSetupError || success}
          </p>

          {dbSetupError && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-skillswap-600">{dbSetupError}</p>
              <div className="text-sm text-skillswap-600 space-y-1">
                <p>
                  Check your environment variables: <span className="font-medium">NEXT_PUBLIC_SUPABASE_URL</span>{' '}
                  and <span className="font-medium">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>.
                </p>
                <p>
                  After running the migration, go to Supabase Dashboard → API → “Reload” (schema cache), then refresh
                  the app.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-6 bg-white border-2 border-skillswap-200 space-y-5">
        <div>
          <Label className="text-skillswap-dark">Email</Label>
          <Input value={user?.email ?? ''} disabled />
        </div>

        <div>
          <Label className="text-skillswap-dark">Profile photo</Label>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {settings.avatar_url ? (
                // preview
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.avatar_url} alt="Avatar" className="w-20 h-20 rounded-full object-cover border" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-skillswap-50 flex items-center justify-center text-sm text-skillswap-600 border">No photo</div>
              )}
            </div>

            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !user) return;
                  setUploadingAvatar(true);
                  setError('');
                  try {
                    const path = `${AVATAR_BUCKET}/${user.id}/${Date.now()}_${file.name}`;
                    const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true });
                    if (uploadError) {
                      // Handle common missing-bucket case with actionable guidance
                      const msg = (uploadError.message || String(uploadError)).toLowerCase();
                      if (msg.includes('bucket') || msg.includes('does not exist') || msg.includes('not found')) {
                        setError(
                          `Storage bucket "${AVATAR_BUCKET}" not found. Create a bucket named "${AVATAR_BUCKET}" in your Supabase project (Storage → Buckets), make it public or configure appropriate policies, then reload this page.`
                        );
                        return;
                      }
                      throw uploadError;
                    }

                    const publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data?.publicUrl;
                    if (!publicUrl) throw new Error('Failed to get public URL for avatar');
                    updateSetting({ avatar_url: publicUrl });
                    setSuccess('Avatar uploaded (remember to click Save)');
                  } catch (err) {
                    setError(typeof err === 'string' ? err : (err as Error)?.message || 'Failed to upload avatar');
                  } finally {
                    setUploadingAvatar(false);
                  }
                }}
                disabled={saving || uploadingAvatar}
                className="file:border-0 file:bg-transparent file:text-sm file:font-medium"
              />

              <div className="mt-2 flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => updateSetting({ avatar_url: null })}
                  disabled={saving || uploadingAvatar}
                  className="text-sm text-destructive"
                >
                  Remove photo
                </button>
                {uploadingAvatar && <span className="text-sm text-skillswap-600">Uploading…</span>}
              </div>
              <p className="text-xs text-skillswap-600 mt-2">You can upload an image; click Save to persist.</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-skillswap-100">
          <h3 className="text-lg font-semibold text-skillswap-dark">Professional / LinkedIn-like info</h3>
          <p className="text-sm text-skillswap-600">Add headline, current role, experience, and other professional details.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-skillswap-dark">Headline</Label>
              <Input value={settings.headline ?? ''} onChange={(e) => updateSetting({ headline: e.target.value })} />
            </div>
            
            <div>
              <Label className="text-skillswap-dark">Personal websites (comma separated)</Label>
              <Input value={arrToCsv(settings.websites)} onChange={(e) => updateSetting({ websites: csvToArr(e.target.value) })} />
            </div>
            <div>
              <Label className="text-skillswap-dark">Phone</Label>
              <Input value={settings.phone ?? ''} onChange={(e) => updateSetting({ phone: e.target.value })} />
            </div>
            <div>
              <Label className="text-skillswap-dark">Birthday</Label>
              <Input type="date" value={settings.birthday ?? ''} onChange={(e) => updateSetting({ birthday: e.target.value })} />
            </div>
            <div>
              <Label className="text-skillswap-dark">Languages (comma separated)</Label>
              <Input value={arrToCsv(settings.languages)} onChange={(e) => updateSetting({ languages: csvToArr(e.target.value) })} />
            </div>
            <div>
              <Label className="text-skillswap-dark">Skills (comma separated)</Label>
              <Input value={arrToCsv(settings.skills)} onChange={(e) => updateSetting({ skills: csvToArr(e.target.value) })} />
            </div>
          </div>

          <div className="mt-3">
            <Label className="text-skillswap-dark">Experience (one entry per line)</Label>
            <Textarea
              value={(settings.experience || []).map((i) => (typeof i === 'string' ? i : JSON.stringify(i))).join('\n')}
              onChange={(e) => updateSetting({ experience: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })}
              placeholder="Company – Title – Dates – brief description"
            />
          </div>

          <div className="mt-3">
            <Label className="text-skillswap-dark">Education (one entry per line)</Label>
            <Textarea
              value={(settings.education || []).map((i) => (typeof i === 'string' ? i : JSON.stringify(i))).join('\n')}
              onChange={(e) => updateSetting({ education: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })}
              placeholder="School – Degree – Years"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-skillswap-dark">Certifications (comma separated)</Label>
              <Input value={arrToCsv(settings.certifications)} onChange={(e) => updateSetting({ certifications: csvToArr(e.target.value) })} />
            </div>
            
            <div>
              <Label className="text-skillswap-dark">Projects (comma separated)</Label>
              <Input value={arrToCsv(settings.projects)} onChange={(e) => updateSetting({ projects: csvToArr(e.target.value) })} />
            </div>
            <div>
              <Label className="text-skillswap-dark">Publications (comma separated)</Label>
              <Input value={arrToCsv(settings.publications)} onChange={(e) => updateSetting({ publications: csvToArr(e.target.value) })} />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-skillswap-dark">Full name</Label>
          <Input
            value={draft.full_name}
            onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
            placeholder="Your name"
            disabled={saving}
          />
        </div>

        <div>
          <Label className="text-skillswap-dark">Username / display name</Label>
          <Input
            value={settings.username ?? settings.display_name ?? ''}
            onChange={(e) => updateSetting({ username: e.target.value, display_name: e.target.value })}
            placeholder="How you'll appear on SkillSwap"
            disabled={saving}
          />
        </div>

        <div>
          <Label className="text-skillswap-dark">Bio</Label>
          <Textarea
            value={draft.bio}
            onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
            placeholder="A short bio about you"
            disabled={saving}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-skillswap-dark">Location</Label>
            <Input value={settings.location ?? ''} onChange={(e) => updateSetting({ location: e.target.value })} />
          </div>
          <div>
            <Label className="text-skillswap-dark">Time zone</Label>
            <Input value={settings.timezone ?? ''} onChange={(e) => updateSetting({ timezone: e.target.value })} placeholder="e.g., America/Los_Angeles" />
          </div>
        </div>

        <Button onClick={save} disabled={saving || !canSave} className="bg-skillswap-500 text-white hover:bg-skillswap-600">
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </Card>

      <div className="mt-6">
        <h2 className="text-xl font-bold text-skillswap-dark">Public profile preview</h2>
        <p className="text-sm text-skillswap-600">How your profile will appear to others.</p>
      </div>

      <Card className="p-6 bg-white border-2 border-skillswap-200">
        <div className="flex items-start gap-4">
          {settings.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.avatar_url} alt={`Avatar for ${settings.display_name || settings.username || draft.full_name}`} className="w-24 h-24 rounded-full object-cover" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-skillswap-100 flex items-center justify-center text-xl font-medium text-skillswap-600">{(settings.display_name || settings.username || draft.full_name || 'S').charAt(0)}</div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-skillswap-dark">{settings.display_name || settings.username || draft.full_name || 'SkillSwap member'}</h2>
            {settings.headline && <p className="text-sm text-skillswap-600">{settings.headline}</p>}
            <p className="text-sm text-skillswap-600 mt-1">{user?.email}</p>
          </div>
        </div>

        {draft.bio && <p className="text-skillswap-600 mt-4">{draft.bio}</p>}

        <div className="mt-4 space-y-1 text-sm text-skillswap-600">
          {settings.location && <div>Location: {settings.location}</div>}
          {settings.timezone && <div>Timezone: {settings.timezone}</div>}
          {settings.languages && settings.languages.length > 0 && <div>Languages: {(settings.languages || []).join(', ')}</div>}
          {settings.websites && settings.websites.length > 0 && (
            <div>Websites: {(settings.websites || []).map((w, i) => <span key={i} className="mr-2">{w}</span>)}</div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
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
      </Card>

      <div>
        <h2 className="text-xl font-bold text-skillswap-dark">Skill Exchange Core</h2>
        <p className="text-skillswap-600">
          Tell SkillSwap what you can teach and what you want to learn.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-white border-2 border-skillswap-200 space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-skillswap-dark">Skills I Can Teach</h3>
            <p className="text-sm text-skillswap-600">Add skills you can help others with.</p>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-skillswap-dark">Skill name</Label>
              <Input
                value={teachDraft.name}
                onChange={(e) => setTeachDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g., React, Public speaking"
                disabled={saving}
              />
            </div>

            <div>
              <Label className="text-skillswap-dark">Proficiency level</Label>
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

            <Button
              onClick={addTeachSkill}
              disabled={saving}
              className="bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              Add
            </Button>
          </div>

          <div className="pt-2">
            {teachSkills.length === 0 ? (
              <p className="text-sm text-skillswap-600">No teaching skills added yet.</p>
            ) : (
              <div className="space-y-2">
                {teachSkills.slice(0, 6).map((s) => (
                  <div key={s.id} className="rounded-lg border border-skillswap-200 bg-skillswap-50 px-3 py-2">
                    {editingSkillId === s.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                            disabled={saving}
                          />
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
                        <div className="flex gap-2">
                          <Button
                            onClick={() => saveEditedSkill(s)}
                            disabled={saving}
                            className="bg-skillswap-500 text-white hover:bg-skillswap-600"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={cancelEditSkill}
                            disabled={saving}
                            variant="outline"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-skillswap-dark truncate">{s.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{s.proficiency_level}</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditSkill(s)}
                            disabled={saving}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => (window.location.href = `/dashboard/skill-assessment?skillId=${s.id}`)}
                            disabled={saving}
                          >
                            Test
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteSkill(s)}
                            disabled={saving}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 bg-white border-2 border-skillswap-200 space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-skillswap-dark">Skills I Want to Learn</h3>
            <p className="text-sm text-skillswap-600">Add skills you want to learn.</p>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-skillswap-dark">Skill name</Label>
              <Input
                value={learnDraft.name}
                onChange={(e) => setLearnDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g., UI design, Python"
                disabled={saving}
              />
            </div>

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
              <Label className="text-skillswap-dark">Goal (optional short text)</Label>
              <Input
                value={learnDraft.goal}
                onChange={(e) => setLearnDraft((d) => ({ ...d, goal: e.target.value }))}
                placeholder="e.g., Build a portfolio in 30 days"
                disabled={saving}
              />
            </div>

            <Button
              onClick={addLearnSkill}
              disabled={saving}
              className="bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              Add
            </Button>
          </div>

          <div className="pt-2">
            {learnSkills.length === 0 ? (
              <p className="text-sm text-skillswap-600">No learning skills added yet.</p>
            ) : (
              <div className="space-y-2">
                {learnSkills.slice(0, 6).map((s) => (
                  <div key={s.id} className="rounded-lg border border-skillswap-200 bg-skillswap-50 px-3 py-2">
                    {editingSkillId === s.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3">
                          <Input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                            disabled={saving}
                          />
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
                          <Input
                            value={editDraft.goal}
                            onChange={(e) => setEditDraft((d) => ({ ...d, goal: e.target.value }))}
                            placeholder="Goal (optional short text)"
                            disabled={saving}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => saveEditedSkill(s)}
                            disabled={saving}
                            className="bg-skillswap-500 text-white hover:bg-skillswap-600"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={cancelEditSkill}
                            disabled={saving}
                            variant="outline"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-skillswap-dark truncate">{s.name}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{s.proficiency_level}</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEditSkill(s)}
                              disabled={saving}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => (window.location.href = `/dashboard/skill-assessment?skillId=${s.id}`)}
                              disabled={saving}
                            >
                              Test
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteSkill(s)}
                              disabled={saving}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        {s.description && (
                          <p className="text-xs text-skillswap-600 truncate">Goal: {s.description}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
