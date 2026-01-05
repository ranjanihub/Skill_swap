"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { isSupabaseConfigured, supabase, Conversation, Message, UserProfile } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
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

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState<ConvWithMeta[]>([]);
  const [activeConv, setActiveConv] = useState<ConvWithMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

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
                      <Avatar src={undefined} alt={c.other?.full_name ?? 'Member'} />
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
                    <Avatar src={undefined} alt={activeConv.other?.full_name ?? 'Member'} />
                    <div>
                      <p className="font-medium">{activeConv.other?.full_name ?? 'Member'}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Skill exchange</Badge>
                        <Badge className="capitalize" variant={activeStatus === 'pending' ? 'secondary' : 'default'}>{activeStatus}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="p-2 rounded hover:bg-skillswap-50" title="View profile"><IconProfile className="w-5 h-5 text-skillswap-600" /></button>
                    <button className="p-2 rounded hover:bg-skillswap-50" title="Session details"><IconCalendar className="w-5 h-5 text-skillswap-600" /></button>
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
    </div>
  );
}
