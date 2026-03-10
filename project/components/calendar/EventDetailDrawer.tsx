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
  onAccept?: (s: SkillSwapSession) => void;
  onDecline?: (s: SkillSwapSession) => void;
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
  onAccept,
  onDecline,
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
        <p className="text-sm text-skillswap-600 mt-1">
          Status:{' '}
          {session.status === 'pending_approval' ? (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              🟡 Waiting for approval
            </span>
          ) : session.status === 'rejected' ? (
            <span className="inline-flex items-center gap-1 text-red-600 font-medium">
              ❌ Declined
            </span>
          ) : (
            session.status
          )}
        </p>
        <p className="text-sm text-skillswap-600 mt-1">Duration: {session.duration_minutes ?? 60} minutes</p>
        <p className="text-sm text-skillswap-600 mt-1">Mode: {session.meet_link ? 'Google Meet' : 'Chat'}</p>
        {session.meet_link ? (
          <a
            className="text-sm text-skillswap-600 mt-1 inline-block underline"
            href={session.meet_link}
            target="_blank"
            rel="noreferrer"
          >
            View Meet link
          </a>
        ) : null}
      </div>

      {session.status !== 'pending_approval' && session.status !== 'rejected' && (
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
      )}

      {session.status === 'pending_approval' && (
        currentUserId === session.user_b_id ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-3">
            <p className="text-sm text-amber-800 font-medium">📩 Session Request</p>
            <p className="text-xs text-amber-700">Your partner has requested a skill swap session. Do you want to accept?</p>
            <div className="flex gap-2">
              <Button className="bg-skillswap-500 text-white flex-1" onClick={() => onAccept?.(session)}>
                Accept
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => onDecline?.(session)}>
                Decline
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm text-amber-800 font-medium">⏳ Pending Approval</p>
            <p className="text-xs text-amber-700 mt-1">Waiting for your partner to accept or decline.</p>
          </div>
        )
      )}

      {session.status === 'rejected' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800 font-medium">Session Declined</p>
          <p className="text-xs text-red-700 mt-1">Your partner declined this session request. The time slot has been released.</p>
        </div>
      )}

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
