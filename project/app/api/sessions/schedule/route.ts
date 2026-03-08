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

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET.');
  }

  const { data: tokenRow, error } = await (admin as any)
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
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
  if (!refreshRes.ok) {
    throw new Error(`Google token refresh failed: ${JSON.stringify(refreshJson)}`);
  }

  const accessToken = refreshJson.access_token as string | undefined;
  const expiresIn = typeof refreshJson.expires_in === 'number' ? refreshJson.expires_in : null;
  if (!accessToken) throw new Error('Google refresh response missing access_token.');

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
  if (!res.ok) {
    return { ok: false as const, status: res.status, json };
  }

  const meetLink = (json.hangoutLink as string | undefined) ||
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
      return NextResponse.json({ error: 'Supabase service role key not configured on the server.' }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;
    const jwt = getBearerToken(req);
    if (!jwt) return NextResponse.json({ error: 'Missing Authorization bearer token.' }, { status: 401 });

    const { data: authData, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const authedUserId = authData.user.id;

    const body = await req.json().catch(() => ({} as any));
    const requestId = body?.requestId as string | undefined;
    const slotId = body?.slotId as string | undefined;

    if (!requestId || !slotId) {
      return NextResponse.json({ error: 'Missing requestId/slotId.' }, { status: 400 });
    }

    const { data: requestRow, error: reqErr } = await admin
      .from('connection_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr) throw reqErr;
    if (!requestRow) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });

    if (requestRow.recipient_id !== authedUserId) {
      return NextResponse.json({ error: 'Only the recipient can accept this request.' }, { status: 403 });
    }

    if (requestRow.status !== 'pending') {
      return NextResponse.json({ error: 'Request is not pending.' }, { status: 409 });
    }

    const { data: slotRow, error: slotErr } = await admin
      .from('connection_request_slots')
      .select('*')
      .eq('id', slotId)
      .eq('request_id', requestId)
      .maybeSingle();

    if (slotErr) throw slotErr;
    if (!slotRow) return NextResponse.json({ error: 'Slot not found for this request.' }, { status: 404 });

    const durationMinutes = Number(requestRow.duration_minutes ?? 60) || 60;
    const startIso = new Date(slotRow.start_at as string).toISOString();
    const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();

    if (!requestRow.skill_id) {
      return NextResponse.json({ error: 'Request is missing skill_id and cannot be scheduled.' }, { status: 400 });
    }

    let skillName: string | null = null;
    const { data: skillRow } = await admin
      .from('skills')
      .select('name')
      .eq('id', requestRow.skill_id)
      .maybeSingle();
    if (skillRow?.name) skillName = skillRow.name as string;

    const summary = skillName ? `SkillSwap Session – ${skillName}` : 'SkillSwap Session';
    const description = skillName
      ? `Skill being taught: ${skillName}\n\n${requestRow.session_note}`
      : requestRow.session_note;

    const { data: connRow, error: connErr } = await admin
      .from('google_calendar_connections')
      .select('calendar_id')
      .eq('user_id', authedUserId)
      .maybeSingle();

    if (connErr) throw connErr;
    if (!connRow?.calendar_id) {
      return NextResponse.json(
        { error: 'Google Calendar not connected for recipient.', code: 'GOOGLE_NOT_CONNECTED' },
        { status: 409 }
      );
    }

    const accessToken = await getValidGoogleAccessToken(admin, authedUserId);
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google Calendar token missing/expired. Reconnect Google Calendar.', code: 'GOOGLE_TOKEN_MISSING' },
        { status: 409 }
      );
    }

    // Fetch participant emails (best-effort)
    const [{ data: reqUser }, { data: recUser }] = await Promise.all([
      admin.auth.admin.getUserById(requestRow.requester_id as string),
      admin.auth.admin.getUserById(requestRow.recipient_id as string),
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

    if (!created.ok) {
      // If token was revoked, a reconnect is the right UX.
      if (created.status === 401) {
        return NextResponse.json(
          { error: 'Google authorization expired. Reconnect Google Calendar.', code: 'GOOGLE_UNAUTHORIZED', details: created.json },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to create Google Calendar event.', details: created.json },
        { status: 502 }
      );
    }

    const eventId = created.eventId;
    const meetLink = created.meetLink;

    // Ensure conversation exists
    const a = requestRow.requester_id as string;
    const b = requestRow.recipient_id as string;
    const pairCond = `and(participant_a.eq.${a},participant_b.eq.${b}),and(participant_a.eq.${b},participant_b.eq.${a})`;

    const { data: existingConv } = await admin
      .from('conversations')
      .select('id')
      .or(pairCond)
      .limit(1)
      .maybeSingle();

    if (!existingConv) {
      await admin.from('conversations').insert({ participant_a: a, participant_b: b });
    }

    // Create session
    const { data: sessionRow, error: sessionErr } = await admin
      .from('skill_swap_sessions')
      .insert({
        user_a_id: a,
        user_b_id: b,
        skill_a_id: requestRow.skill_id,
        skill_b_id: requestRow.skill_id,
        status: 'scheduled',
        scheduled_at: startIso,
        duration_minutes: durationMinutes,
        notes: requestRow.session_note,
        meet_link: meetLink,
        calendar_event_id: eventId,
        calendar_provider: 'google',
      })
      .select('*')
      .single();

    if (sessionErr) throw sessionErr;

    // Mark request accepted + link
    await admin
      .from('connection_requests')
      .update({
        status: 'accepted',
        selected_slot_id: slotId,
        accepted_at: new Date().toISOString(),
        scheduled_session_id: sessionRow.id,
      })
      .eq('id', requestId);

    // Link event to both users for lookup
    await admin
      .from('google_calendar_event_links')
      .upsert(
        [
          { user_id: a, session_id: sessionRow.id, event_id: eventId },
          { user_id: b, session_id: sessionRow.id, event_id: eventId },
        ],
        { onConflict: 'user_id,session_id' }
      );

    // Participant names (best-effort)
    const [{ data: profA }, { data: profB }] = await Promise.all([
      admin.from('user_profiles').select('full_name').eq('id', a).maybeSingle(),
      admin.from('user_profiles').select('full_name').eq('id', b).maybeSingle(),
    ]);

    const nameA = (profA as any)?.full_name || 'Your partner';
    const nameB = (profB as any)?.full_name || 'Your partner';

    const common = {
      session_id: sessionRow.id,
      request_id: requestId,
      skill_id: requestRow.skill_id,
      skill_name: skillName,
      scheduled_at: startIso,
      duration_minutes: durationMinutes,
      meet_link: meetLink,
      calendar_event_id: eventId,
      calendar_added: true,
    };

    // Request accepted (for requester)
    await admin.from('notifications').insert({
      user_id: a,
      type: 'swap_request_accepted',
      payload: {
        ...common,
        partner_id: b,
        partner_name: nameB,
      },
    });

    // Session scheduled (for both)
    await admin.from('notifications').insert([
      {
        user_id: a,
        type: 'session_scheduled',
        payload: {
          ...common,
          partner_id: b,
          partner_name: nameB,
          meet_link_available: Boolean(meetLink),
        },
      },
      {
        user_id: b,
        type: 'session_scheduled',
        payload: {
          ...common,
          partner_id: a,
          partner_name: nameA,
          meet_link_available: Boolean(meetLink),
        },
      },
    ]);

    return NextResponse.json({ ok: true, session: sessionRow, meetLink, calendarEventId: eventId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
