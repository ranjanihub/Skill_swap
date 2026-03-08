import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import CalendarPopup from '@/components/calendar/CalendarPopup';

type Props = {
  availabilities: string[];
  note: string;
  onNoteChange: (v: string) => void;
  durationMinutes: number;
  onDurationMinutesChange: (v: number) => void;
  onAdd: (s: string) => void;
  onRemove?: (idx: number) => void;
  max?: number;
};
export default function AvailabilityPicker({
  availabilities,
  note,
  onNoteChange,
  durationMinutes,
  onDurationMinutesChange,
  onAdd,
  onRemove,
  max = 6,
}: Props) {
  const [timeValue, setTimeValue] = useState('18:00');
  const [popupOpen, setPopupOpen] = useState(false);

  // Note: slots are added via the calendar popup; keep timeValue for quick edits

  return (
    <div className="space-y-2">
      <div className="p-3 bg-skillswap-50 rounded">
        <div className="text-sm font-medium">Session details</div>
        <div className="text-xs text-skillswap-600">Provide a short note and the session duration.</div>
        <div className="mt-2">
          <Textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Session note (e.g. 'Intro call, focus on fundamentals')"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="text-xs text-skillswap-600">Duration (minutes)</div>
          <Input
            type="number"
            min={15}
            max={240}
            value={durationMinutes}
            onChange={(e) => onDurationMinutesChange(Number(e.target.value || 0))}
            className="w-28"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input type="time" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} />
        <Button onClick={() => setPopupOpen(true)} className="bg-skillswap-500 text-white" disabled={availabilities.length >= max}>
          Add slot
        </Button>
        <Button variant="outline" onClick={() => setPopupOpen(true)}>Open calendar</Button>
        <div className="text-xs text-skillswap-600">{availabilities.length}/{max}</div>
      </div>

      {availabilities.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-auto">
          {availabilities.map((a, idx) => (
            <div key={`${a}-${idx}`} className="flex items-center justify-between bg-skillswap-50 p-2 rounded">
              <div className="text-sm text-skillswap-700">
                {Number.isNaN(new Date(a).getTime()) ? a : new Date(a).toLocaleString()}
              </div>
              {onRemove ? (
                <button className="text-sm text-destructive" onClick={() => onRemove(idx)}>Remove</button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <CalendarPopup
        open={popupOpen}
        onOpenChange={setPopupOpen}
        onConfirm={(slot) => onAdd(slot)}
      />
    </div>
  );
}
