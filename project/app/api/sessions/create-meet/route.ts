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

    const userId = authData.user.id;

    const body = await req.json().catch(() => ({} as any));
    const sessionId = body?.sessionId as string | undefined;

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId.' }, { status: 400 });
    }

    // Fetch the session
    const { data: sessionRow, error: sessErr } = await admin
      .from('skill_swap_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessErr) throw sessErr;
    if (!sessionRow) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

    // User must be a participant
    if (sessionRow.user_a_id !== userId && sessionRow.user_b_id !== userId) {
      return NextResponse.json({ error: 'You are not a participant of this session.' }, { status: 403 });
    }

    // If already has a meet link, return it
    if (sessionRow.meet_link) {
      return NextResponse.json({ meetLink: sessionRow.meet_link });
    }

    // Session must be scheduled or ongoing to create a meet link
    if (!['scheduled', 'ongoing', 'pending_approval'].includes(sessionRow.status)) {
      return NextResponse.json({ error: 'Session is not in a valid state for creating a meet link.' }, { status: 409 });
    }

    // Try to get Google Calendar connection for current user
    const { data: connRow } = await admin
      .from('google_calendar_connections')
      .select('calendar_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!connRow?.calendar_id) {
      return NextResponse.json(
        { error: 'Google Calendar not connected. Please connect Google Calendar in settings.', code: 'GOOGLE_NOT_CONNECTED' },
        { status: 409 }
      );
    }

    const accessToken = await getValidGoogleAccessToken(admin, userId);
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Calendar token missing or expired. Please reconnect Google Calendar.', code: 'GOOGLE_TOKEN_MISSING' },
        { status: 409 }
      );
    }

    // Fetch skill names
    const [{ data: skillA }, { data: skillB }] = await Promise.all([
      admin.from('skills').select('name').eq('id', sessionRow.skill_a_id).maybeSingle(),
      admin.from('skills').select('name').eq('id', sessionRow.skill_b_id).maybeSingle(),
    ]);
    const skillAName = skillA?.name || 'a skill';
    const skillBName = skillB?.name || 'a skill';

    // Fetch participant names & emails
    const [{ data: profA }, { data: profB }] = await Promise.all([
      admin.from('user_profiles').select('full_name').eq('id', sessionRow.user_a_id).maybeSingle(),
      admin.from('user_profiles').select('full_name').eq('id', sessionRow.user_b_id).maybeSingle(),
    ]);
    const nameA = profA?.full_name || 'Participant';
    const nameB = profB?.full_name || 'Participant';

    const [{ data: userA }, { data: userB }] = await Promise.all([
      admin.auth.admin.getUserById(sessionRow.user_a_id),
      admin.auth.admin.getUserById(sessionRow.user_b_id),
    ]);
    const attendeeEmails = uniqueStrings([userA?.user?.email, userB?.user?.email]);

    const durationMinutes = Number(sessionRow.duration_minutes) || 60;
    const startIso = sessionRow.scheduled_at
      ? new Date(sessionRow.scheduled_at).toISOString()
      : new Date(Date.now() + 5 * 60_000).toISOString(); // default to 5 min from now
    const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();

    const summary = `SkillSwap Session – ${skillAName} / ${skillBName}`;
    const description = `Skill swap between ${nameA} and ${nameB}.\n\n${sessionRow.notes || ''}`;

    const created = await createGoogleCalendarEvent({
      accessToken,
      calendarId: connRow.calendar_id as string,
      summary,
      description,
      startIso,
      endIso,
      attendeesEmails: attendeeEmails,
    });

    if (!created.ok) {
      if (created.status === 401) {
        return NextResponse.json(
          { error: 'Google authorization expired. Please reconnect Google Calendar.', code: 'GOOGLE_UNAUTHORIZED' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to create Google Calendar event.', details: created.json },
        { status: 502 }
      );
    }

    // Update session with meet link
    const updatePayload: Record<string, any> = {};
    if (created.meetLink) updatePayload.meet_link = created.meetLink;
    if (created.eventId) {
      updatePayload.calendar_event_id = created.eventId;
      updatePayload.calendar_provider = 'google';
    }

    if (Object.keys(updatePayload).length > 0) {
      await admin
        .from('skill_swap_sessions')
        .update(updatePayload)
        .eq('id', sessionId);
    }

    // Link calendar event to both users
    if (created.eventId) {
      await admin
        .from('google_calendar_event_links')
        .upsert(
          [
            { user_id: sessionRow.user_a_id, session_id: sessionId, event_id: created.eventId },
            { user_id: sessionRow.user_b_id, session_id: sessionId, event_id: created.eventId },
          ],
          { onConflict: 'user_id,session_id' }
        );
    }

    return NextResponse.json({
      meetLink: created.meetLink,
      eventId: created.eventId,
    });
  } catch (err: any) {
    console.error('create-meet error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
