import React from 'react';
import { SkillSwapSession } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

type Props = {
  session: SkillSwapSession | null;
  onClose?: () => void;
  onJoin?: (s: SkillSwapSession) => void;
  onReschedule?: (s: SkillSwapSession) => void;
  onCancel?: (s: SkillSwapSession) => void;
  onMarkCompleted?: (s: SkillSwapSession) => void;
};

export default function EventDetailDrawer({ session, onClose, onJoin, onReschedule, onCancel, onMarkCompleted }: Props) {
  if (!session) {
    return (
      <Card className="p-6">
        <p className="font-medium">No event selected</p>
        <p className="text-sm text-skillswap-600 mt-2">Select an event to view details.</p>
      </Card>
    );
  }

  const scheduledLabel = session.scheduled_at ? new Date(session.scheduled_at).toLocaleString() : 'TBD';
  const showMarkCompleted = session.status === 'scheduled' || session.status === 'ongoing';

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={undefined as any} alt="Partner" />
          <AvatarFallback>P</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">Skill session</p>
          <p className="text-xs text-skillswap-600">{scheduledLabel}</p>
        </div>
      </div>

      <div>
        <h4 className="font-medium">Details</h4>
        <p className="text-sm text-skillswap-600 mt-1">Status: {session.status}</p>
        <p className="text-sm text-skillswap-600 mt-1">Duration: {session.duration_minutes ?? 60} minutes</p>
        <p className="text-sm text-skillswap-600 mt-1">Mode: Chat (optional external call link)</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button className="bg-skillswap-500 text-white" onClick={() => onJoin?.(session)}>
          Join Session
        </Button>
        <Button variant="outline" onClick={() => onReschedule?.(session)}>
          Reschedule
        </Button>
        {showMarkCompleted ? (
          <Button variant="outline" onClick={() => onMarkCompleted?.(session)}>
            Mark completed
          </Button>
        ) : null}
        <Button variant="destructive" onClick={() => onCancel?.(session)}>
          Cancel
        </Button>
      </div>

      <div>
        <h5 className="font-medium">Notes</h5>
        <p className="text-sm text-skillswap-600 mt-1">{session.notes || 'No notes provided.'}</p>
      </div>
    </Card>
  );
}
