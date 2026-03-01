import React from 'react';
import { SkillSwapSession } from '@/lib/supabase';
import { formatExactDateTime, formatExactDateTimeWithSeconds } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Star } from 'lucide-react';

type Props = {
  session: SkillSwapSession | null;
  currentUserId?: string | null;
  rating?: number | null;
  onClose?: () => void;
  onJoin?: (s: SkillSwapSession) => void;
  onReschedule?: (s: SkillSwapSession) => void;
  onCancel?: (s: SkillSwapSession) => void;
  onMarkCompleted?: (s: SkillSwapSession) => void;
  onSubmitRating?: (rating: number) => void;
};

export default function EventDetailDrawer({
  session,
  currentUserId,
  rating,
  onClose,
  onJoin,
  onReschedule,
  onCancel,
  onMarkCompleted,
  onSubmitRating,
}: Props) {
  if (!session) {
    return (
      <Card className="p-6">
        <p className="font-medium">No event selected</p>
        <p className="text-sm text-skillswap-600 mt-2">Select an event to view details.</p>
      </Card>
    );
  }

  const scheduledLabel = session.scheduled_at ? formatExactDateTime(session.scheduled_at) : 'TBD';
  const showMarkCompleted = session.status === 'scheduled' || session.status === 'ongoing';

  const [localRating, setLocalRating] = React.useState<number | null>(rating ?? null);
  React.useEffect(() => {
    setLocalRating(rating ?? null);
  }, [rating]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={undefined as any} alt="Partner" />
          <AvatarFallback>P</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">Skill session</p>
          {session.scheduled_at ? (
            <time
              className="text-xs text-skillswap-600"
              dateTime={session.scheduled_at}
              title={formatExactDateTimeWithSeconds(session.scheduled_at)}
            >
              {scheduledLabel}
            </time>
          ) : (
            <p className="text-xs text-skillswap-600">{scheduledLabel}</p>
          )}
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

      {session.status === 'completed' && currentUserId && (
        <div className="mt-4">
          {localRating ? (
            <p className="text-sm text-skillswap-700">You rated this swap partner <strong>{localRating} / 5</strong></p>
          ) : (
            <>
              <h5 className="font-medium">Rate your partner</h5>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-5 w-5 cursor-pointer ${localRating && localRating >= n ? 'text-skillswap-600' : 'text-skillswap-300'}`}
                    onClick={() => setLocalRating(n)}
                  />
                ))}
              </div>
              <Button
                className="mt-2"
                disabled={!localRating}
                onClick={() => {
                  if (localRating) onSubmitRating?.(localRating);
                }}
              >
                Submit rating
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
