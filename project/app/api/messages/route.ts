import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { conversation_id, sender_id, body: text } = body || {};

    if (!conversation_id || !sender_id || !text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase service role key not configured on the server.' }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // verify conversation exists and sender is a participant
    const { data: conv } = await admin.from('conversations').select('participant_a,participant_b').eq('id', conversation_id).maybeSingle();
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    if (conv.participant_a !== sender_id && conv.participant_b !== sender_id) {
      return NextResponse.json({ error: 'Sender is not a participant of this conversation' }, { status: 403 });
    }

    const other = conv.participant_a === sender_id ? conv.participant_b : conv.participant_a;

    // ensure there is an accepted connection between sender and other
    const pairCond = `and(requester_id.eq.${sender_id},recipient_id.eq.${other}),and(requester_id.eq.${other},recipient_id.eq.${sender_id})`;
    const { data: accepted } = await admin
      .from('connection_requests')
      .select('id,status')
      .or(pairCond)
      .eq('status', 'accepted')
      .limit(1);

    if (!accepted || (Array.isArray(accepted) && accepted.length === 0)) {
      return NextResponse.json({ error: 'Connection not accepted' }, { status: 403 });
    }

    // insert message as service role
    const { data: inserted, error: insertErr } = await admin
      .from('messages')
      .insert({ conversation_id, sender_id, body: text })
      .select('*')
      .single();
    if (insertErr) throw insertErr;

    return NextResponse.json({ ok: true, message: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
