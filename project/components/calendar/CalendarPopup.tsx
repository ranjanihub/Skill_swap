import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function buildMonthGrid(viewMonth: Date) {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  gridStart.setHours(0, 0, 0, 0);

  return Array.from({ length: 42 }).map((_, idx) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + idx);
    return d;
  });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (slot: string) => void;
  initialDate?: Date;
};

export default function CalendarPopup({ open, onOpenChange, onConfirm, initialDate }: Props) {
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState<Date>(() => initialDate ? new Date(initialDate.getFullYear(), initialDate.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate ?? null);
  const [time, setTime] = useState('18:00');

  const days = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const confirm = () => {
    if (!selectedDate) return;
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    const slot = `${y}-${m}-${d} ${time}`;
    onConfirm(slot);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pick a date & time</DialogTitle>
          <DialogDescription>Select a day from the calendar and a time slot.</DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">{viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>Prev</Button>
              <Button variant="outline" size="sm" onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>Next</Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((h) => (
              <div key={h} className="text-xs text-skillswap-600 text-center">{h}</div>
            ))}

            {days.map((d) => {
              const isOtherMonth = d.getMonth() !== viewMonth.getMonth();
              const isSelected = selectedDate && d.toDateString() === selectedDate.toDateString();
              return (
                <button
                  key={d.toDateString()}
                  onClick={() => setSelectedDate(new Date(d))}
                  className={`p-2 rounded text-sm text-center ${isSelected ? 'bg-skillswap-500 text-white' : isOtherMonth ? 'text-skillswap-400 bg-white' : 'bg-white'} border border-skillswap-100`}
                >
                  <div>{d.getDate()}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <div className="ml-auto text-sm text-skillswap-600">{selectedDate ? selectedDate.toLocaleDateString() : 'No date selected'}</div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-skillswap-500 text-white" onClick={confirm} disabled={!selectedDate}>Add slot</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
