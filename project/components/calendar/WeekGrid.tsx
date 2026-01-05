import React from 'react';
import { SkillSwapSession } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Props = {
  sessions: SkillSwapSession[];
  onSelect?: (s: SkillSwapSession) => void;
};

function dayLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function WeekGrid({ sessions, onSelect }: Props) {
  // Simplified: show current week days and list sessions under each day
  const start = new Date();
  start.setDate(start.getDate() - start.getDay() + 1); // Monday
  const days: Date[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const sessionsByDay = days.map((d) => {
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    return sessions.filter((s) => {
      const t = s.scheduled_at ? new Date(s.scheduled_at) : null;
      return t && t >= dayStart && t <= dayEnd;
    });
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-skillswap-600">Week view</div>
        <div className="text-sm text-skillswap-600">Mon — Sun</div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {days.map((d, idx) => (
          <div key={d.toDateString()} className="bg-white rounded-lg p-3 min-h-[140px]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">{dayLabel(d)}</div>
              <div className="text-xs text-skillswap-600">{sessionsByDay[idx].length} events</div>
            </div>

            <div className="space-y-2">
              {sessionsByDay[idx].length === 0 ? (
                <div className="text-xs text-skillswap-600">No sessions</div>
              ) : (
                sessionsByDay[idx].map((s) => (
                  <div key={s.id} className="p-2 rounded-md border border-skillswap-100 bg-skillswap-50 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{s.id ? (s.skill_a_id ? 'Session' : 'Session') : 'Session'}</div>
                      <div className="text-xs text-skillswap-600">{new Date(s.scheduled_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="ml-2 flex items-center gap-2">
                      <Badge variant="outline">{s.status}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => onSelect?.(s)}>Details</Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
