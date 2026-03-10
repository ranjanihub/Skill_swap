import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
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
    const partnerId = body?.partnerId as string | undefined;
    const mySkillId = body?.mySkillId as string | undefined;
    const partnerSkillId = body?.partnerSkillId as string | undefined;
    const scheduledAt = body?.scheduledAt as string | undefined;
    const durationMinutes = Number(body?.durationMinutes) || 60;
    const notes = (body?.notes as string | undefined)?.trim() || null;

    if (!partnerId || !mySkillId || !partnerSkillId || !scheduledAt) {
      return NextResponse.json({ error: 'Missing required fields: partnerId, mySkillId, partnerSkillId, scheduledAt.' }, { status: 400 });
    }

    if (partnerId === userId) {
      return NextResponse.json({ error: 'Cannot schedule a session with yourself.' }, { status: 400 });
    }

    // Verify there is an accepted connection between the two users
    const pairCond = `and(requester_id.eq.${userId},recipient_id.eq.${partnerId}),and(requester_id.eq.${partnerId},recipient_id.eq.${userId})`;
    const { data: connReqs } = await admin
      .from('connection_requests')
      .select('id,status')
      .or(pairCond)
      .eq('status', 'accepted')
      .limit(1);

    if (!connReqs || connReqs.length === 0) {
      return NextResponse.json({ error: 'No accepted connection with this partner.' }, { status: 403 });
    }

    // Create the session with status pending_approval
    const startIso = new Date(scheduledAt).toISOString();

    const { data: sessionRow, error: sessionErr } = await admin
      .from('skill_swap_sessions')
      .insert({
        user_a_id: userId,
        user_b_id: partnerId,
        skill_a_id: mySkillId,
        skill_b_id: partnerSkillId,
        status: 'pending_approval',
        scheduled_at: startIso,
        duration_minutes: durationMinutes,
        notes,
      })
      .select('*')
      .single();

    if (sessionErr) throw sessionErr;

    // Fetch names for notification & chat message
    const [{ data: profA }, { data: profB }] = await Promise.all([
      admin.from('user_profiles').select('full_name').eq('id', userId).maybeSingle(),
      admin.from('user_profiles').select('full_name').eq('id', partnerId).maybeSingle(),
    ]);
    const initiatorName = profA?.full_name || 'Your partner';

    // Fetch skill names
    const [{ data: skillA }, { data: skillB }] = await Promise.all([
      admin.from('skills').select('name').eq('id', mySkillId).maybeSingle(),
      admin.from('skills').select('name').eq('id', partnerSkillId).maybeSingle(),
    ]);
    const mySkillName = skillA?.name || 'a skill';
    const partnerSkillName = skillB?.name || 'a skill';

    // Format date for display
    const dateDisplay = new Date(startIso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    // Ensure conversation exists between the two users
    const convPairCond = `and(participant_a.eq.${userId},participant_b.eq.${partnerId}),and(participant_a.eq.${partnerId},participant_b.eq.${userId})`;
    let { data: existingConv } = await admin
      .from('conversations')
      .select('id')
      .or(convPairCond)
      .limit(1)
      .maybeSingle();

    if (!existingConv) {
      const { data: newConv, error: convErr } = await admin
        .from('conversations')
        .insert({ participant_a: userId, participant_b: partnerId })
        .select('id')
        .single();
      if (convErr) throw convErr;
      existingConv = newConv;
    }

    const conversationId = existingConv.id;

    // Send a system message in the chat conversation asking for approval
    const chatPayload = JSON.stringify({
      _v: 1,
      type: 'session_request',
      session_id: sessionRow.id,
      initiator_id: userId,
      initiator_name: initiatorName,
      partner_id: partnerId,
      scheduled_at: startIso,
      duration_minutes: durationMinutes,
      my_skill_name: mySkillName,
      partner_skill_name: partnerSkillName,
      date_display: dateDisplay,
      status: 'pending_approval',
      text: `${initiatorName} requested a skill swap session on ${dateDisplay} (${durationMinutes} min). Do you want to accept?`,
    });

    await admin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userId,
      body: chatPayload,
    });

    // Create notification for partner
    await admin.from('notifications').insert({
      user_id: partnerId,
      type: 'session_request',
      payload: {
        session_id: sessionRow.id,
        initiator_id: userId,
        initiator_name: initiatorName,
        scheduled_at: startIso,
        duration_minutes: durationMinutes,
        skill_name: mySkillName,
        partner_skill_name: partnerSkillName,
        date_display: dateDisplay,
        conversation_id: conversationId,
      },
    });

    return NextResponse.json({ ok: true, session: sessionRow, conversationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
