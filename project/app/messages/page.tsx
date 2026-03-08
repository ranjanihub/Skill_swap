"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Home as HomeIcon,
  Users,
  Calendar,
  Bell,
  Briefcase,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Search,
  Star,
  ArrowLeft,
  Compass,
  UserCircle,
  Clipboard,
  Video,
  Paperclip,
  Mic,
  Send,
  Smile,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

import { useAuth } from '@/context/auth-context';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  Conversation,
  Message,
  UserProfile,
  Skill,
  SkillSwapSession,
  ConnectionRequest,
} from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

import AppShell, { type ShellNavItem } from '@/components/app-shell';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type ConvWithMeta = Conversation & {
  other?: Pick<UserProfile, 'id' | 'full_name'>;
  lastMessage?: Message | null;
  avatar_url?: string | null;
  isAcceptedConnection?: boolean;
};

const DESKTOP_TABS = ['Read', 'Unread', 'Starred'] as const;

type ChatPayload =
  | { _v: 1; type: 'text'; text: string }
  | { _v: 1; type: 'image'; url: string; name?: string | null; mime?: string | null; size?: number | null; caption?: string | null }
  | { _v: 1; type: 'file'; url: string; name: string; mime?: string | null; size?: number | null }
  | { _v: 1; type: 'voice'; url: string; mime?: string | null; durationSec?: number | null }
  | { _v: 1; type: 'notes'; title?: string | null; text: string }
  | { _v: 1; type: 'system'; text: string };

function tryParsePayload(raw: string): ChatPayload {
  const s = String(raw ?? '');
  const trimmed = s.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed._v === 1 && typeof parsed.type === 'string') return parsed as ChatPayload;
    } catch {
      // fall through
    }
  }
  return { _v: 1, type: 'text', text: s };
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatBytes(n?: number | null) {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : null;
  if (!v) return null;
  const kb = v / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function buildGoogleCalendarEventUrl(eventId: string) {
  return `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(eventId)}`;
}

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<ConvWithMeta[]>([]);
  const [settingsById, setSettingsById] = useState<Record<string, { avatar_url?: string | null }>>({});
  const [activeConv, setActiveConv] = useState<ConvWithMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<(typeof DESKTOP_TABS)[number]>('Unread');
  const [searchConvs, setSearchConvs] = useState('');
  const [starredMap, setStarredMap] = useState<Record<string, boolean>>({});
  const [muted, setMuted] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [otherTeachSkill, setOtherTeachSkill] = useState<Skill | null>(null);
  const [activeSession, setActiveSession] = useState<SkillSwapSession | null>(null);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean>(false);

  const [otherOnline, setOtherOnline] = useState<boolean>(false);
  const [readsByMessageId, setReadsByMessageId] = useState<Record<string, Set<string>>>({});

  const [showEmojiRow, setShowEmojiRow] = useState(false);
  const [composerMode, setComposerMode] = useState<'message' | 'notes'>('message');
  const [showSessionRequest, setShowSessionRequest] = useState(false);
  const [sessionNote, setSessionNote] = useState('');
  const [sessionDuration, setSessionDuration] = useState<number>(60);
  const [slotInput, setSlotInput] = useState('');
  const [proposedSlots, setProposedSlots] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);

  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number | null>(null);

  useEffect(() => {
    // load starred conversations from localStorage
    try {
      const raw = localStorage.getItem('starred_conversations');
      if (raw) setStarredMap(JSON.parse(raw));
    } catch (e) {
      // ignore
    }
    try {
      const m = localStorage.getItem('messages_muted');
      if (m) setMuted(m === '1');
    } catch (e) {
      // ignore
    }

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
      setLoading(true);
      setError('');
      try {
        const { data: convs, error: convErr } = await supabase
          .from('conversations')
          .select('*')
          .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
          .order('created_at', { ascending: false });
        if (convErr) throw convErr;

        const rows: Conversation[] = (convs || []) as Conversation[];
        const otherIds = rows.map((c) => (c.participant_a === user.id ? c.participant_b : c.participant_a));

        const { data: profiles, error: profErr } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', otherIds.slice(0, 200));
        if (profErr) throw profErr;

        const byId: Record<string, Pick<UserProfile, 'id' | 'full_name'>> = {};
        (profiles || []).forEach((p: any) => (byId[p.id] = p));

        // fetch avatars from user_settings
        const { data: settingsData } = await supabase
          .from('user_settings')
          .select('id, avatar_url')
          .in('id', otherIds.slice(0, 200));
        const settingsMap: Record<string, { avatar_url?: string | null }> = {};
        (settingsData || []).forEach((s: any) => (settingsMap[s.id] = { avatar_url: s.avatar_url }));
        setSettingsById(settingsMap);

        // fetch connection_requests for these participants to determine accepted status
        const userAndOthers = [user.id, ...otherIds].slice(0, 500);
        const { data: connReqs } = await supabase
          .from('connection_requests')
          .select('requester_id,recipient_id,status')
          .in('requester_id', userAndOthers)
          .in('recipient_id', userAndOthers);
        const acceptedSet = new Set<string>();
        (connReqs || []).forEach((r: any) => {
          if (r.status === 'accepted') {
            acceptedSet.add(`${r.requester_id}:${r.recipient_id}`);
            acceptedSet.add(`${r.recipient_id}:${r.requester_id}`);
          }
        });

        const convIds = rows.map((r) => r.id);
        const { data: messagesData, error: lastErr } = await supabase
          .from('messages')
          .select('*')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(500);
        if (lastErr) throw lastErr;

        const lastByConv: Record<string, Message> = {};
        (messagesData || []).forEach((m: any) => {
          if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
        });

        const enriched: ConvWithMeta[] = rows.map((r) => ({
          ...r,
          other: byId[r.participant_a === user.id ? r.participant_b : r.participant_a],
          lastMessage: lastByConv[r.id] ?? null,
          avatar_url: settingsMap[r.participant_a === user.id ? r.participant_b : r.participant_a]?.avatar_url ?? null,
          isAcceptedConnection:
            acceptedSet.has(`${user.id}:${r.participant_a === user.id ? r.participant_b : r.participant_a}`) ?? false,
        }));

        setConversations(enriched);
        if (enriched.length > 0) {
          setActiveConv(enriched[0]);
        } else {
          setActiveConv(null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load conversations';
        setError(msg);
        console.error('Failed to load conversations', err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user, router]);

  useEffect(() => {
    try {
      localStorage.setItem('starred_conversations', JSON.stringify(starredMap));
    } catch (e) {
      // ignore
    }
    try {
      localStorage.setItem('messages_muted', muted ? '1' : '0');
    } catch (e) {
      // ignore
    }
  }, [starredMap, muted]);

  useEffect(() => {
    if (!activeConv || !user) return;
    let cancelled = false;

    const run = async () => {
      try {
        const { data, error: msgErr } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', activeConv.id)
          .order('created_at', { ascending: true })
          .limit(250);
        if (msgErr) throw msgErr;
        if (!cancelled) setMessages((data || []) as Message[]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeConv, user]);

  // Load chat header metadata: partner teach skill, active session, calendar linkage, Google connection
  useEffect(() => {
    if (!activeConv || !user) {
      setOtherTeachSkill(null);
      setActiveSession(null);
      setCalendarEventId(null);
      setGoogleConnected(false);
      return;
    }
    if (!isSupabaseConfigured) return;

    const otherId = activeConv.participant_a === user.id ? activeConv.participant_b : activeConv.participant_a;
    let cancelled = false;

    const run = async () => {
      try {
        const [{ data: skillRow }, { data: sessionRows }, { data: gConn }] = await Promise.all([
          supabase
            .from('skills')
            .select('*')
            .eq('user_id', otherId)
            .eq('skill_type', 'teach')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('skill_swap_sessions')
            .select('*')
            .or(`and(user_a_id.eq.${user.id},user_b_id.eq.${otherId}),and(user_a_id.eq.${otherId},user_b_id.eq.${user.id})`)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase.from('google_calendar_connections').select('user_id').eq('user_id', user.id).maybeSingle(),
        ]);

        if (cancelled) return;
        setOtherTeachSkill((skillRow || null) as any);
        setGoogleConnected(Boolean(gConn));

        const sessions = (sessionRows || []) as SkillSwapSession[];
        const next = sessions.find((s) => s.status === 'ongoing') || sessions.find((s) => s.status === 'scheduled') || null;
        setActiveSession(next);

        if (next?.calendar_event_id) {
          setCalendarEventId(next.calendar_event_id);
        } else {
          setCalendarEventId(null);
        }
      } catch (err) {
        console.error('Failed to load header metadata', err);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeConv, user]);

  // Real-time subscriptions: conversations and messages
  useEffect(() => {
    if (!user) return;

    const convChannel = supabase
      .channel('public:conversations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, (payload) => {
        const row = payload.new as Conversation;
        const otherId = row.participant_a === user.id ? row.participant_b : row.participant_a;
        // fetch profile for other
        void (async () => {
          try {
            const { data: profile } = await supabase.from('user_profiles').select('id, full_name').eq('id', otherId).maybeSingle();
            const { data: settings } = await supabase.from('user_settings').select('id, avatar_url').eq('id', otherId).maybeSingle();
            // determine if this pair has an accepted connection
            const { data: reqs } = await supabase
              .from('connection_requests')
              .select('requester_id,recipient_id,status')
              .in('requester_id', [user.id, otherId])
              .in('recipient_id', [user.id, otherId]);
            let isAccepted = false;
            (reqs || []).forEach((r: any) => {
              if (r.status === 'accepted') isAccepted = true;
            });
            setConversations((prev) => [{ ...row, other: profile ?? { id: otherId, full_name: 'Member' }, lastMessage: null, avatar_url: settings?.avatar_url ?? null, isAcceptedConnection: isAccepted }, ...prev]);
          } catch (e) {
            console.error('Realtime conv fetch failed', e);
          }
        })();
      })
      .subscribe();

    const msgChannel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message;
        // if the message belongs to current active conversation, append it
        if (activeConv && m.conversation_id === activeConv.id) {
          setMessages((prev) => [...prev, m]);
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current?.scrollHeight ?? 0, behavior: 'smooth' }), 50);
        }
        // update lastMessage for the conversation in list
        setConversations((prev) => prev.map((c) => (c.id === m.conversation_id ? { ...c, lastMessage: m } : c)));
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(convChannel);
        supabase.removeChannel(msgChannel);
      } catch (e) {
        // ignore
      }
    };
  }, [user, activeConv]);

  const filteredConversations = useMemo(() => {
    const q = searchConvs.trim().toLowerCase();
    let list = conversations.slice();

    // apply tab filters
    if (activeTab === 'Unread') {
      list = list.filter((c) => c.lastMessage && c.lastMessage.sender_id !== user?.id);
    } else if (activeTab === 'Read') {
      list = list.filter((c) => !c.lastMessage || c.lastMessage.sender_id === user?.id);
    } else if (activeTab === 'Starred') {
      list = list.filter((c) => !!starredMap[c.id]);
    }

    if (!q) return list;
    return list.filter((c) => {
      const name = (c.other?.full_name || '').toLowerCase();
      const last = (c.lastMessage?.body || '').toLowerCase();
      return name.includes(q) || last.includes(q);
    });
  }, [conversations, searchConvs, activeTab, starredMap, user]);

  const selectConversation = (c: ConvWithMeta) => {
    setActiveConv(c);
    setMobileView('chat');
  };

  const otherUserId = useMemo(() => {
    if (!activeConv || !user) return null;
    return activeConv.participant_a === user.id ? activeConv.participant_b : activeConv.participant_a;
  }, [activeConv, user]);

  const sendMessage = async () => {
    if (!user || !text.trim()) return;

    // determine payload: try use existing conversation, otherwise fallback to otherUserId
    const payload: any = { sender_id: user.id, body: text.trim() };
    if (activeConv) {
      if (!activeConv.isAcceptedConnection) {
        setError('You can only send messages to accepted connections.');
        return;
      }
      payload.conversation_id = activeConv.id;
    } else if (otherUserId) {
      // no open conversation, but we know the other user id
      payload.recipient_id = otherUserId;
    } else {
      setError('No conversation or recipient specified');
      return;
    }

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Failed to send message');
        return;
      }

      const data = json?.message;
      if (data) {
        setMessages((prev) => [...prev, data as Message]);
        setText('');
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
        toast({ title: 'Message sent', variant: 'default' });
      }
    } catch (err) {
      console.error('Failed to send message', err);
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setError(msg);
      toast({ title: 'Error sending message', description: msg, variant: 'destructive' });
    }
  };
  const startGoogleCalendarConnect = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/google/oauth/start', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Failed to start Google OAuth');
      window.location.href = json.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start Google OAuth';
      setError(msg);
    }
  };

  const addToGoogleCalendar = async () => {
    if (!calendarEventId) return;
    window.open(buildGoogleCalendarEventUrl(calendarEventId), '_blank', 'noopener,noreferrer');
  };

  const openMeetInNewTab = (link: string) => {
    if (!link) return;
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const buildGoogleMeetLink = (base: string | null) => {
    if (!base) return '';
    return base.startsWith('http') ? base : `https://${base}`;
  };

  const renderMessageContent = (m: Message) => {
    let payload: ChatPayload = { _v: 1, type: 'text', text: m.body || '' };
    try {
      payload = tryParsePayload(m.body || '');
    } catch {}

    switch (payload.type) {
      case 'text':
        return <span>{payload.text}</span>;
      case 'image':
        return <img src={payload.url} alt={payload.name || ''} className="max-w-full rounded" />;
      case 'file':
        return (
          <a href={payload.url} target="_blank" rel="noopener noreferrer" className="text-skillswap-500 underline">
            {payload.name}
          </a>
        );
      case 'voice':
        return (
          <audio controls src={payload.url} className="max-w-full" />
        );
      case 'notes':
        return (
          <div>
            {payload.title && <p className="font-semibold">{payload.title}</p>}
            <p>{payload.text}</p>
          </div>
        );
      case 'system':
        return <em className="text-skillswap-500">{payload.text}</em>;
      default:
        return <span>{m.body}</span>;
    }
  };
  const publicNav: ShellNavItem[] = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/explore', label: 'Explore Skills', icon: Compass },
  ];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-skillswap-600">Loading messages...</p>
      </div>
    );
  }

  return (
    <AppShell
      showSidebar={false}
      nav={publicNav}
      bottomNav={[
        { href: '/', label: 'Home', icon: HomeIcon },
        { href: '/network', label: 'My Network', icon: Users },
        { href: '/calendar', label: 'Calender', icon: Calendar },
        { href: '/notifications', label: 'Notification', icon: Bell },
        { href: '/dashboard/settings', label: 'Settings', icon: UserCircle },
      ]}
      headerLeft={
        <div className="w-full flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            <Image src="/SkillSwap_Logo.jpg" alt="SkillSwap" width={40} height={40} className="object-cover" />
          </div>
          <div className="flex-1 min-w-0 flex justify-center">
            <div className="w-full max-w-2xl relative">
              <input
                aria-label="Search swaps"
                placeholder="Search Swaps"
                className="mobile-header-search pl-10 w-full"
                value={''}
                onChange={() => {}}
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-skillswap-400" />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              aria-label="Notifications"
              title="Notifications"
              onClick={() => router.push('/notifications')}
              className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm"
            >
              <Bell className="h-5 w-5 text-skillswap-600" />
            </button>
          </div>
        </div>
      }
    >
      <div className="w-full max-w-[1128px] mx-auto">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          {/* Left pane */}
          <section className={cn('lg:block', mobileView === 'chat' && 'hidden lg:block')}>
            <Card className="overflow-hidden">
              <div className="p-3 border-b border-skillswap-200 flex items-center justify-between">
                <h2 className="font-semibold text-skillswap-800">Messaging</h2>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center" aria-label="More">
                        <MoreHorizontal className="h-5 w-5 text-skillswap-600" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={async () => {
                          const ok = confirm('Clear all conversations including server data? This will permanently delete your chats. Continue?');
                          if (!ok) return;
                          try {
                            // delete conversations & messages associated with current user
                            if (user) {
                              const { data: convs, error: convErr } = await supabase
                                .from('conversations')
                                .select('id')
                                .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`);
                              if (!convErr && convs) {
                                const ids = convs.map((c: any) => c.id);
                                if (ids.length) {
                                  await supabase.from('messages').delete().in('conversation_id', ids);
                                  await supabase.from('conversations').delete().in('id', ids);
                                }
                              }
                            }
                          } catch (e) {
                            console.error('Failed to clear server chats', e);
                          }
                          setConversations([]);
                          setMessages([]);
                          setActiveConv(null);
                          setStarredMap({});
                          try {
                            localStorage.removeItem('starred_conversations');
                          } catch (e) {}
                        }}
                      >
                        Clear all chat
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setMuted((m) => {
                            const next = !m;
                            try {
                              localStorage.setItem('messages_muted', next ? '1' : '0');
                            } catch (e) {}
                            alert(next ? 'Chat muted' : 'Chat unmuted');
                            return next;
                          });
                        }}
                      >
                        {muted ? 'Unmute chat' : 'Mute chat'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center" aria-label="Compose">
                    <Pencil className="h-5 w-5 text-skillswap-600" />
                  </button>
                </div>
              </div>

              <div className="p-3 border-b border-skillswap-200">
                <div className="relative">
                  <Input
                    value={searchConvs}
                    onChange={(e) => setSearchConvs(e.target.value)}
                    placeholder="Search messages"
                    className="pl-9 h-9 bg-skillswap-50 border-skillswap-200"
                  />
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-skillswap-600" />
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {DESKTOP_TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setActiveTab(t)}
                      className={cn(
                        'h-8 px-3 rounded-full text-sm border',
                        activeTab === t
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-skillswap-700 border-skillswap-200'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                  {filteredConversations.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="font-medium text-skillswap-800">No conversations yet</p>
                    <p className="text-sm text-skillswap-600 mt-2">Explore skills to start a conversation.</p>
                    <div className="mt-4">
                      <Button onClick={() => router.push('/')} className="bg-skillswap-500 text-white">Explore Skills</Button>
                    </div>
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isActive = activeConv?.id === c.id;
                    const last = c.lastMessage;
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'w-full text-left px-3 py-3 border-b border-skillswap-100 hover:bg-skillswap-100/60 flex items-start gap-3',
                          isActive && 'bg-skillswap-100/60 border-l-4 border-emerald-700 pl-2'
                        )}
                        onClick={() => selectConversation(c)}
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={''} alt={c.other?.full_name ?? 'Member'} />
                          <AvatarFallback>{(c.other?.full_name || 'M').slice(0, 1)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm text-skillswap-800 truncate">
                              {c.other?.full_name ?? 'Member'}
                            </p>
                            <p className="text-xs text-skillswap-500 flex-shrink-0">
                              {last ? new Date(last.created_at).toLocaleDateString() : ''}
                            </p>
                          </div>
                          <p className="text-sm text-skillswap-600 truncate mt-1">
                            {last?.body || 'SkillSwap conversation'}
                          </p>
                        </div>

                        <div className="ml-2 flex-shrink-0 self-start">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStarredMap((s) => ({ ...s, [c.id]: !s[c.id] }));
                            }}
                            aria-label={starredMap[c.id] ? 'Unstar' : 'Star'}
                            title={starredMap[c.id] ? 'Unstar' : 'Star'}
                            className="h-8 w-8 rounded-full hover:bg-skillswap-100 flex items-center justify-center"
                          >
                            <Star className={cn('h-4 w-4', starredMap[c.id] ? 'text-amber-500' : 'text-skillswap-600')} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </section>

          {/* Center pane */}
          <section className={cn('lg:block', mobileView === 'list' && 'hidden lg:block')}>
            <Card className="h-[calc(100vh-130px)] flex flex-col overflow-hidden">
              {!activeConv ? (
                <div className="p-6">
                  <p className="text-lg font-medium text-skillswap-800">Select a conversation</p>
                  <p className="text-sm text-skillswap-600 mt-1">Your messages will appear here.</p>
                </div>
              ) : (
                <>
                  {/* Chat header (WhatsApp/IG-style) */}
                  <div className="p-3 border-b border-skillswap-200 bg-white flex items-center gap-3">
                    <div className="lg:hidden">
                      <button
                        type="button"
                        onClick={() => setMobileView('list')}
                        className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center"
                        aria-label="Back"
                      >
                        <ArrowLeft className="h-5 w-5 text-skillswap-700" />
                      </button>
                    </div>

                    <Avatar className="h-10 w-10">
                      <AvatarImage src={activeConv.avatar_url ?? ''} alt={activeConv.other?.full_name ?? 'Member'} />
                      <AvatarFallback>{(activeConv.other?.full_name || 'M').slice(0, 1)}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-sm text-skillswap-800 truncate">{activeConv.other?.full_name ?? 'Member'}</p>
                        <span className={cn('h-2 w-2 rounded-full flex-shrink-0', otherOnline ? 'bg-emerald-500' : 'bg-skillswap-300')} aria-hidden="true" />
                        <p className="text-xs text-skillswap-600 flex-shrink-0">{otherOnline ? 'Online' : 'Offline'}</p>
                      </div>
                      <p className="text-xs text-skillswap-600 truncate mt-0.5">
                        {otherTeachSkill?.name ? `Teaching: ${otherTeachSkill.name}` : 'SkillSwap chat'}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      className="bg-skillswap-500 text-white"
                      onClick={() => setShowSessionRequest((v) => !v)}
                      disabled={!activeConv.isAcceptedConnection}
                    >
                      Schedule Session
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center" aria-label="More">
                          <MoreHorizontal className="h-5 w-5 text-skillswap-600" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => {
                            if (!activeConv) return;
                            const ok = confirm('Clear messages for this conversation locally? This will not delete server data. Continue?');
                            if (!ok) return;
                            setMessages([]);
                            setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? { ...c, lastMessage: null } : c)));
                          }}
                        >
                          Clear conversation
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setMuted((m) => {
                              const next = !m;
                              try {
                                localStorage.setItem('messages_muted', next ? '1' : '0');
                              } catch (e) {}
                              alert(next ? 'Chat muted' : 'Chat unmuted');
                              return next;
                            });
                          }}
                        >
                          {muted ? 'Unmute chat' : 'Mute chat'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Session tools + request panel (inside chat) */}
                  <div className="border-b border-skillswap-100 bg-skillswap-50/60 p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowSessionRequest(true)}
                          disabled={!activeConv.isAcceptedConnection}
                        >
                          Request Session
                        </Button>

                        <Button
                          size="sm"
                          variant={composerMode === 'notes' ? 'default' : 'outline'}
                          className={composerMode === 'notes' ? 'bg-skillswap-500 text-white' : ''}
                          onClick={() => setComposerMode((m) => (m === 'notes' ? 'message' : 'notes'))}
                          disabled={!activeConv.isAcceptedConnection}
                        >
                          <Clipboard className="h-4 w-4 mr-2" />
                          Share notes
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!activeSession?.meet_link) {
                              // maybe open request meet modal; for now just alert
                              alert('No meet link yet');
                            } else {
                              openMeetInNewTab(activeSession.meet_link);
                            }
                          }}
                        >
                          <Video className="h-4 w-4 mr-2" />
                          {activeSession?.meet_link ? 'Join Meet' : 'Request Meet'}
                        </Button>
                      </div>
                      {googleConnected && (
                        <Button size="sm" variant="outline" onClick={addToGoogleCalendar} disabled={!calendarEventId}>
                          Add to calendar
                        </Button>
                      )}
                    </div>
                    {showSessionRequest && (
                      <div className="mt-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input
                            value={sessionNote}
                            onChange={(e) => setSessionNote(e.target.value)}
                            placeholder="Note (optional)"
                            className="flex-1"
                          />
                          <Input
                            value={sessionDuration.toString()}
                            onChange={(e) => setSessionDuration(Number(e.target.value) || 0)}
                            placeholder="Duration min"
                            type="number"
                            className="w-24"
                          />
                          <Input
                            value={slotInput}
                            onChange={(e) => setSlotInput(e.target.value)}
                            placeholder="Propose slots (comma separated)"
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              const slots = slotInput.split(',').map((s) => s.trim()).filter(Boolean);
                              setProposedSlots(slots);
                            }}
                          >
                            Set Slots
                          </Button>
                        </div>
                        {proposedSlots.length > 0 && (
                          <p className="mt-2 text-xs text-skillswap-600">Proposed: {proposedSlots.join(', ')}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 bg-white">
                    {messages.length === 0 ? (
                      <div className="text-sm text-skillswap-600 mt-8">No messages yet.</div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((m) => {
                          const mine = m.sender_id === user?.id;
                          return (
                            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                              <div className={cn('max-w-[75%] rounded-2xl px-4 py-2 text-sm', mine ? 'bg-skillswap-500 text-white' : 'bg-skillswap-100 text-skillswap-800')}>
                                {renderMessageContent(m)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t border-skillswap-200 bg-white">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Emoji"
                        onClick={() => setShowEmojiRow((v) => !v)}
                        className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center"
                      >
                        <Smile className="h-5 w-5 text-skillswap-600" />
                      </button>

                      <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={composerMode === 'notes' ? 'Write notes...' : 'Write a message...'}
                        className="flex-1 h-20 resize-none"
                        disabled={!activeConv.isAcceptedConnection}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void sendMessage();
                          }
                        }}
                      />

                      <button
                        type="button"
                        className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Attach file"
                      >
                        <Paperclip className="h-5 w-5 text-skillswap-600" />
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          // handle file upload (placeholder)
                          alert(`Selected file: ${file.name}`);
                        }}
                      />

                      <button
                        type="button"
                        className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center"
                        onClick={sendMessage}
                        disabled={!activeConv.isAcceptedConnection}
                        aria-label="Send"
                      >
                        <Send className="h-5 w-5 text-skillswap-600" />
                      </button>

                      <button
                        type="button"
                        className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center"
                        onClick={() => {
                          if (recording) {
                            // stop
                            recorderRef.current?.stop();
                          } else {
                            // start
                            navigator.mediaDevices
                              .getUserMedia({ audio: true })
                              .then((stream) => {
                                const recorder = new MediaRecorder(stream);
                                recorderRef.current = recorder;
                                recorder.ondataavailable = (e) => {
                                  recordChunksRef.current.push(e.data);
                                };
                                recorder.onstop = () => {
                                  const blob = new Blob(recordChunksRef.current);
                                  // placeholder for upload
                                  alert('Recorded ' + blob.size + ' bytes');
                                  recordChunksRef.current = [];
                                };
                                recorder.start();
                                setRecording(true);
                              })
                              .catch((err) => console.error('Record failed', err));
                          }
                        }}
                        aria-label="Record voice"
                      >
                        <Mic className="h-5 w-5 text-skillswap-600" />
                      </button>
                    </div>
                    {showEmojiRow && (
                      <div className="mt-2">
                        {/* emoji picker placeholder - can integrate real component */}
                        <p className="text-sm text-skillswap-500">Emoji picker here</p>
                      </div>
                    )}
                    {!activeConv.isAcceptedConnection && (
                      <p className="mt-2 text-xs text-skillswap-500">You can only chat once the connection is accepted.</p>
                    )}
                  </div>
                </>
              )}
            </Card>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
