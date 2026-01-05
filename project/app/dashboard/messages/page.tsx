"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Conversation,
  Message,
  Skill,
  SkillSwapSession,
  UserProfile,
} from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
import { useRouter } from 'next/navigation';

type ConvWithMeta = Conversation & {
  other?: Pick<UserProfile, 'id' | 'full_name'>;
  lastMessage?: Message | null;
};

function IconProfile(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20c0-3.313 2.687-6 6-6h4c3.313 0 6 2.687 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCalendar(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 3v4M8 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCall(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8.5 6.5h7A2.5 2.5 0 0 1 18 9v6a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 15V9a2.5 2.5 0 0 1 2.5-2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M18 10.2l2.2-1.3a1 1 0 0 1 1.5.86v4.5a1 1 0 0 1-1.5.86L18 13.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState<ConvWithMeta[]>([]);
  const [activeConv, setActiveConv] = useState<ConvWithMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  // Schedule/reschedule from chat
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [existingNextSession, setExistingNextSession] = useState<SkillSwapSession | null>(null);
  const [myTeachSkills, setMyTeachSkills] = useState<Skill[]>([]);
  const [partnerTeachSkills, setPartnerTeachSkills] = useState<Skill[]>([]);

  const [mySkillId, setMySkillId] = useState('');
  const [partnerSkillId, setPartnerSkillId] = useState('');
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [notes, setNotes] = useState('');

  // External call link sharing (Google Meet)
  const [callOpen, setCallOpen] = useState(false);
  const [callLink, setCallLink] = useState('');
  const [sendingCallLink, setSendingCallLink] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    if (!isSupabaseConfigured) return;

    const run = async () => {
      setLoading(true);
      try {
        const { data: convs } = await supabase
          .from('conversations')
          .select('*')
          .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
          .order('created_at', { ascending: false });

        const rows: Conversation[] = (convs || []) as Conversation[];
        const otherIds = rows.map((c) => (c.participant_a === user.id ? c.participant_b : c.participant_a));

        const { data: profiles } = await supabase.from('user_profiles').select('id, full_name').in('id', otherIds.slice(0, 200));
        const byId: Record<string, any> = {};
        (profiles || []).forEach((p: any) => (byId[p.id] = p));

        // fetch last messages for conversations in a single query
        const convIds = rows.map((r) => r.id);
        const { data: messagesData } = await supabase
          .from('messages')
          .select('*')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(500);

        const lastByConv: Record<string, Message> = {};
        (messagesData || []).forEach((m: any) => {
          if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
        });

        const enriched = rows.map((r) => ({ ...r, other: byId[r.participant_a === user.id ? r.participant_b : r.participant_a], lastMessage: lastByConv[r.id] ?? null }));

        setConversations(enriched);
        if (enriched.length > 0) setActiveConv(enriched[0]);
      } catch (err) {
        console.error('Failed to load conversations', err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!activeConv || !user) return;
    let cancelled = false;
    const run = async () => {
      try {
        const { data } = await supabase.from('messages').select('*').eq('conversation_id', activeConv.id).order('created_at', { ascending: true }).limit(200);
        if (!cancelled) setMessages((data || []) as Message[]);
        // scroll to bottom after loading
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeConv, user]);

  const otherUserId = useMemo(() => {
    if (!activeConv || !user) return null;
    return activeConv.participant_a === user.id ? activeConv.participant_b : activeConv.participant_a;
  }, [activeConv, user]);

  useEffect(() => {
    if (!scheduleOpen) return;
    if (!user || !otherUserId) return;
    if (!isSupabaseConfigured) return;

    const run = async () => {
      try {
        setExistingNextSession(null);

        const { data: mySkills, error: mySkillsErr } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', user.id)
          .eq('skill_type', 'teach')
          .order('created_at', { ascending: false })
          .limit(200);
        if (mySkillsErr) throw mySkillsErr;
        setMyTeachSkills((mySkills || []) as Skill[]);

        const { data: partnerSkills, error: partnerSkillsErr } = await supabase
          .from('skills')
          .select('*')
          .eq('user_id', otherUserId)
          .eq('skill_type', 'teach')
          .order('created_at', { ascending: false })
          .limit(200);
        if (partnerSkillsErr) throw partnerSkillsErr;
        setPartnerTeachSkills((partnerSkills || []) as Skill[]);

        const nowIso = new Date().toISOString();
        const { data: nextData, error: nextErr } = await supabase
          .from('skill_swap_sessions')
          .select('*')
          .or(
            `and(user_a_id.eq.${user.id},user_b_id.eq.${otherUserId}),and(user_a_id.eq.${otherUserId},user_b_id.eq.${user.id})`
          )
          .eq('status', 'scheduled')
          .gte('scheduled_at', nowIso)
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (nextErr) throw nextErr;
        const next = ((nextData || [])[0] as SkillSwapSession | undefined) ?? null;
        setExistingNextSession(next);

        if (next?.scheduled_at) {
          setScheduledAtLocal(new Date(next.scheduled_at).toISOString().slice(0, 16));
        } else {
          setScheduledAtLocal('');
        }
        setDurationMinutes(next?.duration_minutes ?? 60);
        setNotes(next?.notes ?? '');

        if (next) {
          const iAmA = next.user_a_id === user.id;
          setMySkillId(iAmA ? next.skill_a_id : next.skill_b_id);
          setPartnerSkillId(iAmA ? next.skill_b_id : next.skill_a_id);
        } else {
          setMySkillId('');
          setPartnerSkillId('');
        }
      } catch (err) {
        console.error('Failed to load scheduling data', err);
      }
    };

    void run();
  }, [scheduleOpen, user, otherUserId]);

  const resetScheduleForm = () => {
    setExistingNextSession(null);
    setMyTeachSkills([]);
    setPartnerTeachSkills([]);
    setMySkillId('');
    setPartnerSkillId('');
    setScheduledAtLocal('');
    setDurationMinutes(60);
    setNotes('');
  };

  const saveSchedule = async () => {
    if (!user || !otherUserId) return;
    if (!isSupabaseConfigured) {
      alert(supabaseConfigError ?? 'Supabase is not configured');
      return;
    }

    if (!mySkillId || !partnerSkillId || !scheduledAtLocal) {
      alert('Please select both skills and a date/time.');
      return;
    }

    const scheduledAtIso = new Date(scheduledAtLocal).toISOString();

    setSavingSchedule(true);
    try {
      if (existingNextSession) {
        const iAmA = existingNextSession.user_a_id === user.id;
        const patch = {
          scheduled_at: scheduledAtIso,
          duration_minutes: durationMinutes || 60,
          notes: notes.trim() ? notes.trim() : null,
          ...(iAmA
            ? { skill_a_id: mySkillId, skill_b_id: partnerSkillId }
            : { skill_a_id: partnerSkillId, skill_b_id: mySkillId }),
        };

        const { error } = await supabase
          .from('skill_swap_sessions')
          .update(patch)
          .eq('id', existingNextSession.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('skill_swap_sessions').insert({
          user_a_id: user.id,
          user_b_id: otherUserId,
          skill_a_id: mySkillId,
          skill_b_id: partnerSkillId,
          status: 'scheduled',
          scheduled_at: scheduledAtIso,
          duration_minutes: durationMinutes || 60,
          notes: notes.trim() ? notes.trim() : null,
        });
        if (error) throw error;
      }

      setScheduleOpen(false);
      resetScheduleForm();
    } catch (err) {
      console.error('Failed to save schedule', err);
      alert('Failed to save session. Make sure both users have teaching skills and migrations are applied.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const sendMessage = async () => {
    if (!activeConv || !user || !text.trim()) return;
    try {
      const { error, data } = await supabase.from('messages').insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        body: text.trim(),
      }).select().single();
      if (error) throw error;
      setMessages((m) => [...m, data]);
      setText('');
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  const openGoogleMeet = () => {
    // Uses meet.new which redirects to a new meeting for signed-in Google accounts.
    window.open('https://meet.new', '_blank', 'noopener,noreferrer');
  };

  const shareCallLink = async () => {
    if (!activeConv || !user) return;
    if (!isSupabaseConfigured) {
      alert(supabaseConfigError ?? 'Supabase is not configured');
      return;
    }
    const link = callLink.trim();
    if (!link) {
      alert('Paste a call link first.');
      return;
    }
    if (!/^https?:\/\//i.test(link)) {
      alert('Please use a full URL (starting with http:// or https://).');
      return;
    }

    setSendingCallLink(true);
    try {
      const body = `Call link: ${link}`;
      const { error, data } = await supabase
        .from('messages')
        .insert({ conversation_id: activeConv.id, sender_id: user.id, body })
        .select()
        .single();
      if (error) throw error;
      setMessages((m) => [...m, data]);
      setCallLink('');
      setCallOpen(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch (err) {
      console.error('Failed to share call link', err);
      alert('Failed to share call link.');
    } finally {
      setSendingCallLink(false);
    }
  };

  const activeStatus = useMemo(() => {
    if (!activeConv) return 'unknown';
    // simple heuristic: pending if no lastMessage, otherwise active
    if (!activeConv.lastMessage) return 'pending';
    return 'active';
  }, [activeConv]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-skillswap-600">Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-skillswap-dark">Messages</h1>
            <p className="text-sm text-skillswap-600">Chat with your learning and teaching connections</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">New Conversation</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <aside className="md:col-span-4 lg:col-span-3">
            <Card className="p-4 mb-4">
              <Input placeholder="Search conversations" />
            </Card>

            <div className="space-y-3">
              {conversations.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="font-semibold">You don’t have any conversations yet.</p>
                  <p className="text-sm text-skillswap-600 mt-2">Explore skills to start a conversation with someone.</p>
                  <div className="mt-4">
                    <Button onClick={() => router.push('/explore')}>Explore Skills</Button>
                  </div>
                </Card>
              ) : (
                conversations.map((c) => {
                  const last = c.lastMessage;
                  const unread = !!last && last.sender_id !== user?.id;
                  return (
                    <div key={c.id} onClick={() => setActiveConv(c)} className={`cursor-pointer p-3 rounded-lg flex items-center gap-3 ${activeConv?.id === c.id ? 'bg-white shadow-sm border border-skillswap-100' : 'bg-white/60 hover:bg-white'}`}>
                      <Avatar>
                        <AvatarImage src={undefined as any} alt={c.other?.full_name ?? 'Member'} />
                        <AvatarFallback>{(c.other?.full_name || 'M').slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{c.other?.full_name ?? 'Member'}</p>
                            <p className="text-xs text-skillswap-600 truncate">{last ? last.body : 'Skill exchange'}</p>
                          </div>
                          <div className="ml-2 text-right">
                            <p className="text-xs text-skillswap-600">{last ? new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                            {unread && <span className="inline-flex items-center justify-center mt-1 w-6 h-6 rounded-full bg-skillswap-500 text-white text-xs">•</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          <main className="md:col-span-8 lg:col-span-9 flex flex-col bg-transparent">
            {activeConv ? (
              <Card className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-skillswap-100">
                    <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={undefined as any} alt={activeConv.other?.full_name ?? 'Member'} />
                      <AvatarFallback>{(activeConv.other?.full_name || 'M').slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{activeConv.other?.full_name ?? 'Member'}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Skill exchange</Badge>
                        <Badge className="capitalize" variant={activeStatus === 'pending' ? 'secondary' : 'default'}>{activeStatus}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="p-2 rounded hover:bg-skillswap-50"
                      title="View profile"
                      onClick={() => router.push('/dashboard/public-view')}
                    >
                      <IconProfile className="w-5 h-5 text-skillswap-600" />
                    </button>
                    <button
                      className="p-2 rounded hover:bg-skillswap-50"
                      title="Start a call (Google Meet)"
                      onClick={() => setCallOpen(true)}
                    >
                      <IconCall className="w-5 h-5 text-skillswap-600" />
                    </button>
                    <button
                      className="p-2 rounded hover:bg-skillswap-50"
                      title="Schedule session"
                      onClick={() => setScheduleOpen(true)}
                    >
                      <IconCalendar className="w-5 h-5 text-skillswap-600" />
                    </button>
                  </div>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-white to-white/90">
                  {/* date separators could be added here */}
                  {messages.length === 0 ? (
                    <div className="text-center text-sm text-skillswap-600 mt-12">No messages yet — say hello 👋</div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`max-w-[70%] ${m.sender_id === user?.id ? 'ml-auto text-right' : 'mr-auto text-left'}`}>
                        <div className={`${m.sender_id === user?.id ? 'bg-skillswap-500 text-white' : 'bg-white shadow-sm'} inline-block px-4 py-2 rounded-2xl`}> 
                          <p className="text-sm">{m.body}</p>
                        </div>
                        <div className={`text-xs text-skillswap-600 mt-1 ${m.sender_id === user?.id ? 'text-right' : ''}`}>{new Date(m.created_at).toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-skillswap-100">
                  <div className="flex items-center gap-3">
                    <button className="p-2 rounded hover:bg-skillswap-50" title="Attach (coming soon)">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-skillswap-600"><path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l8.48-8.48a3 3 0 114.24 4.24L9.5 18.71a1 1 0 01-1.41-1.41l8.48-8.48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message..." />
                    <Button onClick={sendMessage} className="bg-skillswap-500 text-white">Send</Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-8">
                <p className="text-lg font-medium">Select a conversation to start chatting.</p>
                <p className="text-sm text-skillswap-600 mt-2">Your conversations will appear here when you have active or pending connections.</p>
              </Card>
            )}
          </main>
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
            <DialogTitle>{existingNextSession ? 'Reschedule session' : 'Schedule session'}</DialogTitle>
            <DialogDescription>
              {existingNextSession
                ? 'Update your next scheduled session with this person.'
                : 'Pick skills and set a time for your session.'}
            </DialogDescription>
          </DialogHeader>

          {!isSupabaseConfigured ? (
            <Card className="p-4 bg-white border border-skillswap-100">
              <p className="font-semibold text-skillswap-dark">Supabase not configured</p>
              <p className="text-sm text-skillswap-600 mt-1">{supabaseConfigError}</p>
            </Card>
          ) : null}

          {isSupabaseConfigured && (myTeachSkills.length === 0 || partnerTeachSkills.length === 0) ? (
            <Card className="p-4 bg-white border border-skillswap-100">
              <p className="font-semibold text-skillswap-dark">Skills required</p>
              <p className="text-sm text-skillswap-600 mt-1">
                Both you and your partner need at least one teaching skill to schedule a session.
              </p>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => router.push('/dashboard#skills')} className="bg-skillswap-500 text-white">
                  Add your skills
                </Button>
                <Button variant="outline" onClick={() => setScheduleOpen(false)}>
                  Close
                </Button>
              </div>
            </Card>
          ) : null}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>You will teach</Label>
                <Select value={mySkillId} onValueChange={setMySkillId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your teaching skill" />
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
                <Select value={partnerSkillId} onValueChange={setPartnerSkillId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select partner skill" />
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
                placeholder="Agenda, tasks, resources, or an external call link"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={savingSchedule}>
              Cancel
            </Button>
            <Button className="bg-skillswap-500 text-white" onClick={saveSchedule} disabled={savingSchedule || !isSupabaseConfigured}>
              {savingSchedule ? 'Saving…' : existingNextSession ? 'Update' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={callOpen}
        onOpenChange={(open) => {
          setCallOpen(open);
          if (!open) setCallLink('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect via Google Meet</DialogTitle>
            <DialogDescription>
              Start a Meet in a new tab, then paste the link here to share it in chat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button onClick={openGoogleMeet} className="bg-skillswap-500 text-white">
              Open meet.new
            </Button>

            <div>
              <Label>Meet link</Label>
              <Input
                value={callLink}
                onChange={(e) => setCallLink(e.target.value)}
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCallOpen(false)} disabled={sendingCallLink}>
              Close
            </Button>
            <Button className="bg-skillswap-500 text-white" onClick={shareCallLink} disabled={sendingCallLink || !isSupabaseConfigured}>
              {sendingCallLink ? 'Sending…' : 'Share link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
