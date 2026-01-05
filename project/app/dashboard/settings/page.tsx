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
  const [dbSetupError, setDbSetupError] = useState<string | null>(null);

  const canSave = useMemo(() => true, []);

  const ensureUserProfileRow = async () => {
    if (!user) return;
    const fullNameFromMetadata =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.email?.split('@')[0] ?? '');

    const { error: upsertError } = await supabase.from('user_profiles').upsert(
      {
        id: user.id,
        full_name: fullNameFromMetadata.trim() || null,
        bio: null,
      },
      { onConflict: 'id' }
    );

    if (upsertError) throw upsertError;
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
      });

      if (upsertError) throw upsertError;

      setSuccess('Profile updated');
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
        <p className="text-skillswap-600">Update your name and bio.</p>
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
          <Label className="text-skillswap-dark">Full name</Label>
          <Input
            value={draft.full_name}
            onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
            placeholder="Your name"
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

        <Button
          onClick={save}
          disabled={saving || !canSave}
          className="bg-skillswap-500 text-white hover:bg-skillswap-600"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
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
