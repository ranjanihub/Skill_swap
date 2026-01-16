"use client";

import React, { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import WeekGrid from '@/components/calendar/WeekGrid';
import EventDetailDrawer from '@/components/calendar/EventDetailDrawer';
import AvailabilityOverlay from '@/components/calendar/AvailabilityOverlay';
import GanttCalendar from '@/components/GanttCalendar';
import { useRouter } from 'next/navigation';

export default function CalendarPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<SkillSwapSession[]>([]);
  const [selected, setSelected] = useState<SkillSwapSession | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const [pageError, setPageError] = useState<string>('');

  // Scheduling dialog state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [connections, setConnections] = useState<Array<Pick<UserProfile, 'id' | 'full_name'>>>([]);
  const [myTeachSkills, setMyTeachSkills] = useState<Skill[]>([]);
  const [partnerTeachSkills, setPartnerTeachSkills] = useState<Skill[]>([]);

  const [partnerId, setPartnerId] = useState('');
  const [mySkillId, setMySkillId] = useState('');
  const [partnerSkillId, setPartnerSkillId] = useState('');
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    if (!isSupabaseConfigured) {
      setPageError(supabaseConfigError ?? 'Supabase is not configured');
      setLoadingSessions(false);
      return;
    }

    const run = async () => {
      setLoadingSessions(true);
      setPageError('');
      try {
        const { data } = await supabase
          .from('skill_swap_sessions')
          .select('*')
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .order('scheduled_at', { ascending: true });
        setSessions((data || []) as SkillSwapSession[]);
      } catch (err) {
        console.warn('Failed to load sessions (maybe migration not applied)', err);
        setSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    };

    void run();
  }, [loading, user, router]);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!isSupabaseConfigured) return;

    const run = async () => {
      try {
        // Fetch accepted connections (other user ids)
        const { data: reqData, error: reqErr } = await supabase
          .from('connection_requests')
          .select('*')
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .eq('status', 'accepted')
          .limit(200);

        if (reqErr) throw reqErr;

        const ids = new Set<string>();
        (reqData || []).forEach((r: any) => {
          const other = r.requester_id === user.id ? r.recipient_id : r.requester_id;
          if (other) ids.add(other);
        });

        const otherIds = Array.from(ids);
        if (otherIds.length === 0) {
          setConnections([]);
        } else {
          const { data: profileData, error: profileErr } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', otherIds);

          if (profileErr) throw profileErr;
          setConnections((profileData || []) as any);
        }

        // Fetch my teach skills
        const { data: mySkills, error: skillsErr } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', user.id)
          .eq('skill_type', 'teach')
          .order('created_at', { ascending: false })
          .limit(200);
        if (skillsErr) throw skillsErr;
        setMyTeachSkills((mySkills || []) as Skill[]);
      } catch (err) {
        console.error('Failed to load scheduling prerequisites', err);
      }
    };

    void run();
  }, [loading, user]);

  useEffect(() => {
    if (!partnerId) {
      setPartnerTeachSkills([]);
      setPartnerSkillId('');
      return;
    }
    if (!isSupabaseConfigured) return;

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', partnerId)
          .eq('skill_type', 'teach')
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        setPartnerTeachSkills((data || []) as Skill[]);
      } catch (err) {
        console.error('Failed to load partner skills', err);
        setPartnerTeachSkills([]);
      }
    };

    void run();
  }, [partnerId]);

  const resetScheduleForm = () => {
    setPartnerId('');
    setMySkillId('');
    setPartnerSkillId('');
    setScheduledAtLocal('');
    setDurationMinutes(60);
    setNotes('');
  };

  const submitSchedule = async () => {
    if (!user) return;
    if (!isSupabaseConfigured) {
      alert(supabaseConfigError ?? 'Supabase is not configured');
      return;
    }

    if (!partnerId || !mySkillId || !partnerSkillId || !scheduledAtLocal) {
      alert('Please select a partner, both skills, and a date/time.');
      return;
    }

    const scheduledAtIso = new Date(scheduledAtLocal).toISOString();

    setSavingSchedule(true);
    try {
      const { data, error } = await supabase
        .from('skill_swap_sessions')
        .insert({
          user_a_id: user.id,
          user_b_id: partnerId,
          skill_a_id: mySkillId,
          skill_b_id: partnerSkillId,
          status: 'scheduled',
          scheduled_at: scheduledAtIso,
          duration_minutes: durationMinutes || 60,
          notes: notes.trim() ? notes.trim() : null,
        })
        .select('*')
        .single();

      if (error) throw error;

      setSessions((prev) => {
        const next = [data as SkillSwapSession, ...prev];
        next.sort((a, b) => {
          const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
          const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
          return ta - tb;
        });
        return next;
      });

      setScheduleOpen(false);
      resetScheduleForm();
    } catch (err) {
      console.error('Failed to schedule session', err);
      alert('Failed to schedule session. Make sure you have a connection, skills set up, and migrations applied.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const updateSessionStatus = async (sessionId: string, status: SkillSwapSession['status']) => {
    if (!isSupabaseConfigured) {
      alert(supabaseConfigError ?? 'Supabase is not configured');
      return;
    }
    try {
      const { error } = await supabase.from('skill_swap_sessions').update({ status }).eq('id', sessionId);
      if (error) throw error;
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status } : s)));
      setSelected((prev) => (prev && prev.id === sessionId ? { ...prev, status } : prev));
    } catch (err) {
      console.error('Failed to update session status', err);
      alert('Failed to update session.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-skillswap-dark">Calendar</h1>
            <p className="text-sm text-skillswap-600">Manage your learning and teaching sessions</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md bg-white p-1 shadow-sm">
              <Button variant="outline">Month</Button>
              <Button className="bg-skillswap-500 text-white">Week</Button>
              <Button variant="outline">Day</Button>
            </div>
            <Button className="bg-skillswap-500 text-white" onClick={() => setScheduleOpen(true)}>
              Schedule Session
            </Button>
          </div>
        </div>

        {pageError ? (
          <Card className="p-4 mb-6 border-2 border-dashed border-skillswap-200 bg-white">
            <p className="font-semibold text-skillswap-dark">Calendar is not ready</p>
            <p className="text-sm text-skillswap-600 mt-1">{pageError}</p>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-3 space-y-4">
            <Card className="p-4">
              <Input placeholder="Search sessions or partners" />
            </Card>

            <Card className="p-4">
              <h3 className="font-medium">Upcoming</h3>
              {loadingSessions ? (
                <p className="text-sm text-skillswap-600">Loading...</p>
              ) : sessions.length === 0 ? (
                <div className="text-center py-6">
                  <p className="font-semibold">You don’t have any sessions yet.</p>
                  <p className="text-sm text-skillswap-600 mt-2">Schedule a session or explore skills to find partners.</p>
                  <div className="mt-4">
                    <Button onClick={() => router.push('/explore')}>Explore Skills</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 mt-3">
                  {sessions.slice(0, 5).map((s) => (
                    <div key={s.id} className="p-2 rounded-md bg-white/80 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Skill session</p>
                        <p className="text-xs text-skillswap-600">{new Date(s.scheduled_at || '').toLocaleString()}</p>
                      </div>
                      <Badge>{s.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="font-medium">Availability</h3>
              <p className="text-sm text-skillswap-600 mt-2">Manage weekly availability and buffer times.</p>
              <div className="mt-3">
                <AvailabilityOverlay />
              </div>
            </Card>
          </aside>

          <main className="lg:col-span-6">
            <Card className="p-4">
              {/* Render a Gantt-style calendar derived from sessions. Falls back to a small sample when no sessions. */}
              <GanttCalendar
                tasks={(() => {
                  if (!sessions || sessions.length === 0) {
                    return [
                      { id: 'sample-1', title: 'Design', start: '2026-01-05', end: '2026-01-14', progress: 60 },
                      { id: 'sample-2', title: 'Development', start: '2026-01-09', end: '2026-01-20', progress: 50 },
                    ];
                  }

                  return sessions.map((s) => {
                    const start = s.scheduled_at ? new Date(s.scheduled_at) : new Date();
                    const end = new Date(start.getTime() + ((s.duration_minutes ?? 60) * 60 * 1000));
                    const pad = (d: Date) => d.toISOString().slice(0, 10);
                    const progress = s.status === 'completed' ? 100 : s.status === 'ongoing' ? 50 : 0;
                    return {
                      id: s.id,
                      title: `Session — ${new Date(s.scheduled_at || '').toLocaleDateString()}`,
                      start: pad(start),
                      end: pad(end),
                      progress,
                    };
                  });
                })()}
                viewStart={sessions && sessions.length ? new Date(Math.min(...sessions.map((s) => new Date(s.scheduled_at || Date.now()).getTime()))).toISOString().slice(0, 10) : undefined}
                viewDays={21}
              />
            </Card>
          </main>

          <aside className="lg:col-span-3">
            <EventDetailDrawer
              session={selected}
              onClose={() => setSelected(null)}
              onJoin={() => router.push('/dashboard/messages')}
              onCancel={(s) => updateSessionStatus(s.id, 'cancelled')}
              onMarkCompleted={(s) => updateSessionStatus(s.id, 'completed')}
              onReschedule={(s) => {
                setSelected(s);
                setScheduleOpen(true);
                setPartnerId(s.user_a_id === user?.id ? s.user_b_id : s.user_a_id);
                setMySkillId(s.skill_a_id);
                setPartnerSkillId(s.skill_b_id);
                setDurationMinutes(s.duration_minutes ?? 60);
                setNotes(s.notes ?? '');
                setScheduledAtLocal(s.scheduled_at ? new Date(s.scheduled_at).toISOString().slice(0, 16) : '');
              }}
            />
          </aside>
        </div>
      </div>

      <Dialog
        open={scheduleOpen}
        onOpenChange={(open) => {
          setScheduleOpen(open);
          if (!open) resetScheduleForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule session</DialogTitle>
            <DialogDescription>
              Pick a connection, choose what each person teaches, and set the time.
            </DialogDescription>
          </DialogHeader>

          {connections.length === 0 ? (
            <Card className="p-4 bg-white border border-skillswap-100">
              <p className="font-semibold text-skillswap-dark">No connections yet</p>
              <p className="text-sm text-skillswap-600 mt-1">
                Accept a connection request or explore skills to connect with someone.
              </p>
              <div className="mt-3">
                <Button onClick={() => router.push('/explore')} className="bg-skillswap-500 text-white">
                  Explore Skills
                </Button>
              </div>
            </Card>
          ) : null}

          <div className="space-y-4">
            <div>
              <Label>Partner</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name || 'Member'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>You will teach</Label>
                <Select value={mySkillId} onValueChange={setMySkillId}>
                  <SelectTrigger>
                    <SelectValue placeholder={myTeachSkills.length ? 'Select your skill' : 'Add a teaching skill first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {myTeachSkills.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Partner will teach</Label>
                <Select value={partnerSkillId} onValueChange={setPartnerSkillId} disabled={!partnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={!partnerId ? 'Select a partner first' : partnerTeachSkills.length ? 'Select partner skill' : 'Partner has no teaching skills'} />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerTeachSkills.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Date & time</Label>
                <Input type="datetime-local" value={scheduledAtLocal} onChange={(e) => setScheduledAtLocal(e.target.value)} />
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min={15}
                  max={240}
                  step={15}
                  value={Number.isFinite(durationMinutes) ? String(durationMinutes) : '60'}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add an agenda, async tasks/resources, or paste an external call link (Zoom/Meet)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={savingSchedule}>
              Cancel
            </Button>
            <Button
              className="bg-skillswap-500 text-white"
              onClick={submitSchedule}
              disabled={savingSchedule || connections.length === 0}
            >
              {savingSchedule ? 'Scheduling…' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

