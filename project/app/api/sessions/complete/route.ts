import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
}

export const runtime = 'nodejs';

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

    const authedUserId = authData.user.id as string;

    const body = await req.json().catch(() => ({} as any));
    const sessionId = body?.sessionId as string | undefined;

    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId.' }, { status: 400 });

    const { data: sessionRow, error: sessionErr } = await admin
      .from('skill_swap_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr) throw sessionErr;
    if (!sessionRow) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

    const a = sessionRow.user_a_id as string;
    const b = sessionRow.user_b_id as string;

    if (authedUserId !== a && authedUserId !== b) {
      return NextResponse.json({ error: 'Only participants can complete this session.' }, { status: 403 });
    }

    if (String(sessionRow.status) === 'completed') {
      return NextResponse.json({ ok: true, session: sessionRow, alreadyCompleted: true });
    }

    const { data: updated, error: updErr } = await admin
      .from('skill_swap_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)
      .select('*')
      .single();

    if (updErr) throw updErr;

    // Skill name (best-effort)
    let skillName: string | null = null;
    try {
      const skillId = (updated?.skill_a_id as string | undefined) || (updated?.skill_b_id as string | undefined);
      if (skillId) {
        const { data: skillRow } = await admin.from('skills').select('name').eq('id', skillId).maybeSingle();
        if (skillRow?.name) skillName = skillRow.name as string;
      }
    } catch {
      // ignore
    }

    // Participant names (best-effort)
    const [{ data: profA }, { data: profB }] = await Promise.all([
      admin.from('user_profiles').select('full_name').eq('id', a).maybeSingle(),
      admin.from('user_profiles').select('full_name').eq('id', b).maybeSingle(),
    ]);

    const nameA = (profA as any)?.full_name || 'Your partner';
    const nameB = (profB as any)?.full_name || 'Your partner';

    const common = {
      session_id: sessionId,
      skill_name: skillName,
      scheduled_at: updated?.scheduled_at ?? null,
      duration_minutes: updated?.duration_minutes ?? null,
    };

    // Notify both users
    await admin.from('notifications').insert([
      {
        user_id: a,
        type: 'session_completed',
        payload: {
          ...common,
          partner_id: b,
          partner_name: nameB,
        },
      },
      {
        user_id: b,
        type: 'session_completed',
        payload: {
          ...common,
          partner_id: a,
          partner_name: nameA,
        },
      },
    ]);

    return NextResponse.json({ ok: true, session: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
