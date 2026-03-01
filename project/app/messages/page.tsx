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
} from '@/lib/supabase';
import { cn } from '@/lib/utils';

import AppShell, { type ShellNavItem } from '@/components/app-shell';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type ConvWithMeta = Conversation & {
  other?: Pick<UserProfile, 'id' | 'full_name'>;
  lastMessage?: Message | null;
  avatar_url?: string | null;
  isAcceptedConnection?: boolean;
};

const DESKTOP_TABS = ['Read', 'Unread', 'Starred'] as const;

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

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

  const sendMessage = async () => {
    if (!activeConv || !user || !text.trim()) return;
    if (!activeConv.isAcceptedConnection) {
      setError('You can only send messages to accepted connections.');
      return;
    }

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeConv.id, sender_id: user.id, body: text.trim() }),
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
      }
    } catch (err) {
      console.error('Failed to send message', err);
      setError('Failed to send message');
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
              aria-label="Messages"
              title="Messages"
              onClick={() => router.push('/messages')}
              className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm"
            >
              <MessageSquare className="h-5 w-5 text-skillswap-600" />
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
                        onClick={() => {
                          const ok = confirm('Clear all conversations locally? This will not delete server data. Continue?');
                          if (!ok) return;
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
                      <Button onClick={() => router.push('/explore')} className="bg-skillswap-500 text-white">Explore Skills</Button>
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
                  <div className="p-3 border-b border-skillswap-200 flex items-center gap-2">
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

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-skillswap-800 truncate">
                          {activeConv.other?.full_name ?? 'Member'}
                        </p>
                    </div>

                    <button className="h-9 w-9 rounded-full hover:bg-skillswap-100 flex items-center justify-center" aria-label="Star">
                      <Star className="h-5 w-5 text-skillswap-600" />
                    </button>
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
                                {m.body}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t border-skillswap-200 bg-white">
                    <div className="flex items-center gap-2">
                      <Input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Write a message..."
                        className="h-10"
                        disabled={!activeConv.isAcceptedConnection}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void sendMessage();
                          }
                        }}
                      />
                      <Button onClick={sendMessage} className="bg-skillswap-500 text-white" disabled={!activeConv.isAcceptedConnection}>Send</Button>
                    </div>
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
