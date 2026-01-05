"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { supabase, SkillSwapSession, UserProfile } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import WeekGrid from '@/components/calendar/WeekGrid';
import EventDetailDrawer from '@/components/calendar/EventDetailDrawer';
import AvailabilityOverlay from '@/components/calendar/AvailabilityOverlay';
import { useRouter } from 'next/navigation';

export default function CalendarPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<SkillSwapSession[]>([]);
  const [selected, setSelected] = useState<SkillSwapSession | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    const run = async () => {
      setLoadingSessions(true);
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
            <Button className="bg-skillswap-500 text-white">Schedule Session</Button>
          </div>
        </div>

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
              <WeekGrid sessions={sessions} onSelect={(s) => setSelected(s)} />
            </Card>
          </main>

          <aside className="lg:col-span-3">
            <EventDetailDrawer session={selected} onClose={() => setSelected(null)} />
          </aside>
        </div>
      </div>
    </div>
  );
}

