import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import CalendarPopup from '@/components/calendar/CalendarPopup';

type Props = {
  availabilities: string[];
  onAdd: (s: string) => void;
  onRemove?: (idx: number) => void;
  max?: number;
};
export default function AvailabilityPicker({ availabilities, onAdd, onRemove, max = 6 }: Props) {
  const [timeValue, setTimeValue] = useState('18:00');
  const [popupOpen, setPopupOpen] = useState(false);

  // Note: slots are added via the calendar popup; keep timeValue for quick edits

  return (
    <div className="space-y-2">
      <div className="p-3 bg-skillswap-50 rounded">
        <div className="text-sm font-medium">Optional session</div>
        <div className="text-xs text-skillswap-600">Add an optional note for this session (visible to recipient).</div>
        <div className="mt-2">
          <Textarea placeholder="Optional note about this session (e.g. 'Introductory call, ~30 minutes')" />
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
              <div className="text-sm text-skillswap-700">{a}</div>
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
