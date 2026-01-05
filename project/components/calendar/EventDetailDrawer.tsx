import React from 'react';
import { SkillSwapSession } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

type Props = {
  session: SkillSwapSession | null;
  onClose?: () => void;
};

export default function EventDetailDrawer({ session, onClose }: Props) {
  if (!session) {
    return (
      <Card className="p-6">
        <p className="font-medium">No event selected</p>
        <p className="text-sm text-skillswap-600 mt-2">Select an event to view details.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar src={undefined} alt="Partner" />
        <div>
          <p className="font-medium">Skill session</p>
          <p className="text-xs text-skillswap-600">{new Date(session.scheduled_at || '').toLocaleString()}</p>
        </div>
      </div>

      <div>
        <h4 className="font-medium">Details</h4>
        <p className="text-sm text-skillswap-600 mt-1">Type: {session.status}</p>
        <p className="text-sm text-skillswap-600 mt-1">Duration: {session.duration_minutes ?? 60} minutes</p>
        <p className="text-sm text-skillswap-600 mt-1">Mode: {session.notes ? 'Video' : 'Chat'}</p>
      </div>

      <div className="flex gap-2">
        <Button className="bg-skillswap-500 text-white">Join Session</Button>
        <Button variant="outline">Reschedule</Button>
        <Button variant="destructive">Cancel</Button>
      </div>

      <div>
        <h5 className="font-medium">Notes</h5>
        <p className="text-sm text-skillswap-600 mt-1">{session.notes || 'No notes provided.'}</p>
      </div>
    </Card>
  );
}
