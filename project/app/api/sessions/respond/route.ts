import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))));
}

async function getValidGoogleAccessToken(admin: ReturnType<typeof createClient>, userId: string) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;

  const { data: tokenRow, error } = await (admin as any)
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return null;
  const token: any = tokenRow;
  if (!token?.access_token) return null;

  const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : null;
  const isExpired = expiresAt ? Date.now() > expiresAt - 60_000 : false;

  if (!isExpired) return token.access_token as string;
  if (!token.refresh_token) return null;

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token as string,
    }),
  });

  const refreshJson = await refreshRes.json().catch(() => ({} as any));
  if (!refreshRes.ok) return null;

  const accessToken = refreshJson.access_token as string | undefined;
  const expiresIn = typeof refreshJson.expires_in === 'number' ? refreshJson.expires_in : null;
  if (!accessToken) return null;

  const nextExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  await (admin as any)
    .from('google_calendar_tokens')
    .update({
      access_token: accessToken,
      expires_at: nextExpiresAt,
      token_type: refreshJson.token_type ?? token.token_type,
      scope: refreshJson.scope ?? token.scope,
    })
    .eq('user_id', userId);

  return accessToken;
}

async function createGoogleCalendarEvent(opts: {
  accessToken: string;
  calendarId: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  attendeesEmails: string[];
}) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        summary: opts.summary,
        description: opts.description,
        start: { dateTime: opts.startIso },
        end: { dateTime: opts.endIso },
        attendees: opts.attendeesEmails.map((email) => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 10 },
            { method: 'email', minutes: 10 },
          ],
        },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    }
  );

  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) return { ok: false as const, status: res.status, json };

  const meetLink =
    (json.hangoutLink as string | undefined) ||
    (Array.isArray(json?.conferenceData?.entryPoints)
      ? (json.conferenceData.entryPoints.find((e: any) => e.entryPointType === 'video')?.uri as string | undefined)
      : undefined);

  return {
    ok: true as const,
    eventId: json.id as string,
    meetLink: meetLink ?? null,
    raw: json,
  };
}

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;
    const jwt = getBearerToken(req);
    if (!jwt) return NextResponse.json({ error: 'Missing Authorization bearer token.' }, { status: 401 });

    const { data: authData, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const responderId = authData.user.id;

    const body = await req.json().catch(() => ({} as any));
    const sessionId = body?.sessionId as string | undefined;
    const action = body?.action as string | undefined;

    if (!sessionId || !action || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Missing sessionId or valid action (accept/decline).' }, { status: 400 });
    }

    // Fetch the session
    const { data: sessionRow, error: sessErr } = await admin
      .from('skill_swap_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessErr) throw sessErr;
    if (!sessionRow) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

    if (sessionRow.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Session is not pending approval.' }, { status: 409 });
    }

    // The responder must be the partner (user_b_id) - the one who receives the request
    if (sessionRow.user_b_id !== responderId) {
      return NextResponse.json({ error: 'Only the requested partner can respond to this session request.' }, { status: 403 });
    }

    const initiatorId = sessionRow.user_a_id as string;
    const partnerId = sessionRow.user_b_id as string;

    // Fetch participant names
    const [{ data: profA }, { data: profB }] = await Promise.all([
      admin.from('user_profiles').select('full_name').eq('id', initiatorId).maybeSingle(),
      admin.from('user_profiles').select('full_name').eq('id', partnerId).maybeSingle(),
    ]);
    const initiatorName = profA?.full_name || 'Your partner';
    const responderName = profB?.full_name || 'Your partner';

    // Fetch skill names
    const [{ data: skillA }, { data: skillB }] = await Promise.all([
      admin.from('skills').select('name').eq('id', sessionRow.skill_a_id).maybeSingle(),
      admin.from('skills').select('name').eq('id', sessionRow.skill_b_id).maybeSingle(),
    ]);
    const skillAName = skillA?.name || 'a skill';
    const skillBName = skillB?.name || 'a skill';

    const dateDisplay = sessionRow.scheduled_at
      ? new Date(sessionRow.scheduled_at).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'TBD';

    // Get conversation
    const convPairCond = `and(participant_a.eq.${initiatorId},participant_b.eq.${partnerId}),and(participant_a.eq.${partnerId},participant_b.eq.${initiatorId})`;
    let { data: conv } = await admin
      .from('conversations')
      .select('id')
      .or(convPairCond)
      .limit(1)
      .maybeSingle();

    if (!conv) {
      const { data: newConv } = await admin
        .from('conversations')
        .insert({ participant_a: initiatorId, participant_b: partnerId })
        .select('id')
        .single();
      conv = newConv;
    }

    const conversationId = conv?.id;

    if (action === 'decline') {
      // Reject the session
      await admin
        .from('skill_swap_sessions')
        .update({ status: 'rejected' })
        .eq('id', sessionId);

      // Send rejection message in chat
      if (conversationId) {
        const chatPayload = JSON.stringify({
          _v: 1,
          type: 'session_response',
          session_id: sessionId,
          action: 'declined',
          responder_id: responderId,
          responder_name: responderName,
          scheduled_at: sessionRow.scheduled_at,
          date_display: dateDisplay,
          text: `${responderName} declined the skill swap session scheduled for ${dateDisplay}.`,
        });

        await admin.from('messages').insert({
          conversation_id: conversationId,
          sender_id: responderId,
          body: chatPayload,
        });
      }

      // Notify initiator
      await admin.from('notifications').insert({
        user_id: initiatorId,
        type: 'session_declined',
        payload: {
          session_id: sessionId,
          partner_id: responderId,
          partner_name: responderName,
          scheduled_at: sessionRow.scheduled_at,
          date_display: dateDisplay,
        },
      });

      return NextResponse.json({ ok: true, action: 'declined', sessionId });
    }

    // === ACCEPT FLOW ===

    const durationMinutes = Number(sessionRow.duration_minutes) || 60;
    const startIso = new Date(sessionRow.scheduled_at).toISOString();
    const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
    const summary = `SkillSwap Session – ${skillAName} / ${skillBName}`;
    const description = `Skill swap between ${initiatorName} and ${responderName}.\n\n${sessionRow.notes || ''}`;

    let meetLink: string | null = null;
    let eventId: string | null = null;

    // Attempt Google Calendar + Meet integration (best-effort)
    const { data: connRow } = await admin
      .from('google_calendar_connections')
      .select('calendar_id')
      .eq('user_id', responderId)
      .maybeSingle();

    if (connRow?.calendar_id) {
      const accessToken = await getValidGoogleAccessToken(admin, responderId);
      if (accessToken) {
        const [{ data: reqUser }, { data: recUser }] = await Promise.all([
          admin.auth.admin.getUserById(initiatorId),
          admin.auth.admin.getUserById(responderId),
        ]);
        const attendeeEmails = uniqueStrings([reqUser?.user?.email, recUser?.user?.email]);

        const created = await createGoogleCalendarEvent({
          accessToken,
          calendarId: connRow.calendar_id as string,
          summary,
          description,
          startIso,
          endIso,
          attendeesEmails: attendeeEmails,
        });

        if (created.ok) {
          meetLink = created.meetLink;
          eventId = created.eventId;
        }
      }
    }

    // Update session to scheduled with meet info
    const updatePayload: Record<string, any> = { status: 'scheduled' };
    if (meetLink) updatePayload.meet_link = meetLink;
    if (eventId) {
      updatePayload.calendar_event_id = eventId;
      updatePayload.calendar_provider = 'google';
    }

    const { data: updatedSession, error: updErr } = await admin
      .from('skill_swap_sessions')
      .update(updatePayload)
      .eq('id', sessionId)
      .select('*')
      .single();

    if (updErr) throw updErr;

    // Link calendar event to both users
    if (eventId) {
      await admin
        .from('google_calendar_event_links')
        .upsert(
          [
            { user_id: initiatorId, session_id: sessionId, event_id: eventId },
            { user_id: partnerId, session_id: sessionId, event_id: eventId },
          ],
          { onConflict: 'user_id,session_id' }
        );
    }

    // Send confirmation message in chat
    if (conversationId) {
      const meetInfo = meetLink ? `\n\nGoogle Meet: ${meetLink}` : '';
      const chatPayload = JSON.stringify({
        _v: 1,
        type: 'session_response',
        session_id: sessionId,
        action: 'accepted',
        responder_id: responderId,
        responder_name: responderName,
        scheduled_at: sessionRow.scheduled_at,
        duration_minutes: durationMinutes,
        date_display: dateDisplay,
        meet_link: meetLink,
        calendar_event_id: eventId,
        text: `${responderName} accepted the skill swap session on ${dateDisplay}!${meetInfo}`,
      });

      await admin.from('messages').insert({
        conversation_id: conversationId,
        sender_id: responderId,
        body: chatPayload,
      });
    }

    // Create notifications for both users
    const common = {
      session_id: sessionId,
      scheduled_at: sessionRow.scheduled_at,
      duration_minutes: durationMinutes,
      meet_link: meetLink,
      calendar_event_id: eventId,
      skill_name: skillAName,
      date_display: dateDisplay,
    };

    await admin.from('notifications').insert([
      {
        user_id: initiatorId,
        type: 'session_confirmed',
        payload: {
          ...common,
          partner_id: responderId,
          partner_name: responderName,
          meet_link_available: Boolean(meetLink),
        },
      },
      {
        user_id: responderId,
        type: 'session_confirmed',
        payload: {
          ...common,
          partner_id: initiatorId,
          partner_name: initiatorName,
          meet_link_available: Boolean(meetLink),
        },
      },
    ]);

    return NextResponse.json({
      ok: true,
      action: 'accepted',
      session: updatedSession,
      meetLink,
      calendarEventId: eventId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
