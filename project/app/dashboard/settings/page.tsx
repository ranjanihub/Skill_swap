'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Skill,
  UserProfile,
  SkillSwapSession,
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
const defaultLearnDraft: LearnDraft = { name: '', proficiency_level: 'beginner', goal: '' };

export default function SettingsPage() {

  const { user, loading: authLoading } = useAuth();

  const [draft, setDraft] = useState<ProfileDraft>({ full_name: '', bio: '' });
  const [settings, setSettings] = useState<Partial<UserSettings>>({});
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dbSetupError, setDbSetupError] = useState<string | null>(null);

  const [teachDraft, setTeachDraft] = useState<TeachDraft>(defaultTeachDraft);
  const [learnDraft, setLearnDraft] = useState<LearnDraft>(defaultLearnDraft);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SkillEditDraft>({ name: '', proficiency_level: 'beginner', goal: '' });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pairNotes, setPairNotes] = useState('');
  const [testDraft, setTestDraft] = useState('');

  // Customize Notifications (skill-based)
  const [notifSkillDraft, setNotifSkillDraft] = useState('');
  const [notifSkills, setNotifSkills] = useState<string[]>([]);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState('');
  const [notifError, setNotifError] = useState('');

  // Raise Ticket
  const [recentSwapPosts, setRecentSwapPosts] = useState<Array<{ postId: string; label: string; ownerId: string | null }>>([]);
  const [ticketPostRef, setTicketPostRef] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketEvidenceUrl, setTicketEvidenceUrl] = useState('');
  const [ticketEvidenceFile, setTicketEvidenceFile] = useState<File | null>(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState('');
  const [ticketError, setTicketError] = useState('');
  const [recentPostOwnerBySkillId, setRecentPostOwnerBySkillId] = useState<Record<string, string>>({});

  const AVATAR_BUCKET = 'avatars';
  const TICKET_EVIDENCE_BUCKET = 'ticket-evidence';


  const getSupabaseErrorMessage = (err: unknown, fallback = 'An error occurred') => {
    if (!err) return fallback;
    if (typeof err === 'string') return err as string;
    if ((err as any)?.message) return (err as any).message;
    return fallback;
  };

  const isMissingTableSchemaCacheError = (msg?: string) => {
    if (!msg) return false;
    return msg.includes('does not exist') || msg.includes('missing') || msg.includes('relation');
  };

  const ensureUserProfileRow = async () => {
    if (!user) return;
    const { error } = await supabase.from('user_profiles').upsert({ id: user.id }, { onConflict: 'id' });
    if (error) throw error;
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

        // Load notification preferences
        try {
          const { data: prefsData, error: prefsError } = await supabase
            .from('notification_skill_preferences')
            .select('skill_name')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (!prefsError) {
            const list = (prefsData || [])
              .map((p: any) => String(p.skill_name || '').trim())
              .filter(Boolean);
            setNotifSkills(Array.from(new Set(list)));
          }
        } catch {
          // ignore (table might not exist yet)
        }

        // Load recent swap sessions to allow tagging a related swap post
        try {
          const { data: sessionsData, error: sessionsError } = await supabase
            .from('skill_swap_sessions')
            .select('id, user_a_id, user_b_id, skill_a_id, skill_b_id, status, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

          if (sessionsError) throw sessionsError;

          const sessions = (sessionsData || []) as Partial<SkillSwapSession>[];
          const idRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          const skillIds = Array.from(
            new Set(
              sessions
                .flatMap((s) => [s.skill_a_id, s.skill_b_id])
                .filter((v): v is string => Boolean(v) && idRegex.test(String(v)))
            )
          ).slice(0, 100);

          if (skillIds.length === 0) {
            setRecentSwapPosts([]);
          } else {
            const { data: sessionSkills, error: sessionSkillsError } = await supabase
              .from('skills')
              .select('id, name, skill_type, user_id')
              .in('id', skillIds);
            if (sessionSkillsError) throw sessionSkillsError;

            const ownerIds = Array.from(new Set((sessionSkills || []).map((s: any) => s.user_id).filter(Boolean))).slice(0, 200);
            let ownersMap: Record<string, string> = {};
            if (ownerIds.length > 0) {
              const { data: ownerProfiles } = await supabase
                .from('user_profiles')
                .select('id, full_name')
                .in('id', ownerIds);
              (ownerProfiles || []).forEach((p: any) => {
                ownersMap[p.id] = p.full_name || p.id;
              });
            }

            const bySkillId: Record<string, string> = {};
            (sessionSkills || []).forEach((s: any) => {
              if (s?.id && s?.user_id) bySkillId[s.id] = s.user_id;
            });
            setRecentPostOwnerBySkillId(bySkillId);

            const options = (sessionSkills || []).map((s: any) => {
              const ownerName = ownersMap[s.user_id] || s.user_id || 'SkillSwap member';
              const typeLabel = s.skill_type === 'learn' ? 'Learns' : 'Teaches';
              return {
                postId: s.id,
                ownerId: s.user_id || null,
                label: `${typeLabel}: ${s.name} (${ownerName})`,
              };
            });
            setRecentSwapPosts(options);
          }
        } catch (e) {
          // best-effort; settings page should still render
          setRecentSwapPosts([]);
        }
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

  const normalizeSkillLabel = (s: string) => s.trim();
  const normalizeSkillKey = (s: string) => s.trim().toLowerCase();

  const addNotifSkill = () => {
    const name = normalizeSkillLabel(notifSkillDraft);
    const key = normalizeSkillKey(notifSkillDraft);
    if (!name || !key) return;
    setNotifSkills((prev) => {
      const existingKeys = new Set(prev.map((s) => normalizeSkillKey(s)));
      if (existingKeys.has(key)) return prev;
      return [...prev, name].filter(Boolean);
    });
    setNotifSkillDraft('');
  };

  const removeNotifSkill = (name: string) => {
    const key = normalizeSkillKey(name);
    setNotifSkills((prev) => prev.filter((s) => normalizeSkillKey(s) !== key));
  };

  const saveNotifPrefs = async () => {
    if (!user) return;
    setNotifError('');
    setNotifSuccess('');
    try {
      setNotifSaving(true);

      const cleaned = (() => {
        const byKey = new Map<string, string>();
        for (const raw of notifSkills || []) {
          const label = normalizeSkillLabel(raw);
          const key = normalizeSkillKey(raw);
          if (!label || !key) continue;
          if (!byKey.has(key)) byKey.set(key, label);
        }
        return Array.from(byKey.values()).slice(0, 25);
      })();

      // Replace-all for simplicity
      const { error: delErr } = await supabase
        .from('notification_skill_preferences')
        .delete()
        .eq('user_id', user.id);
      if (delErr) throw delErr;

      if (cleaned.length > 0) {
        const rows = cleaned.map((skill_name) => ({
          user_id: user.id,
          skill_name,
          // keep normalized column consistent with the DB normalize function
          skill_name_normalized: normalizeSkillKey(skill_name),
        }));
        const { error: insErr } = await supabase
          .from('notification_skill_preferences')
          .insert(rows);
        if (insErr) throw insErr;
      }

      setNotifSuccess('Notification preferences saved.');
    } catch (e) {
      const msg = getSupabaseErrorMessage(e, 'Failed to save notification preferences');
      if (isMissingTableSchemaCacheError(msg)) {
        setNotifError(
          "Notification preferences aren't set up yet. Apply `supabase/migrations/20260228153000_add_notification_skill_preferences.sql` on your Supabase DB, reload schema cache, then try again."
        );
      } else {
        setNotifError(msg);
      }
    } finally {
      setNotifSaving(false);
    }
  };

  const parsePostIdFromRef = (ref: string) => {
    const raw = (ref || '').trim();
    if (!raw) return '';
    // Accept full URL or path like /post/<id>
    const match = raw.match(/\/post\/([0-9a-f\-]{36})/i);
    if (match?.[1]) return match[1];
    return raw;
  };

  const raiseTicket = async () => {
    if (!user) return;
    setTicketError('');
    setTicketSuccess('');

    const postId = parsePostIdFromRef(ticketPostRef);
    const description = ticketDescription.trim();
    if (!postId) {
      setTicketError('Please tag the related swap post (paste a /post/… link or ID).');
      return;
    }
    if (!description) {
      setTicketError('Please describe the issue.');
      return;
    }

    try {
      setTicketSubmitting(true);

      const evidenceUrls: string[] = [];
      const url = ticketEvidenceUrl.trim();
      if (url) evidenceUrls.push(url);

      if (ticketEvidenceFile) {
        const form = new FormData();
        form.append('file', ticketEvidenceFile);
        form.append('user_id', user.id);
        form.append('bucket', TICKET_EVIDENCE_BUCKET);

        const res = await fetch('/api/upload-avatar', { method: 'POST', body: form });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || 'Evidence upload failed');
        }
        const publicUrl = json?.publicUrl as string | null;
        if (publicUrl) evidenceUrls.push(publicUrl);
      }

      // Best-effort accused_id resolution from recent post data
      let accusedId: string | null = null;
      if (recentPostOwnerBySkillId[postId]) {
        accusedId = recentPostOwnerBySkillId[postId];
      } else {
        // fallback lookup
        try {
          const { data: skillRow } = await supabase.from('skills').select('user_id').eq('id', postId).maybeSingle();
          if (skillRow?.user_id) accusedId = skillRow.user_id as string;
        } catch {
          // ignore
        }
      }

      const { error: insertError } = await supabase.from('moderation_tickets').insert({
        reporter_id: user.id,
        accused_id: accusedId,
        skill_id: postId,
        session_id: null,
        description,
        evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : null,
        status: 'open',
      });

      if (insertError) throw insertError;

      setTicketSuccess('Ticket submitted for review.');
      setTicketPostRef('');
      setTicketDescription('');
      setTicketEvidenceUrl('');
      setTicketEvidenceFile(null);
    } catch (e) {
      const msg = getSupabaseErrorMessage(e, 'Failed to submit ticket');
      if (isMissingTableSchemaCacheError(msg)) {
        setTicketError(
          "Tickets table isn't set up yet. Apply the migration `supabase/migrations/20260228140000_create_moderation_tickets.sql` on your Supabase DB, reload schema cache, then try again."
        );
      } else {
        setTicketError(msg);
      }
    } finally {
      setTicketSubmitting(false);
    }
  };

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
          headline: settings.headline ?? null,
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

  const canSave = (() => {
    if (!user) return false;
    const profileHas = (draft.full_name || '').trim() !== '' || (draft.bio || '').trim() !== '';
    const settingsHave = Object.keys(settings || {}).length > 0;
    return profileHas || settingsHave;
  })();

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

  // helper that checks if the user already has an assessment result for a
  // given teaching skill name.  the assessment page stores results in the
  // `description` field, so we treat a non-null description as evidence of
  // having taken a test.
  const hasAssessmentFor = async (name: string): Promise<boolean> => {
    if (!user) return false;
    const { data, error } = await supabase
      .from('skills')
      .select('id')
      .eq('user_id', user.id)
      .eq('skill_type', 'teach')
      .eq('name', name)
      .not('description', 'is', null)
      .maybeSingle();
    if (error) {
      console.warn('assessment lookup error', error);
      return false;
    }
    return !!data;
  };

  const addTeachSkill = async () => {
    if (!user) return;
    const name = teachDraft.name.trim();
    if (!name) {
      setError('Skill name is required');
      return;
    }

    // require assessment before adding as teaching skill
    if (!(await hasAssessmentFor(name))) {
      setError('Please take a test for this skill before adding it as a teaching skill.');
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
                    const form = new FormData();
                    form.append('file', file);
                    form.append('user_id', user.id);
                    form.append('bucket', AVATAR_BUCKET);

                    const res = await fetch('/api/upload-avatar', { method: 'POST', body: form });
                    const json = await res.json();
                    if (!res.ok) {
                      throw new Error(json?.error || 'Upload failed');
                    }
                    const publicUrl = json?.publicUrl;
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
          <p className="text-sm text-skillswap-600">Add a headline about your background.</p>

          <div className="mt-3">
            <Label className="text-skillswap-dark">Headline</Label>
            <Input value={settings.headline ?? ''} onChange={(e) => updateSetting({ headline: e.target.value })} />
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


        <Button onClick={save} disabled={saving || !canSave} className="bg-skillswap-500 text-white hover:bg-skillswap-600">
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </Card>

      <Card className="p-6 bg-white border-2 border-skillswap-200 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-skillswap-dark">Customize Notifications</h2>
          <p className="text-sm text-skillswap-600">Choose which skills you want to get notified about when someone creates a related swap post.</p>
        </div>

        {(notifError || notifSuccess) && (
          <div className={notifError ? 'p-3 rounded-md bg-destructive/10 border border-destructive/20' : 'p-3 rounded-md bg-secondary/40 border border-secondary'}>
            <p className={notifError ? 'text-sm text-destructive' : 'text-sm text-foreground'}>{notifError || notifSuccess}</p>
          </div>
        )}

        <div>
          <Label className="text-skillswap-dark">Add a skill</Label>
          <div className="mt-2 flex gap-2">
            <Input
              value={notifSkillDraft}
              onChange={(e) => setNotifSkillDraft(e.target.value)}
              placeholder="e.g., React, UI/UX, Next.js"
              disabled={notifSaving}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNotifSkill();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addNotifSkill} disabled={notifSaving || !notifSkillDraft.trim()}>
              Add
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-skillswap-dark">Selected skills</Label>
          {notifSkills.length === 0 ? (
            <p className="text-sm text-skillswap-600 mt-2">No skills selected yet.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {notifSkills.map((s) => (
                <Badge key={s} variant="secondary" className="flex items-center gap-2">
                  <span>{s}</span>
                  <button type="button" onClick={() => removeNotifSkill(s)} disabled={notifSaving} className="text-xs text-skillswap-700">
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveNotifPrefs}
            disabled={notifSaving}
            className="bg-skillswap-500 text-white hover:bg-skillswap-600"
          >
            {notifSaving ? 'Saving…' : 'Save notification preferences'}
          </Button>
        </div>
      </Card>

      <div>
        <h2 className="text-xl font-bold text-skillswap-dark">Take a skill test &amp; add your skills</h2>
        <p className="text-sm text-skillswap-600">
          If you want to offer a teaching skill on your profile, start by
          completing a brief self‑assessment. After the test you'll be able to
          add the skill to your teaching list.
        </p>

        <div className="mt-4 flex flex-col sm:flex-row items-start gap-3">
          <Input
            placeholder="Skill name (e.g. React, Spanish)"
            value={testDraft}
            onChange={(e) => setTestDraft(e.target.value)}
            disabled={saving}
          />
          <Button
            onClick={async () => {
              if (!user) return;
              const name = testDraft.trim();
              if (!name) {
                setError('Skill name is required');
                return;
              }
              try {
                setSaving(true);
                setError('');
                await ensureUserProfileRow();
                const { data, error: insertError } = await supabase
                  .from('skills')
                  .insert({
                    user_id: user.id,
                    name,
                    skill_type: 'teach',
                    proficiency_level: 'beginner',
                    category: null,
                    description: null,
                  })
                  .select('id')
                  .maybeSingle();
                if (insertError) throw insertError;
                const id: string | undefined = data?.id;
                setTestDraft('');
                if (id) {
                  // navigate to assessment page
                  window.location.href = `/dashboard/skill-assessment?skillId=${id}`;
                }
              } catch (e) {
                setError(getSupabaseErrorMessage(e, 'Failed to start assessment'));
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving || !testDraft.trim()}
            className="bg-skillswap-500 text-white"
          >
            Take Test
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-skillswap-dark">Skill Exchange Core</h2>
        <p className="text-skillswap-600">
          Tell SkillSwap what you can teach and what you want to learn.
        </p>
      </div>

      <div>
        <Card className="p-6 bg-white border-2 border-skillswap-200">
          <h3 className="text-lg font-semibold text-skillswap-dark">Raise Ticket</h3>
          <p className="text-sm text-skillswap-600 mt-1">Report an issue if a swapper cheats or violates the agreement. Tag the related swap post.</p>

          {(ticketError || ticketSuccess) && (
            <div className={ticketError ? 'mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20' : 'mt-3 p-3 rounded-md bg-secondary/40 border border-secondary'}>
              <p className={ticketError ? 'text-sm text-destructive' : 'text-sm text-foreground'}>{ticketError || ticketSuccess}</p>
            </div>
          )}

          <div className="mt-4">
            <Label className="text-skillswap-dark">Related swap post</Label>
            {recentSwapPosts.length > 0 ? (
              <div className="mt-2">
                <Select
                  value={''}
                  onValueChange={(v) => setTicketPostRef(v)}
                  disabled={ticketSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select from recent swaps (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {recentSwapPosts.slice(0, 20).map((p) => (
                      <SelectItem key={p.postId} value={p.postId}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="mt-2">
              <Input
                value={ticketPostRef}
                onChange={(e) => setTicketPostRef(e.target.value)}
                placeholder="Paste swap post link like /post/<id> or enter the post ID"
                disabled={ticketSubmitting}
              />
            </div>
          </div>

          <div className="mt-4">
            <Label className="text-skillswap-dark">Description</Label>
            <Textarea
              value={ticketDescription}
              onChange={(e) => setTicketDescription(e.target.value)}
              placeholder="Describe what happened and how it violated the agreement"
              disabled={ticketSubmitting}
            />
          </div>

          <div className="mt-4">
            <Label className="text-skillswap-dark">Supporting evidence (optional)</Label>
            <div className="mt-2 space-y-3">
              <Input
                value={ticketEvidenceUrl}
                onChange={(e) => setTicketEvidenceUrl(e.target.value)}
                placeholder="Evidence link (optional)"
                disabled={ticketSubmitting}
              />

              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setTicketEvidenceFile(e.target.files?.[0] || null)}
                disabled={ticketSubmitting}
                className="file:border-0 file:bg-transparent file:text-sm file:font-medium"
              />
              <p className="text-xs text-skillswap-600">Attach a screenshot or PDF if available.</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              onClick={raiseTicket}
              disabled={ticketSubmitting}
              className="bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              {ticketSubmitting ? 'Submitting…' : 'Submit ticket'}
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <Card className="p-6 bg-white border-2 border-skillswap-200">
          <h3 className="text-lg font-semibold text-skillswap-dark">Skill exchange pair</h3>
          <p className="text-sm text-skillswap-600">Enter the skill you offer and the skill you want to learn.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label className="text-skillswap-dark">I am offering (skill)</Label>
              <Input
                value={teachDraft.name}
                onChange={(e) => setTeachDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g., React, Public speaking"
                disabled={saving}
              />
              <Label className="text-sm mt-2 text-skillswap-dark">Proficiency</Label>
              <Select
                value={teachDraft.proficiency_level}
                onValueChange={(v) => setTeachDraft((d) => ({ ...d, proficiency_level: v as Skill['proficiency_level'] }))}
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
              <Label className="text-skillswap-dark">I want to learn (skill)</Label>
              <Input
                value={learnDraft.name}
                onChange={(e) => setLearnDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g., UI design, Python"
                disabled={saving}
              />
              <Label className="text-sm mt-2 text-skillswap-dark">Current level</Label>
              <Select
                value={learnDraft.proficiency_level}
                onValueChange={(v) => setLearnDraft((d) => ({ ...d, proficiency_level: v as Skill['proficiency_level'] }))}
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
              <Label className="text-sm mt-2 text-skillswap-dark">Goal (optional)</Label>
              <Input value={learnDraft.goal} onChange={(e) => setLearnDraft((d) => ({ ...d, goal: e.target.value }))} placeholder="e.g., Build a portfolio in 30 days" disabled={saving} />
            </div>
          </div>

            <div className="mt-4">
              <Label className="text-skillswap-dark">Additional notes (optional)</Label>
              <Textarea value={pairNotes} onChange={(e) => setPairNotes(e.target.value)} placeholder="Anything you'd like to mention about this pair (optional)" disabled={saving} />
            </div>

          <div className="flex justify-end mt-4">
            <Button
              onClick={async () => {
                if (!user) return;
                const offerName = teachDraft.name.trim();
                const wantName = learnDraft.name.trim();
                if (!offerName && !wantName) {
                  setError('Provide at least one skill to add');
                  return;
                }
                try {
                  setSaving(true);
                  setError('');
                  await ensureUserProfileRow();
                  const inserts: Partial<Skill>[] = [];
                  if (offerName) {
                    // make sure user has done an assessment for this teaching skill
                    if (!(await hasAssessmentFor(offerName))) {
                      setError('Please take a test for the offering skill before adding it.');
                      return;
                    }
                    inserts.push({ user_id: user.id, name: offerName, skill_type: 'teach', proficiency_level: teachDraft.proficiency_level, category: null, description: null });
                  }
                  if (wantName) {
                    inserts.push({ user_id: user.id, name: wantName, skill_type: 'learn', proficiency_level: learnDraft.proficiency_level, category: null, description: learnDraft.goal.trim() || null });
                  }
                  if (inserts.length > 0) {
                    const { error: insertError } = await supabase.from('skills').insert(inserts);
                    if (insertError) throw insertError;
                    await refreshSkills();
                    setTeachDraft(defaultTeachDraft);
                    setLearnDraft(defaultLearnDraft);
                    setSuccess('Skill pair added');
                  }
                } catch (err) {
                  setError(getSupabaseErrorMessage(err, 'Failed to add skills'));
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="bg-skillswap-500 text-white hover:bg-skillswap-600"
            >
              Add pair
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <Card className="p-6 bg-white border-2 border-skillswap-200">
            <h4 className="font-semibold text-skillswap-dark mb-3">Teaching</h4>
            {teach.length === 0 ? (
              <p className="text-sm text-skillswap-600">No teaching skills yet.</p>
            ) : (
              <div className="space-y-3">
                {teach.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-skillswap-dark">{s.name}</p>
                      {(s.category || s.description) && <p className="text-sm text-skillswap-600">{s.category || s.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{s.proficiency_level}</Badge>
                      <Button variant="outline" size="sm" onClick={() => startEditSkill(s)} disabled={saving}>Edit</Button>
                      <Button variant="outline" size="sm" onClick={() => deleteSkill(s)} disabled={saving}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6 bg-white border-2 border-skillswap-200">
            <h4 className="font-semibold text-skillswap-dark mb-3">Learning</h4>
            {learn.length === 0 ? (
              <p className="text-sm text-skillswap-600">No learning skills added yet.</p>
            ) : (
              <div className="space-y-3">
                {learn.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-skillswap-dark">{s.name}</p>
                      {s.description && <p className="text-sm text-skillswap-600">Goal: {s.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{s.proficiency_level}</Badge>
                      <Button variant="outline" size="sm" onClick={() => startEditSkill(s)} disabled={saving}>Edit</Button>
                      <Button variant="outline" size="sm" onClick={() => deleteSkill(s)} disabled={saving}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
