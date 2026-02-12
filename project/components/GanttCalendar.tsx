"use client";

import React from 'react';

type Task = {
  id: string;
  title: string;
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd
  progress?: number;
  color?: string;
};

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export default function GanttCalendar({
  tasks,
  viewStart,
  viewDays = 21,
}: {
  tasks: Task[];
  viewStart?: string;
  viewDays?: number;
}) {
  const startDate = viewStart ? new Date(viewStart) : new Date();
  startDate.setHours(0, 0, 0, 0);

  const [columnWidth, setColumnWidth] = React.useState<number>(48); // px per day (responsive)

  React.useEffect(() => {
    function updateColumnWidth() {
      const w = window.innerWidth;
      if (w < 640) setColumnWidth(32);
      else if (w < 1024) setColumnWidth(40);
      else setColumnWidth(48);
    }
    updateColumnWidth();
    window.addEventListener('resize', updateColumnWidth);
    return () => window.removeEventListener('resize', updateColumnWidth);
  }, []);
  const days: Date[] = Array.from({ length: viewDays }).map((_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    return d;
  });

  return (
    <div className="w-full flex gap-4">
      <div className="min-w-[260px] max-w-[320px]">
        <div className="px-4 py-3 font-semibold text-skillswap-dark">Task / Session</div>
        <div className="space-y-2 px-3 pb-4">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-lg border border-skillswap-200 bg-skillswap-50 px-3 py-2 flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-skillswap-dark truncate">{t.title}</p>
                <p className="text-xs text-skillswap-400">{t.start} — {t.end}</p>
              </div>
              <div className="ml-3 text-xs inline-flex items-center rounded-full border px-2.5 py-0.5">{t.progress ?? 0}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="sticky top-0 bg-white z-10">
          <div className="flex">
            {days.map((d) => (
              <div key={d.toISOString()} style={{ width: columnWidth }} className="border-b border-r border-skillswap-100 px-2 py-3 text-center text-sm">
                <div className="font-semibold">{d.toLocaleString(undefined, { weekday: 'short' })}</div>
                <div className="text-xs text-skillswap-400">{d.getDate()}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          {tasks.map((t) => {
            const taskStart = new Date(t.start);
            taskStart.setHours(0, 0, 0, 0);
            const taskEnd = new Date(t.end);
            taskEnd.setHours(0, 0, 0, 0);

            const offsetDays = Math.max(0, daysBetween(startDate, taskStart) - 1);
            const duration = Math.max(1, daysBetween(taskStart, taskEnd));

            const leftPx = offsetDays * columnWidth;
            const widthPx = duration * columnWidth - 8;

            return (
              <div key={t.id} className="relative h-16 border-b border-skillswap-100">
                <div className="absolute inset-y-0 left-0 flex ml-0">
                  <div className="flex" style={{ width: columnWidth * viewDays }} />
                </div>

                <div className="absolute inset-0 pointer-events-none">
                  <div className="flex h-full">
                    {days.map((d, i) => (
                      <div key={i} style={{ width: columnWidth }} className="border-r border-transparent" />
                    ))}
                  </div>
                </div>

                <div className="absolute top-4" style={{ left: leftPx + 4, width: widthPx }}>
                  <div className="rounded-md px-3 py-2 shadow-sm flex items-center justify-between" style={{ background: t.color ?? 'linear-gradient(90deg,#fff,#f3ebe9)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div className="text-sm font-medium text-skillswap-dark truncate">{t.title}</div>
                    <div className="ml-3 text-xs bg-white/30 px-2 py-1 rounded">{t.progress ?? 0}%</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
