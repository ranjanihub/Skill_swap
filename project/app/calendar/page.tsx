'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Menu,
  Plus,
  Search,
  HelpCircle,
  Settings,
  Grid3X3,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  Skill,
  SkillSwapSession,
  supabase,
  supabaseConfigError,
  UserProfile,
} from '@/lib/supabase';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

import EventDetailDrawer from '@/components/calendar/EventDetailDrawer';
import AppShell, { type ShellNavItem } from '@/components/app-shell';
import { Home as HomeIcon, Users, Calendar, Bell, Briefcase, MessageSquare, Compass, UserCircle } from 'lucide-react';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function shortWeekdays() {
  // Google Calendar style (Sun first)
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
}

function buildMonthGrid(viewMonth: Date) {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay()); // back to Sunday
  gridStart.setHours(0, 0, 0, 0);

  return Array.from({ length: 42 }).map((_, idx) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + idx);
    return d;
  });
}

function sessionTitle(s: SkillSwapSession) {
  // Keep simple label (Google Calendar-like chips)
  if (s.status === 'completed') return 'Completed session';
  if (s.status === 'ongoing') return 'Ongoing session';
  if (s.status === 'cancelled') return 'Cancelled session';
  return 'Skill swap session';
}

function sessionChipClass(s: SkillSwapSession) {
  // Use existing palette primitives only
  switch (s.status) {
    case 'completed':
      return 'bg-skillswap-700 text-white';
    case 'ongoing':
      return 'bg-skillswap-600 text-white';
    case 'cancelled':
      return 'bg-skillswap-200 text-skillswap-700';
    default:
      return 'bg-skillswap-500 text-white';
  }
}

function toDateTimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function parseScheduleInputToDate(value: string) {
  const v = value.trim();
  if (!v) return null;

  // HTML datetime-local value: YYYY-MM-DDTHH:MM
  const isoLocal = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (isoLocal) {
    const [, y, m, d, hh, min] = isoLocal;
    const dt = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(min),
      0,
      0
    );
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // Fallback for some locale manual-typed formats shown in the UI:
  // DD-MM-YYYY HH:MM AM/PM (also supports / separators)
  const dmYAmPm = v.match(/^([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})\s+([0-2]?\d):(\d{2})\s*(AM|PM)$/i);
  if (dmYAmPm) {
    const [, dd, mm, yyyy, hRaw, min, ap] = dmYAmPm;
    let hours = Number(hRaw);
    const upper = ap.toUpperCase();
    if (upper === 'PM' && hours < 12) hours += 12;
    if (upper === 'AM' && hours === 12) hours = 0;
    const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hours, Number(min), 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatScheduleError(err: unknown) {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const anyErr = err as any;
    const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean);
    if (parts.length) return parts.join(' — ');
  }
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

export default function CalendarStandalonePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const publicNav: ShellNavItem[] = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/explore', label: 'Explore Skills', icon: Compass },
  ];

  const today = useMemo(() => startOfDay(new Date()), []);

  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [miniMonth, setMiniMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const [sessions, setSessions] = useState<SkillSwapSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState('');

  const [selectedSession, setSelectedSession] = useState<SkillSwapSession | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Create (schedule) dialog state (reuses existing logic)
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [rescheduleSessionId, setRescheduleSessionId] = useState<string | null>(null);

  const [connections, setConnections] = useState<Array<Pick<UserProfile, 'id' | 'full_name'>>>([]);
  const [myTeachSkills, setMyTeachSkills] = useState<Skill[]>([]);
  const [partnerTeachSkills, setPartnerTeachSkills] = useState<Skill[]>([]);

  const [partnerId, setPartnerId] = useState('');
  const [mySkillId, setMySkillId] = useState('');
  const [partnerSkillId, setPartnerSkillId] = useState('');
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [notes, setNotes] = useState('');

  const [skillNameById, setSkillNameById] = useState<Record<string, string>>({});

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

    if (!isSupabaseConfigured) {
      setError(supabaseConfigError ?? 'Supabase is not configured');
      setLoadingSessions(false);
      return;
    }

    const run = async () => {
      setLoadingSessions(true);
      setError('');
      try {
        const { data } = await supabase
          .from('skill_swap_sessions')
          .select('*')
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .order('scheduled_at', { ascending: true });
        // only show sessions that are scheduled
        setSessions(((data || []) as SkillSwapSession[]).filter((s) => s.status === 'scheduled'));
      } catch (e) {
        console.warn('Failed to load sessions', e);
        setSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    };

    void run();
  }, [authLoading, user]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const ids = Array.from(
      new Set(
        sessions
          .flatMap((s) => [s.skill_a_id, s.skill_b_id])
          .filter((x): x is string => Boolean(x))
      )
    ).slice(0, 400);

    if (ids.length === 0) {
      setSkillNameById({});
      return;
    }

    const run = async () => {
      try {
        const { data, error: skillsErr } = await supabase.from('skills').select('id, name').in('id', ids);
        if (skillsErr) throw skillsErr;
        const map: Record<string, string> = {};
        (data || []).forEach((r: any) => {
          map[r.id] = r.name;
        });
        setSkillNameById(map);
      } catch (e) {
        // Keep UI functional even if skills lookup fails
        console.warn('Failed to load skill names', e);
      }
    };

    void run();
  }, [sessions]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isSupabaseConfigured) return;

    const run = async () => {
      try {
        const { data: reqData } = await supabase
          .from('connection_requests')
          .select('*')
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .eq('status', 'accepted')
          .limit(200);

        const ids = new Set<string>();
        (reqData || []).forEach((r: any) => {
          const other = r.requester_id === user.id ? r.recipient_id : r.requester_id;
          if (other && other !== user.id) ids.add(other);
        });

        const otherIds = Array.from(ids);
        if (otherIds.length === 0) {
          setConnections([]);
        } else {
          const { data: profileData } = await supabase.from('user_profiles').select('id, full_name').in('id', otherIds);
          setConnections((profileData || []) as any);
        }

        const { data: mySkills } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', user.id)
          .eq('skill_type', 'teach')
          .order('created_at', { ascending: false })
          .limit(200);
        setMyTeachSkills((mySkills || []) as Skill[]);
      } catch (e) {
        console.error('Failed to load prerequisites', e);
      }
    };

    void run();
  }, [authLoading, user]);

  useEffect(() => {
    if (user && partnerId === user.id) {
      // Guard against accidental self-selection (DB constraint different_users)
      setPartnerId('');
      setPartnerTeachSkills([]);
      setPartnerSkillId('');
      return;
    }
    if (!partnerId) {
      setPartnerTeachSkills([]);
      setPartnerSkillId('');
      return;
    }
    if (!isSupabaseConfigured) return;

    const run = async () => {
      try {
        const { data } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', partnerId)
          .eq('skill_type', 'teach')
          .order('created_at', { ascending: false })
          .limit(200);
        setPartnerTeachSkills((data || []) as Skill[]);
      } catch (e) {
        console.error('Failed to load partner skills', e);
        setPartnerTeachSkills([]);
      }
    };

    void run();
  }, [partnerId]);

  const resetScheduleForm = () => {
    setRescheduleSessionId(null);
    setPartnerId('');
    setMySkillId('');
    setPartnerSkillId('');
    setScheduledAtLocal('');
    setDurationMinutes(60);
    setNotes('');
  };

  const updateSessionStatus = async (sessionId: string, status: SkillSwapSession['status']) => {
    if (!isSupabaseConfigured) {
      alert(supabaseConfigError ?? 'Supabase is not configured');
      return;
    }
    try {
      const { error: updErr } = await supabase.from('skill_swap_sessions').update({ status }).eq('id', sessionId);
      if (updErr) throw updErr;
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status } : s)));
      setSelectedSession((prev) => (prev && prev.id === sessionId ? { ...prev, status } : prev));
    } catch (e) {
      console.error('Failed to update session status', e);
      alert('Failed to update session.');
    }
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

    if (partnerId === user.id) {
      alert('Please select a different partner (you cannot schedule with yourself).');
      return;
    }

    const parsed = parseScheduleInputToDate(scheduledAtLocal);
    if (!parsed) {
      alert('Please enter a valid date/time.');
      return;
    }
    const scheduledAtIso = parsed.toISOString();

    setSavingSchedule(true);
    try {
      if (rescheduleSessionId) {
        const original = sessions.find((s) => s.id === rescheduleSessionId);
        if (!original) throw new Error('Session not found');
        const { data, error: updErr } = await supabase
          .from('skill_swap_sessions')
          .update({
            // Keep participants stable (avoids RLS failures + accidental ownership changes)
            user_a_id: original.user_a_id,
            user_b_id: original.user_b_id,
            // Allow adjusting skills while keeping participants unchanged
            skill_a_id: mySkillId,
            skill_b_id: partnerSkillId,
            status: 'scheduled',
            scheduled_at: scheduledAtIso,
            duration_minutes: durationMinutes || 60,
            notes: notes.trim() ? notes.trim() : null,
          })
          .eq('id', rescheduleSessionId)
          .select('*')
          .single();
        if (updErr) throw updErr;

        setSessions((prev) => {
          const next = prev.map((s) => (s.id === rescheduleSessionId ? (data as SkillSwapSession) : s));
          next.sort((a, b) => {
            const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
            const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
            return ta - tb;
          });
          return next;
        });

        setSelectedSession((prev) => (prev && prev.id === rescheduleSessionId ? (data as SkillSwapSession) : prev));
      } else {
        const { data, error: insertErr } = await supabase
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
        if (insertErr) throw insertErr;

        setSessions((prev) => {
          const next = [data as SkillSwapSession, ...prev];
          next.sort((a, b) => {
            const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
            const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
            return ta - tb;
          });
          return next;
        });
      }

      setScheduleOpen(false);
      resetScheduleForm();
    } catch (e) {
      console.error('Failed to schedule', e);
      alert(`Failed to schedule session: ${formatScheduleError(e)}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const monthDays = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const miniDays = useMemo(() => buildMonthGrid(miniMonth), [miniMonth]);

  const sessionsByDate = useMemo(() => {
    const map: Record<string, SkillSwapSession[]> = {};
    sessions.forEach((s) => {
      if (!s.scheduled_at) return;
      const d = startOfDay(new Date(s.scheduled_at));
      const key = d.toISOString().slice(0, 10);
      map[key] = map[key] || [];
      map[key].push(s);
    });
    Object.values(map).forEach((arr) => {
      arr.sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return ta - tb;
      });
    });
    return map;
  }, [sessions]);

  const goToday = () => {
    const m = new Date(today.getFullYear(), today.getMonth(), 1);
    setViewMonth(m);
    setMiniMonth(m);
  };

  const prevMonth = () => {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const titleForSession = (s: SkillSwapSession) => {
    const a = s.skill_a_id ? skillNameById[s.skill_a_id] : '';
    const b = s.skill_b_id ? skillNameById[s.skill_b_id] : '';
    const parts = [a, b].filter(Boolean);
    if (parts.length) return parts.join(' • ');
    return sessionTitle(s);
  };

  const openCreateForDate = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    setRescheduleSessionId(null);
    setScheduledAtLocal(`${yyyy}-${mm}-${dd}T09:00`);
    setScheduleOpen(true);
  };

  const prevMini = () => setMiniMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMini = () => setMiniMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <AppShell
      showSidebar={false}
      nav={publicNav}
      bottomNav={[
        { href: '/', label: 'Home', icon: HomeIcon },
        { href: '/network', label: 'My Network', icon: Users },
        { href: '/calendar', label: 'Calender', icon: Calendar },
        { href: '/notifications', label: 'Notification', icon: Bell },
        { href: '/profile', label: 'Profile', icon: UserCircle },
      ]}
      headerLeft={
        <div className="h-full px-3 sm:px-4 flex items-center gap-3">
          <button type="button" className="h-10 w-10 rounded-full hover:bg-skillswap-50 flex items-center justify-center" aria-label="Menu">
            <Menu className="h-5 w-5 text-skillswap-700" />
          </button>

          <div className="flex items-center gap-2 min-w-[180px]">
            <div className="h-10 w-10 rounded-xl bg-skillswap-50 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-skillswap-600" />
            </div>
            <div className="text-xl font-medium text-skillswap-800">Calendar</div>
          </div>

          <div className="hidden sm:flex items-center gap-2 ml-2">
            <Button variant="outline" className="rounded-full" onClick={goToday}>
              Today
            </Button>
            <button
              type="button"
              className="h-9 w-9 rounded-full hover:bg-skillswap-50 flex items-center justify-center"
              aria-label="Previous month"
              onClick={prevMonth}
            >
              <ChevronLeft className="h-5 w-5 text-skillswap-700" />
            </button>
            <button
              type="button"
              className="h-9 w-9 rounded-full hover:bg-skillswap-50 flex items-center justify-center"
              aria-label="Next month"
              onClick={nextMonth}
            >
              <ChevronRight className="h-5 w-5 text-skillswap-700" />
            </button>
          </div>

          <div className="ml-1 sm:ml-4 text-xl font-medium text-skillswap-800 truncate">
            {monthLabel(viewMonth)}
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button type="button" className="h-10 w-10 rounded-full hover:bg-skillswap-50 flex items-center justify-center" aria-label="Search">
              <Search className="h-5 w-5 text-skillswap-700" />
            </button>
            <button type="button" className="h-10 w-10 rounded-full hover:bg-skillswap-50 flex items-center justify-center" aria-label="Help">
              <HelpCircle className="h-5 w-5 text-skillswap-700" />
            </button>
            <button type="button" className="h-10 w-10 rounded-full hover:bg-skillswap-50 flex items-center justify-center" aria-label="Settings">
              <Settings className="h-5 w-5 text-skillswap-700" />
            </button>

            <div className="hidden md:flex items-center">
              <button
                type="button"
                className="h-10 px-4 rounded-full border border-skillswap-200 bg-white text-sm text-skillswap-800 flex items-center gap-2"
                aria-label="View"
              >
                Month
                <ChevronDown className="h-4 w-4 text-skillswap-600" />
              </button>

              <div className="ml-2 inline-flex rounded-full border border-skillswap-200 overflow-hidden">
                <button type="button" className="h-10 w-10 bg-skillswap-50 flex items-center justify-center" aria-label="Calendar view">
                  <CalendarDays className="h-5 w-5 text-skillswap-700" />
                </button>
                <button type="button" className="h-10 w-10 bg-white flex items-center justify-center" aria-label="Tasks view">
                  <CheckCircle2 className="h-5 w-5 text-skillswap-700" />
                </button>
              </div>

              <button type="button" className="ml-2 h-10 w-10 rounded-full hover:bg-skillswap-50 flex items-center justify-center" aria-label="Apps">
                <Grid3X3 className="h-5 w-5 text-skillswap-700" />
              </button>
            </div>
          </div>
        </div>
      }
    >

      <div className="flex">
        {/* Left sidebar */}
        <aside className="hidden lg:block w-[320px] border-r border-skillswap-200 bg-white">
          <div className="p-4">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-[180px] rounded-2xl justify-start gap-3 shadow-sm"
              onClick={() => setScheduleOpen(true)}
            >
              <Plus className="h-5 w-5" />
              Create
              <ChevronDown className="h-4 w-4 ml-auto text-skillswap-500" />
            </Button>
          </div>

          <div className="px-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-skillswap-800">{monthLabel(miniMonth)}</div>
              <div className="flex items-center gap-1">
                <button type="button" className="h-8 w-8 rounded-full hover:bg-skillswap-50 flex items-center justify-center" onClick={prevMini} aria-label="Previous">
                  <ChevronLeft className="h-4 w-4 text-skillswap-700" />
                </button>
                <button type="button" className="h-8 w-8 rounded-full hover:bg-skillswap-50 flex items-center justify-center" onClick={nextMini} aria-label="Next">
                  <ChevronRight className="h-4 w-4 text-skillswap-700" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-[10px] text-skillswap-500 mb-2">
              {shortWeekdays().map((w) => (
                <div key={w} className="text-center py-1">
                  {w[0]}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {miniDays.map((d, idx) => {
                const inMonth = d.getMonth() === miniMonth.getMonth();
                const isToday = sameDay(d, today);
                return (
                  <button
                    key={idx}
                    type="button"
                    className={
                      'h-8 w-8 rounded-full text-xs flex items-center justify-center ' +
                      (isToday
                        ? 'bg-skillswap-500 text-white'
                        : inMonth
                          ? 'text-skillswap-800 hover:bg-skillswap-50'
                          : 'text-skillswap-400 hover:bg-skillswap-50')
                    }
                    onClick={() => {
                      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                    }}
                    aria-label={d.toDateString()}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="relative">
              <Input className="h-11 pl-11 bg-skillswap-50 border-skillswap-200" placeholder="Search for people" />
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-skillswap-500" />
            </div>
          </div>

          <div className="px-4 pb-3 text-sm text-skillswap-700 font-medium flex items-center justify-between">
            Booking pages
            <button type="button" className="h-8 w-8 rounded-full hover:bg-skillswap-50 flex items-center justify-center" aria-label="Add booking page">
              <Plus className="h-4 w-4 text-skillswap-600" />
            </button>
          </div>

          <div className="px-4 pb-2 text-sm text-skillswap-700 font-medium flex items-center justify-between">
            My calendars
            <button type="button" className="h-8 w-8 rounded-full hover:bg-skillswap-50 flex items-center justify-center" aria-label="Toggle calendars">
              <ChevronDown className="h-4 w-4 text-skillswap-600" />
            </button>
          </div>

          <div className="px-4 pb-6 space-y-3">
            {[{ name: 'Ranjani', checked: true }, { name: 'Birthdays', checked: true }, { name: 'Tasks', checked: true }].map((row) => (
              <label key={row.name} className="flex items-center gap-3 text-sm text-skillswap-700 select-none">
                <input type="checkbox" defaultChecked={row.checked} className="h-4 w-4 accent-skillswap-500" />
                {row.name}
              </label>
            ))}
          </div>
        </aside>

        {/* Main month view */}
        <main className="flex-1 bg-background">
          <div className="p-4 lg:p-6">
            {error ? (
              <Card className="p-4 mb-4 border border-destructive/30 bg-destructive/10">
                <p className="text-sm text-destructive">{error}</p>
              </Card>
            ) : null}

            {loadingSessions ? (
              <div className="py-10 text-center text-sm text-skillswap-600">Loading…</div>
            ) : (
              <div className="rounded-2xl bg-white border border-skillswap-200 overflow-hidden">
                <div className="grid grid-cols-7 border-b border-skillswap-200">
                  {shortWeekdays().map((w) => (
                    <div key={w} className="py-2 text-center text-xs font-medium text-skillswap-600">
                      {w}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {monthDays.map((d, idx) => {
                    const inMonth = d.getMonth() === viewMonth.getMonth();
                    const isToday = sameDay(d, today);
                    const key = startOfDay(d).toISOString().slice(0, 10);
                    const daySessions = sessionsByDate[key] || [];

                    return (
                      <div
                        key={idx}
                        className={
                          'min-h-[112px] border-b border-r border-skillswap-200 p-2 ' +
                          (inMonth ? 'bg-white' : 'bg-skillswap-50')
                        }
                      >
                        <div className="flex items-start justify-between">
                          <button
                            type="button"
                            onClick={() => openCreateForDate(d)}
                            className={
                              'h-7 w-7 rounded-full flex items-center justify-center text-sm hover:bg-skillswap-50 ' +
                              (isToday
                                ? 'bg-skillswap-500 text-white hover:bg-skillswap-500'
                                : inMonth
                                  ? 'text-skillswap-800'
                                  : 'text-skillswap-500')
                            }
                            aria-label={`Create event on ${d.toDateString()}`}
                            title="Create"
                          >
                            {d.getDate()}
                          </button>
                        </div>

                        <div className="mt-2 space-y-1">
                          {daySessions.slice(0, 3).map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={
                                'w-full text-left text-[11px] leading-4 rounded px-2 py-1 truncate ' +
                                sessionChipClass(s)
                              }
                              onClick={() => {
                                setSelectedSession(s);
                                setDetailsOpen(true);
                              }}
                            >
                              {titleForSession(s)}
                            </button>
                          ))}
                          {daySessions.length > 3 ? (
                            <div className="text-[11px] text-skillswap-600">+{daySessions.length - 3} more</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </main>
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
            <DialogTitle>Create</DialogTitle>
            <DialogDescription>Schedule a skill swap session.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Partner</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections
                    .filter((c) => c.id !== user?.id)
                    .map((c) => (
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
                    <SelectValue
                      placeholder={myTeachSkills.length ? 'Select your skill' : 'Add a teaching skill first'}
                    />
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
                    <SelectValue
                      placeholder={
                        !partnerId
                          ? 'Select a partner first'
                          : partnerTeachSkills.length
                            ? 'Select partner skill'
                            : 'Partner has no teaching skills'
                      }
                    />
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
                <Input
                  type="datetime-local"
                  value={scheduledAtLocal}
                  onChange={(e) => setScheduledAtLocal(e.target.value)}
                />
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
                placeholder="Add details"
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
              {savingSchedule ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setSelectedSession(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Event details</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <EventDetailDrawer
            session={selectedSession}
            onClose={() => {
              setDetailsOpen(false);
              setSelectedSession(null);
            }}
            onJoin={() => router.push('/messages')}
            onCancel={(s) => updateSessionStatus(s.id, 'cancelled')}
            onMarkCompleted={(s) => updateSessionStatus(s.id, 'completed')}
            onReschedule={(s) => {
              setDetailsOpen(false);
              setSelectedSession(s);
              setRescheduleSessionId(s.id);
              setScheduleOpen(true);

              const meIsA = s.user_a_id === user?.id;
              setPartnerId(meIsA ? s.user_b_id : s.user_a_id);
              setMySkillId(meIsA ? s.skill_a_id : s.skill_b_id);
              setPartnerSkillId(meIsA ? s.skill_b_id : s.skill_a_id);
              setDurationMinutes(s.duration_minutes ?? 60);
              setNotes(s.notes ?? '');
              setScheduledAtLocal(s.scheduled_at ? toDateTimeLocalValue(new Date(s.scheduled_at)) : '');
            }}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
